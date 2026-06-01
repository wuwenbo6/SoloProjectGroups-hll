from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import sys
import tempfile
from datetime import datetime
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import engine, get_db, Base
from models import QualityReport, SatelliteMetric
from rinex_parser import RinexParser
from quality_calculator import QualityCalculator
from satellite_position import SatellitePositionCalculator
from ionosphere import IonosphereCalculator
from site_monitor import SiteDisplacementMonitor
from gfzrnx_exporter import GfzRnxExporter
from fastapi.responses import PlainTextResponse

Base.metadata.create_all(bind=engine)

app = FastAPI(title="GNSS数据质量分析系统", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GNSSDataProcessor:
    def __init__(self):
        self.parser = RinexParser()
        self.calculator = None
        self.position_calculator = None
        self.ionosphere_calculator = None
        self.site_monitor = None
        self.obs_info = None
        self.nav_info = None
        self.receiver_pos = (0.0, 0.0, 0.0)
        self.ionosphere_results = None
        self.displacement_results = None

    def process_files(self, obs_file: str, nav_file: Optional[str] = None):
        self.obs_info = self.parser.parse_observation_file(obs_file)
        self.receiver_pos = tuple(self.obs_info.get("approx_position", [0, 0, 0]))

        if nav_file:
            self.nav_info = self.parser.parse_navigation_file(nav_file)

        self.calculator = QualityCalculator(
            obs_data=self.parser.obs_data, nav_data=self.parser.nav_data
        )
        self.position_calculator = SatellitePositionCalculator(
            obs_data=self.parser.obs_data, nav_data=self.parser.nav_data
        )
        self.ionosphere_calculator = IonosphereCalculator(
            obs_data=self.parser.obs_data, nav_data=self.parser.nav_data
        )
        self.site_monitor = SiteDisplacementMonitor(
            obs_data=self.parser.obs_data, nav_data=self.parser.nav_data
        )

    def get_quality_metrics(self):
        if self.calculator is None:
            return {}

        satellites = self.obs_info.get("satellites", [])
        all_metrics = self.calculator.calculate_all_metrics(satellites, self.receiver_pos)
        return all_metrics

    def get_skyplot_data(self):
        if self.position_calculator is None:
            return {}
        return self.position_calculator.calculate_skyplot_data(self.receiver_pos)

    def get_visibility_data(self):
        if self.position_calculator is None:
            return {}
        return self.position_calculator.calculate_visibility_data(self.receiver_pos)

    def get_snr_elevation_data(self):
        if self.position_calculator is None:
            return {}
        return self.position_calculator.calculate_snr_vs_elevation(self.receiver_pos)

    def get_ionosphere_results(self):
        if self.ionosphere_calculator is None:
            return {}

        satellites = self.obs_info.get("satellites", [])
        self.ionosphere_results = self.ionosphere_calculator.analyze_ionosphere_activity(
            satellites, self.receiver_pos
        )
        return self.ionosphere_results

    def get_displacement_results(self):
        if self.site_monitor is None:
            return {}

        satellites = self.obs_info.get("satellites", [])
        self.displacement_results = self.site_monitor.generate_displacement_report(
            satellites, self.receiver_pos
        )
        return self.displacement_results

    def export_gfzrnx_report(self, format_type: str = "gfzrnx") -> str:
        quality_metrics = self.get_quality_metrics()
        ionosphere_results = self.ionosphere_results or self.get_ionosphere_results()
        displacement_results = self.displacement_results or self.get_displacement_results()

        exporter = GfzRnxExporter(
            obs_data=self.parser.obs_data,
            nav_data=self.parser.nav_data,
            quality_metrics=quality_metrics,
            ionosphere_results=ionosphere_results,
            displacement_results=displacement_results,
            receiver_pos=self.receiver_pos,
        )

        return exporter.export_quality_report(format_type)


processor = GNSSDataProcessor()


@app.post("/api/upload")
async def upload_files(
    obs_file: UploadFile = File(...),
    nav_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".o") as tmp_obs:
            tmp_obs.write(await obs_file.read())
            tmp_obs_path = tmp_obs.name

        tmp_nav_path = None
        if nav_file:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".n") as tmp_nav:
                tmp_nav.write(await nav_file.read())
                tmp_nav_path = tmp_nav.name

        processor.process_files(tmp_obs_path, tmp_nav_path)

        os.unlink(tmp_obs_path)
        if tmp_nav_path:
            os.unlink(tmp_nav_path)

        return {
            "status": "success",
            "obs_info": processor.obs_info,
            "nav_info": processor.nav_info,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件处理失败: {str(e)}")


@app.get("/api/quality-metrics")
async def get_quality_metrics():
    try:
        metrics = processor.get_quality_metrics()
        return {"status": "success", "metrics": metrics}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取质量指标失败: {str(e)}")


@app.get("/api/skyplot")
async def get_skyplot():
    try:
        data = processor.get_skyplot_data()
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取星空图数据失败: {str(e)}")


@app.get("/api/visibility")
async def get_visibility():
    try:
        data = processor.get_visibility_data()
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取可见性数据失败: {str(e)}")


@app.get("/api/snr-elevation")
async def get_snr_elevation():
    try:
        data = processor.get_snr_elevation_data()
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取SNR-仰角数据失败: {str(e)}")


@app.post("/api/save-report")
async def save_report(db: Session = Depends(get_db)):
    try:
        if processor.obs_info is None:
            raise HTTPException(status_code=400, detail="没有数据可保存")

        metrics = processor.get_quality_metrics()

        report = QualityReport(
            filename=processor.obs_info.get("station_name", "Unknown"),
            created_at=datetime.now(),
            station_name=processor.obs_info.get("station_name", "Unknown"),
            start_time=processor.obs_info.get("start_time"),
            end_time=processor.obs_info.get("end_time"),
            num_satellites=len(processor.obs_info.get("satellites", [])),
            overall_quality_score=0.0,
        )
        db.add(report)
        db.flush()

        total_score = 0.0
        sat_count = 0

        for sat, sat_metrics in metrics.items():
            if sat_metrics:
                multipath = sat_metrics.get("multipath", {})
                snr = sat_metrics.get("snr", {})
                cycle_slips = sat_metrics.get("cycle_slips", {})

                sat_metric = SatelliteMetric(
                    report_id=report.id,
                    satellite=sat,
                    avg_multipath=multipath.get("avg_multipath", 0),
                    max_multipath=multipath.get("max_multipath", 0),
                    avg_snr=snr.get("avg_snr", 0),
                    min_snr=snr.get("min_snr", 0),
                    cycle_slips_count=cycle_slips.get("cycle_slip_count", 0),
                    data_availability=sat_metrics.get("data_availability", 0),
                )
                db.add(sat_metric)

                sat_score = processor.calculator.calculate_quality_score(
                    {
                        "avg_multipath": multipath.get("avg_multipath", 0),
                        "avg_snr": snr.get("avg_snr", 0),
                        "cycle_slip_count": cycle_slips.get("cycle_slip_count", 0),
                        "data_availability": sat_metrics.get("data_availability", 0),
                    }
                )
                total_score += sat_score
                sat_count += 1

        if sat_count > 0:
            report.overall_quality_score = total_score / sat_count

        db.commit()
        db.refresh(report)

        return {"status": "success", "report_id": report.id, "quality_score": report.overall_quality_score}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"保存报告失败: {str(e)}")


