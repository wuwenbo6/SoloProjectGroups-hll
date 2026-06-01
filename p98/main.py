import os
import uuid
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from typing import List
from sqlalchemy.orm import Session

from database.models import get_db, ImageAnalysis
from models.model_inference import predictor
from models.pdf_report import pdf_generator, PDF_AVAILABLE

app = FastAPI(title="颜值评分与年龄分类 API", version="1.0.0")

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/")
async def root():
    return FileResponse("static/index.html")


@app.post("/api/analyze")
async def analyze_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="请上传图片文件")
    
    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    try:
        result = predictor.predict(file_path)
        
        warnings_str = "|".join(result.get("warnings", []))
        
        analysis = ImageAnalysis(
            filename=file.filename,
            image_path=f"/uploads/{unique_filename}",
            beauty_score=result["beauty_score"],
            age_group=result["age_group"],
            age_min=result["age_min"],
            age_max=result["age_max"],
            confidence=result.get("confidence", 1.0),
            quality_score=result.get("quality_score", 1.0),
            pose_score=result.get("pose_score", 1.0),
            warnings=warnings_str,
            is_profile=1 if result.get("is_profile", False) else 0
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)
        
        return {
            "success": True,
            "data": analysis.to_dict(),
            "beauty_suggestions": result.get("beauty_suggestions"),
            "model_used": result.get("model_used", "simulation")
        }
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")


@app.post("/api/analyze/batch")
async def analyze_batch(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    results = []
    errors = []
    
    for idx, file in enumerate(files):
        try:
            if not file.content_type or not file.content_type.startswith("image/"):
                errors.append({"filename": file.filename, "error": "不是图片文件"})
                continue
            
            file_ext = os.path.splitext(file.filename)[1]
            unique_filename = f"{uuid.uuid4().hex}{file_ext}"
            file_path = os.path.join(UPLOAD_DIR, unique_filename)
            
            with open(file_path, "wb") as buffer:
                content = await file.read()
                buffer.write(content)
            
            result = predictor.predict(file_path)
            
            warnings_str = "|".join(result.get("warnings", []))
            
            analysis = ImageAnalysis(
                filename=file.filename,
                image_path=f"/uploads/{unique_filename}",
                beauty_score=result["beauty_score"],
                age_group=result["age_group"],
                age_min=result["age_min"],
                age_max=result["age_max"],
                confidence=result.get("confidence", 1.0),
                quality_score=result.get("quality_score", 1.0),
                pose_score=result.get("pose_score", 1.0),
                warnings=warnings_str,
                is_profile=1 if result.get("is_profile", False) else 0
            )
            db.add(analysis)
            db.flush()
            
            results.append({
                "filename": file.filename,
                "data": analysis.to_dict(),
                "model_used": result.get("model_used", "simulation")
            })
            
        except Exception as e:
            errors.append({"filename": file.filename, "error": str(e)})
    
    db.commit()
    
    return {
        "success": True,
        "total": len(files),
        "success_count": len(results),
        "error_count": len(errors),
        "results": results,
        "errors": errors
    }


@app.get("/api/history")
async def get_history(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db)
):
    query = db.query(ImageAnalysis).order_by(ImageAnalysis.created_at.desc())
    
    total = query.count()
    offset = (page - 1) * page_size
    records = query.offset(offset).limit(page_size).all()
    
    return {
        "success": True,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "data": [record.to_dict() for record in records]
    }


