import os
import sys
import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import transforms
from PIL import Image
import time

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from maml.dataset import load_support_set


class LightDefectClassifier(nn.Module):
    def __init__(self, num_classes=3, in_channels=3, img_size=128):
        super(LightDefectClassifier, self).__init__()
        self.img_size = img_size
        self.num_classes = num_classes
        
        def conv_block(in_c, out_c, stride=1):
            return nn.Sequential(
                nn.Conv2d(in_c, out_c, 3, stride=stride, padding=1, bias=False),
                nn.BatchNorm2d(out_c),
                nn.ReLU(inplace=True)
            )
        
        self.features = nn.Sequential(
            conv_block(in_channels, 16, stride=2),
            conv_block(16, 32, stride=2),
            conv_block(32, 48, stride=2),
            conv_block(48, 64, stride=2),
            nn.AdaptiveAvgPool2d(1)
        )
        
        self.classifier = nn.Sequential(
            nn.Dropout(0.2),
            nn.Linear(64, num_classes)
        )
        
        self._init_weights()
    
    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
            elif isinstance(m, nn.BatchNorm2d):
                nn.init.constant_(m.weight, 1)
                nn.init.constant_(m.bias, 0)
            elif isinstance(m, nn.Linear):
                nn.init.normal_(m.weight, 0, 0.01)
                nn.init.constant_(m.bias, 0)
    
    def forward(self, x, weights=None):
        if weights is None:
            x = self.features(x)
            x = x.view(x.size(0), -1)
            x = self.classifier(x)
            return x
        else:
            return self._forward_with_weights(x, weights)
    
    def _forward_with_weights(self, x, weights):
        idx = 0
        for layer in self.features:
            if isinstance(layer, nn.Sequential):
                for sub_layer in layer:
                    if isinstance(sub_layer, nn.Conv2d):
                        w = weights.get(f'features.{idx}.0.weight')
                        b = weights.get(f'features.{idx}.0.bias')
                        stride = sub_layer.stride
                        x = F.conv2d(x, w, b, stride=stride, padding=1)
                    elif isinstance(sub_layer, nn.BatchNorm2d):
                        w = weights.get(f'features.{idx}.1.weight')
                        b = weights.get(f'features.{idx}.1.bias')
                        x = F.batch_norm(x, None, None, weight=w, bias=b, training=True)
                    elif isinstance(sub_layer, nn.ReLU):
                        x = F.relu(x, inplace=True)
                idx += 1
            elif isinstance(layer, nn.AdaptiveAvgPool2d):
                x = F.adaptive_avg_pool2d(x, 1)
        
        x = x.view(x.size(0), -1)
        
        for i, layer in enumerate(self.classifier):
            if isinstance(layer, nn.Dropout):
                x = F.dropout(x, 0.2, training=self.training)
            elif isinstance(layer, nn.Linear):
                w = weights.get(f'classifier.{i}.weight')
                b = weights.get(f'classifier.{i}.bias')
                x = F.linear(x, w, b)
        
        return x
    
    def get_weights(self):
        from collections import OrderedDict
        return OrderedDict(self.named_parameters())
    
    def get_features(self, x):
        x = self.features(x)
        return x.view(x.size(0), -1)


class FastMAML:
    def __init__(self, model, device, lr=0.01, meta_lr=0.001, num_updates=3):
        self.model = model.to(device)
        self.device = device
        self.lr = lr
        self.num_updates = num_updates
        self.meta_optimizer = torch.optim.Adam(self.model.parameters(), lr=meta_lr)
        self.criterion = nn.CrossEntropyLoss()
    
    def fine_tune(self, support_x, support_y, num_steps=5):
        support_x = support_x.to(self.device)
        support_y = support_y.to(self.device)
        
        weights = self.model.get_weights()
        weights = {k: v.clone() for k, v in weights.items()}
        
        for _ in range(num_steps):
            logits = self.model(support_x, weights)
            loss = self.criterion(logits, support_y)
            grads = torch.autograd.grad(loss, weights.values(), create_graph=False)
            weights = {k: v - self.lr * g for (k, v), g in zip(weights.items(), grads)}
        
        return weights
    
    def save_model(self, path):
        torch.save({'model_state_dict': self.model.state_dict()}, path)
    
    def load_model(self, path):
        checkpoint = torch.load(path, map_location=self.device)
        self.model.load_state_dict(checkpoint['model_state_dict'])


