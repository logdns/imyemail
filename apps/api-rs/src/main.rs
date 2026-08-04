use std::process::ExitCode;

use imyemail_api_rs::{AppState, Config, build_router};
use tokio::signal;
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let config = match Config::from_env() {
        Ok(config) => config,
        Err(error) => {
            error!(%error, "invalid configuration");
            return ExitCode::FAILURE;
        }
    };
    let state = match AppState::new(config.legacy_base_url.clone()) {
        Ok(state) => state,
        Err(error) => {
            error!(%error, "failed to create HTTP client");
            return ExitCode::FAILURE;
        }
    };
    let listener = match tokio::net::TcpListener::bind(config.addr).await {
        Ok(listener) => listener,
        Err(error) => {
            error!(addr = %config.addr, %error, "failed to bind Rust API");
            return ExitCode::FAILURE;
        }
    };

    info!(addr = %config.addr, legacy = %config.legacy_base_url, "Rust API listening");
    if let Err(error) = axum::serve(listener, build_router(state))
        .with_graceful_shutdown(shutdown_signal())
        .await
    {
        error!(%error, "Rust API stopped unexpectedly");
        return ExitCode::FAILURE;
    }
    info!("Rust API stopped");
    ExitCode::SUCCESS
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }
}
