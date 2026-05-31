import cv2
import numpy as np
import json
import sys
import base64
from io import BytesIO
from PIL import Image

def analyze_particles(image_path, min_area=50, max_area=5000, fg_threshold=0.5, use_adaptive=False, scale_factor=1.0):
    img = cv2.imread(image_path)
    if img is None:
        return json.dumps({"error": "无法读取图像"})
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    if use_adaptive:
        thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                       cv2.THRESH_BINARY_INV, 11, 2)
    else:
        _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    kernel = np.ones((3, 3), np.uint8)
    opening = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=2)
    
    closing = cv2.morphologyEx(opening, cv2.MORPH_CLOSE, kernel, iterations=1)
    
    sure_bg = cv2.dilate(closing, kernel, iterations=2)
    
    dist_transform = cv2.distanceTransform(closing, cv2.DIST_L2, 5)
    
    dist_norm = cv2.normalize(dist_transform, None, 0, 1.0, cv2.NORM_MINMAX)
    
    _, sure_fg = cv2.threshold(dist_norm, fg_threshold, 1.0, cv2.THRESH_BINARY)
    sure_fg = (sure_fg * 255).astype(np.uint8)
    
    dist_local_max = cv2.dilate(dist_transform, kernel, iterations=1)
    local_max = (dist_transform == dist_local_max) & (dist_transform > 0)
    sure_fg_combined = sure_fg | (local_max.astype(np.uint8) * 255)
    
    unknown = cv2.subtract(sure_bg, sure_fg_combined)
    
    _, markers = cv2.connectedComponents(sure_fg_combined)
    markers = markers + 1
    markers[unknown == 255] = 0
    
    markers = cv2.watershed(img, markers)
    
    particles = []
    unique_markers = np.unique(markers)
    
    for marker in unique_markers:
        if marker <= 1:
            continue
            
        mask = np.zeros(gray.shape, dtype=np.uint8)
        mask[markers == marker] = 255
        
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if len(contours) == 0:
            continue
            
        contour = contours[0]
        area_px = cv2.contourArea(contour)
        
        if area_px < min_area or area_px > max_area:
            continue
            
        perimeter_px = cv2.arcLength(contour, True)
        
        if perimeter_px == 0:
            continue
            
        area = area_px * scale_factor * scale_factor
        perimeter = perimeter_px * scale_factor
        circularity = 4 * np.pi * (area / (perimeter * perimeter))
        
        M = cv2.moments(contour)
        if M["m00"] != 0:
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"])
        else:
            cx, cy = 0, 0
        
        particles.append({
            "id": int(marker),
            "area": float(area),
            "area_px": float(area_px),
            "perimeter": float(perimeter),
            "perimeter_px": float(perimeter_px),
            "circularity": float(circularity),
            "centroid": {"x": cx, "y": cy},
            "contour": [[int(p[0][0]), int(p[0][1])] for p in contour]
        })
        
        cv2.drawContours(img, [contour], -1, (0, 255, 0), 2)
        cv2.circle(img, (cx, cy), 3, (0, 0, 255), -1)
    
    _, buffer = cv2.imencode('.png', img)
    annotated_image = base64.b64encode(buffer).decode('utf-8')
    
    result = {
        "particles": particles,
        "annotated_image": annotated_image,
        "total_count": len(particles),
        "scale_factor": scale_factor,
        "statistics": {
            "min_area": float(min([p["area"] for p in particles])) if particles else 0,
            "max_area": float(max([p["area"] for p in particles])) if particles else 0,
            "avg_area": float(np.mean([p["area"] for p in particles])) if particles else 0,
            "avg_circularity": float(np.mean([p["circularity"] for p in particles])) if particles else 0
        }
    }
    
    return json.dumps(result)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "缺少图像路径参数"}))
        sys.exit(1)
    
    image_path = sys.argv[1]
    min_area = int(sys.argv[2]) if len(sys.argv) > 2 else 50
    max_area = int(sys.argv[3]) if len(sys.argv) > 3 else 5000
    fg_threshold = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
    use_adaptive = sys.argv[5].lower() == 'true' if len(sys.argv) > 5 else False
    scale_factor = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
    
    result = analyze_particles(image_path, min_area, max_area, fg_threshold, use_adaptive, scale_factor)
    print(result)
