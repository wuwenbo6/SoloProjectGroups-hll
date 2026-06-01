from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import datetime
import os

from database import get_db, init_db, PricingHistory
from pricing_engine import price_option, price_multi_asset
from report_generator import generate_csv_report, generate_history_csv_report

app = FastAPI(title="Option Pricing API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class OptionRequest(BaseModel):
    option_style: str
    option_type: str
    S0: float
    K: float
    T: float
    r: float
    sigma: float
    num_paths: int = 100000
    num_steps: int = 252
    underlying_name: str = "Asset"

class MultiAssetRequest(BaseModel):
    options: List[OptionRequest]

@app.on_event("startup")
def startup_event():
    init_db()

@app.post("/api/price/single")
def price_single_option(request: OptionRequest, db: Session = Depends(get_db)):
    try:
        result = price_option(
            option_style=request.option_style,
            option_type=request.option_type,
            S0=request.S0,
            K=request.K,
            T=request.T,
            r=request.r,
            sigma=request.sigma,
            num_paths=request.num_paths,
            num_steps=request.num_steps,
            underlying_name=request.underlying_name
        )
        
        db_record = PricingHistory(
            underlying_name=request.underlying_name,
            option_style=request.option_style,
            option_type=request.option_type,
            S0=request.S0,
            K=request.K,
            T=request.T,
            r=request.r,
            sigma=request.sigma,
            num_paths=request.num_paths,
            num_steps=request.num_steps,
            price=result["price"],
            ci_lower=result["ci_lower"],
            ci_upper=result["ci_upper"],
            std_error=result["std_error"],
            time_taken=result["time_taken"]
        )
        db.add(db_record)
        db.commit()
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/price/multi")
def price_multiple_options(request: MultiAssetRequest, db: Session = Depends(get_db)):
    try:
        options_data = [opt.dict() for opt in request.options]
        results = price_multi_asset(options_data)
        
        for result, opt in zip(results, request.options):
            db_record = PricingHistory(
                underlying_name=opt.underlying_name,
                option_style=opt.option_style,
                option_type=opt.option_type,
                S0=opt.S0,
                K=opt.K,
                T=opt.T,
                r=opt.r,
                sigma=opt.sigma,
                num_paths=opt.num_paths,
                num_steps=opt.num_steps,
                price=result["price"],
                ci_lower=result["ci_lower"],
                ci_upper=result["ci_upper"],
                std_error=result["std_error"],
                time_taken=result["time_taken"]
            )
            db.add(db_record)
        db.commit()
        
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/history")
def get_pricing_history(
    skip: int = 0,
    limit: int = 100,
    underlying_name: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(PricingHistory)
    if underlying_name:
        query = query.filter(PricingHistory.underlying_name == underlying_name)
    
    records = query.order_by(PricingHistory.created_at.desc()).offset(skip).limit(limit).all()
    
    return {
        "total": query.count(),
        "records": [
            {
                "id": r.id,
                "underlying_name": r.underlying_name,
                "option_style": r.option_style,
                "option_type": r.option_type,
                "S0": r.S0,
                "K": r.K,
                "T": r.T,
                "r": r.r,
                "sigma": r.sigma,
                "num_paths": r.num_paths,
                "num_steps": r.num_steps,
                "price": r.price,
                "ci_lower": r.ci_lower,
                "ci_upper": r.ci_upper,
                "std_error": r.std_error,
                "time_taken": r.time_taken,
                "created_at": r.created_at.isoformat()
            }
            for r in records
        ]
    }

@app.post("/api/report/single")
def export_single_report(request: OptionRequest):
    try:
        result = price_option(
            option_style=request.option_style,
            option_type=request.option_type,
            S0=request.S0,
            K=request.K,
            T=request.T,
            r=request.r,
            sigma=request.sigma,
            num_paths=request.num_paths,
            num_steps=request.num_steps,
            underlying_name=request.underlying_name
        )
        return generate_csv_report([result])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/report/multi")
def export_multi_report(request: MultiAssetRequest):
    try:
        options_data = [opt.dict() for opt in request.options]
        results = price_multi_asset(options_data)
        return generate_csv_report(results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/report/history")
def export_history_report(
    underlying_name: Optional[str] = None,
    db: Session = Depends(get_db)
):
    try:
        query = db.query(PricingHistory)
        if underlying_name:
            query = query.filter(PricingHistory.underlying_name == underlying_name)
        
        records = query.order_by(PricingHistory.created_at.desc()).all()
        records_list = [
            {
                "id": r.id,
                "underlying_name": r.underlying_name,
                "option_style": r.option_style,
                "option_type": r.option_type,
                "S0": r.S0,
                "K": r.K,
                "T": r.T,
                "r": r.r,
                "sigma": r.sigma,
                "num_paths": r.num_paths,
                "num_steps": r.num_steps,
                "price": r.price,
                "ci_lower": r.ci_lower,
                "ci_upper": r.ci_upper,
                "std_error": r.std_error,
                "time_taken": r.time_taken,
                "created_at": r.created_at.isoformat()
            }
            for r in records
        ]
        return generate_history_csv_report(records_list)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def read_root():
    frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "index.html")
    if os.path.exists(frontend_path):
        return FileResponse(frontend_path)
    return {"message": "Option Pricing API - Visit /docs for API documentation"}
