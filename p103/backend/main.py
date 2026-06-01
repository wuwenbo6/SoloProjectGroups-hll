from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.core import settings, init_db, socketio_app
from app.api import api_router

app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

app.mount("/ws", socketio_app)

frontend_dist = Path(__file__).parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")


@app.on_event("startup")
async def startup_event():
    init_db()
    print(f"Modbus Fuzzer API 启动成功，运行在 http://{settings.HOST}:{settings.PORT}")


@app.get("/health")
async def health_check():
    return {"status": "healthy", "app": settings.APP_NAME}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
