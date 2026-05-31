import csv
import io
import os
from datetime import datetime
from typing import List, Dict, Optional
from dataclasses import dataclass

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        Image as RLImage
    )
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np


@dataclass
class DetectionReport:
    detection_id: int
    station: str
    channel: str
    detection_time: str
    correlation_coefficient: float
    template_name: str
    threshold_used: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    depth: Optional[float] = None
    magnitude: Optional[float] = None


class ReportGenerator:
    def __init__(self):
        self.output_dir = "./reports"
        os.makedirs(self.output_dir, exist_ok=True)

    def generate_csv(
        self,
        detections: List[Dict],
        filename: Optional[str] = None,
    ) -> str:
        if filename is None:
            filename = f"detections_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

        filepath = os.path.join(self.output_dir, filename)

        fieldnames = [
            "id",
            "station",
            "channel",
            "detection_time",
            "correlation_coefficient",
            "template_name",
            "threshold_used",
            "latitude",
            "longitude",
            "depth",
        ]

        with open(filepath, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()

            for det in detections:
                writer.writerow({
                    "id": det.get("id", ""),
                    "station": det.get("station", ""),
                    "channel": det.get("channel", ""),
                    "detection_time": det.get("detection_time", ""),
                    "correlation_coefficient": det.get("correlation_coefficient", ""),
                    "template_name": det.get("template_name", ""),
                    "threshold_used": det.get("threshold_used", ""),
                    "latitude": det.get("latitude", ""),
                    "longitude": det.get("longitude", ""),
                    "depth": det.get("depth", ""),
                })

        return filepath

    def generate_csv_bytes(self, detections: List[Dict]) -> bytes:
        output = io.StringIO()
        fieldnames = [
            "id", "station", "channel", "detection_time",
            "correlation_coefficient", "template_name",
            "threshold_used", "latitude", "longitude", "depth",
        ]

        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()

        for det in detections:
            writer.writerow({
                "id": det.get("id", ""),
                "station": det.get("station", ""),
                "channel": det.get("channel", ""),
                "detection_time": det.get("detection_time", ""),
                "correlation_coefficient": det.get("correlation_coefficient", ""),
                "template_name": det.get("template_name", ""),
                "threshold_used": det.get("threshold_used", ""),
                "latitude": det.get("latitude", ""),
                "longitude": det.get("longitude", ""),
                "depth": det.get("depth", ""),
            })

        return output.getvalue().encode('utf-8')

    def generate_cc_histogram(self, detections: List[Dict], filepath: str) -> str:
        if len(detections) == 0:
            return ""

        cc_values = [det.get("correlation_coefficient", 0) for det in detections]

        plt.figure(figsize=(8, 4))
        plt.hist(cc_values, bins=20, range=(0.5, 1.0),
                 edgecolor='black', alpha=0.7, color='steelblue')
        plt.xlabel('相关系数')
        plt.ylabel('频数')
        plt.title('检测结果相关系数分布')
        plt.grid(True, alpha=0.3)
        plt.axvline(np.mean(cc_values), color='red',
                    linestyle='--', label=f'均值: {np.mean(cc_values):.3f}')
        plt.legend()
        plt.tight_layout()
        plt.savefig(filepath, dpi=150, bbox_inches='tight')
        plt.close()

        return filepath

    def generate_detection_timeline(self, detections: List[Dict], filepath: str) -> str:
        if len(detections) == 0:
            return ""

        times = [det.get("detection_time", "") for det in detections]
        cc_values = [det.get("correlation_coefficient", 0) for det in detections]
        stations = list(set(det.get("station", "") for det in detections))

        station_colors = plt.cm.Set3(np.linspace(0, 1, len(stations)))
        color_map = {station: station_colors[i] for i, station in enumerate(stations)}

        plt.figure(figsize=(10, 5))

        for i, (time, cc, det) in enumerate(zip(times, cc_values, detections)):
            station = det.get("station", "")
            plt.scatter(i, cc, c=[color_map.get(station, 'gray')],
                        s=50, alpha=0.8, zorder=5)

        plt.plot(range(len(cc_values)), cc_values, 'b-', alpha=0.3, zorder=3)

        plt.xlabel('检测序号')
        plt.ylabel('相关系数')
        plt.title('检测时间线')
        plt.grid(True, alpha=0.3)

        legend_elements = [plt.Line2D([0], [0], marker='o', color='w',
                                       markerfacecolor=color_map[station],
                                       markersize=10, label=station)
                           for station in stations]
        plt.legend(handles=legend_elements, title='台站')

        plt.tight_layout()
        plt.savefig(filepath, dpi=150, bbox_inches='tight')
        plt.close()

        return filepath

    def generate_pdf_report(
        self,
        detections: List[Dict],
        template_name: str = "未知模板",
        detection_parameters: Optional[Dict] = None,
        filename: Optional[str] = None,
    ) -> Optional[str]:
        if not REPORTLAB_AVAILABLE:
            print("警告: reportlab 不可用，无法生成 PDF 报告")
            return None

        if filename is None:
            filename = f"detection_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"

        filepath = os.path.join(self.output_dir, filename)

        doc = SimpleDocTemplate(
            filepath,
            pagesize=A4,
            rightMargin=2 * cm,
            leftMargin=2 * cm,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            alignment=TA_CENTER,
            spaceAfter=30,
            textColor=colors.HexColor('#2c3e50'),
        )
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            spaceBefore=20,
            spaceAfter=10,
            textColor=colors.HexColor('#34495e'),
        )
        normal_style = styles['Normal']

        story = []

        story.append(Paragraph("地震事件检测报告", title_style))
        story.append(Spacer(1, 0.5 * cm))

        story.append(Paragraph("一、报告概要", heading_style))

        summary_data = [
            ["报告生成时间", datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
            ["检测模板", template_name],
            ["检测结果总数", str(len(detections))],
            ["使用阈值", str(detection_parameters.get("threshold", "N/A")) if detection_parameters else "N/A"],
            ["自适应阈值", "是" if (detection_parameters and detection_parameters.get("use_adaptive_threshold")) else "否"],
        ]

        summary_table = Table(summary_data, colWidths=[5 * cm, 8 * cm])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f8f9fa')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#2c3e50')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#dee2e6')),
        ]))
        story.append(summary_table)
        story.append(Spacer(1, 0.5 * cm))

        story.append(Paragraph("二、检测结果统计", heading_style))

        if len(detections) > 0:
            cc_values = [det.get("correlation_coefficient", 0) for det in detections]
            stats_data = [
                ["统计项", "数值"],
                ["相关系数均值", f"{np.mean(cc_values):.3f}"],
                ["相关系数最大值", f"{np.max(cc_values):.3f}"],
                ["相关系数最小值", f"{np.min(cc_values):.3f}"],
                ["相关系数标准差", f"{np.std(cc_values):.3f}"],
                ["检测台站数", str(len(set(d.get("station", "") for d in detections)))],
            ]

            stats_table = Table(stats_data, colWidths=[5 * cm, 8 * cm])
            stats_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3498db')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 11),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bdc3c7')),
            ]))
            story.append(stats_table)
        story.append(Spacer(1, 0.5 * cm))

        if len(detections) > 0:
            story.append(Paragraph("三、检测结果列表", heading_style))

            table_data = [["序号", "台站", "通道", "检测时间", "相关系数"]]
            for i, det in enumerate(detections[:20], 1):
                table_data.append([
                    str(i),
                    det.get("station", ""),
                    det.get("channel", ""),
                    det.get("detection_time", "")[:19],
                    f"{det.get('correlation_coefficient', 0):.3f}",
                ])

            if len(detections) > 20:
                table_data.append(["...", "...", "...", f"还有 {len(detections) - 20} 条记录...", "..."])

            results_table = Table(table_data, colWidths=[1.5 * cm, 2 * cm, 2 * cm, 4.5 * cm, 2.5 * cm])
            results_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#27ae60')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bdc3c7')),
            ]))
            story.append(results_table)

        story.append(Spacer(1, 1 * cm))
        story.append(Paragraph("-- 报告结束 --", ParagraphStyle(
            'EndNote', parent=normal_style, alignment=TA_CENTER, textColor=colors.gray)))

        doc.build(story)

        return filepath

    def generate_pdf_bytes(
        self,
        detections: List[Dict],
        template_name: str = "未知模板",
        detection_parameters: Optional[Dict] = None,
    ) -> Optional[bytes]:
        if not REPORTLAB_AVAILABLE:
            return None

        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
            tmp_path = tmp.name

        try:
            self.generate_pdf_report(detections, template_name, detection_parameters, os.path.basename(tmp_path))
            with open(os.path.join(self.output_dir, os.path.basename(tmp_path)), 'rb') as f:
                return f.read()
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    def generate_summary_text(self, detections: List[Dict]) -> str:
        if len(detections) == 0:
            return "未检测到任何事件"

        cc_values = [det.get("correlation_coefficient", 0) for det in detections]
        stations = set(d.get("station", "") for det in detections)

        summary = f"""
地震事件检测摘要
==================
检测时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
检测结果总数: {len(detections)} 个事件
涉及台站: {', '.join(stations)}

相关系数统计:
  平均值: {np.mean(cc_values):.3f}
  最大值: {np.max(cc_values):.3f}
  最小值: {np.min(cc_values):.3f}
  标准差: {np.std(cc_values):.3f}

检测事件列表 (前10个):
"""

        for i, det in enumerate(detections[:10], 1):
            summary += f"  {i:2d}. [{det.get('station', '')}] {det.get('detection_time', '')[:19]} - CC={det.get('correlation_coefficient', 0):.3f}\n"

        if len(detections) > 10:
            summary += f"  ... 还有 {len(detections) - 10} 个事件未列出\n"

        return summary
