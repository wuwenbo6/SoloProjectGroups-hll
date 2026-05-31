use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug, Clone)]
#[command(author, version, about, long_about = None)]
pub struct Cli {
    #[arg(short, long, num_args = 1.., required = true)]
    pub files: Vec<PathBuf>,

    #[arg(short, long, default_value = "127.0.0.1")]
    pub host: String,

    #[arg(short, long, default_value_t = 3000)]
    pub port: u16,

    #[arg(short, long, default_value_t = true)]
    pub compress: bool,

    #[arg(long)]
    pub gen_key: bool,

    #[arg(long, default_value_t = 300)]
    pub s3_sync_interval: u64,
}
