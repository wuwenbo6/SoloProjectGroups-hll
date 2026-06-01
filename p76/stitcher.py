#!/usr/bin/env python3
import sys
import json
import cv2
import numpy as np
import base64
import os
from scipy.optimize import least_squares
from PIL import Image

def send_progress(step, progress, **kwargs):
    message = {
        "type": "progress",
        "step": step,
        "progress": progress
    }
    message.update(kwargs)
    print(json.dumps(message))
    sys.stdout.flush()

def send_result(data):
    message = {
        "type": "result",
        "data": data
    }
    print(json.dumps(message))
    sys.stdout.flush()

def send_error(message):
    message = {
        "type": "error",
        "message": message
    }
    print(json.dumps(message))
    sys.stdout.flush()

def image_to_base64(image):
    _, buffer = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 95])
    return base64.b64encode(buffer).decode('utf-8')

def preprocess_image(image):
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    lab = cv2.merge((l, a, b))
    enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    return enhanced

def detect_features(image, method='SIFT'):
    enhanced = preprocess_image(image)
    gray = cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY)
    
    if method == 'SIFT':
        detector = cv2.SIFT_create(nfeatures=5000, contrastThreshold=0.02, edgeThreshold=20)
    elif method == 'ORB':
        detector = cv2.ORB_create(nfeatures=5000, scaleFactor=1.2, nlevels=8)
    elif method == 'AKAZE':
        detector = cv2.AKAZE_create(threshold=0.001)
    else:
        detector = cv2.SIFT_create()
    
    keypoints, descriptors = detector.detectAndCompute(gray, None)
    return keypoints, descriptors

def detect_features_ensemble(image):
    kp_sift, desc_sift = detect_features(image, 'SIFT')
    kp_akaze, desc_akaze = detect_features(image, 'AKAZE')
    
    if len(kp_sift) >= 100:
        return kp_sift, desc_sift
    elif len(kp_akaze) >= 100:
        return kp_akaze, desc_akaze
    else:
        return kp_sift, desc_sift

def match_features_robust(desc1, desc2, method='SIFT'):
    if desc1 is None or desc2 is None:
        return []
    
    if method == 'ORB' or method == 'AKAZE':
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    else:
        bf = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
    
    try:
        matches_1to2 = bf.knnMatch(desc1, desc2, k=2)
    except:
        return []
    
    good_matches = []
    for match in matches_1to2:
        if len(match) >= 2:
            m, n = match
            if m.distance < 0.80 * n.distance:
                good_matches.append(m)
    
    if len(good_matches) > 10:
        matches_2to1 = bf.knnMatch(desc2, desc1, k=2)
        good_matches_2to1 = []
        for match in matches_2to1:
            if len(match) >= 2:
                m, n = match
                if m.distance < 0.80 * n.distance:
                    good_matches_2to1.append(m)
        
        bidirectional_matches = []
        train_to_query = {m.trainIdx: m.queryIdx for m in good_matches_2to1}
        
        for m in good_matches:
            if m.queryIdx in train_to_query and train_to_query[m.queryIdx] == m.trainIdx:
                bidirectional_matches.append(m)
        
        if len(bidirectional_matches) >= 10:
            return bidirectional_matches
    
    return good_matches

