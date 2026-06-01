import os
from datetime import datetime
from typing import Dict, List, Optional

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    print("ReportLab not available, PDF export will be disabled")


class PDFReportGenerator:
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_styles()
    
    def _setup_styles(self):
        self.title_style = ParagraphStyle(
            'CustomTitle',
            parent=self.styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#667eea'),
            spaceAfter=30,
            alignment=1
        )
        
        self.subtitle_style = ParagraphStyle(
            'Subtitle',
            parent=self.styles['Heading2'],
            fontSize=16,
            textColor=colors.HexColor('#333333'),
            spaceAfter=20,
            spaceBefore=15
        )
        
        self.normal_style = ParagraphStyle(
            'Normal',
            parent=self.styles['Normal'],
            fontSize=11,
            textColor=colors.HexColor('#555555'),
            spaceAfter=10
        )
        
        self.tip_style = ParagraphStyle(
            'Tip',
            parent=self.styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor('#666666'),
            leftIndent=20,
            spaceAfter=5
        )
        
        self.warning_style = ParagraphStyle(
            'Warning',
            parent=self.styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor('#f59e0b'),
            backColor=colors.HexColor('#fef3c7'),
            borderPadding=8,
            spaceAfter=8
        )
    
    def generate_report(self, analysis_data: Dict[str, any], output_path: str, image_path: Optional[str] = None) -> str:
        if not PDF_AVAILABLE:
            raise ImportError("ReportLab is required for PDF generation")
        
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        story = []
        
        story.append(Paragraph("✨ 颜值分析报告", self.title_style))
        
        story.append(Paragraph(f"生成时间：{datetime.now().strftime('%Y年%m月%d日 %H:%M:%S')}", self.normal_style))
        story.append(Spacer(1, 20))
        
        if image_path and os.path.exists(image_path):
            try:
                img = Image(image_path, width=8*cm, height=8*cm)
                img.hAlign = 'CENTER'
                story.append(img)
                story.append(Spacer(1, 20))
            except Exception as e:
                print(f"Could not add image to PDF: {e}")
        
        score_data = [
            ["评分项", "得分"],
            ["颜值评分", f"{analysis_data.get('beauty_score', 0):.2f} / 10"],
            ["年龄段", analysis_data.get('age_group', '未知')],
            ["分析置信度", f"{int(analysis_data.get('confidence', 0) * 100)}%"],
            ["图像质量", f"{int(analysis_data.get('quality_score', 0) * 100)}%"],
            ["姿态得分", f"{int(analysis_data.get('pose_score', 0) * 100)}%"]
        ]
        
        score_table = Table(score_data, colWidths=[8*cm, 6*cm])
        score_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#667eea')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f7fafc')),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
            ('FONTSIZE', (0, 1), (-1, -1), 11),
            ('TOPPADDING', (0, 1), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
        ]))
        story.append(score_table)
        story.append(Spacer(1, 20))
        
        warnings = analysis_data.get('warnings', [])
        if warnings:
            story.append(Paragraph("⚠️ 质量提示", self.subtitle_style))
            for warning in warnings:
                story.append(Paragraph(f"• {warning}", self.warning_style))
            story.append(Spacer(1, 15))
        
        beauty_suggestions = analysis_data.get('beauty_suggestions')
        if beauty_suggestions:
            story.append(Paragraph("💄 美颜建议", self.subtitle_style))
            
            skin_status = beauty_suggestions.get('skin_status', '')
            summary = beauty_suggestions.get('summary', '')
            story.append(Paragraph(f"<b>皮肤状态：</b>{skin_status}", self.normal_style))
            story.append(Paragraph(summary, self.normal_style))
            story.append(Spacer(1, 10))
            
            issue_suggestions = beauty_suggestions.get('issue_suggestions', [])
            for suggestion in issue_suggestions:
                issue = suggestion.get('issue', '')
                severity = suggestion.get('severity', 0)
                title = suggestion.get('title', '')
                tips = suggestion.get('tips', [])
                
                story.append(Paragraph(f"<b>{issue}</b> (严重度: {int(severity * 100)}%)", self.subtitle_style))
                story.append(Paragraph(title, self.normal_style))
                for tip in tips:
                    story.append(Paragraph(f"• {tip}", self.tip_style))
                story.append(Spacer(1, 10))
            
            general_tips = beauty_suggestions.get('general_tips', [])
            if general_tips:
                story.append(Paragraph("💡 日常护肤小贴士", self.subtitle_style))
                for tip in general_tips:
                    story.append(Paragraph(f"• {tip}", self.tip_style))
        
        story.append(Spacer(1, 30))
        story.append(Paragraph("---", self.normal_style))
        story.append(Paragraph("<i>本报告基于AI图像分析技术，仅供参考，不构成专业医疗建议。如有皮肤问题请咨询专业皮肤科医生。</i>", 
                              ParagraphStyle('Disclaimer', parent=self.normal_style, fontSize=9, textColor=colors.HexColor('#999999'))))
        
        doc.build(story)
        return output_path
    
    def generate_batch_report(self, analyses: List[Dict[str, any]], output_path: str) -> str:
        if not PDF_AVAILABLE:
            raise ImportError("ReportLab is required for PDF generation")
        
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        story = []
        
        story.append(Paragraph("✨ 批量颜值分析报告", self.title_style))
        story.append(Paragraph(f"生成时间：{datetime.now().strftime('%Y年%m月%d日 %H:%M:%S')}", self.normal_style))
        story.append(Paragraph(f"共分析 {len(analyses)} 张图片", self.normal_style))
        story.append(Spacer(1, 20))
        
        summary_data = [["序号", "文件名", "颜值评分", "年龄段", "置信度"]]
        
        for idx, analysis in enumerate(analyses, 1):
            summary_data.append([
                str(idx),
                analysis.get('filename', '未知'),
                f"{analysis.get('beauty_score', 0):.2f}",
                analysis.get('age_group', '未知'),
                f"{int(analysis.get('confidence', 0) * 100)}%"
            ])
        
        summary_table = Table(summary_data, colWidths=[1.5*cm, 4.5*cm, 3*cm, 3*cm, 3*cm])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#667eea')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(summary_table)
        
        avg_score = sum(a.get('beauty_score', 0) for a in analyses) / len(analyses)
        avg_confidence = sum(a.get('confidence', 0) for a in analyses) / len(analyses)
        
        story.append(Spacer(1, 20))
        story.append(Paragraph(f"<b>平均颜值评分：</b>{avg_score:.2f} / 10", self.normal_style))
        story.append(Paragraph(f"<b>平均置信度：</b>{int(avg_confidence * 100)}%", self.normal_style))
        
        doc.build(story)
        return output_path


pdf_generator = PDFReportGenerator() if PDF_AVAILABLE else None
