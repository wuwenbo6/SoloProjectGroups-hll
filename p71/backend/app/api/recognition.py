from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List
import json

from app.schemas.pose import RecognitionRequest, RecognitionResponse
from app.services.pose_service import ActionRecognitionService

router = APIRouter(prefix="/recognize", tags=["recognition"])

recognition_service = ActionRecognitionService()


@router.post("", response_model=RecognitionResponse)
def recognize_action(request: RecognitionRequest):
    result = recognition_service.recognize(request.frames)
    return RecognitionResponse(**result)


@router.post("/reset")
def reset_counts():
    recognition_service.reset_counts()
    return {"message": "Counts reset successfully"}


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "frames":
                frames_data = message.get("frames", [])
                from app.schemas.pose import PoseFrame
                frames = [PoseFrame(**f) for f in frames_data]
                result = recognition_service.recognize(frames)
                await websocket.send_json(result)
            
            elif message.get("type") == "reset":
                recognition_service.reset_counts()
                await websocket.send_json({"message": "Counts reset successfully"})
                
    except WebSocketDisconnect:
        print("Client disconnected")
