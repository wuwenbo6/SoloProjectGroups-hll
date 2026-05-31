import cv2
import numpy as np


class MotionDetector:
    def __init__(self, threshold=25.0, min_area=500, enable_skip=True, skip_frames=5):
        self.threshold = threshold
        self.min_area = min_area
        self.enable_skip = enable_skip
        self.skip_frames = skip_frames
        self.frame_count = 0
        self.last_motion_frame = None
        self.back_sub = cv2.createBackgroundSubtractorMOG2(
            history=500,
            varThreshold=16,
            detectShadows=False
        )
        self.motion_detected = False
        self.motion_regions = []
        
    def set_threshold(self, threshold):
        self.threshold = max(1.0, threshold)
        
    def set_min_area(self, area):
        self.min_area = max(100, area)
        
    def set_enable_skip(self, enable, skip_frames=5):
        self.enable_skip = enable
        self.skip_frames = max(1, skip_frames)
        
    def detect(self, frame):
        if self.enable_skip:
            self.frame_count += 1
            if self.frame_count % self.skip_frames != 0 and self.last_motion_frame is not None:
                return self.last_motion_frame, self.motion_detected, self.motion_regions
        
        fg_mask = self.back_sub.apply(frame)
        
        fg_mask = cv2.medianBlur(fg_mask, 5)
        
        _, thresh = cv2.threshold(fg_mask, self.threshold, 255, cv2.THRESH_BINARY)
        
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        self.motion_regions = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > self.min_area:
                x, y, w, h = cv2.boundingRect(contour)
                self.motion_regions.append((x, y, w, h))
        
        self.motion_detected = len(self.motion_regions) > 0
        self.last_motion_frame = fg_mask.copy()
        
        return fg_mask, self.motion_detected, self.motion_regions
        
    def has_motion(self):
        return self.motion_detected
        
    def get_motion_regions(self):
        return self.motion_regions
        
    def reset(self):
        self.back_sub = cv2.createBackgroundSubtractorMOG2(
            history=500,
            varThreshold=16,
            detectShadows=False
        )
        self.frame_count = 0
        self.last_motion_frame = None
        self.motion_detected = False
        self.motion_regions = []
