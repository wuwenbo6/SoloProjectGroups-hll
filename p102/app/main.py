import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db, AsyncSessionLocal
from app.api.routes import router
from app.stream.stream_manager import init_stream_manager
from app.stream.video_exporter import init_export_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Database initialized")
    
    init_stream_manager(AsyncSessionLocal)
    logger.info("Stream manager initialized")
    
    init_export_manager("exports")
    logger.info("Export manager initialized")
    
    yield
    
    from app.stream.stream_manager import get_stream_manager
    manager = get_stream_manager()
    if manager:
        await manager.shutdown_all()
        logger.info("All streams shutdown")


app = FastAPI(title="RTSP WebRTC Tracking Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
app.include_router(router, prefix="/api", tags=["streams"])


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True
    )