@app.get("/api/history/{record_id}")
async def get_history_detail(
    record_id: int,
    db: Session = Depends(get_db)
):
    record = db.query(ImageAnalysis).filter(ImageAnalysis.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    
    return {
        "success": True,
        "data": record.to_dict()
    }


@app.delete("/api/history/{record_id}")
async def delete_history(
    record_id: int,
    db: Session = Depends(get_db)
):
    record = db.query(ImageAnalysis).filter(ImageAnalysis.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    
    if record.image_path:
        file_path = record.image_path.lstrip("/")
        if os.path.exists(file_path):
            os.remove(file_path)
    
    db.delete(record)
    db.commit()
    
    return {"success": True, "message": "删除成功"}


@app.get("/api/stats")
async def get_stats(db: Session = Depends(get_db)):
    total = db.query(ImageAnalysis).count()
    
    if total == 0:
        return {
            "success": True,
            "total": 0,
            "avg_beauty_score": 0,
            "age_distribution": {}
        }
    
    from sqlalchemy import func
    avg_score = db.query(func.avg(ImageAnalysis.beauty_score)).scalar()
    
    age_groups = db.query(
        ImageAnalysis.age_group,
        func.count(ImageAnalysis.id)
    ).group_by(ImageAnalysis.age_group).all()
    
    age_distribution = {group: count for group, count in age_groups}
    
    return {
        "success": True,
        "total": total,
        "avg_beauty_score": round(float(avg_score), 2) if avg_score else 0,
        "age_distribution": age_distribution
    }


@app.post("/api/analyze/multi-face")
async def analyze_multi_face(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="请上传图片文件")
    
    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    try:
        result = predictor.predict_multi_face(file_path)
        
        if result["face_count"] > 0:
            main_face = result["faces"][0]
            warnings_str = "|".join(main_face.get("warnings", []))
            
            analysis = ImageAnalysis(
                filename=file.filename,
                image_path=f"/uploads/{unique_filename}",
                beauty_score=main_face["beauty_score"],
                age_group=main_face["age_group"],
                age_min=main_face["age_min"],
                age_max=main_face["age_max"],
                confidence=main_face.get("confidence", 1.0),
                quality_score=main_face.get("quality_score", 1.0),
                pose_score=main_face.get("pose_score", 1.0),
                warnings=warnings_str,
                is_profile=1 if main_face.get("is_profile", False) else 0
            )
            db.add(analysis)
            db.commit()
            db.refresh(analysis)
        
        return {
            "success": True,
            "data": result,
            "image_path": f"/uploads/{unique_filename}"
        }
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")


@app.get("/api/export/pdf/{record_id}")
async def export_pdf(
    record_id: int,
    db: Session = Depends(get_db)
):
    if not PDF_AVAILABLE:
        raise HTTPException(status_code=503, detail="PDF导出功能不可用，请安装 reportlab 库")
    
    record = db.query(ImageAnalysis).filter(ImageAnalysis.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    
    try:
        image_path = record.image_path.lstrip("/") if record.image_path else None
        
        pdf_filename = f"report_{record_id}.pdf"
        pdf_path = os.path.join(UPLOAD_DIR, pdf_filename)
        
        analysis_data = record.to_dict()
        analysis_data["beauty_suggestions"] = None
        
        if image_path and os.path.exists(image_path):
            full_result = predictor.predict(image_path)
            analysis_data["beauty_suggestions"] = full_result.get("beauty_suggestions")
        
        pdf_generator.generate_report(analysis_data, pdf_path, image_path)
        
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=f"颜值分析报告_{record_id}.pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF生成失败: {str(e)}")


@app.post("/api/export/pdf/batch")
async def export_batch_pdf(
    record_ids: List[int],
    db: Session = Depends(get_db)
):
    if not PDF_AVAILABLE:
        raise HTTPException(status_code=503, detail="PDF导出功能不可用，请安装 reportlab 库")
    
    records = db.query(ImageAnalysis).filter(ImageAnalysis.id.in_(record_ids)).all()
    
    if not records:
        raise HTTPException(status_code=404, detail="未找到记录")
    
    try:
        analyses = [record.to_dict() for record in records]
        
        pdf_filename = f"batch_report_{uuid.uuid4().hex[:8]}.pdf"
        pdf_path = os.path.join(UPLOAD_DIR, pdf_filename)
        
        pdf_generator.generate_batch_report(analyses, pdf_path)
        
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename="批量颜值分析报告.pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF生成失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9876)
