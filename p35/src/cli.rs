use std::net::{SocketAddr, UdpSocket};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use clap::{Parser, Subcommand};
use serde::Serialize;

mod protocol;
use protocol::{NtpPacket, NtpTimestamp, calculate_offset, calculate_delay, NTP_PORT};

#[derive(Parser, Debug)]
#[command(name = "ntp-cli", version = "0.1.0", about = "NTP Client CLI Tool")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    Query {
        #[arg(short, long, default_value = "localhost")]
        server: String,

        #[arg(short, long, default_value_t = 123)]
        port: u16,

        #[arg(short, long, default_value_t = 1)]
        count: u32,

        #[arg(short, long, default_value_t = 1000)]
        interval: u64,

        #[arg(short, long)]
        verbose: bool,

        #[arg(long)]
        json: bool,
    },
    Monitor {
        #[arg(short, long, default_value = "localhost")]
        server: String,

        #[arg(short, long, default_value_t = 123)]
        port: u16,

        #[arg(short, long, default_value_t = 10)]
        samples: u32,

        #[arg(long)]
        json: bool,
    },
    Benchmark {
        #[arg(short, long, default_value = "localhost")]
        server: String,

        #[arg(short, long, default_value_t = 123)]
        port: u16,

        #[arg(short, long, default_value_t = 100)]
        requests: u32,

        #[arg(short, long, default_value_t = 10)]
        concurrency: u32,
    },
    PtpQuery {
        #[arg(short, long, default_value = "localhost")]
        server: String,

        #[arg(short, long, default_value_t = 319)]
        port: u16,

        #[arg(short, long, default_value_t = 1)]
        count: u32,

        #[arg(long)]
        json: bool,
    },
    TimeSourceDemo {
        #[arg(long)]
        gps: Option<String>,

        #[arg(long)]
        atomic: bool,

        #[arg(long, value_delimiter = ',')]
        ntp: Vec<String>,

        #[arg(long)]
        json: bool,
    },
}

#[derive(Debug, Clone, Serialize)]
struct QueryResult {
    server: String,
    timestamp: String,
    offset_ms: f64,
    delay_ms: f64,
    stratum: u8,
    precision: i8,
    root_delay_ms: f64,
    root_dispersion_ms: f64,
}

#[derive(Debug, Clone, Serialize)]
struct MonitorSummary {
    server: String,
    samples: u32,
    avg_offset_ms: f64,
    min_offset_ms: f64,
    max_offset_ms: f64,
    std_offset_ms: f64,
    avg_delay_ms: f64,
    min_delay_ms: f64,
    max_delay_ms: f64,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Query {
            server,
            port,
            count,
            interval,
            verbose,
            json,
        } => {
            run_query(&server, port, count, interval, verbose, json)
        }
        Commands::Monitor {
            server,
            port,
            samples,
            json,
        } => run_monitor(&server, port, samples, json),
        Commands::Benchmark {
            server,
            port,
            requests,
            concurrency,
        } => run_benchmark(&server, port, requests, concurrency),
        Commands::PtpQuery {
            server,
            port,
            count,
            json,
        } => run_ptp_query(&server, port, count, json),
        Commands::TimeSourceDemo {
            gps,
            atomic,
            ntp,
            json,
        } => run_timesource_demo(gps, atomic, ntp, json),
    }
}

