use std::sync::Arc;
use std::time::{Duration, SystemTime};
use serde::Serialize;
use tokio::sync::RwLock;
use tokio::task;
use tracing::info;

use crate::stats::{StatsManager, ServerStats, ClientStats};
use crate::monitor::MonitorSnapshot;
use crate::time_source::TimeSourceManager;

#[derive(Debug, Clone, Serialize)]
pub struct FullStatsReport {
    pub timestamp: String,
    pub server: ServerStats,
    pub monitor: Option<MonitorSnapshot>,
    pub clients: Vec<ClientStats>,
    pub time_sources: Option<crate::time_source::TimeSourceReport>,
    pub ptp_stats: Option<PtpStats>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PtpStats {
    pub enabled: bool,
    pub sync_messages_sent: u64,
    pub follow_up_messages_sent: u64,
    pub announce_messages_sent: u64,
    pub delay_req_received: u64,
    pub delay_resp_sent: u64,
    pub last_sync_time: Option<String>,
}

impl Default for PtpStats {
    fn default() -> Self {
        PtpStats {
            enabled: false,
            sync_messages_sent: 0,
            follow_up_messages_sent: 0,
            announce_messages_sent: 0,
            delay_req_received: 0,
            delay_resp_sent: 0,
            last_sync_time: None,
        }
    }
}

pub struct ReportExporter {
    stats: Arc<StatsManager>,
    time_source_manager: Option<Arc<TimeSourceManager>>,
    ptp_stats: Arc<RwLock<PtpStats>>,
    report_history: Arc<RwLock<Vec<FullStatsReport>>>,
    max_history: usize,
}

impl ReportExporter {
    pub fn new(stats: Arc<StatsManager>) -> Self {
        ReportExporter {
            stats,
            time_source_manager: None,
            ptp_stats: Arc::new(RwLock::new(PtpStats::default())),
            report_history: Arc::new(RwLock::new(Vec::new())),
            max_history: 1008,
        }
    }

    pub fn with_time_source(mut self, manager: Arc<TimeSourceManager>) -> Self {
        self.time_source_manager = Some(manager);
        self
    }

    pub async fn set_ptp_enabled(&self, enabled: bool) {
        let mut stats = self.ptp_stats.write().await;
        stats.enabled = enabled;
    }

    pub async fn increment_sync(&self) {
        let mut stats = self.ptp_stats.write().await;
        stats.sync_messages_sent += 1;
    }

    pub async fn increment_follow_up(&self) {
        let mut stats = self.ptp_stats.write().await;
        stats.follow_up_messages_sent += 1;
    }

    pub async fn increment_announce(&self) {
        let mut stats = self.ptp_stats.write().await;
        stats.announce_messages_sent += 1;
    }

    pub async fn increment_delay_req(&self) {
        let mut stats = self.ptp_stats.write().await;
        stats.delay_req_received += 1;
    }

    pub async fn increment_delay_resp(&self) {
        let mut stats = self.ptp_stats.write().await;
        stats.delay_resp_sent += 1;
    }

    pub async fn generate_report(&self) -> FullStatsReport {
        use chrono::Utc;
        
        let server_stats = self.stats.get_server_stats();
        let client_stats = self.stats.get_client_stats().await;
        
        let time_source_report = if let Some(tsm) = &self.time_source_manager {
            let sources = tsm.get_all_sources().await;
            let active_idx = tsm.active_source_index().await;
            let switchover_count = tsm.switchover_count().await;
            
            let active_source = sources.get(active_idx).cloned();
            
            Some(crate::time_source::TimeSourceReport {
                active_source: active_source.as_ref().map(|s| s.id.clone()).unwrap_or_default(),
                active_source_type: active_source.as_ref().map(|s| s.source_type).unwrap_or(crate::time_source::TimeSourceType::Local),
                switchover_count,
                sources,
                current_time: Utc::now().to_rfc3339(),
            })
        } else {
            None
        };

        let ptp_stats = Some(self.ptp_stats.read().await.clone());

        FullStatsReport {
            timestamp: Utc::now().to_rfc3339(),
            server: server_stats,
            monitor: None,
            clients: client_stats,
            time_sources: time_source_report,
            ptp_stats,
        }
    }

    pub async fn export_json(&self) -> Result<String, serde_json::Error> {
        let report = self.generate_report().await;
        serde_json::to_string_pretty(&report)
    }

