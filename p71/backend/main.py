from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models.database import create_tables
from app.api.training import router as training_router
from app.api.recognition import router as recognition_router
from app.api.advanced import router as advanced_router

app = FastAPI(title="Action Recognition API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(training_router, prefix="/api")
app.include_router(recognition_router, prefix="/api")
app.include_router(advanced_router, prefix="/api")


@app.on_event("startup")
def startup_event():
    create_tables()


@app.get("/")
def root():
    return {
        "message": "Action Recognition API",
        "version": "1.0.0",
        "endpoints": {
            "training": "/api/training",
            "recognition": "/api/recognize",
            "docs": "/docs"
        }
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
