use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::interval;
use tracing::{info, debug};
use serde::Serialize;

use crate::stats::{StatsManager, OffsetSample};

#[derive(Debug, Clone, Serialize)]
pub struct MonitorSnapshot {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub current_offset_ms: f64,
    pub current_delay_ms: f64,
    pub avg_offset_1min_ms: f64,
    pub avg_offset_5min_ms: f64,
    pub avg_offset_15min_ms: f64,
    pub max_offset_1min_ms: f64,
    pub min_offset_1min_ms: f64,
    pub total_requests: u64,
    pub total_responses: u64,
    pub active_clients: u64,
    pub requests_per_second: f64,
}

pub struct Monitor {
    stats: Arc<StatsManager>,
    snapshot: Arc<RwLock<MonitorSnapshot>>,
    history: Arc<RwLock<Vec<MonitorSnapshot>>>,
    last_request_count: Arc<RwLock<u64>>,
    max_history: usize,
}

impl Monitor {
    pub fn new(stats: Arc<StatsManager>) -> Self {
        Monitor {
            stats,
            snapshot: Arc::new(RwLock::new(MonitorSnapshot::default())),
            history: Arc::new(RwLock::new(Vec::new())),
            last_request_count: Arc::new(RwLock::new(0)),
            max_history: 10080,
        }
    }

    pub async fn start(&self, sample_interval: Duration) {
        info!("Starting monitor with {:?} interval", sample_interval);
        let mut ticker = interval(sample_interval);
        
        loop {
            ticker.tick().await;
            self.update_snapshot().await;
        }
    }

    async fn update_snapshot(&self) {
        let server_stats = self.stats.get_server_stats();
        let offset_history = self.stats.get_offset_history().await;
        
        let (current_offset, current_delay) = offset_history
            .last()
            .map(|s| (s.offset * 1000.0, s.delay * 1000.0))
            .unwrap_or((0.0, 0.0));
        
        let now = chrono::Utc::now();
        let one_min_ago = now - chrono::Duration::minutes(1);
        let five_min_ago = now - chrono::Duration::minutes(5);
        let fifteen_min_ago = now - chrono::Duration::minutes(15);
        
        let avg_offset_1min = Self::avg_offset_since(&offset_history, &one_min_ago);
        let avg_offset_5min = Self::avg_offset_since(&offset_history, &five_min_ago);
        let avg_offset_15min = Self::avg_offset_since(&offset_history, &fifteen_min_ago);
        
        let (max_offset_1min, min_offset_1min) = Self::min_max_offset_since(&offset_history, &one_min_ago);
        
        let mut last_count = self.last_request_count.write().await;
        let requests_per_second = (server_stats.total_requests - *last_count) as f64 / 60.0;
        *last_count = server_stats.total_requests;
        drop(last_count);
        
        let snapshot = MonitorSnapshot {
            timestamp: now,
            current_offset_ms: current_offset,
            current_delay_ms: current_delay,
            avg_offset_1min_ms: avg_offset_1min,
            avg_offset_5min_ms: avg_offset_5min,
            avg_offset_15min_ms: avg_offset_15min,
            max_offset_1min_ms: max_offset_1min,
            min_offset_1min_ms: min_offset_1min,
            total_requests: server_stats.total_requests,
            total_responses: server_stats.total_responses,
            active_clients: server_stats.clients_served,
            requests_per_second,
        };
        
        *self.snapshot.write().await = snapshot.clone();
        
        let mut history = self.history.write().await;
        history.push(snapshot);
        if history.len() > self.max_history {
            history.remove(0);
        }
        
        debug!(
            "Monitor update: offset={:.3}ms, delay={:.3}ms, reqs={}",
            current_offset, current_delay, server_stats.total_requests
        );
    }

    fn avg_offset_since(samples: &[OffsetSample], since: &chrono::DateTime<chrono::Utc>) -> f64 {
        let filtered: Vec<f64> = samples
            .iter()
            .filter(|s| {
                let ts: chrono::DateTime<chrono::Utc> = s.timestamp.into();
                ts >= *since
            })
            .map(|s| s.offset * 1000.0)
            .collect();
        
        if filtered.is_empty() {
            0.0
        } else {
            filtered.iter().sum::<f64>() / filtered.len() as f64
        }
    }

    fn min_max_offset_since(samples: &[OffsetSample], since: &chrono::DateTime<chrono::Utc>) -> (f64, f64) {
        let filtered: Vec<f64> = samples
            .iter()
            .filter(|s| {
                let ts: chrono::DateTime<chrono::Utc> = s.timestamp.into();
                ts >= *since
            })
            .map(|s| s.offset * 1000.0)
            .collect();
        
        if filtered.is_empty() {
            (0.0, 0.0)
        } else {
            let max = filtered.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
            let min = filtered.iter().cloned().fold(f64::INFINITY, f64::min);
            (max, min)
        }
    }

    pub async fn get_snapshot(&self) -> MonitorSnapshot {
        self.snapshot.read().await.clone()
    }

    pub async fn get_history(&self) -> Vec<MonitorSnapshot> {
        self.history.read().await.clone()
    }

    pub async fn print_status(&self) {
        let snapshot = self.get_snapshot().await;
        println!("\n=== NTP Server Monitor Status ===");
        println!("Time: {}", snapshot.timestamp.format("%Y-%m-%d %H:%M:%S UTC"));
        println!();
        println!("Current Offset: {:.3} ms", snapshot.current_offset_ms);
        println!("Current Delay:  {:.3} ms", snapshot.current_delay_ms);
        println!();
        println!("Average Offset:");
        println!("  1 min:  {:.3} ms", snapshot.avg_offset_1min_ms);
        println!("  5 min:  {:.3} ms", snapshot.avg_offset_5min_ms);
        println!("  15 min: {:.3} ms", snapshot.avg_offset_15min_ms);
        println!();
        println!("1-min Offset Range: [{:.3}, {:.3}] ms", snapshot.min_offset_1min_ms, snapshot.max_offset_1min_ms);
        println!();
        println!("Total Requests:  {}", snapshot.total_requests);
        println!("Total Responses: {}", snapshot.total_responses);
        println!("Active Clients:  {}", snapshot.active_clients);
        println!("Requests/sec:    {:.2}", snapshot.requests_per_second);
        println!("=================================\n");
    }
}

impl Default for MonitorSnapshot {
    fn default() -> Self {
        MonitorSnapshot {
            timestamp: chrono::Utc::now(),
            current_offset_ms: 0.0,
            current_delay_ms: 0.0,
            avg_offset_1min_ms: 0.0,
            avg_offset_5min_ms: 0.0,
            avg_offset_15min_ms: 0.0,
            max_offset_1min_ms: 0.0,
            min_offset_1min_ms: 0.0,
            total_requests: 0,
            total_responses: 0,
            active_clients: 0,
            requests_per_second: 0.0,
        }
    }
}