class OODDetector:
    def __init__(self, device='cpu', temperature=1.0, conf_threshold=0.5, energy_threshold=-5.0):
        self.device = torch.device(device)
        self.temperature = temperature
        self.conf_threshold = conf_threshold
        self.energy_threshold = energy_threshold
        self.class_mean = None
        self.class_std = None
        self.feature_dim = 64
    
    def fit(self, support_features, support_labels, num_classes=3):
        self.class_mean = torch.zeros(num_classes, self.feature_dim, device=self.device)
        self.class_std = torch.zeros(num_classes, self.feature_dim, device=self.device)
        
        for c in range(num_classes):
            mask = support_labels == c
            if mask.any():
                class_features = support_features[mask]
                self.class_mean[c] = class_features.mean(dim=0)
                self.class_std[c] = class_features.std(dim=0) + 1e-6
    
    def get_ood_score(self, logits, features=None):
        probs = F.softmax(logits / self.temperature, dim=1)
        max_conf = probs.max(dim=1)[0]
        
        energy = -self.temperature * torch.logsumexp(logits / self.temperature, dim=1)
        
        mahalanobis_score = torch.tensor(0.0, device=self.device)
        if features is not None and self.class_mean is not None:
            distances = []
            for c in range(len(self.class_mean)):
                diff = features - self.class_mean[c]
                dist = torch.sum(diff * diff / (self.class_std[c] + 1e-6), dim=1)
                distances.append(dist)
            mahalanobis_score = torch.min(torch.stack(distances), dim=0)[0]
        
        return {
            'max_confidence': max_conf.item(),
            'energy': energy.item(),
            'mahalanobis': mahalanobis_score.item() if isinstance(mahalanobis_score, torch.Tensor) else mahalanobis_score
        }
    
    def is_ood(self, logits, features=None):
        scores = self.get_ood_score(logits, features)
        
        conf_ood = scores['max_confidence'] < self.conf_threshold
        energy_ood = scores['energy'] > self.energy_threshold
        
        return conf_ood or energy_ood, scores


