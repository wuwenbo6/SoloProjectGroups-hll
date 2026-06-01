from pydantic import BaseModel
from typing import List


class PoseLandmark(BaseModel):
    x: float
    y: float
    z: float
    visibility: float


class PoseFrame(BaseModel):
    timestamp: float
    landmarks: List[PoseLandmark]


class RecognitionRequest(BaseModel):
    frames: List[PoseFrame]


class RecognitionResponse(BaseModel):
    action: str
    confidence: float
    count: int
