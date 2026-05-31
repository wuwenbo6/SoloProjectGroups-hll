from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm, cm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph,
    Spacer, Image, PageBreak
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from datetime import datetime
from typing import Optional

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

from app.models.calibration import Calibration
from app.models.tank import Tank


class CalibrationReportGenerator:
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_styles()

    def _setup_styles(self):
        self.title_style = ParagraphStyle(
            'CustomTitle',
            parent=self.styles['Heading1'],
            fontSize=20,
            alignment=TA_CENTER,
            spaceAfter=20,
            textColor=colors.HexColor('#1a1a2e')
        )
        
        self.subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=self.styles['Heading2'],
            fontSize=14,
            spaceBefore=15,
            spaceAfter=10,
            textColor=colors.HexColor('#16213e')
        )
        
        self.normal_style = ParagraphStyle(
            'CustomNormal',
            parent=self.styles['Normal'],
            fontSize=10,
            spaceAfter=6,
            leading=14
        )

    def _create_calibration_plot(self, calibration: Calibration) -> BytesIO:
        fig, ax = plt.subplots(figsize=(8, 5))
        
        if calibration.points:
            measured = [p.measured_level for p in calibration.points]
            actual = [p.actual_level for p in calibration.points]
            
            ax.scatter(measured, actual, c='#00d4ff', s=80, alpha=0.8, label='校准点', zorder=5)
            
            if calibration.result:
                x_line = np.linspace(min(measured) * 0.9, max(measured) * 1.1, 100)
                y_line = calibration.result.offset + calibration.result.scale_factor * x_line
                ax.plot(x_line, y_line, c='#7c3aed', linewidth=2, 
                        label=f'拟合线: y = {calibration.result.offset:.4f} + {calibration.result.scale_factor:.4f}x')
            
            max_val = max(max(measured), max(actual)) * 1.1
            ax.plot([0, max_val], [0, max_val], '--', c='#6b7280', alpha=0.5, label='理想线 (y=x)')
            
            for i, (m, a) in enumerate(zip(measured, actual)):
                ax.annotate(f'#{i+1}', (m, a), textcoords="offset points", 
                           xytext=(5, 5), ha='center', fontsize=8)
        
        ax.set_xlabel('测量液位 (m)', fontsize=11)
        ax.set_ylabel('实际液位 (m)', fontsize=11)
        ax.set_title('校准曲线', fontsize=13, pad=15)
        ax.legend(fontsize=9)
        ax.grid(True, alpha=0.3)
        ax.set_facecolor('#f8f9fa')
        fig.patch.set_facecolor('#ffffff')
        
        buf = BytesIO()
        plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
        buf.seek(0)
        plt.close()
        return buf

    def _create_error_plot(self, calibration: Calibration) -> BytesIO:
        fig, ax = plt.subplots(figsize=(8, 4))
        
        if calibration.points:
            errors = [p.error for p in calibration.points]
            point_nums = range(1, len(errors) + 1)
            
            bars = ax.bar(point_nums, errors, color='#7c3aed', alpha=0.7, width=0.6)
            
            for bar, err in zip(bars, errors):
                height = bar.get_height()
                va = 'bottom' if height >= 0 else 'top'
                ax.text(bar.get_x() + bar.get_width()/2., height,
                       f'{err:.4f}m',
                       ha='center', va=va, fontsize=8)
        
        ax.axhline(y=0, color='#6b7280', linestyle='-', linewidth=0.5)
        ax.set_xlabel('校准点编号', fontsize=11)
        ax.set_ylabel('误差 (m)', fontsize=11)
        ax.set_title('误差分布', fontsize=13, pad=15)
        ax.grid(True, alpha=0.3, axis='y')
        ax.set_facecolor('#f8f9fa')
        fig.patch.set_facecolor('#ffffff')
        
        buf = BytesIO()
        plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
        buf.seek(0)
        plt.close()
        return buf

    def generate_report(self, calibration: Calibration, tank: Tank) -> BytesIO:
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        story = []
        
        story.append(Paragraph('液位传感器校准报告', self.title_style))
        story.append(Spacer(1, 10))
        
        report_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        story.append(Paragraph(f'生成时间: {report_time}', 
                              ParagraphStyle('center', parent=self.normal_style, alignment=TA_CENTER)))
        story.append(Spacer(1, 20))
        
        story.append(Paragraph('一、基本信息', self.subtitle_style))
        
        info_data = [
            ['储罐名称', tank.name, '储罐编号', tank.id[:8] + '...'],
            ['储罐位置', tank.location or '-', '储罐高度', f'{tank.max_height} m'],
            ['传感器高度', f'{tank.sensor_height} m', '当前校准状态', 
             '已应用' if tank.calibration_scale != 1 or tank.calibration_offset != 0 else '未校准'],
            ['校准任务名称', calibration.name, '校准点数', str(len(calibration.points))],
            ['创建时间', calibration.created_at.strftime('%Y-%m-%d %H:%M:%S'), 
             '完成时间', calibration.completed_at.strftime('%Y-%m-%d %H:%M:%S') if calibration.completed_at else '-'],
        ]
        
        info_table = Table(info_data, colWidths=[3*cm, 4.5*cm, 3*cm, 4.5*cm])
        info_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8f9fa')),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e0e0e0')),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e3f2fd')),
            ('BACKGROUND', (2, 0), (2, -1), colors.HexColor('#e3f2fd')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 15))
        
        story.append(Paragraph('二、校准结果', self.subtitle_style))
        
        if calibration.result:
            result_data = [
                ['参数', '数值', '说明'],
                ['偏移量 (offset)', f'{calibration.result.offset:.6f} m', 'y = offset + scale * 测量值'],
                ['缩放系数 (scale)', f'{calibration.result.scale_factor:.6f}', '理想值为 1.000000'],
                ['拟合优度 (R²)', f'{calibration.result.r_squared:.4f}', '越接近1表示拟合越好'],
                ['平均误差', f'{calibration.result.mean_error:.4f} m', '所有校准点的绝对误差平均值'],
                ['最大误差', f'{calibration.result.max_error:.4f} m', '所有校准点中的最大绝对误差'],
                ['校准点数', str(calibration.result.point_count), '建议至少5个校准点'],
            ]
            
            result_table = Table(result_data, colWidths=[4*cm, 4*cm, 7*cm])
            result_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#7c3aed')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e0e0e0')),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
                ('PADDING', (0, 0), (-1, -1), 8),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f8f9fa')),
            ]))
            story.append(result_table)
        else:
            story.append(Paragraph('校准未完成，暂无结果数据。', self.normal_style))
        
        story.append(Spacer(1, 20))
        
        story.append(Paragraph('三、校准曲线', self.subtitle_style))
        plot_buf = self._create_calibration_plot(calibration)
        img = Image(plot_buf, width=16*cm, height=10*cm)
        story.append(img)
        story.append(Spacer(1, 15))
        
        story.append(Paragraph('四、误差分析', self.subtitle_style))
        error_buf = self._create_error_plot(calibration)
        img2 = Image(error_buf, width=16*cm, height=8*cm)
        story.append(img2)
        story.append(Spacer(1, 15))
        
        story.append(Paragraph('五、校准点明细', self.subtitle_style))
        
        if calibration.points:
            point_data = [['序号', '测量液位(m)', '实际液位(m)', '误差(m)', '温度(°C)', '备注']]
            for i, p in enumerate(calibration.points, 1):
                point_data.append([
                    str(i),
                    f'{p.measured_level:.4f}',
                    f'{p.actual_level:.4f}',
                    f'{p.error:+.4f}',
                    f'{p.temperature:.1f}',
                    p.note or '-'
                ])
            
            point_table = Table(point_data, colWidths=[1.5*cm, 3*cm, 3*cm, 2.5*cm, 2.5*cm, 5*cm])
            point_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#00d4ff')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e0e0e0')),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('PADDING', (0, 0), (-1, -1), 6),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f8f9fa')),
            ]))
            story.append(point_table)
        
        story.append(Spacer(1, 30))
        
        story.append(Paragraph('六、应用说明', self.subtitle_style))
        
        notes = [
            '1. 校准公式: 校准后液位 = offset + scale × 测量液位',
            '2. 建议每3个月进行一次校准，或在传感器维护后重新校准',
            '3. 校准时应覆盖液位测量的整个量程范围',
            '4. R² > 0.99 表示校准效果良好',
            '5. 如发现误差偏大，请检查传感器安装是否牢固、液面是否平稳',
        ]
        
        for note in notes:
            story.append(Paragraph(note, self.normal_style))
        
        story.append(Spacer(1, 40))
        
        signature_data = [
            ['校准人: _______________', '审核人: _______________', '日期: _______________'],
        ]
        sig_table = Table(signature_data, colWidths=[5.5*cm, 5.5*cm, 5.5*cm])
        sig_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ]))
        story.append(sig_table)
        
        doc.build(story)
        buffer.seek(0)
        return buffer


pdf_generator = CalibrationReportGenerator()


def generate_calibration_report(calibration: Calibration, tank: Tank) -> BytesIO:
    return pdf_generator.generate_report(calibration, tank)
