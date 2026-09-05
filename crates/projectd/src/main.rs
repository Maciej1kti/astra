mod watcher;
use clap::Parser;
use project_application::engine::Engine;
use project_store::filesystem::Directory;
use projectd::{LocalPeer, Service};
use std::{
    os::unix::fs::{FileTypeExt, MetadataExt, PermissionsExt},
    path::PathBuf,
};
use tokio::net::{TcpListener, UnixListener};

#[derive(Parser)]
#[command(
    version,
    about = "Local Projects daemon. Expose HTTPS through your own trusted local proxy."
)]
struct Arguments {
    #[arg(long)]
    data_dir: PathBuf,
    #[arg(long)]
    public_origin: String,
    #[arg(long, default_value_t = 47831)]
    port: u16,
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Arguments::parse();
    // Require an explicit owner-only directory; do not chmod a user's existing tree.
    let directory = Directory::open(&args.data_dir)?;
    directory.require_private()?;
    let engine = Engine::open(&args.data_dir)?;
    let service = Service::new(engine, &args.public_origin)?;
    let socket = args.data_dir.join("projectd.sock");
    if let Ok(metadata) = std::fs::symlink_metadata(&socket) {
        if !metadata.file_type().is_socket() || metadata.uid() != rustix::process::getuid().as_raw()
        {
            return Err("Unsafe existing socket path".into());
        }
        match UnixListener::bind(&socket) {
            Ok(_) => return Err("Socket changed during startup".into()),
            Err(_) => {
                if tokio::net::UnixStream::connect(&socket).await.is_ok() {
                    return Err("Socket is already active".into());
                }
                std::fs::remove_file(&socket)?;
            }
        }
    }
    let tcp = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, args.port)).await?;
    let unix = UnixListener::bind(&socket)?;
    std::fs::set_permissions(&socket, std::fs::Permissions::from_mode(0o600))?;
    let (shutdown, signal) = tokio::sync::watch::channel(false);
    let watcher = tokio::spawn(watcher::run(service.engine.clone(), signal.clone()));
    let mut stop = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    let termination = tokio::spawn(async move {
        tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = stop.recv() => {} }
        let _ = shutdown.send(true);
    });
    let mut browser_signal = signal.clone();
    let mut local_signal = signal;
    eprintln!(
        "Local Projects listening on 127.0.0.1:{}; Unix socket {}",
        args.port,
        socket.display()
    );
    let browser = axum::serve(tcp, service.browser_router()).with_graceful_shutdown(async move {
        let _ = browser_signal.changed().await;
    });
    let local = axum::serve(
        unix,
        service
            .local_router()
            .into_make_service_with_connect_info::<LocalPeer>(),
    )
    .with_graceful_shutdown(async move {
        let _ = local_signal.changed().await;
    });
    let result = tokio::try_join!(browser, local);
    watcher.abort();
    termination.abort();
    std::fs::remove_file(socket)?;
    result?;
    Ok(())
}
