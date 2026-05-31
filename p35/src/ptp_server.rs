use std::net::{SocketAddr, Ipv4Addr};
use std::sync::Arc;
use std::time::Duration;
use tokio::net::UdpSocket;
use tokio::task;
use tracing::{info, error, debug, warn};

use crate::ptp::*;
use crate::reporting::ReportExporter;

#[derive(Debug, Clone)]
pub struct PtpServerConfig {
    pub event_addr: SocketAddr,
    pub general_addr: SocketAddr,
    pub multicast_addr: Ipv4Addr,
    pub domain: u8,
    pub announce_interval: Duration,
    pub sync_interval: Duration,
    pub is_grandmaster: bool,
}

impl Default for PtpServerConfig {
    fn default() -> Self {
        PtpServerConfig {
            event_addr: format!("0.0.0.0:{}", PTP_EVENT_PORT).parse().unwrap(),
            general_addr: format!("0.0.0.0:{}", PTP_GENERAL_PORT).parse().unwrap(),
            multicast_addr: PTP_MULTICAST_ADDR,
            domain: 0,
            announce_interval: Duration::from_secs(2),
            sync_interval: Duration::from_millis(250),
            is_grandmaster: true,
        }
    }
}

pub struct PtpServer {
    config: PtpServerConfig,
    state: Arc<std::sync::RwLock<PtpState>>,
    exporter: Option<Arc<ReportExporter>>,
}

impl PtpServer {
    pub fn new(config: PtpServerConfig) -> Self {
        let mut state = PtpState::default();
        state.is_grandmaster = config.is_grandmaster;
        
        PtpServer {
            config,
            state: Arc::new(std::sync::RwLock::new(state)),
            exporter: None,
        }
    }

    pub fn with_exporter(mut self, exporter: Arc<ReportExporter>) -> Self {
        self.exporter = Some(exporter);
        self
    }

    pub async fn run(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        info!("Starting PTP server on ports {} and {}", 
              self.config.event_addr.port(), 
              self.config.general_addr.port());
        info!("PTP Domain: {}", self.config.domain);
        info!("Grandmaster: {}", self.config.is_grandmaster);

        let event_socket = Arc::new(UdpSocket::bind(self.config.event_addr).await?);
        let general_socket = Arc::new(UdpSocket::bind(self.config.general_addr).await?);

        event_socket.set_multicast_ttl_v4(64)?;
        event_socket.join_multicast_v4(self.config.multicast_addr, Ipv4Addr::UNSPECIFIED)?;
        
        general_socket.set_multicast_ttl_v4(64)?;
        general_socket.join_multicast_v4(self.config.multicast_addr, Ipv4Addr::UNSPECIFIED)?;

        info!("PTP sockets bound successfully");

        if let Some(exporter) = &self.exporter {
            exporter.set_ptp_enabled(true).await;
        }

        let mut tasks = Vec::new();

        if self.config.is_grandmaster {
            let sync_socket = event_socket.clone();
            let general_socket_clone = general_socket.clone();
            let state_clone = self.state.clone();
            let config_clone = self.config.clone();
            let exporter_clone = self.exporter.clone();
            
            tasks.push(task::spawn(async move {
                if let Err(e) = Self::grandmaster_loop(
                    sync_socket,
                    general_socket_clone,
                    state_clone,
                    config_clone,
                    exporter_clone,
                ).await {
                    error!("Grandmaster loop error: {}", e);
                }
            }));
        }

        let event_socket_clone = event_socket.clone();
        let general_socket_clone = general_socket.clone();
        let state_clone = self.state.clone();
        let exporter_clone = self.exporter.clone();
        let config_clone = self.config.clone();
        
        tasks.push(task::spawn(async move {
            if let Err(e) = Self::event_listener(
                event_socket_clone,
                general_socket_clone,
                state_clone,
                config_clone,
                exporter_clone,
            ).await {
                error!("Event listener error: {}", e);
            }
        }));

        for task in tasks {
            task.await?;
        }

        Ok(())
    }

