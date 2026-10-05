//! The listeners bound open connections and close ones that send no request.
use project_application::engine::Engine;
use project_store::filesystem::Directory;
use projectd::{Limits, Service};
use std::{io::ErrorKind, net::SocketAddr, time::Duration};
use tokio::{
    net::{TcpListener, TcpStream, UnixListener, UnixStream},
    sync::watch,
    task::JoinHandle,
    time::timeout,
};

const REQUEST: &[u8] = b"GET /healthz HTTP/1.1\r\nHost: projects.test\r\n\r\n";

struct Running {
    _temp: tempfile::TempDir,
    address: SocketAddr,
    shutdown: watch::Sender<bool>,
    server: JoinHandle<()>,
}
impl Running {
    async fn new(limits: Limits) -> Self {
        let temp = tempfile::tempdir().unwrap();
        let root = Directory::open(&temp.path().canonicalize().unwrap()).unwrap();
        let state = root.child("state", true).unwrap();
        let service =
            Service::new(Engine::open(state.path()).unwrap(), "https://projects.test").unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (shutdown, signal) = watch::channel(false);
        let server =
            tokio::spawn(async move { service.serve_browser(listener, limits, signal).await });
        Self {
            _temp: temp,
            address,
            shutdown,
            server,
        }
    }
    async fn connect(&self) -> TcpStream {
        TcpStream::connect(self.address).await.unwrap()
    }
}

/// The readiness calls shared by both socket kinds; `io-util` is not enabled.
trait Wire {
    async fn ready(&self, write: bool) -> std::io::Result<()>;
    fn write(&self, bytes: &[u8]) -> std::io::Result<usize>;
    fn read(&self, chunk: &mut [u8]) -> std::io::Result<usize>;
}
macro_rules! wire {
    ($stream:ty) => {
        impl Wire for $stream {
            async fn ready(&self, write: bool) -> std::io::Result<()> {
                if write {
                    self.writable().await
                } else {
                    self.readable().await
                }
            }
            fn write(&self, bytes: &[u8]) -> std::io::Result<usize> {
                self.try_write(bytes)
            }
            fn read(&self, chunk: &mut [u8]) -> std::io::Result<usize> {
                self.try_read(chunk)
            }
        }
    };
}
wire!(TcpStream);
wire!(UnixStream);

async fn send(stream: &impl Wire, mut bytes: &[u8]) {
    while !bytes.is_empty() {
        stream.ready(true).await.unwrap();
        match stream.write(bytes) {
            Ok(written) => bytes = &bytes[written..],
            Err(error) if error.kind() == ErrorKind::WouldBlock => {}
            Err(error) => panic!("request was not written: {error}"),
        }
    }
}

/// Zero means the server closed the connection.
async fn receive(stream: &impl Wire, chunk: &mut [u8]) -> usize {
    loop {
        if stream.ready(false).await.is_err() {
            return 0;
        }
        match stream.read(chunk) {
            Ok(read) => return read,
            Err(error) if error.kind() == ErrorKind::WouldBlock => {}
            // A reset is also the server ending the connection.
            Err(_) => return 0,
        }
    }
}

/// Read one response whose body length is announced, leaving the stream open.
async fn response(stream: &impl Wire) -> String {
    let mut bytes = Vec::new();
    loop {
        let mut chunk = [0; 1024];
        let read = receive(stream, &mut chunk).await;
        assert_ne!(read, 0, "the connection closed before a response");
        bytes.extend_from_slice(&chunk[..read]);
        let text = String::from_utf8_lossy(&bytes);
        if let Some((head, body)) = text.split_once("\r\n\r\n") {
            let length: usize = head
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length:")?
                        .trim()
                        .parse()
                        .ok()
                })
                .expect("a response with a content length");
            if body.len() >= length {
                return text.into_owned();
            }
        }
    }
}

async fn closed_by_server(stream: impl Wire, what: &str) {
    timeout(Duration::from_secs(3), async {
        let mut chunk = [0; 1024];
        while receive(&stream, &mut chunk).await != 0 {}
    })
    .await
    .unwrap_or_else(|_| panic!("{what} was never closed"));
}

