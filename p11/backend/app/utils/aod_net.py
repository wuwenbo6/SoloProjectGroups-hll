import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import cv2
from pathlib import Path


class AODnet(nn.Module):
    def __init__(self):
        super(AODnet, self).__init__()
        self.conv1 = nn.Conv2d(in_channels=3, out_channels=3, kernel_size=1, stride=1, padding=0)
        self.conv2 = nn.Conv2d(in_channels=3, out_channels=3, kernel_size=1, stride=1, padding=0)
        self.conv3 = nn.Conv2d(in_channels=6, out_channels=3, kernel_size=1, stride=1, padding=0)
        self.conv4 = nn.Conv2d(in_channels=6, out_channels=3, kernel_size=1, stride=1, padding=0)
        self.conv5 = nn.Conv2d(in_channels=12, out_channels=3, kernel_size=1, stride=1, padding=0)
        self.b = 1

    def forward(self, x):
        x1 = F.relu(self.conv1(x))
        x2 = F.relu(self.conv2(x1))
        cat1 = torch.cat((x1, x2), 1)
        x3 = F.relu(self.conv3(cat1))
        cat2 = torch.cat((x2, x3), 1)
        x4 = F.relu(self.conv4(cat2))
        cat3 = torch.cat((x1, x2, x3, x4), 1)
        k = F.relu(self.conv5(cat3))
        output = k * x - k + self.b
        return F.relu(output)


class ImageEnhancer:
    def __init__(self, model_path=None, device='cpu'):
        self.device = torch.device(device if torch.cuda.is_available() else 'cpu')
        self.model = None
        self.has_pretrained = False
        
        if model_path and Path(model_path).exists():
            self.model = AODnet().to(self.device)
            self.model.eval()
            self.model.load_state_dict(torch.load(model_path, map_location=self.device))
            self.has_pretrained = True
            print(f"Loaded AOD-Net model from {model_path}")
        else:
            print("No pre-trained AOD-Net model found, using legacy enhancement only")
        
        self.legacy_enhancer = LegacyImageEnhancer()

    def enhance(self, image_array, use_legacy_fallback=True):
        if self.has_pretrained and self.model is not None:
            try:
                return self._enhance_with_aodnet(image_array)
            except Exception as e:
                if use_legacy_fallback:
                    print(f"AOD-Net failed, using fallback: {e}")
                    return self.legacy_enhancer.enhance(image_array)
                raise e
        else:
            return self.legacy_enhancer.enhance(image_array)

    def _enhance_with_aodnet(self, image_array):
        if len(image_array.shape) == 2:
            image_array = cv2.cvtColor(image_array, cv2.COLOR_GRAY2RGB)
        elif image_array.shape[2] == 4:
            image_array = cv2.cvtColor(image_array, cv2.COLOR_BGRA2RGB)
        elif image_array.shape[2] == 3:
            image_array = cv2.cvtColor(image_array, cv2.COLOR_BGR2RGB)
        
        img = image_array.astype(np.float32) / 255.0
        img = np.transpose(img, (2, 0, 1))
        img_tensor = torch.from_numpy(img).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            enhanced_tensor = self.model(img_tensor)
        
        enhanced = enhanced_tensor.squeeze(0).cpu().numpy()
        enhanced = np.transpose(enhanced, (1, 2, 0))
        enhanced = np.clip(enhanced * 255.0, 0, 255).astype(np.uint8)
        enhanced = cv2.cvtColor(enhanced, cv2.COLOR_RGB2BGR)
        
        return enhanced


class LegacyImageEnhancer:
    def __init__(self):
        pass
    
    def enhance(self, image_array, method='auto'):
        if method == 'auto':
            method = self._detect_conditions(image_array)
        
        if method == 'haze':
            result = self._defog(image_array)
        elif method == 'rain':
            result = self._derain(image_array)
        elif method == 'dark':
            result = self._enhance_dark(image_array)
        else:
            result = self._general_enhance(image_array)
        
        if self._check_overexposure(result):
            return image_array.copy()
        
        return result
    
    def _detect_conditions(self, img):
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        brightness = np.mean(gray)
        
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        
        hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
        low_contrast_ratio = (hist[50:200].sum() / hist.sum()) if hist.sum() > 0 else 1
        
        if brightness < 60:
            return 'dark'
        elif laplacian_var < 50 and low_contrast_ratio < 0.7:
            return 'haze'
        elif laplacian_var < 30:
            return 'rain'
        else:
            return 'none'
    
    def _check_overexposure(self, img):
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
        
        bright_pixels = hist[230:].sum()
        total_pixels = hist.sum()
        
        if total_pixels > 0 and bright_pixels / total_pixels > 0.3:
            return True
        
        return False
    
    def _defog(self, img):
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        
        clahe = cv2.createCLAHE(clipLimit=1.2, tileGridSize=(8, 8))
        l_enhanced = clahe.apply(l)
        
        lab_enhanced = cv2.merge((l_enhanced, a, b))
        result = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)
        
        return result
    
    def _derain(self, img):
        result = cv2.medianBlur(img, 3)
        
        result = cv2.bilateralFilter(result, 9, 50, 50)
        
        lab = cv2.cvtColor(result, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=1.0, tileGridSize=(8, 8))
        l = clahe.apply(l)
        lab_enhanced = cv2.merge((l, a, b))
        result = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)
        
        return result
    
    def _enhance_dark(self, img):
        result = cv2.convertScaleAbs(img, alpha=1.15, beta=15)
        
        lab = cv2.cvtColor(result, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
        l = clahe.apply(l)
        lab_enhanced = cv2.merge((l, a, b))
        result = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)
        
        return result
    
    def _general_enhance(self, img):
        return img.copy()
    
    def _adjust_gamma(self, img, gamma=1.0):
        inv_gamma = 1.0 / gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255
                         for i in np.arange(0, 256)]).astype("uint8")
        return cv2.LUT(img, table)


def get_enhancer(model_path=None, device='cpu'):
    return ImageEnhancer(model_path=model_path, device=device)