    async fn grandmaster_loop(
        event_socket: Arc<UdpSocket>,
        general_socket: Arc<UdpSocket>,
        state: Arc<std::sync::RwLock<PtpState>>,
        config: PtpServerConfig,
        exporter: Option<Arc<ReportExporter>>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let multicast_addr: SocketAddr = (config.multicast_addr, PTP_EVENT_PORT).into();
        let general_multicast: SocketAddr = (config.multicast_addr, PTP_GENERAL_PORT).into();
        
        let mut sync_interval = tokio::time::interval(config.sync_interval);
        let mut announce_interval = tokio::time::interval(config.announce_interval);

        info!("PTP Grandmaster loop started");

        loop {
            tokio::select! {
                _ = sync_interval.tick() => {
                    let (port_identity, sequence_id) = {
                        let mut s = state.write().unwrap();
                        s.sequence_id += 1;
                        (s.source_port_identity, s.sequence_id)
                    };

                    let sync_msg = SyncMessage::new(sequence_id - 1, port_identity);
                    let sync_bytes = sync_msg.serialize();
                    
                    match event_socket.send_to(&sync_bytes, multicast_addr).await {
                        Ok(_) => {
                            debug!("Sent PTP Sync message");
                            if let Some(exp) = &exporter {
                                exp.increment_sync().await;
                            }
                        }
                        Err(e) => error!("Failed to send Sync: {}", e),
                    }

                    let precise_ts = PtpTimestamp::now();
                    let follow_up = FollowUpMessage::new(sequence_id - 1, port_identity, precise_ts);
                    let follow_up_bytes = follow_up.serialize();
                    
                    match general_socket.send_to(&follow_up_bytes, general_multicast).await {
                        Ok(_) => {
                            debug!("Sent PTP FollowUp message");
                            if let Some(exp) = &exporter {
                                exp.increment_follow_up().await;
                            }
                        }
                        Err(e) => error!("Failed to send FollowUp: {}", e),
                    }
                }
                _ = announce_interval.tick() => {
                    let (clock_identity, port_identity, sequence_id) = {
                        let mut s = state.write().unwrap();
                        s.sequence_id += 1;
                        (s.clock_identity, s.source_port_identity, s.sequence_id)
                    };

                    let announce = AnnounceMessage::new(sequence_id - 1, port_identity, clock_identity);
                    let announce_bytes = announce.serialize();
                    
                    match general_socket.send_to(&announce_bytes, general_multicast).await {
                        Ok(_) => {
                            debug!("Sent PTP Announce message");
                            if let Some(exp) = &exporter {
                                exp.increment_announce().await;
                            }
                        }
                        Err(e) => error!("Failed to send Announce: {}", e),
                    }
                }
            }
        }
    }

    async fn event_listener(
        event_socket: Arc<UdpSocket>,
        general_socket: Arc<UdpSocket>,
        state: Arc<std::sync::RwLock<PtpState>>,
        config: PtpServerConfig,
        exporter: Option<Arc<ReportExporter>>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut buf = [0u8; 2048];
        
        loop {
            match event_socket.recv_from(&mut buf).await {
                Ok((len, src)) => {
                    debug!("Received PTP event message from {}, {} bytes", src, len);
                    
                    if len < 34 {
                        continue;
                    }

                    let message_type = PtpMessageType::from(buf[0]);
                    debug!("PTP message type: {:?}", message_type);

                    match message_type {
                        PtpMessageType::DelayReq => {
                            let receive_ts = PtpTimestamp::now();
                            
                            if let Some(exp) = &exporter {
                                exp.increment_delay_req().await;
                            }

                            if len >= 44 {
                                match SyncMessage::deserialize(&buf[..len]) {
                                    Ok(delay_req) => {
                                        debug!("DelayReq from {}", src);
                                        
                                        let (port_identity, sequence_id) = {
                                            let mut s = state.write().unwrap();
                                            s.sequence_id += 1;
                                            (s.source_port_identity, s.sequence_id)
                                        };

                                        let req_port_id = delay_req.header.source_port_identity;
                                        let delay_resp = DelayRespMessage::new(
                                            sequence_id - 1,
                                            port_identity,
                                            receive_ts,
                                            req_port_id,
                                        );
                                        let resp_bytes = delay_resp.serialize();

                                        match general_socket.send_to(&resp_bytes, src).await {
                                            Ok(_) => {
                                                debug!("Sent DelayResp to {}", src);
                                                if let Some(exp) = &exporter {
                                                    exp.increment_delay_resp().await;
                                                }
                                            }
                                            Err(e) => error!("Failed to send DelayResp: {}", e),
                                        }
                                    }
                                    Err(e) => warn!("Failed to parse DelayReq: {}", e),
                                }
                            }
                        }
                        _ => {
                            debug!("Unhandled PTP message type: {:?}", message_type);
                        }
                    }
                }
                Err(e) => {
                    error!("PTP event socket error: {}", e);
                }
            }
        }
    }
}
