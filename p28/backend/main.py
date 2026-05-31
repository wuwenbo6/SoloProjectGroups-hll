from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
import numpy as np
import json
import os
from typing import Optional, List
from pydantic import BaseModel

from database import get_db, init_db, SoilMoisture
from wavelet_denoise import extract_ddm_features, wavelet_denoise_2d
from soil_moisture_inversion import ddm_to_soil_moisture, generate_sample_ddm
from vegetation_correction import correct_soil_moisture_for_vegetation, calculate_vegetation_index
from multi_satellite_fusion import fuse_multi_satellite_data, weighted_average_fusion
from netcdf_export import export_to_netcdf

app = FastAPI(title="CYGNSS土壤湿度反演API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DDMData(BaseModel):
    ddm: List[List[float]]
    latitude: float
    longitude: float
    timestamp: Optional[str] = None
    satellite: Optional[str] = "CYGNSS-01"
    temperature: Optional[float] = None

class TimeSeriesQuery(BaseModel):
    latitude: float
    longitude: float
    start_date: str
    end_date: str

class VegetationCorrectionRequest(BaseModel):
    ddm: Optional[List[List[float]]] = None
    soil_moisture: float
    ndvi: Optional[float] = None
    vwc: Optional[float] = None
    method: str = 'tau_omega'

class FusionRequest(BaseModel):
    method: str = 'idw'
    grid_res: float = 1.0
    min_lat: Optional[float] = None
    max_lat: Optional[float] = None
    min_lon: Optional[float] = None
    max_lon: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

@app.on_event("startup")
def startup_event():
    init_db()
    generate_sample_data()

def generate_sample_data():
    db = next(get_db())
    existing = db.query(SoilMoisture).count()
    if existing == 0:
        for i in range(1000):
            lat = np.random.uniform(-60, 60)
            lon = np.random.uniform(-180, 180)
            
            surface_choice = np.random.choice(['soil', 'water', 'frozen'], p=[0.6, 0.25, 0.15])
            ddm = generate_sample_ddm(surface_type=surface_choice)
            
            temperature = None
            if surface_choice == 'frozen':
                temperature = np.random.uniform(260, 273)
            elif surface_choice == 'water':
                temperature = np.random.uniform(280, 300)
            else:
                temperature = np.random.uniform(280, 310)
            
            features = extract_ddm_features(ddm)
            result = ddm_to_soil_moisture(features, temperature=temperature)
            
            days_ago = np.random.randint(0, 30)
            timestamp = datetime.now() - timedelta(days=days_ago)
            
            record = SoilMoisture(
                timestamp=timestamp,
                latitude=round(lat, 2),
                longitude=round(lon, 2),
                soil_moisture=float(result['soil_moisture']),
                surface_type=result['surface_type'],
                reflectivity=float(result['reflectivity']),
                sharpness=float(result['sharpness']),
                ddm_peak=float(features['peak_value']),
                ddm_noise=float(features['noise_floor']),
                snr=float(features['snr']),
                satellite=f"CYGNSS-{np.random.randint(1, 9):02d}"
            )
            db.add(record)
        db.commit()

@app.post("/api/invert")
async def invert_soil_moisture(data: DDMData, db: Session = Depends(get_db)):
    try:
        ddm_array = np.array(data.ddm)
        features = extract_ddm_features(ddm_array)
        result = ddm_to_soil_moisture(features, temperature=data.temperature)
        timestamp = datetime.fromisoformat(data.timestamp) if data.timestamp else datetime.now()
        record = SoilMoisture(
            timestamp=timestamp,
            latitude=data.latitude,
            longitude=data.longitude,
            soil_moisture=float(result['soil_moisture']),
            surface_type=result['surface_type'],
            reflectivity=float(result['reflectivity']),
            sharpness=float(result['sharpness']),
            ddm_peak=float(features['peak_value']),
            ddm_noise=float(features['noise_floor']),
            snr=float(features['snr']),
            satellite=data.satellite
        )
        db.add(record)
        db.commit()
        return {
            "success": True,
            "soil_moisture": float(result['soil_moisture']),
            "surface_type": result['surface_type'],
            "reflectivity": float(result['reflectivity']),
            "features": {
                "peak_value": float(features['peak_value']),
                "noise_floor": float(features['noise_floor']),
                "snr": float(features['snr']),
                "sharpness": float(result['sharpness'])
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/moisture")
async def get_moisture_data(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lon: Optional[float] = None,
    max_lon: Optional[float] = None,
    surface_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(SoilMoisture)
    if start_date:
        query = query.filter(SoilMoisture.timestamp >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(SoilMoisture.timestamp <= datetime.fromisoformat(end_date))
    if min_lat is not None:
        query = query.filter(SoilMoisture.latitude >= min_lat)
    if max_lat is not None:
        query = query.filter(SoilMoisture.latitude <= max_lat)
    if min_lon is not None:
        query = query.filter(SoilMoisture.longitude >= min_lon)
    if max_lon is not None:
        query = query.filter(SoilMoisture.longitude <= max_lon)
    if surface_type:
        query = query.filter(SoilMoisture.surface_type == surface_type)
    results = query.all()
    return {
        "data": [
            {
                "id": r.id,
                "timestamp": r.timestamp.isoformat(),
                "latitude": r.latitude,
                "longitude": r.longitude,
                "soil_moisture": r.soil_moisture,
                "surface_type": r.surface_type,
                "reflectivity": r.reflectivity,
                "snr": r.snr,
                "satellite": r.satellite
            }
            for r in results
        ]
    }

@app.get("/api/timeseries")
async def get_timeseries(
    latitude: float, longitude: float, start_date: str, end_date: str, db: Session = Depends(get_db)
):
    lat_range = 2.0
    results = db.query(SoilMoisture).filter(
        SoilMoisture.latitude.between(latitude - lat_range, latitude + lat_range),
        SoilMoisture.longitude.between(longitude - lat_range, longitude + lat_range),
        SoilMoisture.timestamp.between(
            datetime.fromisoformat(start_date),
            datetime.fromisoformat(end_date)
        )
    ).order_by(SoilMoisture.timestamp).all()
    return {
        "latitude": latitude,
        "longitude": longitude,
        "data": [
            {
                "timestamp": r.timestamp.isoformat(),
                "soil_moisture": r.soil_moisture,
                "snr": r.snr
            }
            for r in results
        ]
    }

@app.get("/api/statistics")
async def get_statistics(db: Session = Depends(get_db)):
    total = db.query(SoilMoisture).count()
    avg_sm = db.query(func.avg(SoilMoisture.soil_moisture)).scalar()
    avg_snr = db.query(func.avg(SoilMoisture.snr)).scalar()
    
    soil_count = db.query(SoilMoisture).filter(SoilMoisture.surface_type == 'soil').count()
    water_count = db.query(SoilMoisture).filter(SoilMoisture.surface_type == 'water').count()
    frozen_count = db.query(SoilMoisture).filter(SoilMoisture.surface_type == 'frozen_soil').count()
    
    return {
        "total_records": total,
        "average_soil_moisture": float(avg_sm) if avg_sm else 0,
        "average_snr": float(avg_snr) if avg_snr else 0,
        "surface_types": {
            "soil": soil_count,
            "water": water_count,
            "frozen_soil": frozen_count
        }
    }

@app.post("/api/vegetation-correction")
async def apply_vegetation_correction(request: VegetationCorrectionRequest):
    try:
        ddm_features = None
        if request.ddm:
            ddm_array = np.array(request.ddm)
            ddm_features = extract_ddm_features(ddm_array)
        
        corrected_sm = correct_soil_moisture_for_vegetation(
            soil_moisture=request.soil_moisture,
            ddm_features=ddm_features,
            ndvi=request.ndvi,
            vwc=request.vwc,
            method=request.method
        )
        
        veg_index = {}
        if ddm_features:
            veg_index = calculate_vegetation_index(ddm_features)
        
        return {
            "success": True,
            "original_soil_moisture": request.soil_moisture,
            "corrected_soil_moisture": float(corrected_sm),
            "correction_method": request.method,
            "vegetation_index": veg_index
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/fuse")
async def fuse_data(request: FusionRequest, db: Session = Depends(get_db)):
    try:
        query = db.query(SoilMoisture).filter(SoilMoisture.surface_type == 'soil')
        
        if request.min_lat is not None:
            query = query.filter(SoilMoisture.latitude >= request.min_lat)
        if request.max_lat is not None:
            query = query.filter(SoilMoisture.latitude <= request.max_lat)
        if request.min_lon is not None:
            query = query.filter(SoilMoisture.longitude >= request.min_lon)
        if request.max_lon is not None:
            query = query.filter(SoilMoisture.longitude <= request.max_lon)
        if request.start_date:
            query = query.filter(SoilMoisture.timestamp >= datetime.fromisoformat(request.start_date))
        if request.end_date:
            query = query.filter(SoilMoisture.timestamp <= datetime.fromisoformat(request.end_date))
        
        results = query.all()
        
        if len(results) == 0:
            return {"success": False, "message": "No data available for fusion"}
        
        points = [
            {
                "latitude": r.latitude,
                "longitude": r.longitude,
                "soil_moisture": r.soil_moisture,
                "snr": r.snr,
                "satellite": r.satellite,
                "timestamp": r.timestamp.isoformat()
            }
            for r in results
        ]
        
        if request.method == 'weighted_average':
            center_lat = (request.min_lat + request.max_lat) / 2 if (request.min_lat and request.max_lat) else np.mean([p['latitude'] for p in points])
            center_lon = (request.min_lon + request.max_lon) / 2 if (request.min_lon and request.max_lon) else np.mean([p['longitude'] for p in points])
            
            result = weighted_average_fusion(points, center_lat, center_lon)
        else:
            result = fuse_multi_satellite_data(
                points,
                method=request.method,
                grid_res=request.grid_res,
                min_lat=request.min_lat if request.min_lat else np.min([p['latitude'] for p in points]),
                max_lat=request.max_lat if request.max_lat else np.max([p['latitude'] for p in points]),
                min_lon=request.min_lon if request.min_lon else np.min([p['longitude'] for p in points]),
                max_lon=request.max_lon if request.max_lon else np.max([p['longitude'] for p in points])
            )
        
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/export/netcdf")
async def export_netcdf(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lon: Optional[float] = None,
    max_lon: Optional[float] = None,
    surface_type: Optional[str] = None,
    apply_correction: bool = False,
    db: Session = Depends(get_db)
):
    try:
        query = db.query(SoilMoisture)
        
        if start_date:
            query = query.filter(SoilMoisture.timestamp >= datetime.fromisoformat(start_date))
        if end_date:
            query = query.filter(SoilMoisture.timestamp <= datetime.fromisoformat(end_date))
        if min_lat is not None:
            query = query.filter(SoilMoisture.latitude >= min_lat)
        if max_lat is not None:
            query = query.filter(SoilMoisture.latitude <= max_lat)
        if min_lon is not None:
            query = query.filter(SoilMoisture.longitude >= min_lon)
        if max_lon is not None:
            query = query.filter(SoilMoisture.longitude <= max_lon)
        if surface_type:
            query = query.filter(SoilMoisture.surface_type == surface_type)
        
        results = query.all()
        
        export_data = []
        for r in results:
            point = {
                "timestamp": r.timestamp,
                "latitude": r.latitude,
                "longitude": r.longitude,
                "soil_moisture": r.soil_moisture,
                "surface_type": r.surface_type,
                "reflectivity": r.reflectivity,
                "snr": r.snr,
                "sharpness": r.sharpness,
                "ddm_peak": r.ddm_peak,
                "satellite": r.satellite
            }
            
            if apply_correction and r.surface_type == 'soil':
                ddm_features = {
                    'peak_value': r.ddm_peak,
                    'snr': r.snr
                }
                point['soil_moisture_corrected'] = correct_soil_moisture_for_vegetation(
                    r.soil_moisture, ddm_features=ddm_features
                )
                veg_idx = calculate_vegetation_index(ddm_features)
                point['estimated_ndvi'] = veg_idx['estimated_ndvi']
                point['estimated_vwc'] = veg_idx['estimated_vwc']
            else:
                point['soil_moisture_corrected'] = r.soil_moisture
            
            export_data.append(point)
        
        output_path = export_to_netcdf(export_data)
        
        return FileResponse(
            output_path,
            media_type='application/x-netcdf',
            filename=os.path.basename(output_path)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
