use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::sync::atomic::{AtomicU8, Ordering};
use tokio::sync::RwLock;
use serde::Serialize;
use tracing::{info, warn, debug};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub enum TimeSourceType {
    Gps = 0,
    Atomic = 1,
    Ptp = 2,
    Ntp = 3,
    Local = 4,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum TimeSourceStatus {
    Active,
    Standby,
    Failed,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
pub struct TimeSourceInfo {
    pub id: String,
    pub source_type: TimeSourceType,
    pub status: TimeSourceStatus,
    pub priority: u8,
    pub accuracy_ns: u64,
    pub last_sync: Option<SystemTime>,
    pub offset_ns: Option<i64>,
    pub drift_ppb: Option<f64>,
}

pub trait TimeSource: Send + Sync {
    fn info(&self) -> TimeSourceInfo;
    fn get_time(&self) -> Result<SystemTime, TimeSourceError>;
    fn check_health(&mut self) -> bool;
    fn update(&mut self) -> Result<(), TimeSourceError>;
}

#[derive(Debug, thiserror::Error)]
pub enum TimeSourceError {
    #[error("Time source not available")]
    NotAvailable,
    #[error("Time source error: {0}")]
    Other(String),
}

pub struct GpsTimeSource {
    info: TimeSourceInfo,
    device_path: String,
    last_valid: bool,
}

impl GpsTimeSource {
    pub fn new(device_path: String, priority: u8) -> Self {
        GpsTimeSource {
            info: TimeSourceInfo {
                id: format!("gps:{}", device_path),
                source_type: TimeSourceType::Gps,
                status: TimeSourceStatus::Unknown,
                priority,
                accuracy_ns: 100,
                last_sync: None,
                offset_ns: None,
                drift_ppb: None,
            },
            device_path,
            last_valid: false,
        }
    }

    fn read_gps_time(&self) -> Result<SystemTime, TimeSourceError> {
        #[cfg(target_os = "linux")]
        {
            use std::fs::File;
            use std::io::Read;
            
            let mut file = File::open("/sys/class/pps/pps0/assert")
                .map_err(|e| TimeSourceError::Other(e.to_string()))?;
            let mut content = String::new();
            file.read_to_string(&mut content)
                .map_err(|e| TimeSourceError::Other(e.to_string()))?;
            
            let parts: Vec<&str> = content.trim().split_whitespace().collect();
            if parts.len() >= 2 {
                if let Ok(secs) = parts[0].parse::<u64>() {
                    if let Ok(nanos) = parts[1].parse::<u32>() {
                    return Ok(UNIX_EPOCH + Duration::new(secs, nanos));
                }
            }
        }
        
        Err(TimeSourceError::NotAvailable)
    }
}

impl TimeSource for GpsTimeSource {
    fn info(&self) -> TimeSourceInfo {
        self.info.clone()
    }

    fn get_time(&self) -> Result<SystemTime, TimeSourceError> {
        if !self.last_valid {
            self.read_gps_time()
        } else {
            Err(TimeSourceError::NotAvailable)
        }
    }

    fn check_health(&mut self) -> bool {
        match self.read_gps_time().is_ok()
    }

    fn update(&mut self) -> Result<(), TimeSourceError> {
        let healthy = self.check_health();
        self.last_valid = healthy;
        self.info.status = if healthy {
            TimeSourceStatus::Active
        } else {
            TimeSourceStatus::Failed
        };
        self.info.last_sync = Some(SystemTime::now());
        Ok(())
    }
}

pub struct AtomicClockSource {
    info: TimeSourceInfo,
}

impl AtomicClockSource {
    pub fn new(priority: u8) -> Self {
        AtomicClockSource {
            info: TimeSourceInfo {
                id: "atomic:local".to_string(),
                source_type: TimeSourceType::Atomic,
                status: TimeSourceStatus::Unknown,
                priority,
                accuracy_ns: 10,
                last_sync: None,
                offset_ns: None,
                drift_ppb: None,
            },
        }
    }

    #[cfg(target_os = "linux")]
    fn read_phc_time(&self) -> Result<SystemTime, TimeSourceError> {
        use std::fs::File;
        use std::io::Read;
        
        let mut file = File::open("/dev/ptp0")
            .map_err(|_| TimeSourceError::NotAvailable)?;
        
        let mut ts = unsafe {
            let mut ts = std::mem::zeroed::<libc::timespec();
            let result = libc::clock_gettime(libc::CLOCK_REALTIME, &mut ts);
            if result != 0 {
                return Err(TimeSourceError::Other("clock_gettime failed".to_string()));
            }
            ts
        };
        
        Ok(UNIX_EPOCH + Duration::new(ts.tv_sec as u64, ts.tv_nsec as u32))
    }

    #[cfg(not(target_os = "linux"))]
    fn read_phc_time(&self) -> Result<SystemTime, TimeSourceError> {
        Err(TimeSourceError::NotAvailable)
    }
}

impl TimeSource for AtomicClockSource {
    fn info(&self) -> TimeSourceInfo {
        self.info.clone()
    }

    fn get_time(&self) -> Result<SystemTime, TimeSourceError> {
        self.read_phc_time()
    }

    fn check_health(&mut self) -> bool {
        self.read_phc_time().is_ok()
    }

    fn update(&mut self) -> Result<(), TimeSourceError> {
        let healthy = self.check_health();
        self.info.status = if healthy {
            TimeSourceStatus::Active
        } else {
            TimeSourceStatus::Failed
        };
        self.info.last_sync = Some(SystemTime::now());
        Ok(())
    }
}

pub struct NtpUpstreamSource {
    info: TimeSourceInfo,
    server: String,
    port: u16,
}

impl NtpUpstreamSource {
    pub fn new(server: String, port: u16, priority: u8) -> Self {
        NtpUpstreamSource {
            info: TimeSourceInfo {
                id: format!("ntp:{}:{}", server, port),
                source_type: TimeSourceType::Ntp,
                status: TimeSourceStatus::Unknown,
                priority,
                accuracy_ns: 1000,
                last_sync: None,
                offset_ns: None,
                drift_ppb: None,
            },
            server,
            port,
        }
    }
}

impl TimeSource for NtpUpstreamSource {
    fn info(&self) -> TimeSourceInfo {
        self.info.clone()
    }

    fn get_time(&self) -> Result<SystemTime, TimeSourceError> {
        Err(TimeSourceError::NotAvailable)
    }

    fn check_health(&mut self) -> bool {
        false
    }

    fn update(&mut self) -> Result<(), TimeSourceError> {
        Ok(())
    }
}

pub struct PtpGrandmasterSource {
    info: TimeSourceInfo,
}

impl PtpGrandmasterSource {
    pub fn new(priority: u8) -> Self {
        PtpGrandmasterSource {
            info: TimeSourceInfo {
                id: "ptp:gm".to_string(),
                source_type: TimeSourceType::Ptp,
                status: TimeSourceStatus::Unknown,
                priority,
                accuracy_ns: 50,
                last_sync: None,
                offset_ns: None,
                drift_ppb: None,
            },
        }
    }
}

impl TimeSource for PtpGrandmasterSource {
    fn info(&self) -> TimeSourceInfo {
        self.info.clone()
    }

    fn get_time(&self) -> Result<SystemTime, TimeSourceError> {
        Err(TimeSourceError::NotAvailable)
    }

    fn check_health(&mut self) -> bool {
        false
    }

    fn update(&mut self) -> Result<(), TimeSourceError> {
        Ok(())
    }
}

pub struct LocalClockSource {
    info: TimeSourceInfo,
}

impl LocalClockSource {
    pub fn new() -> Self {
        LocalClockSource {
            info: TimeSourceInfo {
                id: "local:system".to_string(),
                source_type: TimeSourceType::Local,
                status: TimeSourceStatus::Active,
                priority: 255,
                accuracy_ns: 10_000_000,
                last_sync: Some(SystemTime::now()),
                offset_ns: Some(0),
                drift_ppb: Some(0.0),
            },
        }
    }
}

impl TimeSource for LocalClockSource {
    fn info(&self) -> TimeSourceInfo {
        self.info.clone()
    }

    fn get_time(&self) -> Result<SystemTime, TimeSourceError> {
        Ok(SystemTime::now())
    }

    fn check_health(&mut self) -> bool {
        true
    }

    fn update(&mut self) -> Result<(), TimeSourceError> {
        self.info.last_sync = Some(SystemTime::now());
        Ok(())
    }
}

pub struct TimeSourceManager {
    sources: RwLock<Vec<Box<dyn TimeSource>>>,
    active_source_id: AtomicU8,
    switchover_count: AtomicU8,
}

impl TimeSourceManager {
    pub fn new() -> Self {
        let mut sources: Vec<Box<dyn TimeSource>> = Vec::new();
        sources.push(Box::new(LocalClockSource::new()));
        
        TimeSourceManager {
            sources: RwLock::new(sources),
            active_source_id: AtomicU8::new(0),
            switchover_count: AtomicU8::new(0),
        }
    }

    pub async fn add_source(&self, source: Box<dyn TimeSource>) {
        let mut sources = self.sources.write().await;
        sources.push(source);
        drop(sources);
        self.select_best_source().await;
    }

    pub async fn add_gps_source(&self, device_path: String, priority: u8) {
        self.add_source(Box::new(GpsTimeSource::new(device_path, priority))).await;
    }

    pub async fn add_atomic_source(&self, priority: u8) {
        self.add_source(Box::new(AtomicClockSource::new(priority)))).await;
    }

    pub async fn add_ntp_source(&self, server: String, port: u16, priority: u8) {
        self.add_source(Box::new(NtpUpstreamSource::new(server, port, priority))).await;
    }

    pub async fn add_ptp_source(&self, priority: u8) {
        self.add_source(Box::new(PtpGrandmasterSource::new(priority)))).await;
    }

    pub async fn select_best_source(&self) {
        let sources = self.sources.read().await;
        let mut best_idx = 0;
        let mut best_priority = u8::MAX;
        
        for (i, source) in sources.iter().enumerate() {
            let info = source.info();
            if info.status == TimeSourceStatus::Active && info.priority < best_priority {
                best_priority = info.priority;
                best_idx = i;
            }
        }
        
        let old_idx = self.active_source_id.load(Ordering::Relaxed);
        if best_idx != old_idx as usize {
            info!("Switching time source from {} to {}", old_idx, best_idx);
            self.active_source_id.store(best_idx as u8, Ordering::Relaxed);
            self.switchover_count.fetch_add(1, Ordering::Relaxed);
        }
    }

    pub async fn get_time(&self) -> SystemTime {
        let sources = self.sources.read().await;
        let active_idx = self.active_source_id.load(Ordering::Relaxed) as usize;
        
        if let Some(source) = sources.get(active_idx) {
            if let Ok(time) = source.get_time() {
                return time;
            }
        }
        
        SystemTime::now()
    }

    pub async fn update_all(&self) {
        let mut sources = self.sources.write().await;
        for source in sources.iter_mut() {
            let _ = source.update();
        }
        drop(sources);
        self.select_best_source().await;
    }

    pub async fn get_all_sources(&self) -> Vec<TimeSourceInfo> {
        let sources = self.sources.read().await;
        sources.iter().map(|s| s.info()).collect()
    }

    pub async fn active_source_index(&self) -> usize {
        self.active_source_id.load(Ordering::Relaxed) as usize
    }

    pub async fn switchover_count(&self) -> u8 {
        self.switchover_count.load(Ordering::Relaxed)
    }

    pub fn start_health_check(&self, interval: Duration) {
        let manager = Arc::new(self);
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(interval);
            loop {
                ticker.tick().await;
                manager.update_all().await;
            }
        });
    }
}

impl Default for TimeSourceManager {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct TimeSourceReport {
    pub active_source: String,
    pub active_source_type: TimeSourceType,
    pub switchover_count: u8,
    pub sources: Vec<TimeSourceInfo>,
    pub current_time: String,
}
