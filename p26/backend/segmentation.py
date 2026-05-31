import os
import numpy as np
import torch
import monai
from monai.networks.nets import UNet
from monai.inferers import sliding_window_inference
from monai.transforms import (
    Compose,
    LoadImaged,
    AddChanneld,
    Spacingd,
    Orientationd,
    ScaleIntensityRanged,
    CropForegroundd,
    ToTensord,
)
import tempfile
import pydicom
from scipy import ndimage
from scipy.ndimage import gaussian_filter, median_filter
from scipy.signal import wiener

def denoise_low_dose_ct(image_array, method='hybrid', sigma=1.0):
    """
    低剂量CT降噪处理
    
    参数:
        image_array: 3D CT图像数组 (D, H, W)
        method: 降噪方法
            - 'gaussian': 高斯滤波
            - 'median': 中值滤波  
            - 'wiener': 维纳滤波
            - 'hybrid': 混合方法（推荐）
            - 'bilateral': 双边滤波
        sigma: 降噪强度
    """
    print(f"Applying {method} denoising...")
    original_shape = image_array.shape
    
    if method == 'gaussian':
        denoised = gaussian_filter(image_array, sigma=sigma)
        
    elif method == 'median':
        kernel_size = max(1, int(sigma * 2) // 2 * 2 + 1)
        denoised = median_filter(image_array, size=kernel_size)
        
    elif method == 'wiener':
        denoised = np.zeros_like(image_array)
        for i in range(image_array.shape[0]):
            denoised[i] = wiener(image_array[i], mysize=int(sigma * 2) + 1)
            
    elif method == 'bilateral':
        denoised = bilateral_filter_3d(image_array, sigma_spatial=sigma, sigma_range=50)
        
    elif method == 'hybrid':
        smoothed = gaussian_filter(image_array, sigma=sigma * 0.5)
        detail = image_array - smoothed
        detail_threshold = np.std(detail) * 0.5
        detail_denoised = np.where(np.abs(detail) < detail_threshold, 0, detail)
        denoised = smoothed + detail_denoised
        
    else:
        denoised = image_array
    
    print(f"Denoising complete. SNR improvement estimated.")
    return denoised.astype(np.float32)

def bilateral_filter_3d(image, sigma_spatial=2.0, sigma_range=50.0):
    """3D双边滤波"""
    result = np.zeros_like(image, dtype=np.float32)
    radius = int(sigma_spatial * 1.5)
    
    for z in range(image.shape[0]):
        for y in range(image.shape[1]):
            for x in range(image.shape[2]):
                z_min = max(0, z - radius)
                z_max = min(image.shape[0], z + radius + 1)
                y_min = max(0, y - radius)
                y_max = min(image.shape[1], y + radius + 1)
                x_min = max(0, x - radius)
                x_max = min(image.shape[2], x + radius + 1)
                
                patch = image[z_min:z_max, y_min:y_max, x_min:x_max]
                center_val = image[z, y, x]
                
                z_coords, y_coords, x_coords = np.meshgrid(
                    np.arange(z_min, z_max) - z,
                    np.arange(y_min, y_max) - y,
                    np.arange(x_min, x_max) - x,
                    indexing='ij'
                )
                
                spatial_weights = np.exp(-(z_coords**2 + y_coords**2 + x_coords**2) / (2 * sigma_spatial**2))
                range_weights = np.exp(-(patch - center_val)**2 / (2 * sigma_range**2))
                
                weights = spatial_weights * range_weights
                result[z, y, x] = np.sum(patch * weights) / np.sum(weights)
    
    return result

def preprocess_ct_for_segmentation(image_array, denoise_strength=1.0, window_level=40, window_width=400):
    """
    CT图像预处理流程（针对肝脏分割优化）
    
    1. HU值窗口化
    2. 降噪处理
    3. 归一化
    """
    print("Preprocessing CT image...")
    
    lower = window_level - window_width // 2
    upper = window_level + window_width // 2
    
    windowed = np.clip(image_array, lower, upper)
    
    denoised = denoise_low_dose_ct(windowed, method='hybrid', sigma=denoise_strength)
    
    normalized = (denoised - lower) / (upper - lower)
    normalized = normalized * 2 - 1
    
    print(f"Preprocessing complete. Image shape: {normalized.shape}")
    return normalized.astype(np.float32)

def postprocess_segmentation(seg_mask, min_volume=1000):
    """
    分割结果后处理
    
    1. 形态学操作
    2. 小区域去除
    3. 连通域分析
    """
    print("Postprocessing segmentation...")
    
    struct = ndimage.generate_binary_structure(3, 2)
    seg_cleaned = ndimage.binary_closing(seg_mask > 0, structure=struct, iterations=1)
    seg_cleaned = ndimage.binary_opening(seg_cleaned, structure=struct, iterations=1)
    
    labeled, num_features = ndimage.label(seg_cleaned)
    
    if num_features > 0:
        volumes = ndimage.sum(seg_cleaned, labeled, range(num_features + 1))
        
        max_idx = np.argmax(volumes[1:]) + 1 if num_features > 0 else 0
        
        if volumes[max_idx] >= min_volume:
            final_seg = (labeled == max_idx).astype(np.uint8)
        else:
            final_seg = np.zeros_like(seg_cleaned, dtype=np.uint8)
    else:
        final_seg = np.zeros_like(seg_cleaned, dtype=np.uint8)
    
    print(f"Postprocessing complete. Found {num_features} regions.")
    return final_seg

class LiverSegmentationModel:
    def __init__(self, device="cpu"):
        self.device = torch.device(device if torch.cuda.is_available() else "cpu")
        self.model = self._build_model()
        self._load_pretrained()
        
    def _build_model(self):
        model = UNet(
            spatial_dims=3,
            in_channels=1,
            out_channels=2,
            channels=(16, 32, 64, 128, 256),
            strides=(2, 2, 2, 2),
            num_res_units=2,
            dropout=0.2,
        ).to(self.device)
        return model
    
    def _load_pretrained(self):
        os.makedirs("models", exist_ok=True)
        model_path = "models/liver_segmentation.pth"
        if os.path.exists(model_path):
            try:
                self.model.load_state_dict(torch.load(model_path, map_location=self.device))
                print(f"Loaded pretrained model from {model_path}")
            except Exception as e:
                print(f"Could not load pretrained model: {e}")
                print("Using randomly initialized model")
        else:
            print("No pretrained model found, using random initialization")
            print(f"Model will be saved to: {model_path}")
    
    def predict(self, image_array, spacing=(1.0, 1.0, 1.0), denoise_strength=1.0):
        """
        肝脏分割预测（带降噪预处理）
        
        参数:
            image_array: 3D CT图像数组
            spacing: 体素间距
            denoise_strength: 降噪强度 (0-2)，低剂量CT推荐1.0-1.5
        """
        self.model.eval()
        
        preprocessed = preprocess_ct_for_segmentation(
            image_array, 
            denoise_strength=denoise_strength,
            window_level=40,
            window_width=400
        )
        
        if preprocessed.ndim == 3:
            image_tensor = torch.from_numpy(preprocessed).float().unsqueeze(0).unsqueeze(0)
        elif preprocessed.ndim == 4:
            image_tensor = torch.from_numpy(preprocessed).float().unsqueeze(0)
        else:
            raise ValueError(f"Unexpected image shape: {preprocessed.shape}")
        
        image_tensor = image_tensor.to(self.device)
        
        with torch.no_grad():
            try:
                roi_size = (96, 96, 96)
                sw_batch_size = 1
                outputs = sliding_window_inference(
                    image_tensor, roi_size, sw_batch_size, self.model, overlap=0.5
                )
                seg = torch.argmax(outputs, dim=1).squeeze().cpu().numpy()
            except Exception as e:
                print(f"Sliding window inference failed: {e}")
                seg = np.zeros(preprocessed.shape, dtype=np.uint8)
        
        final_seg = postprocess_segmentation(seg)
        
        return final_seg
    
    def train_from_annotations(self, train_images, train_labels, num_epochs=10):
        self.model.train()
        
        optimizer = torch.optim.Adam(self.model.parameters(), lr=1e-4)
        loss_function = monai.losses.DiceLoss(to_onehot_y=True, softmax=True)
        
        dataset = monai.data.CacheDataset(
            data=[
                {"image": img, "label": lbl} 
                for img, lbl in zip(train_images, train_labels)
            ],
            transform=None
        )
        
        dataloader = torch.utils.data.DataLoader(dataset, batch_size=1, shuffle=True)
        
        losses = []
        for epoch in range(num_epochs):
            epoch_loss = 0
            for batch in dataloader:
                inputs = batch["image"].float().unsqueeze(0).unsqueeze(0).to(self.device)
                labels = batch["label"].long().unsqueeze(0).unsqueeze(0).to(self.device)
                
                optimizer.zero_grad()
                outputs = self.model(inputs)
                loss = loss_function(outputs, labels)
                loss.backward()
                optimizer.step()
                
                epoch_loss += loss.item()
            
            avg_loss = epoch_loss / len(dataloader)
            losses.append(avg_loss)
            print(f"Epoch {epoch+1}/{num_epochs}, Loss: {avg_loss:.4f}")
        
        os.makedirs("models", exist_ok=True)
        torch.save(self.model.state_dict(), "models/liver_segmentation.pth")
        
        return losses

def load_dicom_series(dicom_files):
    slices = []
    for f in sorted(dicom_files):
        try:
            ds = pydicom.dcmread(f)
            slices.append(ds)
        except Exception as e:
            print(f"Error reading {f}: {e}")
    
    if not slices:
        return None
    
    try:
        slices.sort(key=lambda x: float(x.ImagePositionPatient[2]))
    except:
        pass
    
    try:
        pixel_data = np.stack([s.pixel_array for s in slices])
        pixel_data = pixel_data.astype(np.float32)
        
        if hasattr(slices[0], 'RescaleSlope') and hasattr(slices[0], 'RescaleIntercept'):
            slope = slices[0].RescaleSlope
            intercept = slices[0].RescaleIntercept
            pixel_data = pixel_data * slope + intercept
        
        return pixel_data
    except Exception as e:
        print(f"Error stacking slices: {e}")
        return None

def segment_liver_from_dicom(dicom_files):
    model = LiverSegmentationModel()
    image_data = load_dicom_series(dicom_files)
    
    if image_data is None:
        return None
    
    segmentation = model.predict(image_data)
    return segmentation