fn run_query(
    server: &str,
    port: u16,
    count: u32,
    interval: u64,
    verbose: bool,
    json: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let server_addr: SocketAddr = format!("{}:{}", server, port).parse()?;
    
    let socket = UdpSocket::bind("0.0.0.0:0")?;
    socket.set_read_timeout(Some(Duration::from_secs(5)))?;

    let mut results = Vec::new();

    if !json {
        println!("NTP Query Results for {}", server_addr);
        println!("{:=<60}", "");
        if verbose {
            println!("{:<20} {:>12} {:>12} {:>8} {:>10}", 
                "Timestamp", "Offset(ms)", "Delay(ms)", "Stratum", "Precision");
        } else {
            println!("{:<20} {:>12} {:>12}", "Timestamp", "Offset(ms)", "Delay(ms)");
        }
        println!("{:-<60}", "");
    }

    for i in 0..count {
        match send_ntp_request(&socket, server_addr) {
            Ok((packet, t1, t4)) => {
                let offset = calculate_offset(t1, packet.receive_timestamp, 
                                               packet.transmit_timestamp, t4);
                let delay = calculate_delay(t1, packet.receive_timestamp, 
                                           packet.transmit_timestamp, t4);

                let now = chrono::Utc::now();
                
                let result = QueryResult {
                    server: server_addr.to_string(),
                    timestamp: now.to_rfc3339(),
                    offset_ms: offset * 1000.0,
                    delay_ms: delay * 1000.0,
                    stratum: match packet.stratum {
                        protocol::Stratum::KissODeath => 0,
                        protocol::Stratum::Primary => 1,
                        protocol::Stratum::Secondary(n) => n,
                    },
                    precision: packet.precision,
                    root_delay_ms: (packet.root_delay as f64) / 65536.0 * 1000.0,
                    root_dispersion_ms: (packet.root_dispersion as f64) / 65536.0 * 1000.0,
                };
                
                results.push(result.clone());

                if !json {
                    if verbose {
                        println!("{:<20} {:>12.3} {:>12.3} {:>8} {:>10}",
                            now.format("%H:%M:%S%.3f"),
                            result.offset_ms,
                            result.delay_ms,
                            result.stratum,
                            result.precision);
                    } else {
                        println!("{:<20} {:>12.3} {:>12.3}",
                            now.format("%H:%M:%S%.3f"),
                            result.offset_ms,
                            result.delay_ms);
                    }
                }
            }
            Err(e) => {
                eprintln!("Request {} failed: {}", i + 1, e);
            }
        }

        if i < count - 1 {
            std::thread::sleep(Duration::from_millis(interval));
        }
    }

    if json {
        println!("{}", serde_json::to_string_pretty(&results)?);
    } else if !results.is_empty() {
        let avg_offset = results.iter().map(|r| r.offset_ms).sum::<f64>() / results.len() as f64;
        let avg_delay = results.iter().map(|r| r.delay_ms).sum::<f64>() / results.len() as f64;
        
        println!("{:-<60}", "");
        println!("Summary: {} samples", results.len());
        println!("  Average Offset: {:.3} ms", avg_offset);
        println!("  Average Delay:  {:.3} ms", avg_delay);
    }

    Ok(())
}

fn run_monitor(
    server: &str,
    port: u16,
    samples: u32,
    json: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let server_addr: SocketAddr = format!("{}:{}", server, port).parse()?;
    
    let socket = UdpSocket::bind("0.0.0.0:0")?;
    socket.set_read_timeout(Some(Duration::from_secs(5)))?;

    if !json {
        println!("Monitoring {} ({} samples)...", server_addr, samples);
        println!();
    }

    let mut results = Vec::new();

    for i in 0..samples {
        match send_ntp_request(&socket, server_addr) {
            Ok((packet, t1, t4)) => {
                let offset = calculate_offset(t1, packet.receive_timestamp, 
                                               packet.transmit_timestamp, t4);
                let delay = calculate_delay(t1, packet.receive_timestamp, 
                                           packet.transmit_timestamp, t4);
                
                results.push((offset * 1000.0, delay * 1000.0));
            }
            Err(e) => {
                eprintln!("Sample {} failed: {}", i + 1, e);
            }
        }

        std::thread::sleep(Duration::from_secs(1));
    }

    if results.is_empty() {
        eprintln!("No valid samples collected");
        return Ok(());
    }

    let offsets: Vec<f64> = results.iter().map(|(o, _)| *o).collect();
    let delays: Vec<f64> = results.iter().map(|(_, d)| *d).collect();

    let summary = MonitorSummary {
        server: server_addr.to_string(),
        samples: results.len() as u32,
        avg_offset_ms: mean(&offsets),
        min_offset_ms: min(&offsets),
        max_offset_ms: max(&offsets),
        std_offset_ms: std_deviation(&offsets),
        avg_delay_ms: mean(&delays),
        min_delay_ms: min(&delays),
        max_delay_ms: max(&delays),
    };

    if json {
        println!("{}", serde_json::to_string_pretty(&summary)?);
    } else {
        println!("{:=<50}", "");
        println!("Monitor Summary for {}", server_addr);
        println!("{:-<50}", "");
        println!("Samples: {}", summary.samples);
        println!();
        println!("Offset (ms):");
        println!("  Avg: {:.3}", summary.avg_offset_ms);
        println!("  Min: {:.3}", summary.min_offset_ms);
        println!("  Max: {:.3}", summary.max_offset_ms);
        println!("  Std: {:.3}", summary.std_offset_ms);
        println!();
        println!("Delay (ms):");
        println!("  Avg: {:.3}", summary.avg_delay_ms);
        println!("  Min: {:.3}", summary.min_delay_ms);
        println!("  Max: {:.3}", summary.max_delay_ms);
        println!("{:=<50}", "");
    }

    Ok(())
}

