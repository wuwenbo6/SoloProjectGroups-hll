from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Tuple
import io
import tempfile
import os
import json

from database import get_db, init_db, Template, Detection
from schemas import (
    Template as TemplateSchema,
    Detection as DetectionSchema,
    DetectionResponse,
    DetectionResult,
    WaveformSegment,
    AlignedWaveforms,
    LocationRequest,
    LocationResult,
    RelocateRequest,
    StreamingStatus,
)
from matched_filter import MatchedFilterDetector
from double_difference import DoubleDifferenceLocator, create_stations_from_coordinates, Event
from streaming_detector import StreamingDetector, AsyncStreamingDetector
from report_generator import ReportGenerator

app = FastAPI(title="地震事件检测系统 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

detector = MatchedFilterDetector(threshold=0.75)
report_generator = ReportGenerator()
streaming_detector: Optional[StreamingDetector] = None


@app.on_event("startup")
async def startup_event():
    init_db()


@app.get("/")
def read_root():
    return {"message": "地震事件检测系统 API - 使用 ObsPy 模板匹配"}


@app.post("/templates/upload", response_model=TemplateSchema)
async def upload_template(
    name: str = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        contents = await file.read()
        from obspy import read, UTCDateTime
        st = read(io.BytesIO(contents))
        st.merge(fill_value="interpolate")

        if len(st) == 0:
            raise HTTPException(status_code=400, detail="无法读取波形文件")

        tr = st[0]
        db_template = Template(
            name=name,
            station=tr.stats.station,
            channel=tr.stats.channel,
            start_time=str(tr.stats.starttime),
            end_time=str(tr.stats.endtime),
            sampling_rate=tr.stats.sampling_rate
        )
        db.add(db_template)
        db.commit()
        db.refresh(db_template)

        os.makedirs("./templates", exist_ok=True)
        template_file = f"./templates/template_{db_template.id}.mseed"
        st.write(template_file, format="MSEED")

        return db_template
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/templates", response_model=List[TemplateSchema])
def get_templates(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    templates = db.query(Template).offset(skip).limit(limit).all()
    return templates


@app.get("/templates/{template_id}", response_model=TemplateSchema)
def get_template(
    template_id: int,
    db: Session = Depends(get_db)
):
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="模板未找到")
    return template


@app.delete("/templates/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(get_db)
):
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="模板未找到")
    db.delete(template)
    db.commit()
    return {"message": "模板已删除"}


@app.post("/detect", response_model=DetectionResponse)
async def detect_events(
    template_id: int = Query(...),
    threshold: Optional[float] = Query(0.75),
    use_adaptive_threshold: Optional[bool] = Query(True),
    adaptive_sigma: Optional[float] = Query(6.0),
    min_stations: Optional[int] = Query(1),
    cluster_time_window: Optional[float] = Query(2.0),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        template = db.query(Template).filter(Template.id == template_id).first()
        if not template:
            raise HTTPException(status_code=404, detail="模板未找到")

        template_file = f"./templates/template_{template_id}.mseed"
        if not os.path.exists(template_file):
            raise HTTPException(status_code=404, detail="模板波形文件不存在")

        detector = MatchedFilterDetector(
            threshold=threshold,
            use_adaptive_threshold=use_adaptive_threshold,
            adaptive_threshold_sigma=adaptive_sigma,
            min_stations=min_stations,
            cluster_max_time_diff=cluster_time_window
        )

        from obspy import read
        st_template = read(template_file)
        st_template.merge(fill_value="interpolate")
        for tr in st_template:
            tr.stats.name = template.name

        continuous_contents = await file.read()
        st_continuous, _ = detector.load_continuous_from_bytes(continuous_contents)

        detections = detector.detect_stream(st_template, st_continuous)

        for det in detections:
            db_detection = Detection(
                template_id=template_id,
                station=det["station"],
                channel=det["channel"],
                detection_time=det["detection_time"],
                correlation_coefficient=det["correlation_coefficient"],
                threshold_used=det.get("threshold_used"),
                sample_index=det.get("sample_index")
            )
            db.add(db_detection)

        db.commit()

        results = [
            DetectionResult(
                station=det["station"],
                channel=det["channel"],
                detection_time=det["detection_time"],
                correlation_coefficient=det["correlation_coefficient"],
                template_name=template.name
            )
            for det in detections
        ]

        return DetectionResponse(
            detections=results,
            total=len(results)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/detections", response_model=List[DetectionSchema])
def get_detections(
    template_id: Optional[int] = None,
    station: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(Detection)
    if template_id:
        query = query.filter(Detection.template_id == template_id)
    if station:
        query = query.filter(Detection.station == station)
    detections = query.order_by(Detection.detection_time.desc()).offset(skip).limit(limit).all()
    return detections


@app.get("/detections/{detection_id}", response_model=DetectionSchema)
def get_detection(
    detection_id: int,
    db: Session = Depends(get_db)
):
    detection = db.query(Detection).filter(Detection.id == detection_id).first()
    if not detection:
        raise HTTPException(status_code=404, detail="检测结果未找到")
    return detection


@app.delete("/detections/{detection_id}")
def delete_detection(
    detection_id: int,
    db: Session = Depends(get_db)
):
    detection = db.query(Detection).filter(Detection.id == detection_id).first()
    if not detection:
        raise HTTPException(status_code=404, detail="检测结果未找到")
    db.delete(detection)
    db.commit()
    return {"message": "检测结果已删除"}


@app.get("/waveforms/template/{template_id}", response_model=WaveformSegment)
def get_template_waveform(
    template_id: int,
    db: Session = Depends(get_db)
):
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="模板未找到")

    template_file = f"./templates/template_{template_id}.mseed"
    if not os.path.exists(template_file):
        raise HTTPException(status_code=404, detail="模板波形文件不存在")

    from obspy import read
    st = read(template_file)
    tr = st[0]

    return WaveformSegment(
        station=tr.stats.station,
        channel=tr.stats.channel,
        start_time=str(tr.stats.starttime),
        end_time=str(tr.stats.endtime),
        sampling_rate=tr.stats.sampling_rate,
        data=tr.data.tolist()
    )


@app.post("/waveforms/aligned", response_model=AlignedWaveforms)
async def get_aligned_waveforms(
    template_id: int = Query(...),
    detection_ids: List[int] = Query(...),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="模板未找到")

    from obspy import read, UTCDateTime
    import io

    template_file = f"./templates/template_{template_id}.mseed"
    if not os.path.exists(template_file):
        raise HTTPException(status_code=404, detail="模板波形文件不存在")

    st_template = read(template_file)
    tr_template = st_template[0]
    duration = tr_template.stats.endtime - tr_template.stats.starttime

    template_segment = WaveformSegment(
        station=tr_template.stats.station,
        channel=tr_template.stats.channel,
        start_time=str(tr_template.stats.starttime),
        end_time=str(tr_template.stats.endtime),
        sampling_rate=tr_template.stats.sampling_rate,
        data=tr_template.data.tolist()
    )

    detection_segments = []
    if file:
        contents = await file.read()
        st_continuous = read(io.BytesIO(contents))

        for det_id in detection_ids:
            detection = db.query(Detection).filter(Detection.id == det_id).first()
            if detection:
                start_time = UTCDateTime(detection.detection_time)
                end_time = start_time + duration
                st_slice = st_continuous.slice(starttime=start_time, endtime=end_time)
                if len(st_slice) > 0:
                    tr = st_slice[0]
                    detection_segments.append(WaveformSegment(
                        station=tr.stats.station,
                        channel=tr.stats.channel,
                        start_time=str(tr.stats.starttime),
                        end_time=str(tr.stats.endtime),
                        sampling_rate=tr.stats.sampling_rate,
                        data=tr.data.tolist()
                    ))

    return AlignedWaveforms(
        template=template_segment,
        detections=detection_segments
    )


@app.post("/location/single", response_model=Optional[LocationResult])
def locate_single_event(
    request: LocationRequest,
):
    try:
        stations = create_stations_from_coordinates(request.station_coords)
        locator = DoubleDifferenceLocator(stations)

        arrival_times = {}
        for station_name, arrival in request.arrival_times.items():
            arrival_times[station_name] = float(arrival)

        result = locator.locate_single_event(arrival_times)

        if result:
            return LocationResult(
                latitude=result.latitude,
                longitude=result.longitude,
                depth=result.depth,
                origin_time=result.origin_time,
                latitude_uncertainty=result.latitude_uncertainty,
                longitude_uncertainty=result.longitude_uncertainty,
                depth_uncertainty=result.depth_uncertainty,
            )
        return None
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/location/relocate", response_model=List[Optional[LocationResult]])
def relocate_events(
    request: RelocateRequest,
):
    try:
        stations = create_stations_from_coordinates(request.station_coords)
        locator = DoubleDifferenceLocator(stations)

        events = []
        for i, evt in enumerate(request.events):
            events.append(Event(
                id=i,
                latitude=float(evt.get("latitude", 0)),
                longitude=float(evt.get("longitude", 0)),
                depth=float(evt.get("depth", 10)),
                origin_time=float(evt.get("origin_time", 0)),
                detections={k: float(v) for k, v in evt.get("detections", {}).items()}
            ))

        results = locator.relocate_events(events)

        return [
            LocationResult(
                latitude=r.latitude,
                longitude=r.longitude,
                depth=r.depth,
                origin_time=r.origin_time,
                latitude_uncertainty=r.latitude_uncertainty,
                longitude_uncertainty=r.longitude_uncertainty,
                depth_uncertainty=r.depth_uncertainty,
            ) if r else None
            for r in results
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/streaming/start")
def start_streaming(
    template_id: int = Query(...),
    window_size: float = Query(60.0),
    overlap: float = Query(30.0),
    use_adaptive_threshold: bool = Query(True),
    threshold: float = Query(0.75),
    db: Session = Depends(get_db)
):
    global streaming_detector

    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="模板未找到")

    template_file = f"./templates/template_{template_id}.mseed"
    if not os.path.exists(template_file):
        raise HTTPException(status_code=404, detail="模板波形文件不存在")

    from obspy import read
    st_template = read(template_file)
    st_template.merge(fill_value="interpolate")

    detector = MatchedFilterDetector(
        threshold=threshold,
        use_adaptive_threshold=use_adaptive_threshold,
    )

    streaming_detector = StreamingDetector(
        detector=detector,
        template_stream=st_template,
        window_size=window_size,
        overlap=overlap,
    )

    return {"message": "流式检测器已启动", "window_size": window_size, "overlap": overlap}


@app.post("/streaming/feed")
async def feed_streaming_data(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    global streaming_detector

    if not streaming_detector:
        raise HTTPException(status_code=400, detail="流式检测器未启动，请先调用 /streaming/start")

    try:
        contents = await file.read()
        from obspy import read
        st = read(io.BytesIO(contents))

        detections = streaming_detector.add_stream(st)

        return {
            "detections_count": len(detections),
            "detections": detections,
            "statistics": streaming_detector.get_statistics()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/streaming/status", response_model=StreamingStatus)
def get_streaming_status():
    global streaming_detector

    if not streaming_detector:
        return StreamingStatus(
            is_running=False,
            total_data_samples=0,
            windows_processed=0,
            detections_count=0,
            buffer_sizes={}
        )

    stats = streaming_detector.get_statistics()
    return StreamingStatus(
        is_running=True,
        total_data_samples=stats["total_data_samples"],
        windows_processed=stats["windows_processed"],
        detections_count=stats["detections_count"],
        buffer_sizes=stats["buffer_sizes"]
    )


@app.post("/streaming/stop")
def stop_streaming():
    global streaming_detector

    if streaming_detector:
        detections = streaming_detector.detections
        streaming_detector.reset()
        streaming_detector = None
        return {"message": "流式检测器已停止", "total_detections": len(detections)}

    return {"message": "流式检测器未运行"}


@app.get("/reports/csv")
def export_csv(
    template_id: Optional[int] = None,
    station: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Detection, Template).join(Template)
    if template_id:
        query = query.filter(Detection.template_id == template_id)
    if station:
        query = query.filter(Detection.station == station)

    results = query.all()

    detections_list = []
    for det, tpl in results:
        detections_list.append({
            "id": det.id,
            "station": det.station,
            "channel": det.channel,
            "detection_time": det.detection_time,
            "correlation_coefficient": det.correlation_coefficient,
            "template_name": tpl.name,
            "threshold_used": det.threshold_used,
            "latitude": "",
            "longitude": "",
            "depth": "",
        })

    csv_bytes = report_generator.generate_csv_bytes(detections_list)

    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=detections.csv"}
    )


@app.get("/reports/pdf")
def export_pdf(
    template_id: Optional[int] = None,
    station: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Detection, Template).join(Template)
    if template_id:
        query = query.filter(Detection.template_id == template_id)
    if station:
        query = query.filter(Detection.station == station)

    results = query.all()

    detections_list = []
    template_name = "未知模板"
    for det, tpl in results:
        template_name = tpl.name
        detections_list.append({
            "id": det.id,
            "station": det.station,
            "channel": det.channel,
            "detection_time": det.detection_time,
            "correlation_coefficient": det.correlation_coefficient,
            "template_name": tpl.name,
            "threshold_used": det.threshold_used,
        })

    pdf_bytes = report_generator.generate_pdf_bytes(
        detections_list,
        template_name=template_name,
        detection_parameters={
            "threshold": 0.75,
            "use_adaptive_threshold": True,
        }
    )

    if pdf_bytes is None:
        raise HTTPException(status_code=500, detail="PDF生成失败，请安装 reportlab 库")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=detection_report.pdf"}
    )


@app.get("/reports/summary")
def get_report_summary(
    template_id: Optional[int] = None,
    station: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Detection, Template).join(Template)
    if template_id:
        query = query.filter(Detection.template_id == template_id)
    if station:
        query = query.filter(Detection.station == station)

    results = query.all()

    detections_list = []
    for det, tpl in results:
        detections_list.append({
            "id": det.id,
            "station": det.station,
            "channel": det.channel,
            "detection_time": det.detection_time,
            "correlation_coefficient": det.correlation_coefficient,
            "template_name": tpl.name,
        })

    summary = report_generator.generate_summary_text(detections_list)

    return {"summary": summary, "detections_count": len(detections_list)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