#[tokio::test]
async fn connections_without_a_complete_request_head_are_closed() {
    let app = Running::new(Limits {
        connections: 8,
        request_head: Duration::from_millis(200),
    })
    .await;
    let silent = app.connect().await;
    let slow = app.connect().await;
    send(&slow, b"GET /healthz HTTP/1.1\r\nHost: proj").await;
    // A kept-alive connection is served, then waits for a request that never comes.
    let idle = app.connect().await;
    send(&idle, REQUEST).await;
    assert!(response(&idle).await.starts_with("HTTP/1.1 200"));

    closed_by_server(silent, "a connection that sent nothing").await;
    closed_by_server(slow, "a connection with an unfinished request head").await;
    closed_by_server(idle, "an idle kept-alive connection").await;

    // The deadline does not interrupt a prompt request.
    let prompt = app.connect().await;
    send(&prompt, REQUEST).await;
    assert!(response(&prompt).await.starts_with("HTTP/1.1 200"));
}

#[tokio::test]
async fn open_connections_are_bounded_and_a_closed_one_frees_its_place() {
    let app = Running::new(Limits {
        connections: 2,
        request_head: Duration::from_secs(60),
    })
    .await;
    let first = app.connect().await;
    let _second = app.connect().await;
    let third = app.connect().await;
    send(&third, REQUEST).await;
    let mut served = tokio::spawn(async move { response(&third).await });
    assert!(
        timeout(Duration::from_millis(400), &mut served)
            .await
            .is_err(),
        "the listener served a connection beyond its limit"
    );
    drop(first);
    let reply = timeout(Duration::from_secs(3), served)
        .await
        .expect("a closed connection must free its place")
        .unwrap();
    assert!(reply.starts_with("HTTP/1.1 200"), "{reply}");
}

#[tokio::test]
async fn shutdown_closes_idle_connections_and_stops_serving() {
    let app = Running::new(Limits {
        connections: 2,
        request_head: Duration::from_secs(60),
    })
    .await;
    let silent = app.connect().await;
    let idle = app.connect().await;
    send(&idle, REQUEST).await;
    assert!(response(&idle).await.starts_with("HTTP/1.1 200"));
    app.shutdown.send(true).unwrap();
    timeout(Duration::from_secs(3), app.server)
        .await
        .expect("serving must end once connections are idle")
        .unwrap();
    closed_by_server(silent, "a silent connection at shutdown").await;
    closed_by_server(idle, "an idle connection at shutdown").await;
}

#[tokio::test]
async fn an_open_event_stream_outlives_the_request_head_deadline() {
    let temp = tempfile::tempdir().unwrap();
    let root = Directory::open(&temp.path().canonicalize().unwrap()).unwrap();
    let state = root.child("state", true).unwrap();
    let service =
        Service::new(Engine::open(state.path()).unwrap(), "https://projects.test").unwrap();
    let socket = state.path().join("test.sock");
    let listener = UnixListener::bind(&socket).unwrap();
    let (_shutdown, signal) = watch::channel(false);
    let limits = Limits {
        connections: 4,
        request_head: Duration::from_millis(200),
    };
    tokio::spawn(async move { service.serve_local(listener, limits, signal).await });

    let stream = UnixStream::connect(&socket).await.unwrap();
    send(
        &stream,
        b"GET /api/v1/events HTTP/1.1\r\nHost: localhost\r\n\r\n",
    )
    .await;
    let mut chunk = [0; 1024];
    let read = receive(&stream, &mut chunk).await;
    assert!(
        String::from_utf8_lossy(&chunk[..read]).starts_with("HTTP/1.1 200"),
        "the local event stream did not open"
    );
    // Only bytes of the stream may arrive; the server must not close it.
    let closed = timeout(Duration::from_millis(800), async {
        while receive(&stream, &mut chunk).await != 0 {}
    })
    .await;
    assert!(
        closed.is_err(),
        "an open response was cut by the head deadline"
    );
    // The same listener still closes a connection that never sends a request.
    closed_by_server(
        UnixStream::connect(&socket).await.unwrap(),
        "a silent local connection",
    )
    .await;
}
