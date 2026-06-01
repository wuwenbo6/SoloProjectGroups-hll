import sys
import json
import cv2
import numpy as np
import tempfile
import os
from io import BytesIO
from PIL import Image

try:
    from pyzbar.pyzbar import decode
    PYZBAR_AVAILABLE = True
except ImportError:
    PYZBAR_AVAILABLE = False

try:
    import pytesseract
    from pytesseract import Output
    PYTESSERACT_AVAILABLE = True
except ImportError:
    PYTESSERACT_AVAILABLE = False

try:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.utils import ImageReader
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

def order_corners(corners):
    rect = np.zeros((4, 2), dtype="float32")
    s = corners.sum(axis=1)
    rect[0] = corners[np.argmin(s)]
    rect[2] = corners[np.argmax(s)]
    diff = np.diff(corners, axis=1)
    rect[1] = corners[np.argmin(diff)]
    rect[3] = corners[np.argmax(diff)]
    return rect

def remove_shadow(img):
    try:
        if len(img.shape) == 3:
            rgb_planes = cv2.split(img)
            result_planes = []
            for plane in rgb_planes:
                dilated_img = cv2.dilate(plane, np.ones((7,7), np.uint8))
                bg_img = cv2.medianBlur(dilated_img, 21)
                diff_img = 255 - cv2.absdiff(plane, bg_img)
                norm_img = cv2.normalize(diff_img, None, alpha=0, beta=255, 
                                         norm_type=cv2.NORM_MINMAX, dtype=cv2.CV_8UC1)
                result_planes.append(norm_img)
            result = cv2.merge(result_planes)
        else:
            dilated_img = cv2.dilate(img, np.ones((7,7), np.uint8))
            bg_img = cv2.medianBlur(dilated_img, 21)
            diff_img = 255 - cv2.absdiff(img, bg_img)
            result = cv2.normalize(diff_img, None, alpha=0, beta=255, 
                                   norm_type=cv2.NORM_MINMAX, dtype=cv2.CV_8UC1)
        return result
    except:
        return img

def detect_barcode(img):
    if not PYZBAR_AVAILABLE:
        return []
    try:
        barcodes = decode(img)
        results = []
        for barcode in barcodes:
            barcode_data = barcode.data.decode('utf-8')
            barcode_type = barcode.type
            x, y, w, h = barcode.rect
            results.append({
                'data': barcode_data,
                'type': barcode_type,
                'bbox': [x, y, w, h]
            })
        return results
    except:
        return []

def ocr_image(img, lang='chi_sim+eng'):
    if not PYTESSERACT_AVAILABLE:
        return {'text': '', 'boxes': []}
    try:
        data = pytesseract.image_to_data(img, lang=lang, output_type=Output.DICT)
        boxes = []
        full_text = []
        n_boxes = len(data['text'])
        for i in range(n_boxes):
            if int(data['conf'][i]) > 0:
                (x, y, w, h) = (data['left'][i], data['top'][i], 
                               data['width'][i], data['height'][i])
                text = data['text'][i]
                if text.strip():
                    boxes.append({
                        'text': text,
                        'bbox': [x, y, w, h],
                        'conf': data['conf'][i]
                    })
                    full_text.append(text)
        return {
            'text': ' '.join(full_text),
            'boxes': boxes
        }
    except Exception as e:
        return {'text': '', 'boxes': [], 'error': str(e)}

def create_searchable_pdf(image_paths, output_pdf_path, lang='chi_sim+eng'):
    if not (PYTESSERACT_AVAILABLE and REPORTLAB_AVAILABLE):
        return False
    
    try:
        c = canvas.Canvas(output_pdf_path)
        
        for img_path in image_paths:
            img = Image.open(img_path)
            img_width, img_height = img.size
            
            pdf_width, pdf_height = A4
            scale = min(pdf_width / img_width, pdf_height / img_height)
            display_width = img_width * scale
            display_height = img_height * scale
            x_offset = (pdf_width - display_width) / 2
            y_offset = (pdf_height - display_height) / 2
            
            c.setPageSize(A4)
            c.drawImage(img_path, x_offset, y_offset, 
                       width=display_width, height=display_height)
            
            try:
                ocr_data = pytesseract.image_to_data(img, lang=lang, output_type=Output.DICT)
                n_items = len(ocr_data['text'])
                
                c.setFillColorRGB(0, 0, 0, 0)
                
                for i in range(n_items):
                    if int(ocr_data['conf'][i]) > 30:
                        text = ocr_data['text'][i]
                        if text.strip():
                            x = ocr_data['left'][i] * scale + x_offset
                            y = pdf_height - (ocr_data['top'][i] * scale + y_offset) - ocr_data['height'][i] * scale
                            font_size = max(8, min(16, ocr_data['height'][i] * scale * 0.8))
                            
                            try:
                                c.setFont("Helvetica", font_size)
                                c.drawString(x, y, text)
                            except:
                                pass
            except:
                pass
            
            c.showPage()
        
        c.save()
        return True
    except Exception as e:
        print(f"PDF creation error: {e}")
        return False

