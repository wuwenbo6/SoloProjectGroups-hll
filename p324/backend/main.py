import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from dicom_service import apply_window, parse_dicom

app = FastAPI(title="DICOM Window Optimizer", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class WindowRequest(BaseModel):
    id: str
    center: float
    width: float


@app.post("/api/dicom/upload")
async def upload_dicom(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    content = await file.read()
    try:
        result = parse_dicom(content)
        return result
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"DICOM parse error: {str(e)}")


@app.post("/api/dicom/window")
async def adjust_window(req: WindowRequest):
    try:
        result = apply_window(req.id, req.center, req.width)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
