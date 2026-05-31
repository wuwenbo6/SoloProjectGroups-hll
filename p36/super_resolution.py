import cv2
import numpy as np
import os


class ESPCNSuperResolution:
    MODE_FAST = "fast"
    MODE_BALANCED = "balanced"
    MODE_HIGH_QUALITY = "high_quality"
    MODE_ULTRA_FAST = "ultra_fast"
    
    def __init__(self, scale=2, mode="balanced", model_path=None, roi_mode=False, roi_ratio=0.5):
        self.scale = scale
        self.mode = mode
        self.model = None
        self.model_path = model_path
        self.roi_mode = roi_mode
        self.roi_ratio = roi_ratio
        self._init_model()
        
    def _init_model(self):
        if self.mode == self.MODE_HIGH_QUALITY and self.model_path and os.path.exists(self.model_path):
            self._load_pretrained_model()
        else:
            self.use_dnn = False
            
    def _load_pretrained_model(self):
        try:
            self.model = cv2.dnn_superres.DnnSuperResImpl_create()
            self.model.readModel(self.model_path)
            self.model.setModel("espcn", self.scale)
            self.use_dnn = True
        except Exception as e:
            print(f"Failed to load ESPCN model: {e}, falling back to balanced mode")
            self.mode = self.MODE_BALANCED
            self.use_dnn = False
            
    def set_mode(self, mode):
        self.mode = mode
        if mode == self.MODE_HIGH_QUALITY and self.model_path and os.path.exists(self.model_path):
            self._load_pretrained_model()
        else:
            self.use_dnn = False
            
    def get_mode(self):
        return self.mode
        
    def set_roi_mode(self, enabled, ratio=0.5):
        self.roi_mode = enabled
        self.roi_ratio = np.clip(ratio, 0.1, 1.0)
        
    def _get_roi(self, img):
        h, w = img.shape[:2]
        roi_h = int(h * self.roi_ratio)
        roi_w = int(w * self.roi_ratio)
        roi_x = (w - roi_w) // 2
        roi_y = (h - roi_h) // 2
        return roi_x, roi_y, roi_w, roi_h
        
    def _ultra_fast_upscale(self, img):
        h, w = img.shape[:2]
        new_h, new_w = h * self.scale, w * self.scale
        return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        
    def _fast_upscale(self, img):
        h, w = img.shape[:2]
        new_h, new_w = h * self.scale, w * self.scale
        
        img_float = img.astype(np.float32) / 255.0
        
        ycrcb = cv2.cvtColor(img_float, cv2.COLOR_BGR2YCrCb)
        
        y_up = cv2.resize(ycrcb[:, :, 0], (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        cr_up = cv2.resize(ycrcb[:, :, 1], (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        cb_up = cv2.resize(ycrcb[:, :, 2], (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        
        ycrcb_up = np.stack([y_up, cr_up, cb_up], axis=-1)
        result = cv2.cvtColor(ycrcb_up, cv2.COLOR_YCrCb2BGR)
        
        result = (result * 255).astype(np.uint8)
        
        return result
        
    def _balanced_upscale(self, img):
        h, w = img.shape[:2]
        new_h, new_w = h * self.scale, w * self.scale
        
        img_float = img.astype(np.float32) / 255.0
        
        ycrcb = cv2.cvtColor(img_float, cv2.COLOR_BGR2YCrCb)
        y = ycrcb[:, :, 0]
        
        y_blur = cv2.GaussianBlur(y, (3, 3), 0.5)
        y_detail = cv2.subtract(y, y_blur)
        
        y_up = cv2.resize(y, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        y_detail_up = cv2.resize(y_detail, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        
        y_sharp = cv2.add(y_up, y_detail_up * 0.4)
        y_sharp = np.clip(y_sharp, 0, 1)
        
        cr_up = cv2.resize(ycrcb[:, :, 1], (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        cb_up = cv2.resize(ycrcb[:, :, 2], (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        
        ycrcb_up = np.stack([y_sharp, cr_up, cb_up], axis=-1)
        result = cv2.cvtColor(ycrcb_up, cv2.COLOR_YCrCb2BGR)
        
        result = (result * 255).astype(np.uint8)
        
        return result
        
    def _roi_upscale(self, img):
        h, w = img.shape[:2]
        new_h, new_w = h * self.scale, w * self.scale
        
        roi_x, roi_y, roi_w, roi_h = self._get_roi(img)
        roi = img[roi_y:roi_y+roi_h, roi_x:roi_x+roi_w]
        
        full_fast = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        
        if self.use_dnn and self.model is not None:
            try:
                roi_sr = self.model.upsample(roi)
            except:
                roi_sr = self._balanced_upscale(roi)
        elif self.mode == self.MODE_ULTRA_FAST:
            roi_sr = self._ultra_fast_upscale(roi)
        elif self.mode == self.MODE_FAST:
            roi_sr = self._fast_upscale(roi)
        else:
            roi_sr = self._balanced_upscale(roi)
        
        roi_x_sr = roi_x * self.scale
        roi_y_sr = roi_y * self.scale
        roi_w_sr = roi_w * self.scale
        roi_h_sr = roi_h * self.scale
        
        full_fast[roi_y_sr:roi_y_sr+roi_h_sr, roi_x_sr:roi_x_sr+roi_w_sr] = roi_sr
        
        return full_fast
        
    def upscale(self, img):
        if self.roi_mode and self.roi_ratio < 1.0:
            return self._roi_upscale(img)
            
        if self.use_dnn and self.model is not None:
            try:
                return self.model.upsample(img)
            except Exception as e:
                print(f"DNN upscale failed: {e}")
                
        if self.mode == self.MODE_ULTRA_FAST:
            return self._ultra_fast_upscale(img)
        elif self.mode == self.MODE_FAST:
            return self._fast_upscale(img)
        else:
            return self._balanced_upscale(img)
            
    def set_scale(self, scale):
        self.scale = max(1, scale)
