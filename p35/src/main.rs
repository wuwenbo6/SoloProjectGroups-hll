mod protocol;
mod timestamping;
mod stats;
mod server;
mod monitor;
mod leap_second;
mod ptp;
mod ptp_server;
mod time_source;
mod reporting;

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use clap::Parser;
use tracing::{info, warn};
use tokio::task;

use server::{NtpServer, ServerConfig, ServerMode};
use monitor::Monitor;
use ptp_server::{PtpServer, PtpServerConfig};
use time_source::TimeSourceManager;
use reporting::{ReportExporter, ExportFormat};

#[derive(Parser, Debug)]
#[command(name = "ntpd", version = "0.1.0", about = "NTPv4 + PTPv2 Server with hardware timestamping")]
struct Cli {
    #[arg(short, long, default_value = "0.0.0.0:123")]
    listen: String,

    #[arg(long)]
    broadcast: Option<String>,

    #[arg(long, default_value = "64")]
    broadcast_interval: u64,

    #[arg(long)]
    hardware_timestamping: bool,

    #[arg(long, value_enum, default_value = "symmetric")]
    mode: ModeArg,

    #[arg(long, default_value = "info")]
    log_level: String,

    #[arg(long)]
    monitor: bool,

    #[arg(long, default_value = "60")]
    monitor_interval: u64,

    #[arg(long)]
    ptp: bool,

    #[arg(long, default_value = "0.0.0.0:319")]
    ptp_event: String,

    #[arg(long, default_value = "0.0.0.0:320")]
    ptp_general: String,

    #[arg(long)]
    ptp_grandmaster: bool,

    #[arg(long)]
    gps_device: Option<String>,

    #[arg(long)]
    gps_priority: Option<u8>,

    #[arg(long)]
    atomic_clock: bool,

    #[arg(long)]
    atomic_priority: Option<u8>,

    #[arg(long, value_delimiter = ',')]
    ntp_upstream: Vec<String>,

    #[arg(long)]
    export: Option<String>,

    #[arg(long, default_value = "json")]
    export_format: ExportFormatArg,

    #[arg(long, default_value = "300")]
    export_interval: u64,
}

#[derive(clap::ValueEnum, Clone, Debug)]
enum ModeArg {
    Symmetric,
    Broadcast,
    Both,
}

impl From<ModeArg> for ServerMode {
    fn from(m: ModeArg) -> Self {
        match m {
            ModeArg::Symmetric => ServerMode::Symmetric,
            ModeArg::Broadcast => ServerMode::Broadcast,
            ModeArg::Both => ServerMode::Both,
        }
    }
}

#[derive(clap::ValueEnum, Clone, Debug)]
enum ExportFormatArg {
    Json,
    Csv,
    Prometheus,
}

impl From<ExportFormatArg> for ExportFormat {
    fn from(f: ExportFormatArg) -> Self {
        match f {
            ExportFormatArg::Json => ExportFormat::Json,
            ExportFormatArg::Csv => ExportFormat::Csv,
            ExportFormatArg::Prometheus => ExportFormat::Prometheus,
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(&cli.log_level));
    
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_thread_ids(true)
        .init();

    let listen_addr: SocketAddr = cli.listen.parse()?;
    
    let broadcast_addr = match cli.broadcast {
        Some(addr) => {
            let mut addr: SocketAddr = addr.parse()?;
            if addr.port() == 0 {
                addr.set_port(123);
            }
            Some(addr)
        }
        None => None,
    };

    let config = ServerConfig {
        listen_addr,
        broadcast_addr,
        broadcast_interval: Duration::from_secs(cli.broadcast_interval),
        enable_hardware_timestamping: cli.hardware_timestamping,
        mode: cli.mode.into(),
    };

    let server = NtpServer::new(config);
    let stats = server.stats();
    
    let time_source_manager = Arc::new(TimeSourceManager::new());
    
    if let Some(gps_dev) = cli.gps_device {
        let priority = cli.gps_priority.unwrap_or(10);
        info!("Adding GPS time source: {}, priority: {}", gps_dev, priority);
        time_source_manager.add_gps_source(gps_dev, priority).await;
    }

    if cli.atomic_clock {
        let priority = cli.atomic_priority.unwrap_or(5);
        info!("Adding atomic clock time source, priority: {}", priority);
        time_source_manager.add_atomic_source(priority).await;
    }

    for upstream in &cli.ntp_upstream {
        let parts: Vec<&str> = upstream.split(':').collect();
        let (host, port, priority) = match parts.as_slice() {
            [host] => (*host, 123, 50),
            [host, port] => (*host, port.parse().unwrap_or(123), 50),
            [host, port, prio] => (*host, port.parse().unwrap_or(123), prio.parse().unwrap_or(50)),
            _ => continue,
        };
        info!("Adding NTP upstream: {}:{}, priority: {}", host, port, priority);
        time_source_manager.add_ntp_source(host.to_string(), port, priority).await;
    }

    time_source_manager.start_health_check(Duration::from_secs(30));

    let exporter = Arc::new(ReportExporter::new(stats.clone()).with_time_source(time_source_manager.clone()));
    
    if let Some(export_path) = cli.export {
        let format: ExportFormat = cli.export_format.into();
        let interval = Duration::from_secs(cli.export_interval);
        info!("Starting stats export to {} (format: {:?}, interval: {:?})", 
              export_path, format, interval);
        exporter.start_periodic_export(interval, export_path, format);
    }

    let _monitor_handle = if cli.monitor {
        let monitor = Monitor::new(stats.clone());
        let monitor_clone = monitor.clone();
        let interval = Duration::from_secs(cli.monitor_interval);
        
        let handle = task::spawn(async move {
            monitor_clone.start(interval).await;
        });
        
        task::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(30));
            loop {
                interval.tick().await;
                monitor.print_status().await;
            }
        });

        Some(handle)
    } else {
        None
    };

    info!("NTP Server starting...");
    info!("Listen address: {}", listen_addr);
    
    if let Some(addr) = broadcast_addr {
        info!("Broadcast address: {}", addr);
    }
    
    if cli.hardware_timestamping {
        warn!("Hardware timestamping enabled (Linux only)");
    }

    let mut tasks = Vec::new();

    tasks.push(task::spawn(async move {
        if let Err(e) = server.run().await {
            eprintln!("NTP Server error: {}", e);
            std::process::exit(1);
        }
    }));

    if cli.ptp {
        let ptp_config = PtpServerConfig {
            event_addr: cli.ptp_event.parse()?,
            general_addr: cli.ptp_general.parse()?,
            is_grandmaster: cli.ptp_grandmaster,
            ..Default::default()
        };

        let ptp_server = PtpServer::new(ptp_config).with_exporter(exporter.clone());
        
        tasks.push(task::spawn(async move {
            if let Err(e) = ptp_server.run().await {
                eprintln!("PTP Server error: {}", e);
                std::process::exit(1);
            }
        }));
    }

    for task in tasks {
        task.await?;
    }

    Ok(())
}
