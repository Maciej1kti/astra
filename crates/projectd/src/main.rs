#![cfg_attr(
    not(test),
    warn(
        clippy::unwrap_used,
        clippy::expect_used,
        clippy::unreachable,
        clippy::panic,
        clippy::todo,
        clippy::unimplemented
    )
)]
mod watcher;
use clap::Parser;
use project_application::engine::Engine;
use project_store::filesystem::Directory;
use projectd::{AgentConfig, GithubConfig, Limits, Service};
use std::{
    os::unix::fs::{FileTypeExt, MetadataExt, PermissionsExt},
    path::PathBuf,
    time::Duration,
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
    /// After restoring a stopped-server copy, invalidate old sessions and command retries.
    #[arg(long)]
    after_restore: bool,
    #[arg(long, default_value_t = 47831)]
    port: u16,
    /// Enable the in-app agent and set its working directory, which must hold an AGENTS.md.
    #[arg(long)]
    agent_dir: Option<PathBuf>,
    /// Claude Code executable; by default `claude` is found on PATH when a run starts.
    #[arg(long, requires = "agent_dir")]
    agent_claude_bin: Option<PathBuf>,
    /// Codex executable; by default `codex` is found on PATH when a run starts.
    #[arg(long, requires = "agent_dir")]
    agent_codex_bin: Option<PathBuf>,
    /// Wall-clock limit of one agent run in seconds (default 600).
    #[arg(long, requires = "agent_dir", value_parser = clap::value_parser!(u64).range(1..=3600))]
    agent_timeout: Option<u64>,
    /// Let the browser create private GitHub repositories for projects through the signed-in `gh`.
    #[arg(long)]
    github: bool,
    /// GitHub CLI executable; by default `gh` is found on PATH at startup.
    #[arg(long, requires = "github")]
    github_gh_bin: Option<PathBuf>,
    /// Git executable; by default `git` is found on PATH at startup.
    #[arg(long, requires = "github")]
    github_git_bin: Option<PathBuf>,
    /// Prefix of a new repository's remote, followed by `owner/name.git`
    /// (default https://github.com/); change it for a GitHub Enterprise host.
    #[arg(long, requires = "github")]
    github_remote_base: Option<String>,
}

/// An executable given by option, or the first of that name on PATH.
fn executable(option: &Option<PathBuf>, name: &str) -> Result<PathBuf, String> {
    let found = match option {
        Some(path) => std::fs::canonicalize(path).ok(),
        None => std::env::var_os("PATH").and_then(|paths| {
            std::env::split_paths(&paths)
                .map(|directory| directory.join(name))
                .find(|candidate| candidate.is_file())
        }),
    };
    found
        .filter(|path| path.is_absolute() && path.is_file())
        .ok_or_else(|| format!("Cannot find the {name} executable required by --github"))
}
/// How repositories are published, or `None` when the feature is not enabled.
fn github_config(args: &Arguments) -> Result<Option<GithubConfig>, String> {
    if !args.github {
        return Ok(None);
    }
    Ok(Some(GithubConfig {
        gh: executable(&args.github_gh_bin, "gh")?,
        git: executable(&args.github_git_bin, "git")?,
        remote_base: match &args.github_remote_base {
            None => "https://github.com/".into(),
            Some(base) if base.ends_with('/') && url::Url::parse(base).is_ok() => base.clone(),
            Some(_) => return Err("--github-remote-base must be a URL ending with /".into()),
        },
        timeout: Duration::from_secs(120),
    }))
}

/// The agent's configuration, or `None` when the feature is not enabled.
fn agent_config(args: &Arguments) -> Result<Option<AgentConfig>, Box<dyn std::error::Error>> {
    let Some(directory) = &args.agent_dir else {
        return Ok(None);
    };
    let directory = std::fs::canonicalize(directory)
        .ok()
        .filter(|path| path.is_dir())
        .ok_or("Agent directory must be an existing directory")?;
    // The agent starts elsewhere, so every path it receives must be absolute.
    let socket = std::fs::canonicalize(&args.data_dir)?.join("projectd.sock");
    let cli_dir = std::env::current_exe()?
        .parent()
        .map(PathBuf::from)
        .ok_or("Cannot locate the directory of the daemon executable")?;
    Ok(Some(AgentConfig {
        directory,
        socket,
        cli_dir,
        claude: args.agent_claude_bin.clone(),
        codex: args.agent_codex_bin.clone(),
        timeout: Duration::from_secs(args.agent_timeout.unwrap_or(600)),
    }))
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Arguments::parse();
    // Require an explicit owner-only directory; do not chmod a user's existing tree.
    let directory = Directory::open(&args.data_dir)?;
    directory.require_private()?;
    let engine = Engine::open_for_service(&args.data_dir)?;
    let mut service = Service::with_restore(engine, &args.public_origin, args.after_restore)?;
    if let Some(config) = agent_config(&args)? {
        service = service.with_agent(config);
    }
    if let Some(config) = github_config(&args)? {
        service = service.with_github(config);
    }
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
    let watcher = tokio::spawn(watcher::run_users(service.clone(), signal.clone()));
    let mut stop = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    let terminating_service = service.clone();
    let termination = tokio::spawn(async move {
        tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = stop.recv() => {} }
        terminating_service.shutdown();
        let _ = shutdown.send(true);
    });
    eprintln!(
        "Local Projects listening on 127.0.0.1:{}; Unix socket {}",
        args.port,
        socket.display()
    );
    tokio::join!(
        service.serve_browser(tcp, Limits::NETWORK, signal.clone()),
        service.serve_local(unix, Limits::LOCAL, signal),
    );
    // Whatever made the listeners return, end every agent run and leave no agent
    // process behind.
    let agents = service.clone();
    if !tokio::task::spawn_blocking(move || agents.wait_for_agents(Duration::from_secs(20)))
        .await
        .unwrap_or(false)
    {
        eprintln!("An agent process did not exit in time");
    }
    watcher.abort();
    termination.abort();
    std::fs::remove_file(socket)?;
    Ok(())
}
