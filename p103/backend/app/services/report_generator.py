from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from datetime import datetime
import json
from io import StringIO
import os
from pathlib import Path

from app.core import SessionLocal
from app.models import TestTask, PacketRecord, CrashRecord, Target
from .state_machine import ProtocolStateMachine


@dataclass
class TestReport:
    task_id: int
    task_name: str
    protocol: str
    target_info: Dict[str, Any]
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    duration_seconds: float
    total_packets: int
    total_crashes: int
    crash_rate: float
    packet_statistics: Dict[str, Any]
    crash_details: List[Dict[str, Any]]
    strategy_distribution: Dict[str, int]
    state_machine_stats: Dict[str, Any]
    recommendations: List[str]
    generated_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "task_name": self.task_name,
            "protocol": self.protocol,
            "target_info": self.target_info,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration_seconds": round(self.duration_seconds, 2),
            "total_packets": self.total_packets,
            "total_crashes": self.total_crashes,
            "crash_rate": round(self.crash_rate, 4),
            "packet_statistics": self.packet_statistics,
            "crash_details": self.crash_details,
            "strategy_distribution": self.strategy_distribution,
            "state_machine_stats": self.state_machine_stats,
            "recommendations": self.recommendations,
            "generated_at": self.generated_at.isoformat(),
        }

    def to_html(self) -> str:
        html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>模糊测试报告 - {self.task_name}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'JetBrains Mono', -apple-system, sans-serif; background: #0a0a0f; color: #e5e7eb; padding: 40px; line-height: 1.6; }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        h1 {{ color: #fff; font-size: 32px; margin-bottom: 8px; }}
        h2 {{ color: #fff; font-size: 24px; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #1e40af; }}
        h3 {{ color: #fff; font-size: 18px; margin: 24px 0 12px; }}
        .header {{ background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); padding: 32px; border-radius: 12px; margin-bottom: 32px; }}
        .header .subtitle {{ color: #9ca3af; font-size: 14px; }}
        .stats-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }}
        .stat-card {{ background: #1a1a2e; padding: 20px; border-radius: 8px; border: 1px solid #2d2d4a; }}
        .stat-value {{ font-size: 28px; font-weight: bold; color: #60a5fa; }}
        .stat-label {{ font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }}
        .critical {{ color: #ef4444 !important; }}
        .success {{ color: #10b981 !important; }}
        .warning {{ color: #f59e0b !important; }}
        table {{ width: 100%; border-collapse: collapse; margin: 16px 0; }}
        th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #2d2d4a; }}
        th {{ background: #1a1a2e; color: #fff; font-weight: 600; }}
        tr:hover {{ background: rgba(96, 165, 250, 0.05); }}
        .crash-item {{ background: #1a1a2e; border: 1px solid #ef444430; border-radius: 8px; padding: 16px; margin-bottom: 12px; }}
        .crash-header {{ display: flex; justify-content: space-between; margin-bottom: 8px; }}
        .severity {{ padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }}
        .severity-critical {{ background: #ef4444; color: white; }}
        .severity-high {{ background: #f97316; color: white; }}
        .severity-medium {{ background: #f59e0b; color: white; }}
        .severity-low {{ background: #10b981; color: white; }}
        .hex-data {{ font-family: 'JetBrains Mono', monospace; background: #0f0f1a; padding: 8px 12px; border-radius: 4px; color: #60a5fa; font-size: 12px; word-break: break-all; }}
        .recommendations {{ background: #1a1a2e; border-left: 4px solid #10b981; padding: 16px 20px; border-radius: 0 8px 8px 0; }}
        .recommendations ul {{ margin-left: 20px; margin-top: 8px; }}
        .recommendations li {{ margin-bottom: 8px; color: #9ca3af; }}
        .footer {{ margin-top: 48px; padding-top: 24px; border-top: 1px solid #2d2d4a; text-align: center; color: #6b7280; font-size: 12px; }}
        .tag {{ display: inline-block; padding: 2px 8px; background: rgba(96, 165, 250, 0.1); color: #60a5fa; border-radius: 4px; font-size: 12px; margin-right: 4px; }}
        .progress-bar {{ height: 8px; background: #2d2d4a; border-radius: 4px; overflow: hidden; margin-top: 8px; }}
        .progress-fill {{ height: 100%; background: linear-gradient(90deg, #1e40af, #60a5fa); }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔬 模糊测试报告</h1>
            <div class="subtitle">
                任务: {self.task_name} | 
                协议: {self.protocol.upper()} | 
                生成时间: {self.generated_at.strftime('%Y-%m-%d %H:%M:%S UTC')}
            </div>
        </div>

        <h2>📊 测试概览</h2>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">{self.total_packets}</div>
                <div class="stat-label">发送报文总数</div>
            </div>
            <div class="stat-card">
                <div class="stat-value critical">{self.total_crashes}</div>
                <div class="stat-label">检测崩溃次数</div>
            </div>
            <div class="stat-card">
                <div class="stat-value {'critical' if self.crash_rate > 0.01 else 'success'}">{self.crash_rate * 100:.2f}%</div>
                <div class="stat-label">崩溃率</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{int(self.duration_seconds // 60)}:{int(self.duration_seconds % 60):02d}</div>
                <div class="stat-label">测试时长</div>
            </div>
        </div>

        <h3>目标设备信息</h3>
        <table>
            <tr><th>设备名称</th><td>{self.target_info.get('name', 'N/A')}</td></tr>
            <tr><th>IP地址</th><td>{self.target_info.get('ip_address', 'N/A')}</td></tr>
            <tr><th>端口</th><td>{self.target_info.get('port', 'N/A')}</td></tr>
            <tr><th>从站ID</th><td>{self.target_info.get('slave_id', 'N/A')}</td></tr>
            <tr><th>测试开始</th><td>{self.start_time.strftime('%Y-%m-%d %H:%M:%S') if self.start_time else 'N/A'}</td></tr>
            <tr><th>测试结束</th><td>{self.end_time.strftime('%Y-%m-%d %H:%M:%S') if self.end_time else '进行中'}</td></tr>
        </table>

        <h2>📈 报文统计</h2>
        <table>
            <tr><th>统计项</th><th>数值</th></tr>
            <tr><td>发送报文总数</td><td>{self.packet_statistics.get('total_sent', 0)}</td></tr>
            <tr><td>收到响应数</td><td>{self.packet_statistics.get('total_received', 0)}</td></tr>
            <tr><td>无响应数</td><td>{self.packet_statistics.get('no_response', 0)}</td></tr>
            <tr><td>异常响应数</td><td>{self.packet_statistics.get('error_responses', 0)}</td></tr>
            <tr><td>平均响应时间</td><td>{self.packet_statistics.get('avg_response_time', 0):.2f} ms</td></tr>
        </table>

        <h3>策略分布</h3>
        <div style="background: #1a1a2e; padding: 20px; border-radius: 8px;">
"""
        for strategy, count in self.strategy_distribution.items():
            percentage = (count / max(1, self.total_packets)) * 100
            html += f"""
            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; font-size: 14px;">
                    <span>{strategy}</span>
                    <span>{count} ({percentage:.1f}%)</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: {percentage}%;"></div>
                </div>
            </div>"""

        html += f"""
        </div>

        <h2>🚨 崩溃详情 ({self.total_crashes})</h2>
"""
        if self.crash_details:
            for crash in self.crash_details[:10]:
                severity_class = f"severity-{crash.get('severity', 'high')}"
                html += f"""
        <div class="crash-item">
            <div class="crash-header">
                <span class="severity {severity_class}">{crash.get('severity', 'high').upper()}</span>
                <span style="color: #9ca3af; font-size: 12px;">{crash.get('timestamp', 'N/A')}</span>
            </div>
            <p style="margin: 8px 0;">{crash.get('description', 'N/A')}</p>
            <div class="hex-data">{crash.get('packet_hex', 'N/A')}</div>
        </div>"""
            if len(self.crash_details) > 10:
                html += f"<p style=\"text-align: center; color: #9ca3af; margin-top: 16px;\">... 还有 {len(self.crash_details) - 10} 条崩溃记录</p>"
        else:
            html += """
        <div style="text-align: center; padding: 40px; color: #10b981;">
            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
            <p>未检测到崩溃事件</p>
        </div>"""

        html += f"""
        <h2>🧠 状态机分析</h2>
        <table>
            <tr><th>当前状态</th><td><span class="tag">{self.state_machine_stats.get('current_state', 'N/A')}</span></td></tr>
            <tr><th>状态转换总数</th><td>{self.state_machine_stats.get('total_transitions', 0)}</td></tr>
            <tr><th>高风险状态</th><td>{', '.join(self.state_machine_stats.get('crash_prone_states', [])) or '无'}</td></tr>
        </table>

        <h2>💡 改进建议</h2>
        <div class="recommendations">
            <strong>基于测试结果的建议：</strong>
            <ul>"""
        for rec in self.recommendations:
            html += f"<li>{rec}</li>"
        if not self.recommendations:
            html += "<li>测试结果良好，继续保持监控</li>"

        html += f"""
            </ul>
        </div>

        <div class="footer">
            <p>Modbus Fuzzing Platform | 自动化模糊测试报告</p>
            <p style="margin-top: 8px;">本报告由系统自动生成</p>
        </div>
    </div>
</body>
</html>"""
        return html

    def save_html(self, output_dir: str) -> str:
        os.makedirs(output_dir, exist_ok=True)
        filename = f"report_{self.task_id}_{self.generated_at.strftime('%Y%m%d_%H%M%S')}.html"
        filepath = os.path.join(output_dir, filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(self.to_html())
        
        return filepath

    def save_json(self, output_dir: str) -> str:
        os.makedirs(output_dir, exist_ok=True)
        filename = f"report_{self.task_id}_{self.generated_at.strftime('%Y%m%d_%H%M%S')}.json"
        filepath = os.path.join(output_dir, filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)
        
        return filepath


class ReportGenerator:
    def __init__(self, output_dir: str = "data/reports"):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def generate_report(self, task_id: int, state_machine: Optional[ProtocolStateMachine] = None) -> TestReport:
        db = SessionLocal()
        try:
            task = db.query(TestTask).filter(TestTask.id == task_id).first()
            if not task:
                raise ValueError(f"测试任务 {task_id} 不存在")
            
            target = db.query(Target).filter(Target.id == task.target_id).first()
            
            packets = db.query(PacketRecord).filter(PacketRecord.task_id == task_id).all()
            crashes = db.query(CrashRecord).filter(CrashRecord.task_id == task_id).all()
            
            total_sent = len([p for p in packets if p.direction == "sent"])
            total_received = len([p for p in packets if p.direction == "received"])
            no_response = len([p for p in packets if p.direction == "sent" and p.is_error])
            error_responses = len([p for p in packets if p.direction == "received" and (p.function_code or 0) & 0x80])
            
            response_times = [p.response_time_ms for p in packets if p.direction == "received" and p.response_time_ms]
            avg_response_time = sum(response_times) / len(response_times) if response_times else 0
            
            strategy_distribution: Dict[str, int] = {}
            for p in packets:
                if p.direction == "sent":
                    strategy = "unknown"
                    if p.description:
                        for key in ["功能码", "地址", "数据", "截断", "随机", "从站"]:
                            if key in p.description:
                                strategy = p.description.split()[0]
                                break
                    strategy_distribution[strategy] = strategy_distribution.get(strategy, 0) + 1
            
            crash_details = [
                {
                    "id": c.id,
                    "timestamp": c.timestamp.isoformat() if c.timestamp else None,
                    "packet_hex": c.packet_hex,
                    "description": c.description,
                    "severity": c.severity,
                    "reproducible": c.reproducible,
                }
                for c in crashes
            ]
            
            start_time = task.start_time
            end_time = task.end_time or datetime.utcnow()
            duration = (end_time - start_time).total_seconds() if start_time else 0
            
            recommendations = self._generate_recommendations(
                crash_count=len(crashes),
                crash_rate=len(crashes) / max(1, total_sent),
                crash_details=crash_details,
                state_machine_stats=state_machine.get_state_statistics() if state_machine else {},
            )
            
            report = TestReport(
                task_id=task_id,
                task_name=task.name,
                protocol=getattr(target, 'protocol', 'modbus') if target else 'modbus',
                target_info={
                    "name": target.name if target else "Unknown",
                    "ip_address": target.ip_address if target else "N/A",
                    "port": target.port if target else "N/A",
                    "slave_id": target.slave_id if target else "N/A",
                },
                start_time=start_time,
                end_time=task.end_time,
                duration_seconds=duration,
                total_packets=task.packet_count or total_sent,
                total_crashes=task.crash_count or len(crashes),
                crash_rate=(task.crash_count or len(crashes)) / max(1, task.packet_count or total_sent),
                packet_statistics={
                    "total_sent": total_sent,
                    "total_received": total_received,
                    "no_response": no_response,
                    "error_responses": error_responses,
                    "avg_response_time": avg_response_time,
                },
                crash_details=crash_details,
                strategy_distribution=strategy_distribution,
                state_machine_stats=state_machine.get_state_statistics() if state_machine else {},
                recommendations=recommendations,
            )
            
            return report
        finally:
            db.close()

    def _generate_recommendations(self, crash_count: int, crash_rate: float, 
                                  crash_details: List[Dict[str, Any]],
                                  state_machine_stats: Dict[str, Any]) -> List[str]:
        recommendations = []
        
        if crash_count == 0:
            recommendations.append("设备表现良好，建议增加测试时长和报文数量进一步验证")
            recommendations.append("可以尝试启用更多变异策略进行深度测试")
        elif crash_rate > 0.05:
            recommendations.append(f"⚠️ 崩溃率较高 ({crash_rate*100:.1f}%)，设备存在严重安全问题")
            recommendations.append("建议立即停止测试并分析崩溃样本")
            recommendations.append("重点关注触发崩溃的报文模式")
        elif crash_rate > 0.01:
            recommendations.append("设备存在一定稳定性问题，建议进行针对性测试")
            recommendations.append("记录并重现崩溃场景以进行根因分析")
        
        crash_prone = state_machine_stats.get('crash_prone_states', [])
        if crash_prone:
            recommendations.append(f"高风险状态: {', '.join(crash_prone)}，建议深入测试这些状态")
        
        severe_crashes = [c for c in crash_details if c.get('severity') == 'critical']
        if severe_crashes:
            recommendations.append(f"检测到 {len(severe_crashes)} 次严重崩溃，需要优先分析")
        
        if len(crash_details) > 0:
            recommendations.append("建议对崩溃报文进行逆向分析，定位漏洞位置")
            recommendations.append("考虑对设备进行固件级别的安全审计")
        
        return recommendations

    def save_report(self, report: TestReport, format: str = "html") -> str:
        if format.lower() == "html":
            return report.save_html(self.output_dir)
        elif format.lower() == "json":
            return report.save_json(self.output_dir)
        else:
            raise ValueError(f"不支持的报告格式: {format}")