fn run_benchmark(
    server: &str,
    port: u16,
    requests: u32,
    concurrency: u32,
) -> Result<(), Box<dyn std::error::Error>> {
    use std::sync::{Arc, Mutex};
    use std::thread;

    let server_addr: SocketAddr = format!("{}:{}", server, port).parse()?;
    
    println!("Benchmarking {} with {} requests, concurrency {}", 
             server_addr, requests, concurrency);
    println!("{:=<60}", "");

    let success_count = Arc::new(Mutex::new(0u32));
    let total_time = Arc::new(Mutex::new(Duration::new(0, 0)));
    let errors = Arc::new(Mutex::new(0u32));

    let start = SystemTime::now();
    let mut handles = Vec::new();

    let requests_per_thread = requests / concurrency;
    let remainder = requests % concurrency;

    for i in 0..concurrency {
        let thread_requests = if i < remainder {
            requests_per_thread + 1
        } else {
            requests_per_thread
        };
        
        let success_count = Arc::clone(&success_count);
        let total_time = Arc::clone(&total_time);
        let errors = Arc::clone(&errors);

        let handle = thread::spawn(move || {
            let socket = match UdpSocket::bind("0.0.0.0:0") {
                Ok(s) => s,
                Err(_) => return,
            };
            socket.set_read_timeout(Some(Duration::from_secs(2))).ok();

            for _ in 0..thread_requests {
                let req_start = SystemTime::now();
                
                match send_ntp_request(&socket, server_addr) {
                    Ok(_) => {
                        if let Ok(elapsed) = req_start.elapsed() {
                            *success_count.lock().unwrap() += 1;
                            *total_time.lock().unwrap() += elapsed;
                        }
                    }
                    Err(_) => {
                        *errors.lock().unwrap() += 1;
                    }
                }
            }
        });

        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    let total_elapsed = start.elapsed()?;
    let success = *success_count.lock().unwrap();
    let total_req_time = *total_time.lock().unwrap();
    let err_count = *errors.lock().unwrap();

    let requests_per_sec = success as f64 / total_elapsed.as_secs_f64();
    let avg_latency = if success > 0 {
        total_req_time.as_micros() as f64 / success as f64 / 1000.0
    } else {
        0.0
    };

    println!("Total Time:       {:?}", total_elapsed);
    println!("Success:          {}/{}", success, requests);
    println!("Errors:           {}", err_count);
    println!("Throughput:       {:.2} req/sec", requests_per_sec);
    println!("Avg Latency:      {:.3} ms", avg_latency);
    println!("{:=<60}", "");

    Ok(())
}

fn send_ntp_request(
    socket: &UdpSocket,
    server: SocketAddr,
) -> Result<(NtpPacket, NtpTimestamp, NtpTimestamp), Box<dyn std::error::Error>> {
    let mut packet = NtpPacket::new_client();
    packet.transmit_timestamp = NtpTimestamp::now();
    packet.stratum = protocol::Stratum::KissODeath;

    let t1 = packet.transmit_timestamp;
    let bytes = packet.serialize();

    socket.send_to(&bytes, server)?;

    let mut buf = [0u8; 512];
    let (len, _) = socket.recv_from(&mut buf)?;

    let t4 = NtpTimestamp::now();
    let response = NtpPacket::deserialize(&buf[..len])?;

    Ok((response, t1, t4))
}

fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<f64>() / values.len() as f64
    }
}

fn min(values: &[f64]) -> f64 {
    values.iter().cloned().fold(f64::INFINITY, f64::min)
}

fn max(values: &[f64]) -> f64 {
    values.iter().cloned().fold(f64::NEG_INFINITY, f64::max)
}

fn std_deviation(values: &[f64]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        let mean = mean(values);
        let variance = values.iter()
            .map(|v| (v - mean).powi(2))
            .sum::<f64>() / values.len() as f64;
        variance.sqrt()
    }
}

#[derive(Debug, Clone, Serialize)]
struct PtpQueryResult {
    server: String,
    timestamp: String,
    received: bool,
    message_type: Option<String>,
    source_clock: Option<String>,
    sequence_id: Option<u16>,
}

