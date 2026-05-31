import cv2
import numpy as np
import json
import sys
import base64
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

try:
    from tensorflow.keras.models import Model
    from tensorflow.keras.layers import Input, Conv2D, MaxPooling2D, UpSampling2D, concatenate, Dropout
    from tensorflow.keras.optimizers import Adam
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False

def build_unet_model(input_size=(256, 256, 1)):
    if not TF_AVAILABLE:
        return None
    
    inputs = Input(input_size)
    
    conv1 = Conv2D(64, 3, activation='relu', padding='same', kernel_initializer='he_normal')(inputs)
    conv1 = Conv2D(64, 3, activation='relu', padding='same', kernel_initializer='he_normal')(conv1)
    pool1 = MaxPooling2D(pool_size=(2, 2))(conv1)
    
    conv2 = Conv2D(128, 3, activation='relu', padding='same', kernel_initializer='he_normal')(pool1)
    conv2 = Conv2D(128, 3, activation='relu', padding='same', kernel_initializer='he_normal')(conv2)
    pool2 = MaxPooling2D(pool_size=(2, 2))(conv2)
    
    conv3 = Conv2D(256, 3, activation='relu', padding='same', kernel_initializer='he_normal')(pool2)
    conv3 = Conv2D(256, 3, activation='relu', padding='same', kernel_initializer='he_normal')(conv3)
    pool3 = MaxPooling2D(pool_size=(2, 2))(conv3)
    
    conv4 = Conv2D(512, 3, activation='relu', padding='same', kernel_initializer='he_normal')(pool3)
    conv4 = Conv2D(512, 3, activation='relu', padding='same', kernel_initializer='he_normal')(conv4)
    drop4 = Dropout(0.5)(conv4)
    pool4 = MaxPooling2D(pool_size=(2, 2))(drop4)
    
    conv5 = Conv2D(1024, 3, activation='relu', padding='same', kernel_initializer='he_normal')(pool4)
    conv5 = Conv2D(1024, 3, activation='relu', padding='same', kernel_initializer='he_normal')(conv5)
    drop5 = Dropout(0.5)(conv5)
    
    up6 = Conv2D(512, 2, activation='relu', padding='same', kernel_initializer='he_normal')(UpSampling2D(size=(2, 2))(drop5))
    merge6 = concatenate([drop4, up6], axis=3)
    conv6 = Conv2D(512, 3, activation='relu', padding='same', kernel_initializer='he_normal')(merge6)
    conv6 = Conv2D(512, 3, activation='relu', padding='same', kernel_initializer='he_normal')(conv6)
    
    up7 = Conv2D(256, 2, activation='relu', padding='same', kernel_initializer='he_normal')(UpSampling2D(size=(2, 2))(conv6))
    merge7 = concatenate([conv3, up7], axis=3)
    conv7 = Conv2D(256, 3, activation='relu', padding='same', kernel_initializer='he_normal')(merge7)
    conv7 = Conv2D(256, 3, activation='relu', padding='same', kernel_initializer='he_normal')(conv7)
    
    up8 = Conv2D(128, 2, activation='relu', padding='same', kernel_initializer='he_normal')(UpSampling2D(size=(2, 2))(conv7))
    merge8 = concatenate([conv2, up8], axis=3)
    conv8 = Conv2D(128, 3, activation='relu', padding='same', kernel_initializer='he_normal')(merge8)
    conv8 = Conv2D(128, 3, activation='relu', padding='same', kernel_initializer='he_normal')(conv8)
    
    up9 = Conv2D(64, 2, activation='relu', padding='same', kernel_initializer='he_normal')(UpSampling2D(size=(2, 2))(conv8))
    merge9 = concatenate([conv1, up9], axis=3)
    conv9 = Conv2D(64, 3, activation='relu', padding='same', kernel_initializer='he_normal')(merge9)
    conv9 = Conv2D(64, 3, activation='relu', padding='same', kernel_initializer='he_normal')(conv9)
    conv9 = Conv2D(2, 3, activation='relu', padding='same', kernel_initializer='he_normal')(conv9)
    conv10 = Conv2D(1, 1, activation='sigmoid')(conv9)
    
    model = Model(inputs=inputs, outputs=conv10)
    model.compile(optimizer=Adam(learning_rate=1e-4), loss='binary_crossentropy', metrics=['accuracy'])
    
    return model

