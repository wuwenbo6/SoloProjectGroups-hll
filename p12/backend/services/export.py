import os
import numpy as np
from typing import List, Dict, Optional
from datetime import datetime
from pathlib import Path
import json
import xml.etree.ElementTree as ET
from xml.dom import minidom

class LabelExporter:
    def __init__(self):
        self.class_mapping = {
            'Car': 'car',
            'Pedestrian': 'pedestrian',
            'Cyclist': 'cyclist',
            'Van': 'van',
            'Truck': 'truck',
            'Misc': 'misc'
        }
    
    def project_3d_to_2d(self, bbox_3d: Dict, 
                         camera_intrinsic: np.ndarray = None,
                         image_size: tuple = (1242, 375)) -> Dict:
        x, y, z = bbox_3d['x'], bbox_3d['y'], bbox_3d['z']
        w, h, l = bbox_3d['w'], bbox_3d['h'], bbox_3d['l']
        
        if camera_intrinsic is None:
            camera_intrinsic = np.array([
                [721.5377, 0, 609.5593],
                [0, 721.5377, 172.8540],
                [0, 0, 1]
            ])
        
        if z <= 0:
            z = 0.1
        
        scale = 50.0 / z
        center_x_2d = image_size[0] / 2 + x * scale
        center_y_2d = image_size[1] / 2 - y * scale * 0.5
        
        width_2d = w * scale
        height_2d = h * scale * 0.8
        
        xmin = int(max(0, center_x_2d - width_2d / 2))
        ymin = int(max(0, center_y_2d - height_2d / 2))
        xmax = int(min(image_size[0], center_x_2d + width_2d / 2))
        ymax = int(min(image_size[1], center_y_2d + height_2d / 2))
        
        return {
            'xmin': xmin,
            'ymin': ymin,
            'xmax': xmax,
            'ymax': ymax,
            'center_x': center_x_2d,
            'center_y': center_y_2d
        }
    
    def to_pascal_voc_xml(self, 
                          detections: List[Dict],
                          image_path: str,
                          image_size: tuple = (1242, 375, 3),
                          output_path: Optional[str] = None) -> str:
        root = ET.Element('annotation')
        
        folder = ET.SubElement(root, 'folder')
        folder.text = os.path.dirname(image_path) or 'images'
        
        filename = ET.SubElement(root, 'filename')
        filename.text = os.path.basename(image_path)
        
        path = ET.SubElement(root, 'path')
        path.text = image_path
        
        source = ET.SubElement(root, 'source')
        database = ET.SubElement(source, 'database')
        database.text = 'PointCloud Detection'
        
        size = ET.SubElement(root, 'size')
        width = ET.SubElement(size, 'width')
        width.text = str(image_size[0])
        height = ET.SubElement(size, 'height')
        height.text = str(image_size[1])
        depth = ET.SubElement(size, 'depth')
        depth.text = str(image_size[2]) if len(image_size) > 2 else '3'
        
        segmented = ET.SubElement(root, 'segmented')
        segmented.text = '0'
        
        for det in detections:
            bbox_3d = det.get('bbox', det)
            class_name = det.get('class_name', 'Unknown')
            confidence = det.get('confidence', 1.0)
            
            bbox_2d = self.project_3d_to_2d(bbox_3d, image_size=image_size[:2])
            
            obj = ET.SubElement(root, 'object')
            
            name = ET.SubElement(obj, 'name')
            name.text = self.class_mapping.get(class_name, class_name.lower())
            
            pose = ET.SubElement(obj, 'pose')
            pose.text = 'Unspecified'
            
            truncated = ET.SubElement(obj, 'truncated')
            truncated.text = '0'
            
            difficult = ET.SubElement(obj, 'difficult')
            difficult.text = '0'
            
            if confidence < 1.0:
                conf = ET.SubElement(obj, 'confidence')
                conf.text = f"{confidence:.4f}"
            
            if 'track_id' in det:
                track_id_elem = ET.SubElement(obj, 'track_id')
                track_id_elem.text = str(det['track_id'])
            
            bndbox = ET.SubElement(obj, 'bndbox')
            xmin = ET.SubElement(bndbox, 'xmin')
            xmin.text = str(bbox_2d['xmin'])
            ymin = ET.SubElement(bndbox, 'ymin')
            ymin.text = str(bbox_2d['ymin'])
            xmax = ET.SubElement(bndbox, 'xmax')
            xmax.text = str(bbox_2d['xmax'])
            ymax = ET.SubElement(bndbox, 'ymax')
            ymax.text = str(bbox_2d['ymax'])
            
            bbox3d = ET.SubElement(obj, 'bndbox3d')
            x3d = ET.SubElement(bbox3d, 'x')
            x3d.text = f"{bbox_3d['x']:.4f}"
            y3d = ET.SubElement(bbox3d, 'y')
            y3d.text = f"{bbox_3d['y']:.4f}"
            z3d = ET.SubElement(bbox3d, 'z')
            z3d.text = f"{bbox_3d['z']:.4f}"
            w3d = ET.SubElement(bbox3d, 'w')
            w3d.text = f"{bbox_3d['w']:.4f}"
            h3d = ET.SubElement(bbox3d, 'h')
            h3d.text = f"{bbox_3d['h']:.4f}"
            l3d = ET.SubElement(bbox3d, 'l')
            l3d.text = f"{bbox_3d['l']:.4f}"
            ry = ET.SubElement(bbox3d, 'ry')
            ry.text = f"{bbox_3d.get('rotation_y', 0):.4f}"
        
        xml_str = minidom.parseString(ET.tostring(root, 'utf-8')).toprettyxml(indent='  ')
        
        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(xml_str)
        
        return xml_str
    
    def to_yolo_format(self, 
                       detections: List[Dict],
                       image_size: tuple = (1242, 375),
                       output_path: Optional[str] = None) -> str:
        yolo_lines = []
        
        class_to_id = {v: k for k, v in enumerate(['car', 'pedestrian', 'cyclist', 'van', 'truck', 'misc'])}
        
        img_w, img_h = image_size
        
        for det in detections:
            bbox_3d = det.get('bbox', det)
            class_name = det.get('class_name', 'Unknown')
            confidence = det.get('confidence', 1.0)
            
            class_label = self.class_mapping.get(class_name, class_name.lower())
            class_id = class_to_id.get(class_label, 0)
            
            bbox_2d = self.project_3d_to_2d(bbox_3d, image_size=image_size)
            
            x_center = bbox_2d['center_x'] / img_w
            y_center = bbox_2d['center_y'] / img_h
            width = (bbox_2d['xmax'] - bbox_2d['xmin']) / img_w
            height = (bbox_2d['ymax'] - bbox_2d['ymin']) / img_h
            
            x_center = max(0, min(1, x_center))
            y_center = max(0, min(1, y_center))
            width = max(0, min(1, width))
            height = max(0, min(1, height))
            
            line = f"{class_id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}"
            
            if confidence < 1.0:
                line += f" {confidence:.4f}"
            
            yolo_lines.append(line)
        
        yolo_str = '\n'.join(yolo_lines)
        
        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(yolo_str)
        
        return yolo_str
    
    def to_kitti_format(self,
                        detections: List[Dict],
                        frame_id: int = 0,
                        output_path: Optional[str] = None) -> str:
        kitti_lines = []
        
        for det in detections:
            bbox_3d = det.get('bbox', det)
            class_name = det.get('class_name', 'Unknown')
            confidence = det.get('confidence', -1.0)
            track_id = det.get('track_id', -1)
            
            bbox_2d = self.project_3d_to_2d(bbox_3d)
            
            kitti_type = class_name
            
            truncated = 0.0
            occluded = 0
            
            alpha = bbox_3d.get('rotation_y', 0)
            
            bbox_str = f"{bbox_2d['xmin']} {bbox_2d['ymin']} {bbox_2d['xmax']} {bbox_2d['ymax']}"
            
            dimensions_str = f"{bbox_3d['h']} {bbox_3d['w']} {bbox_3d['l']}"
            
            location_str = f"{bbox_3d['x']} {bbox_3d['y']} {bbox_3d['z']}"
            
            rotation_y = bbox_3d.get('rotation_y', 0)
            
            if confidence >= 0:
                score_str = f" {confidence:.4f}"
            else:
                score_str = ""
            
            line = f"{kitti_type} {truncated:.2f} {occluded} {alpha:.2f} {bbox_str} {dimensions_str} {location_str} {rotation_y:.2f}{score_str}"
            kitti_lines.append(line)
        
        kitti_str = '\n'.join(kitti_lines)
        
        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(kitti_str)
        
        return kitti_str
    
    def to_coco_json(self,
                     all_detections: Dict[str, List[Dict]],
                     output_path: Optional[str] = None) -> Dict:
        coco = {
            'info': {
                'description': 'PointCloud Detection Dataset',
                'version': '1.0',
                'year': datetime.now().year,
                'contributor': 'PointCloud Detection System',
                'date_created': datetime.now().isoformat()
            },
            'licenses': [],
            'images': [],
            'annotations': [],
            'categories': [
                {'id': 1, 'name': 'car', 'supercategory': 'vehicle'},
                {'id': 2, 'name': 'pedestrian', 'supercategory': 'person'},
                {'id': 3, 'name': 'cyclist', 'supercategory': 'vehicle'},
            ]
        }
        
        category_map = {'Car': 1, 'Pedestrian': 2, 'Cyclist': 3}
        
        ann_id = 1
        for img_id, (image_name, detections) in enumerate(all_detections.items(), 1):
            coco['images'].append({
                'id': img_id,
                'file_name': image_name,
                'width': 1242,
                'height': 375,
                'date_captured': datetime.now().isoformat()
            })
            
            for det in detections:
                bbox_3d = det.get('bbox', det)
                class_name = det.get('class_name', 'Unknown')
                confidence = det.get('confidence', 1.0)
                
                bbox_2d = self.project_3d_to_2d(bbox_3d)
                
                width = bbox_2d['xmax'] - bbox_2d['xmin']
                height = bbox_2d['ymax'] - bbox_2d['ymin']
                
                coco['annotations'].append({
                    'id': ann_id,
                    'image_id': img_id,
                    'category_id': category_map.get(class_name, 1),
                    'bbox': [bbox_2d['xmin'], bbox_2d['ymin'], width, height],
                    'bbox3d': [
                        bbox_3d['x'], bbox_3d['y'], bbox_3d['z'],
                        bbox_3d['w'], bbox_3d['h'], bbox_3d['l'],
                        bbox_3d.get('rotation_y', 0)
                    ],
                    'area': width * height,
                    'iscrowd': 0,
                    'score': confidence
                })
                ann_id += 1
        
        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(coco, f, indent=2)
        
        return coco
    
    def export_dataset(self,
                       frames_data: List[Dict],
                       output_dir: str,
                       format: str = 'pascal_voc',
                       include_3d: bool = True) -> Dict:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        if format == 'pascal_voc':
            annotations_dir = output_path / 'Annotations'
            images_dir = output_path / 'JPEGImages'
            annotations_dir.mkdir(exist_ok=True)
            images_dir.mkdir(exist_ok=True)
            
            for frame in frames_data:
                frame_id = frame.get('frame_id', 0)
                detections = frame.get('tracks', frame.get('detections', []))
                
                xml_filename = f"{frame_id:06d}.xml"
                xml_path = annotations_dir / xml_filename
                
                image_name = f"{frame_id:06d}.png"
                
                self.to_pascal_voc_xml(
                    detections,
                    image_name,
                    output_path=str(xml_path)
                )
            
            export_summary = {
                'format': 'PASCAL VOC',
                'num_frames': len(frames_data),
                'annotations_dir': str(annotations_dir),
                'images_dir': str(images_dir)
            }
        
        elif format == 'yolo':
            labels_dir = output_path / 'labels'
            images_dir = output_path / 'images'
            labels_dir.mkdir(exist_ok=True)
            images_dir.mkdir(exist_ok=True)
            
            for frame in frames_data:
                frame_id = frame.get('frame_id', 0)
                detections = frame.get('tracks', frame.get('detections', []))
                
                txt_filename = f"{frame_id:06d}.txt"
                txt_path = labels_dir / txt_filename
                
                self.to_yolo_format(
                    detections,
                    output_path=str(txt_path)
                )
            
            export_summary = {
                'format': 'YOLO',
                'num_frames': len(frames_data),
                'labels_dir': str(labels_dir),
                'images_dir': str(images_dir)
            }
        
        elif format == 'kitti':
            labels_dir = output_path / 'label_2'
            labels_dir.mkdir(exist_ok=True)
            
            for frame in frames_data:
                frame_id = frame.get('frame_id', 0)
                detections = frame.get('tracks', frame.get('detections', []))
                
                txt_filename = f"{frame_id:06d}.txt"
                txt_path = labels_dir / txt_filename
                
                self.to_kitti_format(
                    detections,
                    frame_id=frame_id,
                    output_path=str(txt_path)
                )
            
            export_summary = {
                'format': 'KITTI',
                'num_frames': len(frames_data),
                'labels_dir': str(labels_dir)
            }
        
        elif format == 'coco':
            all_detections = {}
            for frame in frames_data:
                frame_id = frame.get('frame_id', 0)
                detections = frame.get('tracks', frame.get('detections', []))
                all_detections[f"{frame_id:06d}.png"] = detections
            
            json_path = output_path / 'annotations.json'
            self.to_coco_json(all_detections, output_path=str(json_path))
            
            export_summary = {
                'format': 'COCO',
                'num_frames': len(frames_data),
                'annotations_file': str(json_path)
            }
        
        else:
            raise ValueError(f"Unsupported format: {format}")
        
        summary_path = output_path / 'export_summary.json'
        with open(summary_path, 'w') as f:
            json.dump(export_summary, f, indent=2)
        
        return export_summary

exporter = LabelExporter()
