import cv2
import numpy as np


class VideoStabilizer:
    def __init__(self, smooth_radius=15, border_mode=cv2.BORDER_REPLICATE, zoom=1.02):
        self.smooth_radius = smooth_radius
        self.border_mode = border_mode
        self.zoom = zoom
        self.prev_gray = None
        self.prev_pts = None
        self.transforms = []
        self.frame_count = 0
        self.max_corners = 100
        self.quality_level = 0.01
        self.min_distance = 20
        self.max_history = 100
        
    def set_smooth_radius(self, radius):
        self.smooth_radius = max(1, min(radius, self.max_history))
        
    def set_zoom(self, zoom):
        self.zoom = max(1.0, zoom)
        
    def _moving_average(self, curve, radius):
        window_size = 2 * radius + 1
        kernel = np.ones(window_size) / window_size
        curve_pad = np.lib.pad(curve, (radius, radius), 'edge')
        curve_smoothed = np.convolve(curve_pad, kernel, mode='same')
        return curve_smoothed[radius:-radius]
        
    def _smooth_transform(self, transforms):
        if len(transforms) < 2:
            return transforms
            
        transforms_array = np.array(transforms)
        
        dx = transforms_array[:, 0, 2]
        dy = transforms_array[:, 1, 2]
        da = np.arctan2(transforms_array[:, 1, 0], transforms_array[:, 0, 0])
        
        dx_smooth = self._moving_average(dx, self.smooth_radius)
        dy_smooth = self._moving_average(dy, self.smooth_radius)
        da_smooth = self._moving_average(da, self.smooth_radius)
        
        smooth_transforms = []
        for i in range(len(transforms)):
            transform = np.eye(3)
            transform[0, 0] = np.cos(da_smooth[i])
            transform[0, 1] = -np.sin(da_smooth[i])
            transform[1, 0] = np.sin(da_smooth[i])
            transform[1, 1] = np.cos(da_smooth[i])
            transform[0, 2] = dx_smooth[i]
            transform[1, 2] = dy_smooth[i]
            smooth_transforms.append(transform[:2, :])
            
        return smooth_transforms
        
    def _apply_zoom(self, transform, w, h):
        transform = transform.copy()
        cx, cy = w / 2, h / 2
        
        transform[0, 0] *= self.zoom
        transform[0, 1] *= self.zoom
        transform[1, 0] *= self.zoom
        transform[1, 1] *= self.zoom
        
        transform[0, 2] = transform[0, 2] * self.zoom + cx * (1 - self.zoom)
        transform[1, 2] = transform[1, 2] * self.zoom + cy * (1 - self.zoom)
        
        return transform
        
    def stabilize(self, frame):
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        if self.prev_gray is None:
            self.prev_gray = gray
            self.prev_pts = cv2.goodFeaturesToTrack(
                gray,
                maxCorners=self.max_corners,
                qualityLevel=self.quality_level,
                minDistance=self.min_distance
            )
            return frame
            
        curr_pts, status, err = cv2.calcOpticalFlowPyrLK(
            self.prev_gray, gray, self.prev_pts, None
        )
        
        if curr_pts is None or len(curr_pts[status == 1]) < 10:
            self.prev_pts = cv2.goodFeaturesToTrack(
                gray,
                maxCorners=self.max_corners,
                qualityLevel=self.quality_level,
                minDistance=self.min_distance
            )
            self.prev_gray = gray
            return frame
            
        good_prev = self.prev_pts[status == 1]
        good_curr = curr_pts[status == 1]
        
        transform, _ = cv2.estimateAffinePartial2D(
            good_prev, good_curr,
            method=cv2.RANSAC,
            ransacReprojThreshold=5.0
        )
        
        if transform is None:
            transform = np.eye(2, 3, dtype=np.float64)
            
        self.transforms.append(transform)
        if len(self.transforms) > self.max_history:
            self.transforms.pop(0)
        self.frame_count += 1
        
        smooth_transforms = self._smooth_transform(self.transforms)
        
        if len(smooth_transforms) > 0:
            idx = min(len(smooth_transforms) - 1, len(self.transforms) - 1)
            transform_smooth = smooth_transforms[idx]
            
            transform_smooth = self._apply_zoom(transform_smooth, w, h)
            
            stabilized = cv2.warpAffine(
                frame, 
                transform_smooth, 
                (w, h),
                borderMode=self.border_mode,
                flags=cv2.INTER_LINEAR
            )
        else:
            stabilized = frame
            
        self.prev_gray = gray
        self.prev_pts = cv2.goodFeaturesToTrack(
            gray,
            maxCorners=self.max_corners,
            qualityLevel=self.quality_level,
            minDistance=self.min_distance
        )
        
        return stabilized
        
    def reset(self):
        self.prev_gray = None
        self.prev_pts = None
        self.transforms = []
        self.frame_count = 0
