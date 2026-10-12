//! Vigil Indexer Microservice
//! Subscribes to EVM logs from Anvil/RPC, indexes borrower position updates,
//! handles chain reorgs, and streams events to NATS JetStream.

use anyhow::Result;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    info!("Starting Vigil Indexer microservice...");

    let rpc_url = std::env::var("RPC_URL").unwrap_or_else(|_| "http://localhost:8545".into());
    let nats_url = std::env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".into());
    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/vigil".into());

    info!(rpc_url = %rpc_url, nats_url = %nats_url, database_url = %database_url, "Configuration loaded");

    // Microservice event loop placeholder
    info!("Indexer initialized and waiting for blocks...");

    tokio::signal::ctrl_c().await?;
    info!("Shutting down Indexer gracefully.");

    Ok(())
}
