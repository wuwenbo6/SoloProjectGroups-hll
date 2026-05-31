import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.api.routes import router as api_router
from backend.app.api.video_routes import router as video_router
from backend.database import init_db
from backend.config import settings


app = FastAPI(
    title=settings.APP_NAME,
    description="License Plate Recognition API with YOLOv5, OCR, AOD-Net image enhancement, RTSP video stream, and watchlist alerts",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(api_router, prefix="/api/v1", tags=["recognition"])
app.include_router(video_router, prefix="/api/v1/video", tags=["video"])


@app.on_event("startup")
async def startup_event():
    init_db()
    print("Database initialized")


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "version": "1.0.0",
        "docs": "/docs",
        "frontend": "/static/index.html"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
