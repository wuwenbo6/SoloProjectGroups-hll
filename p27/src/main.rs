mod cli;
mod index;
mod tail;
mod server;
mod storage;
mod crypto;
mod s3_storage;

use clap::Parser;
use cli::Cli;
use std::sync::Arc;
use tokio::sync::RwLock;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    if cli.gen_key {
        let key = crypto::CryptoManager::generate_key()?;
        println!("Generated encryption key:");
        println!("  Base64: {}", crypto::CryptoManager::key_to_base64(&key));
        println!("  Hex: {}", crypto::CryptoManager::key_to_hex(&key));
        println!();
        println!("Set the key via environment variable:");
        println!("  export LOGTAIL_ENCRYPTION_KEY={}", crypto::CryptoManager::key_to_base64(&key));
        return Ok(());
    }

    let crypto_manager = crypto::CryptoManager::from_env()?
        .unwrap_or_else(crypto::CryptoManager::disabled);
    
    if crypto_manager.is_enabled() {
        println!("Encryption enabled (AES-256-GCM)");
    }

    let s3_storage = s3_storage::S3Storage::from_env()?
        .unwrap_or_else(s3_storage::S3Storage::disabled);
    
    if s3_storage.is_enabled() {
        println!("S3 storage enabled");
    }

    let index = Arc::new(RwLock::new(index::InvertedIndex::new()));
    
    let tail_handle = tokio::spawn(tail::start_tailing(
        cli.files.clone(),
        index.clone(),
        cli.compress,
        crypto_manager,
        s3_storage,
        cli.s3_sync_interval,
    ));

    let server_handle = tokio::spawn(server::start_server(
        cli.host,
        cli.port,
        index.clone(),
        cli.files,
    ));

    let _ = tokio::join!(tail_handle, server_handle);
    
    Ok(())
}
