use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::UdpSocket as TokioUdpSocket;
use tokio::task;
use tracing::{info, error, debug, warn};

use crate::protocol::{NtpPacket, NtpTimestamp, NTP_PORT, calculate_offset, calculate_delay};
use crate::stats::{StatsManager, build_response_packet, build_broadcast_packet};
use crate::leap_second::LeapSecondManager;

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub listen_addr: SocketAddr,
    pub broadcast_addr: Option<SocketAddr>,
    pub broadcast_interval: Duration,
    pub enable_hardware_timestamping: bool,
    pub mode: ServerMode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServerMode {
    Symmetric,
    Broadcast,
    Both,
}

impl Default for ServerConfig {
    fn default() -> Self {
        ServerConfig {
            listen_addr: format!("0.0.0.0:{}", NTP_PORT).parse().unwrap(),
            broadcast_addr: None,
            broadcast_interval: Duration::from_secs(64),
            enable_hardware_timestamping: false,
            mode: ServerMode::Symmetric,
        }
    }
}

pub struct NtpServer {
    config: ServerConfig,
    stats: Arc<StatsManager>,
    leap_manager: Arc<LeapSecondManager>,
}

impl NtpServer {
    pub fn new(config: ServerConfig) -> Self {
        let mode_str = match config.mode {
            ServerMode::Symmetric => "symmetric".to_string(),
            ServerMode::Broadcast => "broadcast".to_string(),
            ServerMode::Both => "both".to_string(),
        };

        let leap_manager = Arc::new(LeapSecondManager::new());
        
        let stats = StatsManager::new(
            config.enable_hardware_timestamping,
            config.broadcast_addr.is_some(),
            mode_str,
            leap_manager.clone(),
        );

        NtpServer {
            config,
            stats: Arc::new(stats),
            leap_manager,
        }
    }

    pub fn stats(&self) -> Arc<StatsManager> {
        self.stats.clone()
    }

    pub fn leap_manager(&self) -> Arc<LeapSecondManager> {
        self.leap_manager.clone()
    }

    pub async fn run(&self) -> Result<(), Box<dyn std::error::Error>> {
        info!("Starting NTP server on {}", self.config.listen_addr);
        info!("Mode: {:?}", self.config.mode);
        info!("Hardware timestamping: {}", self.config.enable_hardware_timestamping);

        let socket = TokioUdpSocket::bind(self.config.listen_addr).await?;
        info!("UDP socket bound successfully");

        #[cfg(target_os = "linux")]
        if self.config.enable_hardware_timestamping {
            use std::os::unix::io::AsRawFd;
            let fd = socket.as_raw_fd();
            
            let flags = libc::SOF_TIMESTAMPING_RX_SOFTWARE
                | libc::SOF_TIMESTAMPING_TX_SOFTWARE
                | libc::SOF_TIMESTAMPING_SYS_HARDWARE
                | libc::SOF_TIMESTAMPING_RX_HARDWARE
                | libc::SOF_TIMESTAMPING_TX_HARDWARE
                | libc::SOF_TIMESTAMPING_RAW_HARDWARE;

            unsafe {
                let result = libc::setsockopt(
                    fd,
                    libc::SOL_SOCKET,
                    libc::SO_TIMESTAMPING,
                    &flags as *const _ as *const libc::c_void,
                    std::mem::size_of_val(&flags) as libc::socklen_t,
                );

                if result == -1 {
                    warn!("Failed to enable hardware timestamping: {}", std::io::Error::last_os_error());
                } else {
                    info!("Hardware timestamping enabled on socket");
                }
            }
        }

        #[cfg(not(target_os = "linux"))]
        if self.config.enable_hardware_timestamping {
            warn!("Hardware timestamping only supported on Linux, disabled");
        }

        self.start_leap_updater();
        self.run_with_socket(socket).await
    }

