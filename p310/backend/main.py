from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import database
import rtcp_xr_parser
import mos_estimator
from seed_demo import seed_demo_data

app = FastAPI(title="RTCP XR Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    database.init_db()


@app.post("/api/xr/parse")
def parse_xr(
    file: Optional[UploadFile] = File(None),
    hex: str = Form(None),
    codec: str = Form("G.711"),
):
    data: Optional[bytes] = None
    if file:
        data = file.file.read()
    elif hex:
        try:
            data = bytes.fromhex(hex.strip())
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid hex string")
    else:
        raise HTTPException(status_code=400, detail="Provide either 'file' or 'hex'")

    result = rtcp_xr_parser.parse_rtcp_xr(data)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    raw_hex = data.hex()
    blocks = result.get("report_blocks", [])

    loss_rate = result["loss_rate"]
    jitter_delay = result["jitter_buffer_delay"]

    p564_result = mos_estimator.estimate_mos_p564(loss_rate, jitter_delay, codec)
    mos_p564 = p564_result["mos"]

    report_id = database.insert_report(
        ssrc=result["ssrc"],
        loss_rate=result["loss_rate"],
        discard_rate=result["discard_rate"],
        jitter_buffer_delay=result["jitter_buffer_delay"],
        mos_cq=result["mos_cq"],
        mos_lq=result["mos_lq"],
        r_factor=result["r_factor"],
        raw_hex=raw_hex,
        blocks=blocks,
        mos_p564=mos_p564,
        codec=codec,
    )

    detail = database.get_detail(report_id)
    if detail:
        detail["mos_p564_detail"] = p564_result
    return detail


@app.get("/api/xr/trend")
def trend(hours: int = 24):
    return database.get_trend(hours)


@app.get("/api/xr/history")
def history(page: int = 1, page_size: int = 20):
    return database.get_history(page, page_size)


@app.get("/api/xr/detail/{report_id}")
def detail(report_id: int):
    result = database.get_detail(report_id)
    if not result:
        raise HTTPException(status_code=404, detail="Report not found")
    return result


@app.get("/api/xr/latest")
def latest():
    result = database.get_latest_metrics()
    if not result:
        raise HTTPException(status_code=404, detail="No data available")
    return result


@app.post("/api/xr/demo")
def demo():
    seed_demo_data()
    return {"message": "Demo data generated successfully"}


@app.get("/api/mos/p564")
def calculate_mos_p564(
    loss_rate: float = Query(..., ge=0, le=100),
    jitter_delay: float = Query(..., ge=0, le=1000),
    codec: str = Query("G.711"),
):
    """
    基于 P.564 映射表估算 MOS 评分
    
    Args:
        loss_rate: 丢包率 (0-100%)
        jitter_delay: 抖动延迟 (0-1000ms)
        codec: 编解码器 (G.711, G.729A, G.723.1, etc.)
    """
    return mos_estimator.estimate_mos_p564_detailed(loss_rate, jitter_delay, codec)


@app.get("/api/codecs")
def list_codecs():
    """返回支持的编解码器列表及其参数"""
    return {
        "codecs": mos_estimator.get_codec_list(),
        "params": {c: mos_estimator.get_codec_params(c) for c in mos_estimator.get_codec_list()},
    }


@app.get("/api/calls")
def list_calls():
    """返回所有呼叫（SSRC）列表"""
    return {"calls": database.get_ssrc_list()}


@app.get("/api/calls/{ssrc}/trend")
def call_trend(ssrc: int, hours: int = 24):
    """返回指定呼叫的趋势数据"""
    return database.get_trend_by_ssrc(ssrc, hours)


@app.get("/api/calls/{ssrc}/summary")
def call_summary(ssrc: int, hours: int = 24):
    """返回指定呼叫的统计摘要"""
    return database.get_call_summary(ssrc, hours)


@app.post("/api/calls/compare")
def compare_calls(ssrcs: list[int], hours: int = 24):
    """比较多个呼叫的统计摘要"""
    return {"comparisons": database.get_multiple_call_summary(ssrcs, hours)}


@app.get("/api/summary")
def overall_summary(hours: int = 24):
    """返回所有呼叫的整体统计摘要"""
    return database.get_call_summary(None, hours)


@app.get("/api/report/pdf")
def generate_pdf_report(hours: int = 24, ssrc: int = None):
    """生成 PDF 质量报告"""
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm, leftMargin=20*mm, rightMargin=20*mm)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=HexColor('#1e293b'),
        spaceAfter=20,
        alignment=1
    )
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=HexColor('#475569'),
        spaceAfter=12,
    )
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=10,
        textColor=HexColor('#334155'),
        spaceAfter=6,
    )

    story = []
    story.append(Paragraph("RTCP XR 呼叫质量分析报告", title_style))
    story.append(Spacer(1, 10))

    summary = database.get_call_summary(ssrc, hours)
    call_label = f"SSRC: {summary['ssrc_hex']}" if ssrc else "整体统计"
    story.append(Paragraph(f"{call_label} · {hours}小时报告", subtitle_style))
    story.append(Spacer(1, 10))

    period_info = [
        ["统计周期", f"{summary['period_start']} - {summary['period_end']}"],
        ["记录数量", f"{summary['record_count']} 条"],
    ]
    period_table = Table(period_info, colWidths=[100, 350])
    period_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (0, -1), HexColor('#64748b')),
        ('TEXTCOLOR', (1, 0), (1, -1), HexColor('#1e293b')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(period_table)
    story.append(Spacer(1, 15))

    story.append(Paragraph("核心指标摘要", subtitle_style))
    story.append(Spacer(1, 10))

    def mos_color(mos):
        if mos >= 4.0:
            return HexColor('#10b981')
        elif mos >= 3.2:
            return HexColor('#f59e0b')
        else:
            return HexColor('#ef4444')

    metrics_data = [
        ["指标", "平均值", "最小值", "最大值"],
        ["丢包率 (%)", f"{summary['avg_loss_rate']:.2f}", f"{summary['min_loss_rate']:.2f}", f"{summary['max_loss_rate']:.2f}"],
        ["抖动延迟 (ms)", f"{summary['avg_jitter']:.1f}", "-", f"{summary['max_jitter']:.1f}"],
        ["MOS-CQ", f"{summary['avg_mos_cq']:.2f}", f"{summary['min_mos_cq']:.2f}", "-"],
        ["MOS-P564", f"{summary['avg_mos_p564']:.2f}", "-", "-"],
        ["R因子", f"{summary['avg_r_factor']:.1f}", f"{summary['min_r_factor']:.1f}", "-"],
    ]
    metrics_table = Table(metrics_data, colWidths=[120, 110, 110, 110])
    metrics_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#1e293b')),
        ('TEXTCOLOR', (0, 1), (0, -1), HexColor('#64748b')),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#e2e8f0')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(metrics_table)
    story.append(Spacer(1, 20))

    story.append(Paragraph("质量评估", subtitle_style))
    story.append(Spacer(1, 10))

    avg_mos = summary['avg_mos_cq']
    if avg_mos >= 4.0:
        quality = "优秀"
        quality_color = HexColor('#10b981')
        recommendation = "语音质量优秀，用户体验良好。"
    elif avg_mos >= 3.6:
        quality = "良好"
        quality_color = HexColor('#3b82f6')
        recommendation = "语音质量良好，不影响正常通话。"
    elif avg_mos >= 3.2:
        quality = "一般"
        quality_color = HexColor('#f59e0b')
        recommendation = "语音质量一般，建议关注网络状况。"
    elif avg_mos >= 2.8:
        quality = "较差"
        quality_color = HexColor('#f97316')
        recommendation = "语音质量较差，建议排查网络问题。"
    else:
        quality = "很差"
        quality_color = HexColor('#ef4444')
        recommendation = "语音质量很差，严重影响通话体验。"

    quality_data = [
        ["综合评分", quality, f"{avg_mos:.2f}"],
        ["建议", recommendation, ""],
    ]
    quality_table = Table(quality_data, colWidths=[80, 270, 100])
    quality_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (0, -1), HexColor('#64748b')),
        ('TEXTCOLOR', (1, 0), (1, 0), quality_color),
        ('FONTNAME', (1, 0), (1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (1, 0), (1, 0), 12),
        ('FONTSIZE', (2, 0), (2, 0), 12),
        ('FONTNAME', (2, 0), (2, 0), 'Helvetica-Bold'),
        ('TEXTCOLOR', (2, 0), (2, 0), quality_color),
        ('ALIGN', (2, 0), (2, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#e2e8f0')),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(quality_table)
    story.append(Spacer(1, 30))

    story.append(Paragraph("报告说明", subtitle_style))
    story.append(Spacer(1, 8))
    story.append(Paragraph("本报告基于 RTCP XR (RFC 3611) VoIP Metrics 数据生成。", normal_style))
    story.append(Paragraph("MOS-CQ 为报文中携带的会话质量评分，MOS-P564 为基于 P.564 映射表估算值。", normal_style))
    story.append(Paragraph(f"报告生成时间: {summary['period_end']}", normal_style))

    doc.build(story)
    buffer.seek(0)

    from fastapi.responses import Response
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=quality_report_{hours}h.pdf"}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", reload=True, port=8000)
