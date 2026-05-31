use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::SystemTime;
use tokio::sync::RwLock;
use serde::Serialize;

use crate::protocol::{NtpPacket, NtpTimestamp, calculate_offset, calculate_delay};
use crate::leap_second::LeapSecondManager;

#[derive(Debug, Clone, Serialize)]
pub struct ClientStats {
    pub address: String,
    pub request_count: u64,
    pub last_request: Option<SystemTime>,
    pub avg_offset: f64,
    pub avg_delay: f64,
    pub min_offset: f64,
    pub max_offset: f64,
    pub min_delay: f64,
    pub max_delay: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServerStats {
    pub total_requests: u64,
    pub total_responses: u64,
    pub clients_served: u64,
    pub start_time: SystemTime,
    pub hardware_timestamping: bool,
    pub broadcast_enabled: bool,
    pub mode: String,
}

#[derive(Debug, Clone)]
pub struct OffsetSample {
    pub timestamp: SystemTime,
    pub offset: f64,
    pub delay: f64,
}

#[derive(Debug, Clone)]
struct ClientStatsInternal {
    request_count: u64,
    last_request: Option<SystemTime>,
    offsets: Vec<f64>,
    delays: Vec<f64>,
}

impl ClientStatsInternal {
    fn new() -> Self {
        ClientStatsInternal {
            request_count: 0,
            last_request: None,
            offsets: Vec::with_capacity(100),
            delays: Vec::with_capacity(100),
        }
    }
}

const SHARD_COUNT: usize = 64;

fn shard_index(addr: &SocketAddr) -> usize {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    
    let mut hasher = DefaultHasher::new();
    addr.hash(&mut hasher);
    hasher.finish() as usize % SHARD_COUNT
}

struct ClientStatsShard {
    clients: RwLock<HashMap<SocketAddr, ClientStatsInternal>>,
}

impl ClientStatsShard {
    fn new() -> Self {
        ClientStatsShard {
            clients: RwLock::new(HashMap::new()),
        }
    }
}

pub struct StatsManager {
    total_requests: Arc<AtomicU64>,
    total_responses: Arc<AtomicU64>,
    clients_served: Arc<AtomicU64>,
    start_time: SystemTime,
    hardware_timestamping: bool,
    broadcast_enabled: bool,
    mode: String,
    
    client_shards: Arc<Vec<ClientStatsShard>>,
    offset_history: Arc<RwLock<Vec<OffsetSample>>>,
    max_history_size: usize,
    
    leap_manager: Arc<LeapSecondManager>,
}

impl StatsManager {
    pub fn new(
        hardware_timestamping: bool, 
        broadcast_enabled: bool, 
        mode: String,
        leap_manager: Arc<LeapSecondManager>,
    ) -> Self {
        let mut client_shards = Vec::with_capacity(SHARD_COUNT);
        for _ in 0..SHARD_COUNT {
            client_shards.push(ClientStatsShard::new());
        }

        StatsManager {
            total_requests: Arc::new(AtomicU64::new(0)),
            total_responses: Arc::new(AtomicU64::new(0)),
            clients_served: Arc::new(AtomicU64::new(0)),
            start_time: SystemTime::now(),
            hardware_timestamping,
            broadcast_enabled,
            mode,
            client_shards: Arc::new(client_shards),
            offset_history: Arc::new(RwLock::new(Vec::with_capacity(10000))),
            max_history_size: 10000,
            leap_manager,
        }
    }

    pub async fn record_request(&self, client: SocketAddr) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
        
        let shard_idx = shard_index(&client);
        let shard = &self.client_shards[shard_idx];
        let mut clients = shard.clients.write().await;
        
        let entry = clients.entry(client).or_insert_with(|| {
            self.clients_served.fetch_add(1, Ordering::Relaxed);
            ClientStatsInternal::new()
        });
        
        entry.request_count += 1;
        entry.last_request = Some(SystemTime::now());
    }

    pub async fn record_response(&self, client: SocketAddr, offset: f64, delay: f64) {
        self.total_responses.fetch_add(1, Ordering::Relaxed);
        
        let shard_idx = shard_index(&client);
        let shard = &self.client_shards[shard_idx];
        let mut clients = shard.clients.write().await;
        
        if let Some(entry) = clients.get_mut(&client) {
            entry.offsets.push(offset);
            entry.delays.push(delay);
            if entry.offsets.len() > 100 {
                entry.offsets.remove(0);
            }
            if entry.delays.len() > 100 {
                entry.delays.remove(0);
            }
        }
        drop(clients);

        let mut history = self.offset_history.write().await;
        history.push(OffsetSample {
            timestamp: SystemTime::now(),
            offset,
            delay,
        });
        if history.len() > self.max_history_size {
            history.remove(0);
        }
    }