    fn start_leap_updater(&self) {
        let leap_manager = self.leap_manager.clone();
        task::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(3600));
            loop {
                interval.tick().await;
                leap_manager.update_leap_indicator().await;
            }
        });
    }

    async fn run_with_socket(&self, socket: TokioUdpSocket) -> Result<(), Box<dyn std::error::Error>> {
        let socket = Arc::new(socket);
        let mut tasks = Vec::new();

        if self.config.mode != ServerMode::Broadcast {
            let socket_clone = socket.clone();
            let stats_clone = self.stats.clone();
            let leap_clone = self.leap_manager.clone();
            
            tasks.push(task::spawn(async move {
                if let Err(e) = Self::handle_requests(socket_clone, stats_clone, leap_clone).await {
                    error!("Request handler error: {}", e);
                }
            }));
        }

        if self.config.mode != ServerMode::Symmetric {
            if let Some(broadcast_addr) = self.config.broadcast_addr {
                let socket_clone = socket.clone();
                let interval = self.config.broadcast_interval;
                let leap_clone = self.leap_manager.clone();
                
                tasks.push(task::spawn(async move {
                    if let Err(e) = Self::broadcast_loop(socket_clone, broadcast_addr, interval, leap_clone).await {
                        error!("Broadcast loop error: {}", e);
                    }
                }));
                
                info!("Broadcasting to {} every {:?}", broadcast_addr, interval);
            } else {
                warn!("Broadcast mode enabled but no broadcast address specified");
            }
        }

        for task in tasks {
            task.await?;
        }

        Ok(())
    }

    async fn handle_requests(
        socket: Arc<TokioUdpSocket>,
        stats: Arc<StatsManager>,
        leap_manager: Arc<LeapSecondManager>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut buf = [0u8; 512];
        
        loop {
            match socket.recv_from(&mut buf).await {
                Ok((len, src)) => {
                    debug!("Received {} bytes from {}", len, src);
                    
                    let receive_ts = NtpTimestamp::now();
                    stats.record_request(src).await;
                    
                    match NtpPacket::deserialize(&buf[..len]) {
                        Ok(request) => {
                            debug!("Request mode: {:?}, version: {}", request.mode, request.version);
                            
                            let response = build_response_packet(&request, receive_ts, &leap_manager);
                            let response_bytes = response.serialize();
                            
                            match socket.send_to(&response_bytes, src).await {
                                Ok(_) => {
                                    let transmit_ts = NtpTimestamp::now();
                                    let offset = calculate_offset(
                                        request.transmit_timestamp,
                                        receive_ts,
                                        receive_ts,
                                        transmit_ts,
                                    );
                                    let delay = calculate_delay(
                                        request.transmit_timestamp,
                                        receive_ts,
                                        receive_ts,
                                        transmit_ts,
                                    );
                                    
                                    stats.record_response(src, offset, delay).await;
                                    debug!("Response sent to {}, offset: {:.6}s", src, offset);
                                }
                                Err(e) => {
                                    error!("Failed to send response to {}: {}", src, e);
                                }
                            }
                        }
                        Err(e) => {
                            warn!("Failed to parse request from {}: {}", src, e);
                        }
                    }
                }
                Err(e) => {
                    error!("Receive error: {}", e);
                }
            }
        }
    }

    async fn broadcast_loop(
        socket: Arc<TokioUdpSocket>,
        broadcast_addr: SocketAddr,
        interval: Duration,
        leap_manager: Arc<LeapSecondManager>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        socket.set_broadcast(true)?;
        
        let mut interval = tokio::time::interval(interval);
        
        loop {
            interval.tick().await;
            
            let packet = build_broadcast_packet(&leap_manager);
            let bytes = packet.serialize();
            
            match socket.send_to(&bytes, broadcast_addr).await {
                Ok(_) => {
                    debug!("Broadcast packet sent to {}", broadcast_addr);
                }
                Err(e) => {
                    error!("Broadcast error: {}", e);
                }
            }
        }
    }
}
