const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');

class AuditReportGenerator extends EventEmitter {
    constructor(auditLogger, policyManager) {
        super();
        this.auditLogger = auditLogger;
        this.policyManager = policyManager;
        this.reportTemplates = {
            summary: this.generateSummaryReport.bind(this),
            detailed: this.generateDetailedReport.bind(this),
            compliance: this.generateComplianceReport.bind(this),
            incident: this.generateIncidentReport.bind(this)
        };
    }

    async generateReport(type, options = {}) {
        const template = this.reportTemplates[type];
        if (!template) {
            return { success: false, message: `未知的报告类型: ${type}` };
        }

        try {
            const report = await template(options);
            
            const reportId = this.generateReportId();
            const timestamp = new Date().toISOString();
            
            const reportData = {
                id: reportId,
                type,
                generatedAt: timestamp,
                generatedBy: os.hostname(),
                options,
                ...report
            };

            return {
                success: true,
                report: reportData,
                reportId,
                timestamp
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async generateSummaryReport(options = {}) {
        const { dateRange, includeStats = true } = options;
        const logs = this.getLogsByDateRange(dateRange);

        const summary = {
            title: 'USB Guardian - 审计摘要报告',
            period: this.formatDateRange(dateRange),
            statistics: {
                totalEvents: logs.length,
                byType: this.countByType(logs),
                byDevice: this.countByDevice(logs),
                blockedCount: logs.filter(l => l.type === 'device_blocked').length,
                allowedCount: logs.filter(l => l.type === 'device_allowed').length,
                fileOperations: logs.filter(l => l.type === 'file_operation').length
            },
            topDevices: this.getTopDevices(logs, 10),
            recentAlerts: logs
                .filter(l => ['device_blocked', 'decrypt_failed', 'erase_error'].includes(l.type))
                .slice(-20)
                .map(l => ({
                    type: l.type,
                    device: l.data?.deviceName || l.data?.device || '未知',
                    message: l.data?.reason || l.data?.message || '',
                    timestamp: l.timestamp
                }))
        };

        return summary;
    }

    async generateDetailedReport(options = {}) {
        const { dateRange, deviceId, includeFileOperations = true } = options;
        let logs = this.getLogsByDateRange(dateRange);

        if (deviceId) {
            logs = logs.filter(l => 
                l.data?.deviceId === deviceId || 
                l.data?.device?.id === deviceId
            );
        }

        const detailed = {
            title: 'USB Guardian - 详细审计报告',
            period: this.formatDateRange(dateRange),
            deviceFilter: deviceId || '全部设备',
            eventDetails: logs.map(log => ({
                id: log.id,
                type: log.type,
                timestamp: log.timestamp,
                data: log.data
            })),
            deviceSummary: this.getDeviceSummary(logs),
            fileOperationSummary: includeFileOperations ? this.getFileOperationSummary(logs) : null
        };

        return detailed;
    }

    async generateComplianceReport(options = {}) {
        const { dateRange, complianceStandard = 'generic' } = options;
        const logs = this.getLogsByDateRange(dateRange);

        const blockedDevices = logs.filter(l => l.type === 'device_blocked');
        const allowedDevices = logs.filter(l => l.type === 'device_allowed');
        const insertedDevices = logs.filter(l => l.type === 'device_inserted');
        const removedDevices = logs.filter(l => l.type === 'device_removed');

        const compliance = {
            title: 'USB Guardian - 合规性报告',
            period: this.formatDateRange(dateRange),
            standard: complianceStandard,
            complianceMetrics: {
                totalDeviceEvents: insertedDevices.length + removedDevices.length,
                blockedDevices: blockedDevices.length,
                allowedDevices: allowedDevices.length,
                policyComplianceRate: this.calculateComplianceRate(logs),
                unauthorizedAttempts: blockedDevices.length,
                encryptionEvents: logs.filter(l => l.type.startsWith('decrypt') || l.type.startsWith('encrypt')).length
            },
            policyViolations: blockedDevices.map(l => ({
                device: l.data?.deviceName || l.data?.device || '未知',
                reason: l.data?.reason || '策略违规',
                timestamp: l.timestamp
            })),
            recommendations: this.generateRecommendations(logs),
            complianceStatus: this.evaluateComplianceStatus(logs)
        };

        return compliance;
    }

    async generateIncidentReport(options = {}) {
        const { dateRange, incidentType } = options;
        const logs = this.getLogsByDateRange(dateRange);

        const incidentLogs = logs.filter(l => {
            if (!incidentType) {
                return ['device_blocked', 'decrypt_failed', 'erase_error', 'erase_failed'].includes(l.type);
            }
            return l.type === incidentType;
        });

        const incidents = {
            title: 'USB Guardian - 事件报告',
            period: this.formatDateRange(dateRange),
            incidentType: incidentType || '全部事件',
            totalIncidents: incidentLogs.length,
            incidents: incidentLogs.map(log => ({
                id: log.id,
                type: log.type,
                severity: this.getSeverity(log.type),
                device: log.data?.deviceName || log.data?.device || '未知',
                details: log.data,
                timestamp: log.timestamp,
                status: this.getIncidentStatus(log)
            })),
            summary: {
                bySeverity: this.countBySeverity(incidentLogs),
                byType: this.countByType(incidentLogs),
                resolutionRate: this.calculateResolutionRate(incidentLogs)
            }
        };

        return incidents;
    }

    exportReport(report, format = 'json') {
        switch (format) {
            case 'json':
                return this.exportAsJSON(report);
            case 'html':
                return this.exportAsHTML(report);
            case 'pdf':
                return this.exportAsPDF(report);
            case 'csv':
                return this.exportAsCSV(report);
            default:
                return this.exportAsJSON(report);
        }
    }

    exportAsJSON(report) {
        return {
            format: 'json',
            content: JSON.stringify(report, null, 2),
            filename: `audit-report-${report.reportId}.json`,
            mimeType: 'application/json'
        };
    }

    exportAsHTML(report) {
        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${report.report?.title || '审计报告'}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 40px 20px;
            background: #f5f5f5;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            border-radius: 16px;
            margin-bottom: 30px;
        }
        .header h1 { margin: 0 0 10px 0; font-size: 28px; }
        .header .meta { opacity: 0.9; font-size: 14px; }
        .section {
            background: white;
            padding: 30px;
            border-radius: 12px;
            margin-bottom: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .section h2 { margin-top: 0; color: #333; }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }
        .stat-value { font-size: 32px; font-weight: bold; color: #667eea; }
        .stat-label { font-size: 14px; color: #666; margin-top: 5px; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }
        th { background: #f8f9fa; font-weight: 600; }
        .alert { padding: 15px; border-radius: 8px; margin-bottom: 10px; }
        .alert-warning { background: #fff3cd; border-left: 4px solid #ffc107; }
        .alert-danger { background: #f8d7da; border-left: 4px solid #dc3545; }
        .alert-success { background: #d4edda; border-left: 4px solid #28a745; }
        .footer {
            text-align: center;
            padding: 20px;
            color: #999;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${report.report?.title || '审计报告'}</h1>
        <div class="meta">
            报告ID: ${report.reportId} | 生成时间: ${new Date(report.timestamp).toLocaleString('zh-CN')} | 主机: ${report.report?.generatedBy || os.hostname()}
        </div>
    </div>
    ${this.generateHTMLContent(report.report)}
    <div class="footer">
        USB Guardian Audit Report | Generated at ${new Date(report.timestamp).toLocaleString('zh-CN')}
    </div>
</body>
</html>`;

        return {
            format: 'html',
            content: html,
            filename: `audit-report-${report.reportId}.html`,
            mimeType: 'text/html'
        };
    }

    generateHTMLContent(report) {
        if (!report) return '';

        let html = '';

        if (report.statistics) {
            html += `<div class="section">
                <h2>统计摘要</h2>
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-value">${report.statistics.totalEvents}</div><div class="stat-label">总事件数</div></div>
                    <div class="stat-card"><div class="stat-value">${report.statistics.blockedCount}</div><div class="stat-label">阻止次数</div></div>
                    <div class="stat-card"><div class="stat-value">${report.statistics.allowedCount}</div><div class="stat-label">允许次数</div></div>
                    <div class="stat-card"><div class="stat-value">${report.statistics.fileOperations}</div><div class="stat-label">文件操作</div></div>
                </div>
            </div>`;
        }

        if (report.recentAlerts && report.recentAlerts.length > 0) {
            html += `<div class="section">
                <h2>最近告警</h2>
                ${report.recentAlerts.slice(0, 10).map(alert => 
                    `<div class="alert ${alert.type === 'device_blocked' ? 'alert-warning' : 'alert-danger'}">
                        <strong>${this.getLogTypeName(alert.type)}</strong> - ${alert.device}
                        <br><small>${alert.message}</small>
                        <br><small>${new Date(alert.timestamp).toLocaleString('zh-CN')}</small>
                    </div>`
                ).join('')}
            </div>`;
        }

        if (report.eventDetails) {
            html += `<div class="section">
                <h2>事件详情</h2>
                <table>
                    <thead><tr><th>时间</th><th>类型</th><th>设备</th><th>详情</th></tr></thead>
                    <tbody>
                        ${report.eventDetails.slice(0, 100).map(event => 
                            `<tr>
                                <td>${new Date(event.timestamp).toLocaleString('zh-CN')}</td>
                                <td>${this.getLogTypeName(event.type)}</td>
                                <td>${event.data?.deviceName || event.data?.device || '-'}</td>
                                <td>${event.data?.reason || event.data?.message || event.data?.filePath || '-'}</td>
                            </tr>`
                        ).join('')}
                    </tbody>
                </table>
            </div>`;
        }

        if (report.complianceMetrics) {
            html += `<div class="section">
                <h2>合规性指标</h2>
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-value">${report.complianceMetrics.policyComplianceRate}%</div><div class="stat-label">策略合规率</div></div>
                    <div class="stat-card"><div class="stat-value">${report.complianceMetrics.unauthorizedAttempts}</div><div class="stat-label">未授权尝试</div></div>
                    <div class="stat-card"><div class="stat-value">${report.complianceMetrics.encryptionEvents}</div><div class="stat-label">加密事件</div></div>
                </div>
            </div>`;
        }

        return html;
    }

    exportAsPDF(report) {
        const htmlReport = this.exportAsHTML(report);
        return {
            format: 'pdf',
            content: htmlReport.content,
            filename: `audit-report-${report.reportId}.html`,
            mimeType: 'text/html',
            note: '请使用浏览器打开HTML文件并打印为PDF'
        };
    }

    exportAsCSV(report) {
        const events = report.report?.eventDetails || report.report?.incidents || [];
        const headers = ['时间', '类型', '设备', '详情'];
        const rows = events.map(event => [
            new Date(event.timestamp || event.id).toLocaleString('zh-CN'),
            this.getLogTypeName(event.type),
            event.data?.deviceName || event.data?.device || event.device || '',
            (event.data?.reason || event.data?.message || event.data?.filePath || '').replace(/,/g, ';')
        ]);

        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

        return {
            format: 'csv',
            content: csv,
            filename: `audit-report-${report.reportId}.csv`,
            mimeType: 'text/csv'
        };
    }

    getLogsByDateRange(dateRange) {
        const allLogs = this.auditLogger.logEntries || [];
        
        if (!dateRange) {
            return allLogs;
        }

        const { start, end } = dateRange;
        return allLogs.filter(log => {
            const logDate = new Date(log.timestamp);
            if (start && logDate < new Date(start)) return false;
            if (end && logDate > new Date(end)) return false;
            return true;
        });
    }

    formatDateRange(dateRange) {
        if (!dateRange) return '全部时间';
        const start = dateRange.start ? new Date(dateRange.start).toLocaleDateString('zh-CN') : '开始';
        const end = dateRange.end ? new Date(dateRange.end).toLocaleDateString('zh-CN') : '现在';
        return `${start} 至 ${end}`;
    }

    countByType(logs) {
        const counts = {};
        for (const log of logs) {
            counts[log.type] = (counts[log.type] || 0) + 1;
        }
        return counts;
    }

    countByDevice(logs) {
        const counts = {};
        for (const log of logs) {
            const device = log.data?.deviceName || log.data?.device || '未知';
            counts[device] = (counts[device] || 0) + 1;
        }
        return counts;
    }

    getTopDevices(logs, limit = 10) {
        const deviceCounts = this.countByDevice(logs);
        return Object.entries(deviceCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([device, count]) => ({ device, count }));
    }

    getDeviceSummary(logs) {
        const devices = {};
        for (const log of logs) {
            const deviceId = log.data?.deviceId || log.data?.device?.id || 'unknown';
            if (!devices[deviceId]) {
                devices[deviceId] = {
                    device: log.data?.deviceName || log.data?.device || '未知',
                    events: [],
                    insertCount: 0,
                    removeCount: 0,
                    blockCount: 0,
                    allowCount: 0
                };
            }
            devices[deviceId].events.push(log);
            if (log.type === 'device_inserted') devices[deviceId].insertCount++;
            if (log.type === 'device_removed') devices[deviceId].removeCount++;
            if (log.type === 'device_blocked') devices[deviceId].blockCount++;
            if (log.type === 'device_allowed') devices[deviceId].allowCount++;
        }
        return Object.values(devices);
    }

    getFileOperationSummary(logs) {
        const fileOps = logs.filter(l => l.type === 'file_operation');
        const summary = {
            total: fileOps.length,
            byType: { write: 0, modify: 0, delete: 0, mkdir: 0, rmdir: 0 },
            byDevice: {},
            totalFiles: new Set(fileOps.map(l => l.data?.filePath).filter(Boolean)).size
        };

        for (const op of fileOps) {
            const type = op.data?.type || 'unknown';
            summary.byType[type] = (summary.byType[type] || 0) + 1;

            const device = op.data?.deviceName || '未知';
            if (!summary.byDevice[device]) summary.byDevice[device] = 0;
            summary.byDevice[device]++;
        }

        return summary;
    }

    calculateComplianceRate(logs) {
        const totalEvents = logs.filter(l => ['device_inserted', 'device_blocked', 'device_allowed'].includes(l.type)).length;
        if (totalEvents === 0) return 100;

        const compliantEvents = logs.filter(l => 
            l.type === 'device_allowed' || 
            (l.type === 'device_blocked' && l.data?.reason?.includes('策略'))
        ).length;

        return Math.round((compliantEvents / totalEvents) * 100);
    }

    generateRecommendations(logs) {
        const recommendations = [];
        const blockedCount = logs.filter(l => l.type === 'device_blocked').length;
        const decryptFailures = logs.filter(l => l.type === 'decrypt_failed').length;

        if (blockedCount > 10) {
            recommendations.push({
                level: 'high',
                message: '大量设备被阻止，请检查白名单配置是否需要更新'
            });
        }

        if (decryptFailures > 0) {
            recommendations.push({
                level: 'medium',
                message: '存在加密U盘解密失败，建议加强加密设备管理'
            });
        }

        if (recommendations.length === 0) {
            recommendations.push({
                level: 'low',
                message: '系统运行正常，建议定期审计USB设备使用情况'
            });
        }

        return recommendations;
    }

    evaluateComplianceStatus(logs) {
        const complianceRate = this.calculateComplianceRate(logs);
        if (complianceRate >= 95) return { status: 'excellent', message: '合规性优秀' };
        if (complianceRate >= 80) return { status: 'good', message: '合规性良好' };
        if (complianceRate >= 60) return { status: 'fair', message: '合规性一般，需要改进' };
        return { status: 'poor', message: '合规性较差，请加强管理' };
    }

    getSeverity(logType) {
        const severityMap = {
            'device_blocked': 'high',
            'decrypt_failed': 'medium',
            'erase_error': 'critical',
            'erase_failed': 'critical'
        };
        return severityMap[logType] || 'low';
    }

    countBySeverity(incidents) {
        const counts = { critical: 0, high: 0, medium: 0, low: 0 };
        for (const incident of incidents) {
            const severity = this.getSeverity(incident.type);
            counts[severity] = (counts[severity] || 0) + 1;
        }
        return counts;
    }

    calculateResolutionRate(incidents) {
        if (incidents.length === 0) return 100;
        const resolved = incidents.filter(i => i.status === 'resolved').length;
        return Math.round((resolved / incidents.length) * 100);
    }

    getIncidentStatus(log) {
        if (log.type === 'device_blocked') return 'blocked';
        if (log.type === 'decrypt_failed') return 'failed';
        if (log.type === 'erase_error' || log.type === 'erase_failed') return 'error';
        return 'pending';
    }

    getLogTypeName(type) {
        const names = {
            device_inserted: '设备插入',
            device_removed: '设备移除',
            device_blocked: '设备阻止',
            device_allowed: '设备允许',
            file_operation: '文件操作',
            system_started: '系统启动',
            system_stopped: '系统停止',
            decrypt_attempt: '解密尝试',
            decrypt_success: '解密成功',
            decrypt_failed: '解密失败',
            erase_started: '擦除开始',
            erase_completed: '擦除完成',
            erase_failed: '擦除失败',
            erase_error: '擦除错误',
            erase_cancelled: '擦除取消'
        };
        return names[type] || type;
    }

    generateReportId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9).toUpperCase();
    }

    getReportTypes() {
        return [
            { id: 'summary', name: '摘要报告', description: '包含统计摘要和最近告警' },
            { id: 'detailed', name: '详细报告', description: '包含所有事件的详细信息' },
            { id: 'compliance', name: '合规性报告', description: '合规性评估和建议' },
            { id: 'incident', name: '事件报告', description: '安全事件详情' }
        ];
    }

    getExportFormats() {
        return [
            { id: 'json', name: 'JSON', description: '机器可读格式' },
            { id: 'html', name: 'HTML', description: '浏览器可读格式' },
            { id: 'csv', name: 'CSV', description: '表格格式' },
            { id: 'pdf', name: 'PDF', description: '打印格式（通过浏览器转换）' }
        ];
    }
}

module.exports = { AuditReportGenerator };
