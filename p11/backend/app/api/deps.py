import cv2
import numpy as np
from typing import Optional
from backend.app.utils.aod_net import get_enhancer
from backend.app.utils.yolo_detector import get_plate_detector
from backend.app.utils.ocr_recognizer import get_ocr_recognizer, LicensePlatePipeline
from backend.app.utils.video_processor import get_video_manager
from backend.config import settings


enhancer = get_enhancer(model_path=settings.AOD_MODEL_PATH)
detector = get_plate_detector(model_path=settings.YOLO_MODEL_PATH)
ocr_recognizer = get_ocr_recognizer(use_easyocr=True)

pipeline = LicensePlatePipeline(detector, enhancer, ocr_recognizer)
video_manager = get_video_manager(pipeline)


def get_pipeline():
    return pipeline


def get_video_manager_instance():
    return video_manager


def get_enhancer_instance():
    return enhancer


def get_detector_instance():
    return detector


def get_ocr_instance():
    return ocr_recognizer


def read_image_file(file_content: bytes) -> Optional[np.ndarray]:
    try:
        nparr = np.frombuffer(file_content, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception:
        return None


def save_image(image_array: np.ndarray, path: str) -> bool:
    try:
        return cv2.imwrite(path, image_array)
    except Exception:
        return False
