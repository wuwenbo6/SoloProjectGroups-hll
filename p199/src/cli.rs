use clap::{Parser, Subcommand};
use crate::efivar::{EfiVarManager, EfiVarError};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "efitool")]
#[command(about = "UEFI Variable Management Tool", long_about = None)]
pub struct Cli {
    #[arg(short, long, value_name = "FILE")]
    pub store: Option<PathBuf>,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand)]
pub enum Commands {
    List,
    Get {
        #[arg(short, long)]
        name: String,
        #[arg(short, long)]
        guid: String,
        #[arg(short, long, default_value_t = false)]
        hex: bool,
    },
    Set {
        #[arg(short, long)]
        name: String,
        #[arg(short, long)]
        guid: String,
        #[arg(short, long, default_value_t = 7)]
        attributes: u32,
        #[arg(short, long)]
        data: String,
        #[arg(short, long, default_value_t = false)]
        hex_input: bool,
    },
    Create {
        #[arg(short, long)]
        name: String,
        #[arg(short, long)]
        guid: String,
        #[arg(short, long, default_value_t = 7)]
        attributes: u32,
        #[arg(short, long)]
        data: String,
        #[arg(short, long, default_value_t = false)]
        hex_input: bool,
    },
    Delete {
        #[arg(short, long)]
        name: String,
        #[arg(short, long)]
        guid: String,
        #[arg(short, long, default_value_t = false)]
        force: bool,
    },
    Backup {
        #[arg(short, long)]
        output: String,
    },
    Restore {
        #[arg(short, long)]
        input: String,
        #[arg(short, long, default_value_t = false)]
        force: bool,
    },
    Server {
        #[arg(short, long, default_value_t = 3000)]
        port: u16,
        #[arg(short, long, default_value = "127.0.0.1")]
        host: String,
    },
}

pub fn handle_cli(cli: Cli) -> Result<(), EfiVarError> {
    let mut manager = if let Some(store_path) = cli.store {
        EfiVarManager::with_persistence(store_path)?
    } else {
        EfiVarManager::new()
    };

    match cli.command {
        Commands::List => {
            let vars = manager.list_variables();
            if vars.is_empty() {
                println!("No variables found.");
            } else {
                for var in vars {
                    println!("{} - {} (attributes: {})", var.name, var.guid, var.attributes);
                    println!("  Data: {}", var.data_hex());
                }
            }
        }
        Commands::Get { name, guid, hex } => {
            let var = manager.get_variable(&name, &guid)?;
            println!("Variable: {} - {}", var.name, var.guid);
            println!("Attributes: {}", var.attributes);
            if hex {
                println!("Data (hex): {}", var.data_hex());
            } else {
                if let Some(s) = var.data_as_string() {
                    println!("Data (string): {}", s);
                }
                println!("Data (hex): {}", var.data_hex());
            }
        }
        Commands::Set { name, guid, attributes, data, hex_input } => {
            let data_bytes = if hex_input {
                hex::decode(&data)?
            } else {
                data.into_bytes()
            };
            let var = manager.set_variable(&name, &guid, attributes, &data_bytes)?;
            println!("Updated variable: {} - {}", var.name, var.guid);
        }
        Commands::Create { name, guid, attributes, data, hex_input } => {
            let data_bytes = if hex_input {
                hex::decode(&data)?
            } else {
                data.into_bytes()
            };
            let var = manager.create_variable(&name, &guid, attributes, &data_bytes)?;
            println!("Created variable: {} - {}", var.name, var.guid);
        }
        Commands::Delete { name, guid, force } => {
            manager.delete_variable(&name, &guid, force)?;
            println!("Deleted variable: {} - {}", name, guid);
        }
        Commands::Backup { output } => {
            let path = std::path::Path::new(&output);
            manager.backup_all(path)?;
            println!("Backup saved to: {}", output);
        }
        Commands::Restore { input, force } => {
            let path = std::path::Path::new(&input);
            let restored = manager.restore_all(path, force)?;
            println!("Restored {} variables:", restored.len());
            for v in restored {
                println!("  - {}", v);
            }
        }
        Commands::Server { port, host } => {
            let store_path = manager.store_path.clone();
            drop(manager);
            crate::server::run_server(host, port, store_path);
        }
    }

    Ok(())
}