    pub fn get_server_stats(&self) -> ServerStats {
        ServerStats {
            total_requests: self.total_requests.load(Ordering::Relaxed),
            total_responses: self.total_responses.load(Ordering::Relaxed),
            clients_served: self.clients_served.load(Ordering::Relaxed),
            start_time: self.start_time,
            hardware_timestamping: self.hardware_timestamping,
            broadcast_enabled: self.broadcast_enabled,
            mode: self.mode.clone(),
        }
    }

    pub async fn get_client_stats(&self) -> Vec<ClientStats> {
        let mut result = Vec::new();
        
        for shard in self.client_shards.iter() {
            let clients = shard.clients.read().await;
            for (addr, stats) in clients.iter() {
                let (avg_offset, min_offset, max_offset) = if !stats.offsets.is_empty() {
                    let avg = stats.offsets.iter().sum::<f64>() / stats.offsets.len() as f64;
                    let min = stats.offsets.iter().cloned().fold(f64::INFINITY, f64::min);
                    let max = stats.offsets.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
                    (avg, min, max)
                } else {
                    (0.0, 0.0, 0.0)
                };

                let (avg_delay, min_delay, max_delay) = if !stats.delays.is_empty() {
                    let avg = stats.delays.iter().sum::<f64>() / stats.delays.len() as f64;
                    let min = stats.delays.iter().cloned().fold(f64::INFINITY, f64::min);
                    let max = stats.delays.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
                    (avg, min, max)
                } else {
                    (0.0, 0.0, 0.0)
                };

                result.push(ClientStats {
                    address: addr.to_string(),
                    request_count: stats.request_count,
                    last_request: stats.last_request,
                    avg_offset,
                    avg_delay,
                    min_offset,
                    max_offset,
                    min_delay,
                    max_delay,
                });
            }
        }
        
        result
    }

    pub async fn get_offset_history(&self) -> Vec<OffsetSample> {
        self.offset_history.read().await.clone()
    }

    pub async fn get_current_offset(&self) -> Option<f64> {
        let history = self.offset_history.read().await;
        history.last().map(|s| s.offset)
    }

    pub fn leap_manager(&self) -> Arc<LeapSecondManager> {
        self.leap_manager.clone()
    }
}

pub fn build_response_packet(
    request: &NtpPacket, 
    receive_ts: NtpTimestamp,
    leap_manager: &LeapSecondManager,
) -> NtpPacket {
    let transmit_ts = NtpTimestamp::now();
    let leap_ind = leap_manager.get_leap_indicator();
    
    NtpPacket {
        leap_indicator: leap_ind,
        version: 4,
        mode: match request.mode {
            crate::protocol::Mode::Client => crate::protocol::Mode::Server,
            crate::protocol::Mode::SymmetricActive => crate::protocol::Mode::SymmetricPassive,
            crate::protocol::Mode::Broadcast => crate::protocol::Mode::Broadcast,
            _ => crate::protocol::Mode::Server,
        },
        stratum: crate::protocol::Stratum::Primary,
        poll: request.poll,
        precision: -20,
        root_delay: 0,
        root_dispersion: 0,
        reference_id: [b'L', b'O', b'C', b'L'],
        reference_timestamp: receive_ts,
        originate_timestamp: request.transmit_timestamp,
        receive_timestamp: receive_ts,
        transmit_timestamp: transmit_ts,
        extension_fields: Vec::new(),
        key_identifier: None,
        message_digest: None,
    }
}

pub fn build_broadcast_packet(leap_manager: &LeapSecondManager) -> NtpPacket {
    let now = NtpTimestamp::now();
    let leap_ind = leap_manager.get_leap_indicator();
    
    NtpPacket {
        leap_indicator: leap_ind,
        version: 4,
        mode: crate::protocol::Mode::Broadcast,
        stratum: crate::protocol::Stratum::Primary,
        poll: 6,
        precision: -20,
        root_delay: 0,
        root_dispersion: 0,
        reference_id: [b'L', b'O', b'C', b'L'],
        reference_timestamp: now,
        originate_timestamp: NtpTimestamp::zero(),
        receive_timestamp: NtpTimestamp::zero(),
        transmit_timestamp: now,
        extension_fields: Vec::new(),
        key_identifier: None,
        message_digest: None,
    }
}