def cluster_points(points, eps=30):
    if len(points) < 2:
        return points
    points = np.array(points, dtype="float32")
    clusters = []
    used = np.zeros(len(points), dtype=bool)
    for i in range(len(points)):
        if used[i]:
            continue
        cluster = [points[i]]
        used[i] = True
        queue = [i]
        while queue:
            idx = queue.pop(0)
            for j in range(len(points)):
                if not used[j]:
                    dist = np.linalg.norm(points[idx] - points[j])
                    if dist < eps:
                        cluster.append(points[j])
                        used[j] = True
                        queue.append(j)
        clusters.append(np.mean(cluster, axis=0))
    return np.array(clusters, dtype="float32")

def find_corners_from_contours(img, gray, width, height):
    try:
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 30, 100, apertureSize=3)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(edges.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]
        screenCnt = None
        for c in contours:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) == 4:
                screenCnt = approx
                break
        if screenCnt is None:
            for c in contours:
                x, y, w, h = cv2.boundingRect(c)
                area = cv2.contourArea(c)
                if area > (width * height) * 0.1:
                    rect = cv2.minAreaRect(c)
                    box = cv2.boxPoints(rect)
                    screenCnt = np.int32(box)
                    break
        if screenCnt is not None:
            corners = screenCnt.reshape(4, 2)
            return order_corners(corners)
    except:
        pass
    return None

def detect_corners(image_path):
    try:
        img = cv2.imread(image_path)
        if img is None:
            return json.dumps({"success": False, "error": "无法读取图片"})
        
        original_img = img.copy()
        height, width = img.shape[:2]
        max_dim = max(height, width)
        scale = 1000 / max_dim if max_dim > 1000 else 1
        if scale < 1:
            img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
            height, width = img.shape[:2]
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        contour_corners = find_corners_from_contours(img, gray, width, height)
        if contour_corners is not None:
            if scale < 1:
                contour_corners = contour_corners / scale
            return json.dumps({
                "success": True,
                "corners": contour_corners.tolist()
            })
        
        gray = cv2.GaussianBlur(gray, (3, 3), 0)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
        
        edges_multi = []
        for low, high in [(30, 80), (50, 120), (70, 150)]:
            edges = cv2.Canny(gray, low, high, apertureSize=3)
            edges_multi.append(edges)
        edges = np.max(edges_multi, axis=0).astype(np.uint8)
        
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        edges = cv2.dilate(edges, kernel, iterations=1)
        
        min_line_len = min(width, height) * 0.15
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=60, 
                               minLineLength=min_line_len, 
                               maxLineGap=25)
        
        if lines is None:
            corners = np.array([
                [0, 0],
                [width - 1, 0],
                [width - 1, height - 1],
                [0, height - 1]
            ], dtype="float32")
        else:
            horizontal_lines = []
            vertical_lines = []
            
            for line in lines:
                x1, y1, x2, y2 = line[0]
                angle = abs(np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi)
                line_len = np.sqrt((x2-x1)**2 + (y2-y1)**2)
                
                if angle < 35 or angle > 145:
                    horizontal_lines.append((x1, y1, x2, y2, line_len))
                elif 55 < angle < 125:
                    vertical_lines.append((x1, y1, x2, y2, line_len))
            
            horizontal_lines.sort(key=lambda x: x[4], reverse=True)
            vertical_lines.sort(key=lambda x: x[4], reverse=True)
            horizontal_lines = horizontal_lines[:20]
            vertical_lines = vertical_lines[:20]
            
            intersections = []
            for h_line in horizontal_lines:
                for v_line in vertical_lines:
                    x1, y1, x2, y2, _ = h_line
                    x3, y3, x4, y4, _ = v_line
                    
                    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
                    if abs(denom) < 1e-6:
                        continue
                    
                    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
                    u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom
                    
                    if -0.1 <= t <= 1.1 and -0.1 <= u <= 1.1:
                        x = int(x1 + t * (x2 - x1))
                        y = int(y1 + t * (y2 - y1))
                        if 0 <= x < width and 0 <= y < height:
                            intersections.append((x, y))
            
            if len(intersections) >= 4:
                clustered = cluster_points(intersections, eps=30)
                
                if len(clustered) >= 4:
                    corners = order_corners(clustered)
                else:
                    corners = np.array([
                        [0, 0],
                        [width - 1, 0],
                        [width - 1, height - 1],
                        [0, height - 1]
                    ], dtype="float32")
            else:
                corners = np.array([
                    [0, 0],
                    [width - 1, 0],
                    [width - 1, height - 1],
                    [0, height - 1]
                ], dtype="float32")
        
        if scale < 1:
            corners = corners / scale
        
        corners_list = corners.tolist()
        
        return json.dumps({
            "success": True,
            "corners": corners_list
        })
    
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

