from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pydantic import BaseModel
from datetime import datetime
import uuid
import os
import json
from pathlib import Path

app = FastAPI(title="OSM History Viewer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./osm_history.db")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

UPLOAD_DIR = Path("./uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


class Region(Base):
    __tablename__ = "regions"
    id = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False)
    min_lat = Column(Float, nullable=False)
    max_lat = Column(Float, nullable=False)
    min_lon = Column(Float, nullable=False)
    max_lon = Column(Float, nullable=False)
    available_years = Column(String, default="[]")
    created_at = Column(DateTime, default=datetime.utcnow)


class RoadSegment(Base):
    __tablename__ = "road_segments"
    id = Column(String(128), primary_key=True)
    osm_id = Column(Integer, nullable=False)
    name = Column(String(255))
    highway_type = Column(String(64), nullable=False)
    geometry = Column(String, nullable=False)
    first_seen_year = Column(Integer, nullable=False)
    last_seen_year = Column(Integer, nullable=False)
    region_id = Column(String(64))
    created_at = Column(DateTime, default=datetime.utcnow)


class PBFTask(Base):
    __tablename__ = "pbf_tasks"
    id = Column(String(64), primary_key=True)
    filename = Column(String(255), nullable=False)
    region_id = Column(String(64))
    status = Column(String(32), default="pending")
    progress = Column(Integer, default=0)
    error_message = Column(String)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)


Base.metadata.create_all(bind=engine)


class RegionResponse(BaseModel):
    id: str
    name: str
    bbox: list[float]
    availableYears: list[int]


class RoadSegmentResponse(BaseModel):
    type: str
    features: list


class StatsResponse(BaseModel):
    year: int
    newRoads: int
    disappearedRoads: int
    totalRoads: int


class TaskResponse(BaseModel):
    taskId: str
    status: str
    progress: int
    message: str


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_sample_data():
    db = next(get_db())
    
    if db.query(Region).count() == 0:
        regions = [
            Region(
                id="beijing",
                name="北京市",
                min_lat=39.7, max_lat=40.1,
                min_lon=116.2, max_lon=116.6,
                available_years=json.dumps([2018, 2019, 2020, 2021, 2022, 2023, 2024])
            ),
            Region(
                id="shanghai",
                name="上海市",
                min_lat=31.1, max_lat=31.4,
                min_lon=121.3, max_lon=121.6,
                available_years=json.dumps([2018, 2019, 2020, 2021, 2022, 2023, 2024])
            ),
            Region(
                id="guangzhou",
                name="广州市",
                min_lat=23.0, max_lat=23.3,
                min_lon=113.2, max_lon=113.5,
                available_years=json.dumps([2018, 2019, 2020, 2021, 2022, 2023, 2024])
            )
        ]
        db.add_all(regions)
        
        sample_roads = generate_sample_roads()
        db.add_all(sample_roads)
        db.commit()


def generate_sample_roads():
    roads = []
    
    center_lat, center_lon = 39.9042, 116.4074
    
    road_data = [
        ("长安街", "primary", 2018, 2024),
        ("建国路", "primary", 2019, 2024),
        ("三环路", "trunk", 2018, 2024),
        ("四环路", "trunk", 2020, 2024),
        ("五环路", "motorway", 2021, 2024),
        ("王府井大街", "secondary", 2018, 2024),
        ("中关村大街", "secondary", 2019, 2024),
        ("望京路", "tertiary", 2020, 2024),
        ("朝阳路", "secondary", 2022, 2024),
        ("学院路", "secondary", 2018, 2023),
        ("旧路1", "tertiary", 2018, 2020),
        ("旧路2", "residential", 2019, 2021),
        ("新建路1", "residential", 2023, 2024),
        ("新建路2", "tertiary", 2024, 2024),
    ]
    
    for i, (name, htype, first, last) in enumerate(road_data):
        offset = i * 0.01
        coords = [
            [center_lon - 0.05 + offset, center_lat - 0.02],
            [center_lon + offset, center_lat],
            [center_lon + 0.05 + offset, center_lat + 0.02]
        ]
        geom = {
            "type": "LineString",
            "coordinates": coords
        }
        
        roads.append(RoadSegment(
            id=f"road_beijing_{i}",
            osm_id=100000 + i,
            name=name,
            highway_type=htype,
            geometry=json.dumps(geom),
            first_seen_year=first,
            last_seen_year=last,
            region_id="beijing"
        ))
    
    return roads


init_sample_data()


@app.get("/api/regions", response_model=list[RegionResponse])
async def get_regions():
    db = next(get_db())
    regions = db.query(Region).all()
    return [
        RegionResponse(
            id=r.id,
            name=r.name,
            bbox=[r.min_lon, r.min_lat, r.max_lon, r.max_lat],
            availableYears=json.loads(r.available_years)
        )
        for r in regions
    ]


@app.get("/api/roads")
async def get_roads(regionId: str, year: int):
    db = next(get_db())
    roads = db.query(RoadSegment).filter(
        RoadSegment.region_id == regionId,
        RoadSegment.first_seen_year <= year,
        RoadSegment.last_seen_year >= year
    ).all()
    
    features = []
    for road in roads:
        status = "existing"
        if road.first_seen_year == year:
            status = "new"
        elif road.last_seen_year == year:
            status = "disappeared"
        
        features.append({
            "type": "Feature",
            "properties": {
                "id": road.id,
                "osmId": road.osm_id,
                "name": road.name,
                "highwayType": road.highway_type,
                "firstSeen": road.first_seen_year,
                "lastSeen": road.last_seen_year,
                "status": status
            },
            "geometry": json.loads(road.geometry)
        })
    
    return {"type": "FeatureCollection", "features": features}


@app.get("/api/stats")
async def get_stats(regionId: str):
    db = next(get_db())
    roads = db.query(RoadSegment).filter(RoadSegment.region_id == regionId).all()
    
    years = list(range(2018, 2025))
    stats = []
    
    for year in years:
        new_roads = sum(1 for r in roads if r.first_seen_year == year)
        disappeared = sum(1 for r in roads if r.last_seen_year == year)
        total = sum(1 for r in roads if r.first_seen_year <= year <= r.last_seen_year)
        stats.append({
            "year": year,
            "newRoads": new_roads,
            "disappearedRoads": disappeared,
            "totalRoads": total
        })
    
    return stats


@app.post("/api/upload-pbf", response_model=TaskResponse)
async def upload_pbf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    regionId: str = ""
):
    task_id = str(uuid.uuid4())
    db = next(get_db())
    
    file_path = UPLOAD_DIR / f"{task_id}_{file.filename}"
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    task = PBFTask(
        id=task_id,
        filename=file.filename,
        region_id=regionId,
        status="processing",
        started_at=datetime.utcnow()
    )
    db.add(task)
    db.commit()
    
    return TaskResponse(
        taskId=task_id,
        status="processing",
        progress=0,
        message="任务已开始"
    )


@app.get("/api/tasks/{taskId}", response_model=TaskResponse)
async def get_task(taskId: str):
    db = next(get_db())
    task = db.query(PBFTask).filter(PBFTask.id == taskId).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return TaskResponse(
        taskId=task.id,
        status=task.status,
        progress=task.progress,
        message=task.error_message or ""
    )


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