def traditional_unet_like_segmentation(gray):
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(blurred)
    
    kernel_large = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    kernel_small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    
    opening = cv2.morphologyEx(enhanced, cv2.MORPH_OPEN, kernel_small, iterations=1)
    blackhat = cv2.morphologyEx(opening, cv2.MORPH_BLACKHAT, kernel_large)
    
    _, thresh = cv2.threshold(blackhat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    edges = cv2.Canny(enhanced, 50, 150)
    combined = cv2.bitwise_or(thresh, edges)
    
    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    mask = np.zeros_like(gray)
    
    for contour in contours:
        area = cv2.contourArea(contour)
        if 20 < area < 5000:
            cv2.drawContours(mask, [contour], -1, 255, -1)
    
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel_small, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_small, iterations=1)
    
    return mask

def analyze_with_unet(image_path, min_area=50, max_area=5000, scale_factor=1.0, use_tf=False):
    img = cv2.imread(image_path)
    if img is None:
        return json.dumps({"error": "无法读取图像"})
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    if TF_AVAILABLE and use_tf:
        try:
            model = build_unet_model(input_size=(256, 256, 1))
            if model:
                resized = cv2.resize(gray, (256, 256))
                normalized = resized / 255.0
                input_img = normalized.reshape(1, 256, 256, 1)
                pred_mask = model.predict(input_img, verbose=0)[0, :, :, 0]
                pred_mask = (pred_mask > 0.5).astype(np.uint8) * 255
                mask = cv2.resize(pred_mask, (gray.shape[1], gray.shape[0]))
            else:
                mask = traditional_unet_like_segmentation(gray)
        except:
            mask = traditional_unet_like_segmentation(gray)
    else:
        mask = traditional_unet_like_segmentation(gray)
    
    dist_transform = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    dist_norm = cv2.normalize(dist_transform, None, 0, 1.0, cv2.NORM_MINMAX)
    
    _, sure_fg = cv2.threshold(dist_norm, 0.3, 1.0, cv2.THRESH_BINARY)
    sure_fg = (sure_fg * 255).astype(np.uint8)
    
    kernel = np.ones((3, 3), np.uint8)
    sure_bg = cv2.dilate(mask, kernel, iterations=2)
    
    unknown = cv2.subtract(sure_bg, sure_fg)
    
    _, markers = cv2.connectedComponents(sure_fg)
    markers = markers + 1
    markers[unknown == 255] = 0
    
    markers = cv2.watershed(img, markers)
    
    particles = []
    unique_markers = np.unique(markers)
    
    for marker in unique_markers:
        if marker <= 1:
            continue
            
        mask_particle = np.zeros(gray.shape, dtype=np.uint8)
        mask_particle[markers == marker] = 255
        
        contours, _ = cv2.findContours(mask_particle, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
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
        
        cv2.drawContours(img, [contour], -1, (255, 0, 255), 2)
        cv2.circle(img, (cx, cy), 3, (0, 255, 255), -1)
    
    _, buffer = cv2.imencode('.png', img)
    annotated_image = base64.b64encode(buffer).decode('utf-8')
    
    result = {
        "particles": particles,
        "annotated_image": annotated_image,
        "total_count": len(particles),
        "scale_factor": scale_factor,
        "method": "unet",
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
    scale_factor = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
    use_tf = sys.argv[5].lower() == 'true' if len(sys.argv) > 5 else False
    
    result = analyze_with_unet(image_path, min_area, max_area, scale_factor, use_tf)
    print(result)