class DefectDetector:
    def __init__(self, model_path, support_data_dir=None, device='cpu', img_size=128):
        self.device = torch.device(device)
        self.img_size = img_size
        self.classes = ['normal', 'scratch', 'dent', 'unknown']
        self.inference_time = 0.0
        
        self.model = LightDefectClassifier(num_classes=3, img_size=img_size)
        self.maml = FastMAML(self.model, self.device, lr=0.01, meta_lr=0.001, num_updates=3)
        
        if os.path.exists(model_path):
            self.maml.load_model(model_path)
        
        self.fine_tuned_weights = None
        self.ood_detector = OODDetector(
            device=device,
            temperature=1.0,
            conf_threshold=0.3,
            energy_threshold=-1.0
        )
        
        if support_data_dir and os.path.exists(support_data_dir):
            self.fine_tune(support_data_dir)
        
        self.transform = transforms.Compose([
            transforms.Resize((img_size, img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        self._warmup()
    
    def _warmup(self):
        dummy_input = torch.randn(1, 3, self.img_size, self.img_size).to(self.device)
        self.model.eval()
        with torch.no_grad():
            for _ in range(3):
                self.model(dummy_input)
    
    def fine_tune(self, support_data_dir, support_shots=5):
        support_x, support_y = load_support_set(
            support_data_dir, 
            support_shots=support_shots, 
            img_size=self.img_size
        )
        
        self.fine_tuned_weights = self.maml.fine_tune(support_x, support_y, num_steps=5)
        
        support_x = support_x.to(self.device)
        with torch.no_grad():
            support_features = self.model.get_features(support_x)
        self.ood_detector.fit(support_features, support_y, num_classes=3)
    
    def preprocess(self, image):
        if isinstance(image, str):
            image = Image.open(image).convert('RGB')
        elif isinstance(image, np.ndarray):
            image = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        
        image_tensor = self.transform(image)
        return image_tensor.unsqueeze(0)
    
    def detect(self, image, return_heatmap=True):
        start_time = time.time()
        
        input_tensor = self.preprocess(image)
        
        if isinstance(image, str):
            original_image = cv2.imread(image)
        elif isinstance(image, np.ndarray):
            original_image = image.copy()
        else:
            original_image = np.array(image)
            original_image = cv2.cvtColor(original_image, cv2.COLOR_RGB2BGR)
        
        input_tensor = input_tensor.to(self.device)
        
        with torch.no_grad():
            self.model.eval()
            
            features = self.model.get_features(input_tensor)
            
            if self.fine_tuned_weights:
                logits = self.model(input_tensor, self.fine_tuned_weights)
            else:
                logits = self.model(input_tensor)
            
            probs = F.softmax(logits, dim=1)
            pred_class = torch.argmax(probs, dim=1).item()
            confidence = probs[0][pred_class].item()
            
            is_unknown, ood_scores = self.ood_detector.is_ood(logits, features)
            
            if is_unknown and confidence < 0.6:
                pred_class = 3
                confidence = 1.0 - ood_scores['max_confidence']
        
        self.inference_time = time.time() - start_time
        
        result = {
            'class': self.classes[pred_class],
            'class_id': pred_class,
            'confidence': confidence,
            'probabilities': {cls: probs[0][i].item() for i, cls in enumerate(self.classes[:3])},
            'ood_scores': ood_scores,
            'inference_time_ms': self.inference_time * 1000
        }
        
        if 0 < pred_class < 3:
            bboxes = self._detect_defect_regions(original_image, pred_class)
            result['defects'] = bboxes
        else:
            result['defects'] = []
        
        if return_heatmap and pred_class < 3:
            heatmap = self.generate_heatmap_fast(original_image, input_tensor)
            result['heatmap'] = heatmap
        elif return_heatmap:
            h, w = original_image.shape[:2]
            result['heatmap'] = np.zeros((h, w, 3), dtype=np.uint8)
        
        return result
    
    def _detect_defect_regions(self, image, class_id):
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        if class_id == 1:
            blurred = cv2.GaussianBlur(gray, (3, 3), 0)
            edges = cv2.Canny(blurred, 50, 150)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            edges = cv2.dilate(edges, kernel, iterations=1)
        else:
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            edges = cv2.Canny(blurred, 30, 100)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        bboxes = []
        h, w = image.shape[:2]
        total_area = h * w
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > 30:
                x, y, bw, bh = cv2.boundingRect(contour)
                if bw < w * 0.8 and bh < h * 0.8:
                    severity = self._classify_severity(area, total_area, class_id)
                    bboxes.append({
                        'x': int(x),
                        'y': int(y),
                        'width': int(bw),
                        'height': int(bh),
                        'area': int(area),
                        'class': self.classes[class_id],
                        'class_id': class_id,
                        'severity': severity
                    })
        
        if len(bboxes) == 0:
            default_area = int(w * h * 0.25)
            severity = self._classify_severity(default_area, total_area, class_id)
            bboxes.append({
                'x': int(w * 0.25),
                'y': int(h * 0.25),
                'width': int(w * 0.5),
                'height': int(h * 0.5),
                'area': default_area,
                'class': self.classes[class_id],
                'class_id': class_id,
                'severity': severity
            })
        
        return bboxes
    
    def _classify_severity(self, defect_area, total_area, class_id):
        area_ratio = defect_area / total_area
        
        if class_id == 1:
            light_threshold = 0.001
            heavy_threshold = 0.005
        else:
            light_threshold = 0.01
            heavy_threshold = 0.05
        
        if area_ratio < light_threshold:
            return 'light'
        elif area_ratio < heavy_threshold:
            return 'medium'
        else:
            return 'heavy'
    
    def generate_heatmap_fast(self, original_image, input_tensor):
        self.model.eval()
        
        input_tensor.requires_grad = True
        
        if self.fine_tuned_weights:
            output = self.model(input_tensor, self.fine_tuned_weights)
        else:
            output = self.model(input_tensor)
        
        pred_idx = output.argmax(dim=1).item()
        
        self.model.zero_grad()
        output[0, pred_idx].backward(retain_graph=True)
        
        with torch.no_grad():
            features = self.model.features[:-1](input_tensor)
            pooled_gradients = torch.mean(input_tensor.grad, dim=[0, 2, 3])
            
            for i in range(features.shape[1]):
                features[:, i, :, :] *= pooled_gradients[i % pooled_gradients.shape[0]]
            
            heatmap = torch.mean(features, dim=1).squeeze().cpu().numpy()
            heatmap = np.maximum(heatmap, 0)
            
            if heatmap.max() > 0:
                heatmap /= heatmap.max()
        
        heatmap = cv2.resize(heatmap, (original_image.shape[1], original_image.shape[0]))
        heatmap = np.uint8(255 * heatmap)
        heatmap = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
        
        return heatmap


def blend_heatmap(original_image, heatmap, alpha=0.4):
    if isinstance(original_image, str):
        original_image = cv2.imread(original_image)
    
    heatmap_resized = cv2.resize(heatmap, (original_image.shape[1], original_image.shape[0]))
    blended = cv2.addWeighted(original_image, 1 - alpha, heatmap_resized, alpha, 0)
    
    return blended
