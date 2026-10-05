//! Bounded connection handling for both listeners.
//!
//! `axum::serve` accepts without a limit and builds its HTTP/1 connections
//! without a timer, so hyper's request-head timeout never runs: a peer that
//! connects and sends nothing holds a task and a descriptor indefinitely. This
//! accept path holds a permit for every open connection and closes one that
//! does not deliver a request head in time. Request admission, body limits and
//! timeouts stay in `handle`.
use axum::{Router, body::Body, extract::ConnectInfo, serve::Listener};
use hyper::{body::Incoming, server::conn::http1, service::service_fn};
use hyper_util::rt::{TokioIo, TokioTimer};
use std::{sync::Arc, time::Duration};
use tokio::sync::{Semaphore, watch};
use tower_service::Service as _;

/// What one listener may hold open.
#[derive(Clone, Copy, Debug)]
pub struct Limits {
    /// Open connections, including long-lived event streams. At the limit the
    /// listener stops accepting; later peers wait in the kernel backlog and
    /// take no descriptor in this process.
    pub connections: usize,
    /// Time to deliver a complete request head. hyper starts the same deadline
    /// when a kept-alive connection begins waiting for its next request, so it
    /// also bounds an idle connection. It does not run during a response.
    pub request_head: Duration,
}
impl Limits {
    /// Both listeners together stay at half of the 256-descriptor soft limit
    /// that macOS gives a process, leaving the rest to state and source files.
    ///
    /// The network listener sits behind the owner's proxy, which keeps a pool
    /// of idle connections. The deadline exceeds common proxy idle timeouts
    /// (60 to 120 seconds), so the proxy retires a connection it might reuse
    /// before this server closes it under a new request.
    pub const NETWORK: Self = Self {
        connections: 96,
        request_head: Duration::from_secs(150),
    };
    /// Local commands are short-lived and never wait between requests.
    pub const LOCAL: Self = Self {
        connections: 32,
        request_head: Duration::from_secs(30),
    };
}

/// Resolves once shutdown is requested or nobody is left to request it.
async fn stopped(shutdown: &mut watch::Receiver<bool>) {
    let _ = shutdown.wait_for(|stop| *stop).await;
}

/// Serve `router` until shutdown, then let open connections finish their
/// current exchange. `peer` describes an accepted connection to its requests,
/// as `ConnectInfo`.
pub(crate) async fn serve<L, P>(
    mut listener: L,
    router: Router,
    limits: Limits,
    peer: impl Fn(&L::Io) -> Option<P>,
    mut shutdown: watch::Receiver<bool>,
) where
    L: Listener,
    P: Clone + Send + Sync + 'static,
{
    let open = Arc::new(Semaphore::new(limits.connections));
    loop {
        // Take the permit first: an accepted connection always has one.
        let permit = tokio::select! {
            permit = open.clone().acquire_owned() => match permit {
                Ok(permit) => permit,
                Err(_) => break,
            },
            _ = stopped(&mut shutdown) => break,
        };
        let (io, _) = tokio::select! {
            accepted = listener.accept() => accepted,
            _ = stopped(&mut shutdown) => break,
        };
        let peer = peer(&io);
        let router = router.clone();
        let mut closing = shutdown.clone();
        tokio::spawn(async move {
            let _permit = permit;
            let service = service_fn(move |request: hyper::Request<Incoming>| {
                let mut request = request.map(Body::new);
                if let Some(peer) = &peer {
                    request.extensions_mut().insert(ConnectInfo(peer.clone()));
                }
                let mut router = router.clone();
                async move { router.call(request).await }
            });
            let mut builder = http1::Builder::new();
            builder
                .timer(TokioTimer::new())
                .header_read_timeout(limits.request_head);
            let mut connection =
                std::pin::pin!(builder.serve_connection(TokioIo::new(io), service));
            let mut draining = false;
            loop {
                tokio::select! {
                    // A failed connection only ends itself.
                    _ = connection.as_mut() => break,
                    _ = stopped(&mut closing), if !draining => {
                        draining = true;
                        connection.as_mut().graceful_shutdown();
                    }
                }
            }
        });
    }
    drop(listener);
    // Every connection task holds one permit until it has finished.
    let all = u32::try_from(limits.connections).unwrap_or(u32::MAX);
    let _ = open.acquire_many(all).await;
}
