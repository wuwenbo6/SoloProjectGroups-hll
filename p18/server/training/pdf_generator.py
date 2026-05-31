from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import io
import os
from datetime import datetime
from .rehab_score import RehabScorer


class PDFReportGenerator:
    def __init__(self, output_dir: str = "./reports"):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        self.scorer = RehabScorer()

        self.styles = getSampleStyleSheet()
        self._define_styles()

    def _define_styles(self):
        self.title_style = ParagraphStyle(
            'CustomTitle',
            parent=self.styles['Heading1'],
            fontSize=20,
            spaceAfter=20,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#1E88E5')
        )

        self.subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=self.styles['Heading2'],
            fontSize=14,
            spaceAfter=12,
            textColor=colors.HexColor('#333333')
        )

        self.normal_style = ParagraphStyle(
            'CustomNormal',
            parent=self.styles['Normal'],
            fontSize=10,
            spaceAfter=6,
            leading=14
        )

        self.highlight_style = ParagraphStyle(
            'Highlight',
            parent=self.styles['Normal'],
            fontSize=12,
            spaceAfter=8,
            textColor=colors.HexColor('#E65100'),
            backColor=colors.HexColor('#FFF3E0'),
            borderPadding=8
        )

    def generate_report(self, session_id: str, user_id: str, data: list, session_info: dict = None) -> str:
        filename = f"gait_report_{session_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        filepath = os.path.join(self.output_dir, filename)

        doc = SimpleDocTemplate(
            filepath,
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )

        elements = []

        elements.extend(self._create_header(session_id, user_id, session_info))
        elements.append(Spacer(1, 0.5*cm))

        scores = self.scorer.calculate_all_scores(data)
        elements.extend(self._create_score_section(scores))
        elements.append(Spacer(1, 0.5*cm))

        if len(data) >= 50:
            chart_img = self._create_acceleration_chart(data)
            elements.append(Image(chart_img, width=16*cm, height=8*cm))
            elements.append(Spacer(1, 0.3*cm))

            phase_chart = self._create_phase_distribution_chart(data)
            elements.append(Image(phase_chart, width=12*cm, height=7*cm))
            elements.append(Spacer(1, 0.3*cm))

        elements.extend(self._create_gait_parameters_section(data, session_info))
        elements.append(Spacer(1, 0.5*cm))

        elements.extend(self._create_recommendations(scores))

        elements.append(PageBreak())
        elements.extend(self._create_detailed_analysis(scores))

        doc.build(elements, onFirstPage=self._add_page_number, onLaterPages=self._add_page_number)

        return filepath

    def _create_header(self, session_id: str, user_id: str, session_info: dict) -> list:
        elements = []

        title = Paragraph("步态分析康复报告", self.title_style)
        elements.append(title)

        header_data = [
            ['报告编号', f"RPT-{session_id[:8]}", '生成日期', datetime.now().strftime('%Y-%m-%d %H:%M')],
            ['用户ID', user_id, '会话ID', session_id],
        ]

        if session_info:
            header_data.append([
                '检测时长',
                f"{session_info.get('duration_minutes', 0):.1f} 分钟",
                '总步数',
                str(session_info.get('total_steps', 0))
            ])

        header_table = Table(header_data, colWidths=[3*cm, 5*cm, 3*cm, 5*cm])
        header_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#E3F2FD')),
            ('BACKGROUND', (2, 0), (2, -1), colors.HexColor('#E3F2FD')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(header_table)

        return elements

    def _create_score_section(self, scores: dict) -> list:
        elements = []

        subtitle = Paragraph("康复评分概览", self.subtitle_style)
        elements.append(subtitle)

        overall_data = [
            ['综合评分', '对称性', '一致性', '稳定性', '节律性', '耐力'],
            [
                f"{scores['overall']}<br/><font color='#666666'>{scores['grade']}级</font>",
                str(scores['symmetry']),
                str(scores['consistency']),
                str(scores['stability']),
                str(scores['rhythm']),
                str(scores['endurance'])
            ]
        ]

        score_table = Table(overall_data, colWidths=[3.2*cm, 2.5*cm, 2.5*cm, 2.5*cm, 2.5*cm, 2.5*cm])
        score_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTSIZE', (0, 1), (-1, -1), 16),
            ('ALIGN', (0, 0), (-1, -1), TA_CENTER),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E88E5')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ]))

        score_color = self._get_score_color(scores['overall'])
        score_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 1), (0, 1), score_color),
            ('TEXTCOLOR', (0, 1), (0, 1), colors.white),
        ]))

        elements.append(score_table)

        return elements

    def _create_acceleration_chart(self, data: list) -> io.BytesIO:
        fig, ax = plt.subplots(figsize=(10, 4))

        df = np.array([[d['accelX'], d['accelY'], d['accelZ']] for d in data[:500]])
        accel_mag = np.sqrt(np.sum(df**2, axis=1))

        time = np.arange(len(accel_mag)) * 20

        ax.plot(time, accel_mag, color='#1E88E5', linewidth=1.5)
        ax.axhline(y=1, color='#E53935', linestyle='--', alpha=0.7, label='重力加速度 (1g)')

        ax.set_xlabel('时间 (ms)')
        ax.set_ylabel('加速度 (g)')
        ax.set_title('加速度波形图')
        ax.legend()
        ax.grid(True, alpha=0.3)

        img_buffer = io.BytesIO()
        plt.savefig(img_buffer, format='png', dpi=150, bbox_inches='tight')
        plt.close()
        img_buffer.seek(0)

        return img_buffer

    def _create_phase_distribution_chart(self, data: list) -> io.BytesIO:
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))

        phases = [d['predictedPhase'] for d in data]
        stance_count = phases.count('STANCE')
        swing_count = phases.count('SWING')

        colors_pie = ['#1E88E5', '#43A047']
        labels = ['支撑相', '摆动相']
        sizes = [stance_count, swing_count]

        ax1.pie(sizes, labels=labels, colors=colors_pie, autopct='%1.1f%%', startangle=90)
        ax1.set_title('步态相位分布')

        categories = ['对称性', '一致性', '稳定性', '节律性', '耐力']
        values = [75, 82, 68, 70, 85]

        ax2.bar(categories, values, color=['#1E88E5', '#43A047', '#FFB300', '#E53935', '#8E24AA'])
        ax2.set_ylim([0, 100])
        ax2.set_title('各项评分')
        ax2.tick_params(axis='x', rotation=45)

        for i, v in enumerate(values):
            ax2.text(i, v + 1, str(v), ha='center')

        plt.tight_layout()

        img_buffer = io.BytesIO()
        plt.savefig(img_buffer, format='png', dpi=150, bbox_inches='tight')
        plt.close()
        img_buffer.seek(0)

        return img_buffer

    def _create_gait_parameters_section(self, data: list, session_info: dict) -> list:
        elements = []

        subtitle = Paragraph("步态参数详情", self.subtitle_style)
        elements.append(subtitle)

        if len(data) > 0:
            phases = [d['predictedPhase'] for d in data]
            stance_ratio = phases.count('STANCE') / len(phases) * 100
            swing_ratio = 100 - stance_ratio

            avg_confidence = np.mean([d['confidence'] for d in data]) * 100

            params_data = [
                ['参数', '数值', '参考范围', '评估'],
                ['支撑相比例', f'{stance_ratio:.1f}%', '60-65%', self._get_ratio_assessment(stance_ratio, 60, 65)],
                ['摆动相比例', f'{swing_ratio:.1f}%', '35-40%', self._get_ratio_assessment(swing_ratio, 35, 40)],
                ['平均置信度', f'{avg_confidence:.1f}%', '>80%', '良好' if avg_confidence > 80 else '一般'],
                ['数据点数', str(len(data)), '-', '-'],
            ]

            params_table = Table(params_data, colWidths=[4*cm, 3*cm, 3*cm, 3*cm])
            params_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F5F5F5')),
                ('ALIGN', (0, 0), (-1, -1), TA_CENTER),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ]))
            elements.append(params_table)

        return elements

    def _create_recommendations(self, scores: dict) -> list:
        elements = []

        subtitle = Paragraph("康复建议", self.subtitle_style)
        elements.append(subtitle)

        recommendations = self._generate_recommendations(scores)

        rec_text = "<br/>".join([f"• {rec}" for rec in recommendations])
        rec_paragraph = Paragraph(rec_text, self.normal_style)
        elements.append(rec_paragraph)

        elements.append(Spacer(1, 0.3*cm))

        if scores['overall'] >= 80:
            summary_text = "整体步态质量良好，建议继续保持现有训练强度。"
        elif scores['overall'] >= 65:
            summary_text = "步态质量有提升空间，建议加强针对性康复训练。"
        else:
            summary_text = "步态质量需要重点改善，建议咨询专业康复医师制定训练计划。"

        summary = Paragraph(f"<b>总结：</b>{summary_text}", self.highlight_style)
        elements.append(summary)

        return elements

    def _create_detailed_analysis(self, scores: dict) -> list:
        elements = []

        subtitle = Paragraph("详细分析说明", self.subtitle_style)
        elements.append(subtitle)

        interpretations = self.scorer.get_score_interpretation(scores)

        details_data = [
            ['评分维度', '得分', '等级', '说明'],
            ['对称性', scores['symmetry'], interpretations.get('symmetry_level', '-'), interpretations.get('symmetry_advice', '-')],
            ['一致性', scores['consistency'], interpretations.get('consistency_level', '-'), interpretations.get('consistency_advice', '-')],
            ['稳定性', scores['stability'], interpretations.get('stability_level', '-'), interpretations.get('stability_advice', '-')],
            ['节律性', scores['rhythm'], interpretations.get('rhythm_level', '-'), interpretations.get('rhythm_advice', '-')],
            ['耐力', scores['endurance'], interpretations.get('endurance_level', '-'), interpretations.get('endurance_advice', '-')],
        ]

        details_table = Table(details_data, colWidths=[2.5*cm, 2*cm, 2*cm, 9*cm])
        details_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F5F5F5')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(details_table)

        elements.append(Spacer(1, 0.5*cm))

        disclaimer = Paragraph(
            "<font color='#999999' size='8'>免责声明：本报告仅供参考，不构成医疗诊断。"
            "如有疑问，请咨询专业医疗人员。</font>",
            self.normal_style
        )
        elements.append(disclaimer)

        return elements

    def _generate_recommendations(self, scores: dict) -> list:
        recommendations = []

        if scores['symmetry'] < 70:
            recommendations.append("加强平衡训练：建议进行单腿站立练习，每次30秒，每天3组")
        else:
            recommendations.append("对称性良好，继续保持当前平衡训练")

        if scores['stability'] < 70:
            recommendations.append("改善稳定性：建议在软垫上进行步行练习，增强核心肌群力量")
        else:
            recommendations.append("稳定性表现优秀")

        if scores['rhythm'] < 70:
            recommendations.append("节律训练：配合节拍器进行有节奏的步行训练")
        else:
            recommendations.append("步态节律性良好")

        if scores['endurance'] < 70:
            recommendations.append("耐力训练：逐渐增加步行时间，目标每次30分钟以上")
        else:
            recommendations.append("耐力表现良好，可适当增加训练强度")

        recommendations.append("建议每天进行15-30分钟的步态训练")
        recommendations.append("定期复查（每2周一次），跟踪改善情况")

        return recommendations

    def _get_score_color(self, score: float) -> colors.Color:
        if score >= 85:
            return colors.HexColor('#43A047')
        elif score >= 70:
            return colors.HexColor('#1E88E5')
        elif score >= 60:
            return colors.HexColor('#FFB300')
        else:
            return colors.HexColor('#E53935')

    def _get_ratio_assessment(self, value: float, min_val: float, max_val: float) -> str:
        if min_val <= value <= max_val:
            return '正常'
        elif abs(value - (min_val + max_val) / 2) < 10:
            return '轻度偏差'
        else:
            return '明显偏差'

    def _add_page_number(self, canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(colors.grey)
        canvas.drawRightString(A4[0] - 2*cm, 2*cm, f"第 {doc.page} 页")
        canvas.drawString(2*cm, 2*cm, "步态分析系统 - 康复报告")
        canvas.restoreState()
