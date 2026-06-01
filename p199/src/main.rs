mod cli;
mod efivar;
mod server;

use clap::Parser;

fn main() {
    let cli = cli::Cli::parse();
    if let Err(e) = cli::handle_cli(cli) {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