fn run_ptp_query(
    server: &str,
    port: u16,
    count: u32,
    json: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    use std::io::Cursor;
    use byteorder::BigEndian;
    
    let server_addr: SocketAddr = format!("{}:{}", server, port).parse()?;
    
    let socket = UdpSocket::bind("0.0.0.0:0")?;
    socket.set_read_timeout(Some(Duration::from_secs(3)))?;
    
    let mut results = Vec::new();
    
    if !json {
        println!("PTP Query for {}:{}", server, port);
        println!("{:=<60}", "");
    }

    for i in 0..count {
        let mut delay_req = vec![0u8; 44];
        delay_req[0] = 0x01;
        delay_req[1] = 0x02;
        delay_req[2..4].copy_from_slice(&44u16.to_be_bytes());
        
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        
        delay_req[34..36].copy_from_slice(&((now.as_secs() >> 32) as u16).to_be_bytes());
        delay_req[36..40].copy_from_slice(&(now.as_secs() as u32).to_be_bytes());
        delay_req[40..44].copy_from_slice(&now.subsec_nanos().to_be_bytes());
        
        socket.send_to(&delay_req, server_addr)?;
        
        let mut buf = [0u8; 2048];
        let result = match socket.recv_from(&mut buf) {
            Ok((len, _)) => {
                let mut cursor = Cursor::new(&buf[..len]);
                let first_byte = buf[0];
                let message_type = match first_byte & 0x0f {
                    0x0 => "Sync",
                    0x1 => "DelayReq",
                    0x8 => "FollowUp",
                    0x9 => "DelayResp",
                    0xb => "Announce",
                    _ => "Unknown",
                };
                
                cursor.set_position(30);
                let seq_id = cursor.read_u16::<BigEndian>().ok();
                
                PtpQueryResult {
                    server: server_addr.to_string(),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    received: true,
                    message_type: Some(message_type.to_string()),
                    source_clock: Some(format!("{:02x?}", &buf[20..28])),
                    sequence_id: seq_id,
                }
            }
            Err(_) => PtpQueryResult {
                server: server_addr.to_string(),
                timestamp: chrono::Utc::now().to_rfc3339(),
                received: false,
                message_type: None,
                source_clock: None,
                sequence_id: None,
            },
        };
        
        results.push(result.clone());
        
        if !json {
            println!(
                "Query {}: {}", 
                i + 1,
                if result.received {
                    format!("OK - Type: {:?}, Seq: {:?}", 
                        result.message_type, result.sequence_id)
                } else {
                    "Timeout".to_string()
                }
            );
        }
        
        if i < count - 1 {
            std::thread::sleep(Duration::from_millis(500));
        }
    }

    if json {
        println!("{}", serde_json::to_string_pretty(&results)?);
    } else {
        println!("{:-<60}", "");
        let success = results.iter().filter(|r| r.received).count();
        println!("Summary: {}/{} responses received", success, results.len());
    }

    Ok(())
}

#[derive(Debug, Clone, Serialize)]
struct TimeSourceDemoResult {
    sources: Vec<String>,
    active_source: String,
    switchover_count: u8,
    demo_mode: bool,
    note: String,
}

fn run_timesource_demo(
    gps: Option<String>,
    atomic: bool,
    ntp: Vec<String>,
    json: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut sources = Vec::new();
    
    sources.push("local (priority 255)".to_string());
    
    if let Some(gps_dev) = gps {
        sources.push(format!("gps:{} (priority 10)", gps_dev));
    }
    
    if atomic {
        sources.push("atomic:phc0 (priority 5)".to_string());
    }
    
    for upstream in ntp {
        sources.push(format!("ntp:{} (priority 50)", upstream));
    }

    let result = TimeSourceDemoResult {
        sources: sources.clone(),
        active_source: "local".to_string(),
        switchover_count: 0,
        demo_mode: true,
        note: "This is a demo. Actual time source detection requires hardware support.".to_string(),
    };

    if json {
        println!("{}", serde_json::to_string_pretty(&result)?);
    } else {
        println!("Time Source Hot-Swap Demo");
        println!("{:=<60}", "");
        println!("Configured sources (priority order):");
        for source in sources {
            println!("  - {}", source);
        }
        println!();
        println!("Active source: {}", result.active_source);
        println!("Switchovers: {}", result.switchover_count);
        println!();
        println!("Note: {}", result.note);
    }

    Ok(())
}