def find_homography_robust(kp1, kp2, matches):
    if len(matches) < 8:
        return None, 0, None
    
    src_pts = np.float32([kp1[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp2[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)
    
    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 3.0, maxIters=2000)
    
    if H is None:
        return None, 0, None
    
    inlier_count = np.sum(mask)
    inlier_ratio = inlier_count / len(matches)
    
    if inlier_ratio < 0.15 or inlier_count < 8:
        return None, 0, None
    
    inlier_matches = [m for i, m in enumerate(matches) if mask[i]]
    return H, inlier_ratio, inlier_matches

def homography_to_params(H):
    H_normalized = H / H[2, 2]
    return H_normalized[:2, :].flatten()

def params_to_homography(params):
    H = np.eye(3)
    H[0, :] = params[0:3]
    H[1, :] = params[3:6]
    return H

def bundle_adjustment_residuals(params, observations, n_images, ref_idx):
    residuals = []
    
    homographies = []
    idx = 0
    for i in range(n_images):
        if i == ref_idx:
            homographies.append(np.eye(3))
        else:
            H = params_to_homography(params[idx:idx+6])
            homographies.append(H)
            idx += 6
    
    for obs in observations:
        img_i, img_j, pt_i, pt_j = obs
        
        pt_i_h = np.array([pt_i[0], pt_i[1], 1.0])
        pt_j_h = np.array([pt_j[0], pt_j[1], 1.0])
        
        proj_i_to_j = homographies[img_j].dot(np.linalg.inv(homographies[img_i])).dot(pt_i_h)
        proj_i_to_j = proj_i_to_j[:2] / proj_i_to_j[2]
        
        residuals.extend([proj_i_to_j[0] - pt_j[0], proj_i_to_j[1] - pt_j[1]])
    
    return np.array(residuals)

def run_bundle_adjustment(homographies, all_keypoints, matches_dict, ref_idx):
    n_images = len(homographies)
    
    observations = []
    for (i, j), matches in matches_dict.items():
        if matches is not None and len(matches) > 0:
            for m in matches:
                pt_i = all_keypoints[i][m.queryIdx].pt
                pt_j = all_keypoints[j][m.trainIdx].pt
                observations.append((i, j, pt_i, pt_j))
    
    if len(observations) < 20:
        return homographies
    
    initial_params = []
    for i in range(n_images):
        if i != ref_idx:
            initial_params.extend(homography_to_params(homographies[i]))
    
    initial_params = np.array(initial_params)
    
    try:
        result = least_squares(
            bundle_adjustment_residuals,
            initial_params,
            args=(observations, n_images, ref_idx),
            method='trf',
            verbose=0,
            max_nfev=100
        )
        
        optimized_params = result.x
        idx = 0
        optimized_homographies = []
        for i in range(n_images):
            if i == ref_idx:
                optimized_homographies.append(np.eye(3))
            else:
                H = params_to_homography(optimized_params[idx:idx+6])
                optimized_homographies.append(H)
                idx += 6
        
        return optimized_homographies
    except:
        return homographies

def compute_panorama_size(images, homographies):
    corners_list = []
    
    for i, img in enumerate(images):
        hi, wi = img.shape[:2]
        corners = np.float32([[0, 0], [0, hi], [wi, hi], [wi, 0]]).reshape(-1, 1, 2)
        
        H = homographies[i]
        if H is not None:
            corners = cv2.perspectiveTransform(corners, H)
        
        corners_list.append(corners)
    
    all_corners = np.concatenate(corners_list, axis=0)
    [x_min, y_min] = np.int32(all_corners.min(axis=0).ravel() - 0.5)
    [x_max, y_max] = np.int32(all_corners.max(axis=0).ravel() + 0.5)
    
    return x_min, y_min, x_max, y_max

def extract_frames_from_video(video_path, max_frames=30, min_frame_interval=10):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    
    frames = []
    frame_count = 0
    last_keypoints = None
    last_desc = None
    
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_step = max(1, total_frames // max_frames)
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_count % frame_step == 0:
            kp, desc = detect_features_ensemble(frame)
            
            if last_desc is not None and len(kp) > 50:
                matches = match_features_robust(desc, last_desc)
                if len(matches) >= 15:
                    frames.append(frame)
            
            if len(frames) == 0:
                frames.append(frame)
            
            last_keypoints = kp
            last_desc = desc
        
        frame_count += 1
        
        if len(frames) >= max_frames:
            break
    
    cap.release()
    
    if len(frames) < 2:
        frames = []
        cap = cv2.VideoCapture(video_path)
        frame_count = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            if frame_count % frame_step == 0:
                frames.append(frame)
            
            frame_count += 1
            if len(frames) >= max_frames:
                break
        cap.release()
    
    return frames

def save_psd_layers(warped_images, output_path):
    from psd_tools import PSDImage
    from psd_tools.api.layers import Layer
    from psd_tools.constants import BlendMode
    
    height, width = warped_images[0].shape[:2]
    
    psd = PSDImage.new(mode='RGB', size=(width, height), color=(255, 255, 255))
    
    for idx, img in enumerate(reversed(warped_images)):
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(img_rgb)
        
        mask = np.any(img > 0, axis=2).astype(np.uint8) * 255
        pil_mask = Image.fromarray(mask)
        
        layer = psd.add_layer(f'Layer_{len(warped_images) - idx}', pil_img)
        layer.blend_mode = BlendMode.NORMAL
    
    psd.save(output_path)
    return True

def simple_psd_export(warped_images, output_path):
    height, width = warped_images[0].shape[:2]
    
    merged = np.zeros((height, width, 3), dtype=np.uint8)
    for img in warped_images:
        mask = np.any(img > 0, axis=2)
        merged[mask] = img[mask]
    
    img_rgb = cv2.cvtColor(merged, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(img_rgb)
    pil_img.save(output_path.replace('.psd', '.png'))
    
    return True

def stitch_multiple_images_robust(image_paths, use_ba=True, export_layers=False, output_dir=None):
    images = []
    is_video = False
    
    if len(image_paths) == 1 and image_paths[0].lower().endswith(('.mp4', '.avi', '.mov', '.mkv')):
        send_progress("detect", 0, message="正在从视频提取帧...")
        video_frames = extract_frames_from_video(image_paths[0])
        if video_frames is None or len(video_frames) < 2:
            send_error("视频帧提取失败或帧数不足")
            return None
        images = video_frames
        is_video = True
        send_progress("detect", 5, message=f"已提取 {len(images)} 帧")
    else:
        for path in image_paths:
            img = cv2.imread(path)
            if img is None:
                send_error(f"无法读取图片: {path}")
                return None
            
            max_dim = 2000
            h, w = img.shape[:2]
            if max(h, w) > max_dim:
                scale = max_dim / max(h, w)
                img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
            
            images.append(img)
    
    n = len(images)
    if n < 2:
        send_error("至少需要2张图片")
        return None
    
    send_progress("detect", 5, message="正在提取特征点...")
    
    all_keypoints = []
    all_descriptors = []
    
    for i, img in enumerate(images):
        kp, desc = detect_features_ensemble(img)
        all_keypoints.append(kp)
        all_descriptors.append(desc)
        send_progress("detect", 10 + int((i + 1) / n * 15), 
                      message=f"已提取第 {i + 1} 张图片的特征点 ({len(kp)} 个)")
    
    send_progress("match", 25, message="正在计算图像间匹配...")
    
    match_matrix = [[None] * n for _ in range(n)]
    homography_matrix = [[None] * n for _ in range(n)]
    matches_for_ba = {}
    
    for i in range(n):
        for j in range(n):
            if i != j:
                matches = match_features_robust(all_descriptors[i], all_descriptors[j])
                match_matrix[i][j] = matches
                
                if len(matches) >= 15:
                    H, inlier_ratio, inlier_matches = find_homography_robust(all_keypoints[i], all_keypoints[j], matches)
                    if H is not None and inlier_ratio >= 0.2:
                        homography_matrix[i][j] = H
                        matches_for_ba[(i, j)] = inlier_matches
    
    send_progress("match", 40, message="正在选择参考图像...")
    
    match_scores = []
    for i in range(n):
        score = 0
        for j in range(n):
            if i != j and homography_matrix[i][j] is not None:
                score += 1
        match_scores.append(score)
    
    ref_idx = np.argmax(match_scores)
    
    if match_scores[ref_idx] == 0:
        send_error("无法找到足够的匹配对，请确保图片有足够的重叠区域")
        return None
    
    send_progress("homography", 45, message=f"选择第 {ref_idx + 1} 张作为参考图像...")
    
    homographies = [None] * n
    homographies[ref_idx] = np.eye(3)
    
    visited = {ref_idx}
    queue = [ref_idx]
    
    while queue:
        current = queue.pop(0)
        for j in range(n):
            if j not in visited:
                if homography_matrix[j][current] is not None:
                    H = homography_matrix[j][current]
                    homographies[j] = homographies[current].dot(H)
                    visited.add(j)
                    queue.append(j)
                elif homography_matrix[current][j] is not None:
                    H = np.linalg.inv(homography_matrix[current][j])
                    homographies[j] = homographies[current].dot(H)
                    visited.add(j)
                    queue.append(j)
    
    unvisited = set(range(n)) - visited
    if unvisited:
        for idx in unvisited:
            best_match = -1
            best_matches = []
            for v in visited:
                matches = match_matrix[idx][v]
                if len(matches) > len(best_matches):
                    best_matches = matches
                    best_match = v
            
            if len(best_matches) >= 10:
                H, inlier_ratio, _ = find_homography_robust(all_keypoints[idx], all_keypoints[best_match], best_matches)
                if H is not None:
                    homographies[idx] = homographies[best_match].dot(H)
                    visited.add(idx)
    
    valid_indices = [i for i in range(n) if homographies[i] is not None]
    if len(valid_indices) < 2:
        send_error("只有少于2张图片能够匹配")
        return None
    
    if len(valid_indices) < n:
        send_progress("homography", 55, message=f"注意: 只有 {len(valid_indices)}/{n} 张图片能够匹配...")
    
    send_progress("match", 50, message="准备匹配预览...")
    
    if len(valid_indices) >= 2:
        preview_idx1 = valid_indices[0]
        preview_idx2 = valid_indices[1]
        preview_matches = match_matrix[preview_idx1][preview_idx2] or []
        
        kp1_coords = [[kp.pt[0], kp.pt[1]] for kp in all_keypoints[preview_idx1]]
        kp2_coords = [[kp.pt[0], kp.pt[1]] for kp in all_keypoints[preview_idx2]]
        matches_data = [{"queryIdx": m.queryIdx, "trainIdx": m.trainIdx, "distance": m.distance} 
                      for m in preview_matches[:150]]
        
        send_progress("match", 55, match_preview={
            "img1": image_to_base64(images[preview_idx1]),
            "img2": image_to_base64(images[preview_idx2]),
            "keypoints1": kp1_coords,
            "keypoints2": kp2_coords,
            "matches": matches_data
        })
    
    if use_ba and len(valid_indices) >= 3:
        send_progress("homography", 55, message="正在执行光束法平差...")
        homographies = run_bundle_adjustment(homographies, all_keypoints, matches_for_ba, ref_idx)
    
    send_progress("warp", 60, message="正在计算全景图尺寸...")
    
    valid_images = [images[i] for i in valid_indices]
    valid_homographies = [homographies[i] for i in valid_indices]
    
    x_min, y_min, x_max, y_max = compute_panorama_size(valid_images, valid_homographies)
    
    width = x_max - x_min
    height = y_max - y_min
    
    max_size = 10000
    if width > max_size or height > max_size:
        scale = min(max_size / width, max_size / height)
        x_min = int(x_min * scale)
        y_min = int(y_min * scale)
        x_max = int(x_max * scale)
        y_max = int(y_max * scale)
        width = x_max - x_min
        height = y_max - y_min
        
        for i in range(len(valid_homographies)):
            scale_mat = np.array([[scale, 0, 0], [0, scale, 0], [0, 0, 1]])
            valid_homographies[i] = scale_mat.dot(valid_homographies[i])
    
    translation = np.array([[1, 0, -x_min], 
                            [0, 1, -y_min], 
                            [0, 0, 1]])
    
    for i in range(len(valid_homographies)):
        valid_homographies[i] = translation.dot(valid_homographies[i])
    
    send_progress("warp", 70, message="正在进行图像变换...")
    
    warped_images = []
    for idx, (img, H) in enumerate(zip(valid_images, valid_homographies)):
        send_progress("warp", 70 + int(idx / len(valid_images) * 15),
                      message=f"正在变换第 {idx + 1}/{len(valid_images)} 张图片...")
        warped = cv2.warpPerspective(img, H, (width, height), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        warped_images.append(warped)
    
    send_progress("blend", 85, message="正在进行图像融合...")
    
    panorama_final = np.zeros((height, width, 3), dtype=np.float32)
    weight_total = np.zeros((height, width), dtype=np.float32)
    
    for warped in warped_images:
        mask = np.any(warped > 0, axis=2).astype(np.float32)
        dist = cv2.distanceTransform((mask > 0).astype(np.uint8), cv2.DIST_L2, 5)
        dist = np.maximum(dist, 1)
        
        weight = dist
        weight_total += weight
        
        for c in range(3):
            panorama_final[:, :, c] += warped[:, :, c].astype(np.float32) * weight
    
    weight_total = np.maximum(weight_total, 1)
    for c in range(3):
        panorama_final[:, :, c] /= weight_total
    
    panorama_final = np.clip(panorama_final, 0, 255).astype(np.uint8)
    
    send_progress("blend", 95, message="正在裁剪边界...")
    
    gray = cv2.cvtColor(panorama_final, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY)
    
    kernel = np.ones((3, 3), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if contours:
        x, y, w, h = cv2.boundingRect(max(contours, key=cv2.contourArea))
        panorama_final = panorama_final[y:y + h, x:x + w]
        
        for i in range(len(warped_images)):
            warped_images[i] = warped_images[i][y:y + h, x:x + w]
    
    layer_paths = []
    if export_layers and output_dir:
        send_progress("blend", 98, message="正在导出图层...")
        try:
            psd_path = os.path.join(output_dir, "panorama_layers.psd")
            simple_psd_export(warped_images, psd_path)
            
            for i, warped in enumerate(warped_images):
                layer_path = os.path.join(output_dir, f"layer_{i+1}.png")
                cv2.imwrite(layer_path, warped)
                layer_paths.append(layer_path)
        except Exception as e:
            print(f"Layer export warning: {e}")
    
    send_progress("blend", 100, message="拼接完成!")
    
    return panorama_final, layer_paths

def main():
    try:
        if len(sys.argv) < 2:
            send_error("缺少参数")
            return
        
        args = json.loads(sys.argv[1])
        
        if isinstance(args, list) and len(args) > 0:
            image_paths = args
            use_ba = True
            export_layers = False
            output_dir = None
        else:
            image_paths = args.get('images', [])
            use_ba = args.get('use_bundle_adjustment', True)
            export_layers = args.get('export_layers', False)
            output_dir = args.get('output_dir', None)
        
        result = stitch_multiple_images_robust(image_paths, use_ba, export_layers, output_dir)
        
        if result is not None:
            panorama, layer_paths = result
            send_result({
                "final_image": image_to_base64(panorama),
                "layer_paths": layer_paths
            })
    
    except Exception as e:
        send_error(str(e))
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