    pub async fn export_csv(&self) -> String {
        let report = self.generate_report().await;
        let mut csv = String::new();

        csv.push_str("=== Server Stats ===\n");
        csv.push_str("Metric,Value\n");
        csv.push_str(&format!("Total Requests,{}\n", report.server.total_requests));
        csv.push_str(&format!("Total Responses,{}\n", report.server.total_responses));
        csv.push_str(&format!("Clients Served,{}\n", report.server.clients_served));
        csv.push_str(&format!("Hardware Timestamping,{}\n", report.server.hardware_timestamping));
        csv.push_str(&format!("Mode,{}\n", report.server.mode));
        csv.push('\n');

        csv.push_str("=== Client Stats ===\n");
        csv.push_str("Address,Request Count,Avg Offset (ms),Avg Delay (ms)\n");
        for client in &report.clients {
            csv.push_str(&format!(
                "{},{},{:.3},{:.3}\n",
                client.address,
                client.request_count,
                client.avg_offset * 1000.0,
                client.avg_delay * 1000.0
            ));
        }

        if let Some(ptp) = &report.ptp_stats {
            csv.push('\n');
            csv.push_str("=== PTP Stats ===\n");
            csv.push_str("Metric,Value\n");
            csv.push_str(&format!("Enabled,{}\n", ptp.enabled));
            csv.push_str(&format!("Sync Messages,{}\n", ptp.sync_messages_sent));
            csv.push_str(&format!("Follow-Up Messages,{}\n", ptp.follow_up_messages_sent));
            csv.push_str(&format!("Announce Messages,{}\n", ptp.announce_messages_sent));
            csv.push_str(&format!("Delay Requests,{}\n", ptp.delay_req_received));
            csv.push_str(&format!("Delay Responses,{}\n", ptp.delay_resp_sent));
        }

        if let Some(ts) = &report.time_sources {
            csv.push('\n');
            csv.push_str("=== Time Sources ===\n");
            csv.push_str("ID,Type,Status,Priority,Accuracy (ns)\n");
            for source in &ts.sources {
                csv.push_str(&format!(
                    "{},{},{},{},{}\n",
                    source.id,
                    format!("{:?}", source.source_type),
                    format!("{:?}", source.status),
                    source.priority,
                    source.accuracy_ns
                ));
            }
        }

        csv
    }

    pub async fn export_prometheus(&self) -> String {
        let report = self.generate_report().await;
        let mut metrics = String::new();

        metrics.push_str("# HELP ntp_server_requests_total Total number of NTP requests\n");
        metrics.push_str("# TYPE ntp_server_requests_total counter\n");
        metrics.push_str(&format!("ntp_server_requests_total {}\n", report.server.total_requests));

        metrics.push_str("# HELP ntp_server_responses_total Total number of NTP responses\n");
        metrics.push_str("# TYPE ntp_server_responses_total counter\n");
        metrics.push_str(&format!("ntp_server_responses_total {}\n", report.server.total_responses));

        metrics.push_str("# HELP ntp_server_clients Number of unique clients served\n");
        metrics.push_str("# TYPE ntp_server_clients gauge\n");
        metrics.push_str(&format!("ntp_server_clients {}\n", report.server.clients_served));

        metrics.push_str("# HELP ntp_server_hardware_timestamping 1 if hardware timestamping is enabled\n");
        metrics.push_str("# TYPE ntp_server_hardware_timestamping gauge\n");
        let hw = if report.server.hardware_timestamping { 1 } else { 0 };
        metrics.push_str(&format!("ntp_server_hardware_timestamping {}\n", hw));

        for client in &report.clients {
            let addr = client.address.replace('.', "_").replace(':', "_");
            metrics.push_str(&format!("# HELP ntp_client_requests_{} Client request count\n", addr));
            metrics.push_str(&format!("# TYPE ntp_client_requests_{} counter\n", addr));
            metrics.push_str(&format!("ntp_client_requests_{} {}\n", addr, client.request_count));
        }

        if let Some(ptp) = &report.ptp_stats {
            if ptp.enabled {
                metrics.push_str("# HELP ptp_sync_messages_total Total PTP sync messages\n");
                metrics.push_str("# TYPE ptp_sync_messages_total counter\n");
                metrics.push_str(&format!("ptp_sync_messages_total {}\n", ptp.sync_messages_sent));

                metrics.push_str("# HELP ptp_followup_messages_total Total PTP follow-up messages\n");
                metrics.push_str("# TYPE ptp_followup_messages_total counter\n");
                metrics.push_str(&format!("ptp_followup_messages_total {}\n", ptp.follow_up_messages_sent));
            }
        }

        if let Some(ts) = &report.time_sources {
            metrics.push_str("# HELP time_source_switchovers Total time source switchovers\n");
            metrics.push_str("# TYPE time_source_switchovers counter\n");
            metrics.push_str(&format!("time_source_switchovers {}\n", ts.switchover_count));
        }

        metrics
    }

    pub async fn save_report(&self) {
        let report = self.generate_report().await;
        let mut history = self.report_history.write().await;
        history.push(report);
        if history.len() > self.max_history {
            history.remove(0);
        }
    }

    pub fn start_periodic_export(&self, interval: Duration, path: String, format: ExportFormat) {
        let exporter = Arc::new(self.clone());
        task::spawn(async move {
            let mut ticker = tokio::time::interval(interval);
            loop {
                ticker.tick().await;
                
                let content = match format {
                    ExportFormat::Json => exporter.export_json().await.unwrap_or_default(),
                    ExportFormat::Csv => exporter.export_csv().await,
                    ExportFormat::Prometheus => exporter.export_prometheus().await,
                };

                let filename = match format {
                    ExportFormat::Json => format!("{}/stats.json", path),
                    ExportFormat::Csv => format!("{}/stats.csv", path),
                    ExportFormat::Prometheus => format!("{}/metrics.prom", path),
                };

                if let Err(e) = tokio::fs::write(&filename, &content).await {
                    tracing::error!("Failed to write stats file: {}", e);
                }

                exporter.save_report().await;
                info!("Stats exported to {}", filename);
            }
        });
    }

    pub async fn get_report_history(&self) -> Vec<FullStatsReport> {
        self.report_history.read().await.clone()
    }
}

impl Clone for ReportExporter {
    fn clone(&self) -> Self {
        ReportExporter {
            stats: self.stats.clone(),
            time_source_manager: self.time_source_manager.clone(),
            ptp_stats: self.ptp_stats.clone(),
            report_history: self.report_history.clone(),
            max_history: self.max_history,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum ExportFormat {
    Json,
    Csv,
    Prometheus,
}