def warp_perspective(image_path, corners, output_path, remove_shadow_flag=False):
    try:
        img = cv2.imread(image_path)
        if img is None:
            return json.dumps({"success": False, "error": "无法读取图片"})
        
        corners = np.array(corners, dtype="float32")
        corners = order_corners(corners)
        
        (tl, tr, br, bl) = corners
        
        widthA = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
        widthB = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
        maxWidth = max(int(widthA), int(widthB))
        
        heightA = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
        heightB = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
        maxHeight = max(int(heightA), int(heightB))
        
        supersample = 2
        dst_width = maxWidth * supersample
        dst_height = maxHeight * supersample
        
        dst = np.array([
            [0, 0],
            [dst_width - 1, 0],
            [dst_width - 1, dst_height - 1],
            [0, dst_height - 1]
        ], dtype="float32")
        
        M = cv2.getPerspectiveTransform(corners, dst)
        warped = cv2.warpPerspective(img, M, (dst_width, dst_height), 
                                    flags=cv2.INTER_LANCZOS4,
                                    borderMode=cv2.BORDER_REPLICATE)
        
        final = cv2.resize(warped, (maxWidth, maxHeight), interpolation=cv2.INTER_AREA)
        
        sharpen_kernel = np.array([
            [-0.5, -0.5, -0.5],
            [-0.5,  5.0, -0.5],
            [-0.5, -0.5, -0.5]
        ], dtype=np.float32)
        final = cv2.filter2D(final, -1, sharpen_kernel)
        
        if remove_shadow_flag:
            final = remove_shadow(final)
        
        cv2.imwrite(output_path, final, [cv2.IMWRITE_PNG_COMPRESSION, 0])
        
        return json.dumps({
            "success": True,
            "output_path": output_path,
            "width": maxWidth,
            "height": maxHeight
        })
    
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

def detect_barcode_from_path(image_path):
    try:
        img = cv2.imread(image_path)
        if img is None:
            return json.dumps({"success": False, "error": "无法读取图片"})
        barcodes = detect_barcode(img)
        return json.dumps({
            "success": True,
            "barcodes": barcodes,
            "available": PYZBAR_AVAILABLE
        })
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

def ocr_from_path(image_path, lang='chi_sim+eng'):
    try:
        img = cv2.imread(image_path)
        if img is None:
            return json.dumps({"success": False, "error": "无法读取图片"})
        result = ocr_image(img, lang)
        return json.dumps({
            "success": True,
            "ocr": result,
            "available": PYTESSERACT_AVAILABLE
        })
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

def export_searchable_pdf(image_paths_json, output_path, lang='chi_sim+eng'):
    try:
        image_paths = json.loads(image_paths_json)
        success = create_searchable_pdf(image_paths, output_path, lang)
        return json.dumps({
            "success": success,
            "available": PYTESSERACT_AVAILABLE and REPORTLAB_AVAILABLE
        })
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

def remove_shadow_from_path(image_path, output_path):
    try:
        img = cv2.imread(image_path)
        if img is None:
            return json.dumps({"success": False, "error": "无法读取图片"})
        result = remove_shadow(img)
        cv2.imwrite(output_path, result, [cv2.IMWRITE_PNG_COMPRESSION, 0])
        return json.dumps({"success": True, "output_path": output_path})
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "缺少参数"}))
        return
    
    command = sys.argv[1]
    
    if command == "detect" and len(sys.argv) == 3:
        result = detect_corners(sys.argv[2])
        print(result)
    elif command == "warp" and len(sys.argv) >= 5:
        corners = json.loads(sys.argv[3])
        remove_shadow_flag = len(sys.argv) > 5 and sys.argv[5] == "true"
        result = warp_perspective(sys.argv[2], corners, sys.argv[4], remove_shadow_flag)
        print(result)
    elif command == "barcode" and len(sys.argv) == 3:
        result = detect_barcode_from_path(sys.argv[2])
        print(result)
    elif command == "ocr" and len(sys.argv) >= 3:
        lang = sys.argv[3] if len(sys.argv) > 3 else 'chi_sim+eng'
        result = ocr_from_path(sys.argv[2], lang)
        print(result)
    elif command == "searchable-pdf" and len(sys.argv) >= 4:
        lang = sys.argv[4] if len(sys.argv) > 4 else 'chi_sim+eng'
        result = export_searchable_pdf(sys.argv[2], sys.argv[3], lang)
        print(result)
    elif command == "remove-shadow" and len(sys.argv) == 4:
        result = remove_shadow_from_path(sys.argv[2], sys.argv[3])
        print(result)
    else:
        print(json.dumps({"success": False, "error": "无效命令"}))

if __name__ == "__main__":
    main()