@app.get("/api/reports")
async def get_reports(db: Session = Depends(get_db)):
    try:
        reports = db.query(QualityReport).order_by(QualityReport.created_at.desc()).all()
        return {
            "status": "success",
            "reports": [
                {
                    "id": r.id,
                    "filename": r.filename,
                    "created_at": r.created_at,
                    "station_name": r.station_name,
                    "start_time": r.start_time,
                    "end_time": r.end_time,
                    "num_satellites": r.num_satellites,
                    "overall_quality_score": r.overall_quality_score,
                }
                for r in reports
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取报告列表失败: {str(e)}")


@app.get("/api/reports/{report_id}")
async def get_report_detail(report_id: int, db: Session = Depends(get_db)):
    try:
        report = db.query(QualityReport).filter(QualityReport.id == report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="报告不存在")

        satellite_metrics = (
            db.query(SatelliteMetric).filter(SatelliteMetric.report_id == report_id).all()
        )

        return {
            "status": "success",
            "report": {
                "id": report.id,
                "filename": report.filename,
                "created_at": report.created_at,
                "station_name": report.station_name,
                "start_time": report.start_time,
                "end_time": report.end_time,
                "num_satellites": report.num_satellites,
                "overall_quality_score": report.overall_quality_score,
            },
            "satellite_metrics": [
                {
                    "satellite": sm.satellite,
                    "avg_multipath": sm.avg_multipath,
                    "max_multipath": sm.max_multipath,
                    "avg_snr": sm.avg_snr,
                    "min_snr": sm.min_snr,
                    "cycle_slips_count": sm.cycle_slips_count,
                    "data_availability": sm.data_availability,
                }
                for sm in satellite_metrics
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取报告详情失败: {str(e)}")


@app.delete("/api/reports/{report_id}")
async def delete_report(report_id: int, db: Session = Depends(get_db)):
    try:
        report = db.query(QualityReport).filter(QualityReport.id == report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="报告不存在")

        db.query(SatelliteMetric).filter(SatelliteMetric.report_id == report_id).delete()
        db.delete(report)
        db.commit()

        return {"status": "success", "message": "报告已删除"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除报告失败: {str(e)}")


@app.get("/api/ionosphere")
async def get_ionosphere():
    try:
        data = processor.get_ionosphere_results()
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取电离层数据失败: {str(e)}")


@app.get("/api/displacement")
async def get_displacement():
    try:
        data = processor.get_displacement_results()
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取位移监测数据失败: {str(e)}")


@app.get("/api/export/gfzrnx")
async def export_gfzrnx(format: str = "gfzrnx"):
    try:
        content = processor.export_gfzrnx_report(format_type=format)
        filename = f"quality_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        if format == "csv":
            filename += ".csv"
        else:
            filename += ".txt"

        return PlainTextResponse(
            content=content,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出GFZRNX报告失败: {str(e)}")


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
