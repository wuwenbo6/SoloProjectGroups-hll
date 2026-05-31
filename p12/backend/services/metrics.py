import numpy as np
from typing import List, Dict, Tuple
from dataclasses import dataclass

@dataclass
class Box3D:
    x: float
    y: float
    z: float
    w: float
    h: float
    l: float
    rotation_y: float = 0.0

class MetricsCalculator:
    def __init__(self, iou_threshold: float = 0.5):
        self.iou_threshold = iou_threshold
    
    def calculate_iou_3d(self, box1: Box3D, box2: Box3D) -> float:
        return self._calculate_iou_bev(box1, box2)
    
    def _calculate_iou_bev(self, box1: Box3D, box2: Box3D) -> float:
        corners1 = self._get_bev_corners(box1)
        corners2 = self._get_bev_corners(box2)
        
        area1 = box1.w * box1.l
        area2 = box2.w * box2.l
        
        intersection_area = self._polygon_intersection_area(corners1, corners2)
        union_area = area1 + area2 - intersection_area
        
        return intersection_area / union_area if union_area > 0 else 0.0
    
    def _get_bev_corners(self, box: Box3D) -> np.ndarray:
        c, s = np.cos(box.rotation_y), np.sin(box.rotation_y)
        R = np.array([[c, -s], [s, c]])
        
        x_corners = np.array([-box.w/2, box.w/2, box.w/2, -box.w/2])
        z_corners = np.array([-box.l/2, -box.l/2, box.l/2, box.l/2])
        
        corners = np.stack([x_corners, z_corners], axis=0)
        corners = R @ corners
        
        corners[0, :] += box.x
        corners[1, :] += box.z
        
        return corners.T
    
    def _polygon_intersection_area(self, poly1: np.ndarray, poly2: np.ndarray) -> float:
        x_min = max(np.min(poly1[:, 0]), np.min(poly2[:, 0]))
        x_max = min(np.max(poly1[:, 0]), np.max(poly2[:, 0]))
        z_min = max(np.min(poly1[:, 1]), np.min(poly2[:, 1]))
        z_max = min(np.max(poly1[:, 1]), np.max(poly2[:, 1]))
        
        if x_max <= x_min or z_max <= z_min:
            return 0.0
        
        return (x_max - x_min) * (z_max - z_min)
    
    def calculate_ap(self, 
                     detections: List[Dict], 
                     ground_truth: List[Dict],
                     class_name: str = None) -> Dict:
        if class_name:
            detections = [d for d in detections if d.get('class_name') == class_name]
            ground_truth = [g for g in ground_truth if g.get('class_name') == class_name]
        
        detections = sorted(detections, key=lambda x: x['confidence'], reverse=True)
        
        num_gt = len(ground_truth)
        matched_gt = set()
        
        tp = []
        fp = []
        scores = []
        
        for det in detections:
            det_box = Box3D(
                x=det['bbox']['x'],
                y=det['bbox']['y'],
                z=det['bbox']['z'],
                w=det['bbox']['w'],
                h=det['bbox']['h'],
                l=det['bbox']['l'],
                rotation_y=det['bbox'].get('rotation_y', 0)
            )
            
            best_iou = 0
            best_gt_idx = -1
            
            for gt_idx, gt in enumerate(ground_truth):
                if gt_idx in matched_gt:
                    continue
                
                gt_box = Box3D(
                    x=gt['bbox']['x'],
                    y=gt['bbox']['y'],
                    z=gt['bbox']['z'],
                    w=gt['bbox']['w'],
                    h=gt['bbox']['h'],
                    l=gt['bbox']['l'],
                    rotation_y=gt['bbox'].get('rotation_y', 0)
                )
                
                iou = self.calculate_iou_3d(det_box, gt_box)
                if iou > best_iou:
                    best_iou = iou
                    best_gt_idx = gt_idx
            
            scores.append(det['confidence'])
            
            if best_iou >= self.iou_threshold:
                tp.append(1)
                fp.append(0)
                matched_gt.add(best_gt_idx)
            else:
                tp.append(0)
                fp.append(1)
        
        tp = np.array(tp)
        fp = np.array(fp)
        scores = np.array(scores)
        
        tp_cumsum = np.cumsum(tp)
        fp_cumsum = np.cumsum(fp)
        
        recall = tp_cumsum / num_gt if num_gt > 0 else np.zeros_like(tp_cumsum)
        precision = tp_cumsum / (tp_cumsum + fp_cumsum + 1e-10)
        
        ap = self._calculate_ap_from_pr(recall, precision)
        
        return {
            'ap': float(ap),
            'precision': precision.tolist(),
            'recall': recall.tolist(),
            'tp_count': int(np.sum(tp)),
            'fp_count': int(np.sum(fp)),
            'fn_count': num_gt - len(matched_gt),
            'num_gt': num_gt,
            'num_det': len(detections)
        }
    
    def _calculate_ap_from_pr(self, recall: np.ndarray, precision: np.ndarray) -> float:
        mrec = np.concatenate(([0.0], recall, [1.0]))
        mpre = np.concatenate(([0.0], precision, [0.0]))
        
        for i in range(mpre.size - 1, 0, -1):
            mpre[i - 1] = np.maximum(mpre[i - 1], mpre[i])
        
        i = np.where(mrec[1:] != mrec[:-1])[0]
        ap = np.sum((mrec[i + 1] - mrec[i]) * mpre[i + 1])
        
        return ap
    
    def calculate_map(self, 
                      all_detections: Dict[str, List[Dict]], 
                      all_ground_truth: Dict[str, List[Dict]],
                      class_names: List[str] = ['Car', 'Pedestrian']) -> Dict:
        results = {}
        class_aps = []
        
        for class_name in class_names:
            class_detections = []
            class_ground_truth = []
            
            for file_id in all_detections.keys():
                class_detections.extend([
                    d for d in all_detections.get(file_id, [])
                    if d.get('class_name') == class_name
                ])
                class_ground_truth.extend([
                    g for g in all_ground_truth.get(file_id, [])
                    if g.get('class_name') == class_name
                ])
            
            if len(class_detections) > 0 or len(class_ground_truth) > 0:
                class_result = self.calculate_ap(
                    class_detections,
                    class_ground_truth,
                    class_name=class_name
                )
                results[class_name] = class_result
                class_aps.append(class_result['ap'])
        
        results['mAP'] = float(np.mean(class_aps)) if class_aps else 0.0
        results['class_aps'] = {c: results.get(c, {}).get('ap', 0.0) for c in class_names}
        
        return results
    
    def get_pr_curve_data(self, 
                          detections: List[Dict], 
                          ground_truth: List[Dict],
                          class_name: str = None,
                          num_points: int = 100) -> Dict:
        result = self.calculate_ap(detections, ground_truth, class_name)
        
        precision = np.array(result['precision'])
        recall = np.array(result['recall'])
        
        if len(recall) > 0:
            recall_interp = np.linspace(0, 1, num_points)
            precision_interp = np.interp(recall_interp, recall, precision, left=1.0, right=0.0)
        else:
            recall_interp = np.linspace(0, 1, num_points)
            precision_interp = np.zeros(num_points)
        
        return {
            'recall': recall_interp.tolist(),
            'precision': precision_interp.tolist(),
            'ap': result['ap']
        }

calculator = MetricsCalculator()
