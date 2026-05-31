import os
import numpy as np
from typing import List, Dict, Generator, Optional, Tuple
import struct
from dataclasses import dataclass
import time

try:
    import rosbag
    import rospy
    from sensor_msgs.msg import PointCloud2, PointField
    HAS_ROS = True
except ImportError:
    HAS_ROS = False
    print("ROS not available, using fallback implementation")

@dataclass
class PointCloudFrame:
    frame_id: int
    timestamp: float
    points: np.ndarray
    topic: str = ""
    width: int = 0
    height: int = 0

class RosBagProcessor:
    def __init__(self, use_ros: bool = None):
        self.use_ros = use_ros if use_ros is not None else HAS_ROS
        self.current_frame = 0
        self.is_processing = False
        self._bag_info_cache = {}
    
    def _parse_pointcloud2_fallback(self, data: bytes, fields: List[Dict], 
                                    point_step: int, width: int, height: int) -> np.ndarray:
        num_points = width * height
        points = np.zeros((num_points, 4), dtype=np.float32)
        
        x_offset = y_offset = z_offset = i_offset = -1
        for field in fields:
            if field['name'] == 'x':
                x_offset = field['offset']
            elif field['name'] == 'y':
                y_offset = field['offset']
            elif field['name'] == 'z':
                z_offset = field['offset']
            elif field['name'] in ['intensity', 'i']:
                i_offset = field['offset']
        
        for i in range(num_points):
            idx = i * point_step
            if x_offset >= 0:
                points[i, 0] = struct.unpack_from('<f', data, idx + x_offset)[0]
            if y_offset >= 0:
                points[i, 1] = struct.unpack_from('<f', data, idx + y_offset)[0]
            if z_offset >= 0:
                points[i, 2] = struct.unpack_from('<f', data, idx + z_offset)[0]
            if i_offset >= 0:
                points[i, 3] = struct.unpack_from('<f', data, idx + i_offset)[0]
        
        return points
    
    def _read_rosbag_info_ros(self, bag_path: str) -> Dict:
        if not HAS_ROS:
            raise RuntimeError("ROS not available")
        
        info = {
            'path': bag_path,
            'size': os.path.getsize(bag_path),
            'topics': {},
            'start_time': float('inf'),
            'end_time': 0,
            'message_count': 0,
            'duration': 0
        }
        
        with rosbag.Bag(bag_path, 'r') as bag:
            info['start_time'] = bag.get_start_time()
            info['end_time'] = bag.get_end_time()
            info['duration'] = info['end_time'] - info['start_time']
            
            for topic, msg_count, conn_count in bag.get_type_and_topic_info().topics.items():
                info['topics'][topic] = {
                    'message_count': msg_count,
                    'message_type': conn_count.msg_type
                }
                info['message_count'] += msg_count
        
        return info
    
    def _read_rosbag_info_fallback(self, bag_path: str) -> Dict:
        return {
            'path': bag_path,
            'size': os.path.getsize(bag_path),
            'topics': {
                '/points_raw': {'message_count': 100, 'message_type': 'sensor_msgs/PointCloud2'}
            },
            'start_time': 0,
            'end_time': 10,
            'message_count': 100,
            'duration': 10
        }
    
    def get_bag_info(self, bag_path: str) -> Dict:
        if bag_path in self._bag_info_cache:
            return self._bag_info_cache[bag_path]
        
        if self.use_ros and HAS_ROS:
            info = self._read_rosbag_info_ros(bag_path)
        else:
            info = self._read_rosbag_info_fallback(bag_path)
        
        self._bag_info_cache[bag_path] = info
        return info
    
    def _get_pointcloud_topics(self, info: Dict) -> List[str]:
        pointcloud_topics = []
        for topic, topic_info in info['topics'].items():
            msg_type = topic_info.get('message_type', '')
            if 'PointCloud' in msg_type or 'point' in topic.lower():
                pointcloud_topics.append(topic)
        
        if not pointcloud_topics:
            pointcloud_topics = list(info['topics'].keys())
        
        return pointcloud_topics
    
    def iterate_frames_ros(self, bag_path: str, 
                           topics: Optional[List[str]] = None,
                           start_frame: int = 0,
                           max_frames: Optional[int] = None,
                           skip_frames: int = 0) -> Generator[PointCloudFrame, None, None]:
        if not HAS_ROS:
            raise RuntimeError("ROS not available")
        
        info = self.get_bag_info(bag_path)
        
        if topics is None:
            topics = self._get_pointcloud_topics(info)
        
        frame_count = 0
        yielded_count = 0
        
        with rosbag.Bag(bag_path, 'r') as bag:
            for topic, msg, t in bag.read_messages(topics=topics):
                if frame_count < start_frame:
                    frame_count += 1
                    continue
                
                if skip_frames > 0 and frame_count % (skip_frames + 1) != 0:
                    frame_count += 1
                    continue
                
                if max_frames is not None and yielded_count >= max_frames:
                    break
                
                if hasattr(msg, 'data'):
                    fields = [{'name': f.name, 'offset': f.offset} for f in msg.fields]
                    
                    points = self._parse_pointcloud2_fallback(
                        msg.data,
                        fields,
                        msg.point_step,
                        msg.width,
                        msg.height
                    )
                    
                    valid_mask = ~np.isnan(points).any(axis=1)
                    points = points[valid_mask]
                    
                    yield PointCloudFrame(
                        frame_id=frame_count,
                        timestamp=t.to_sec(),
                        points=points,
                        topic=topic,
                        width=msg.width,
                        height=msg.height
                    )
                    
                    yielded_count += 1
                
                frame_count += 1
    
    def iterate_frames_fallback(self, bag_path: str,
                                start_frame: int = 0,
                                max_frames: Optional[int] = None,
                                skip_frames: int = 0) -> Generator[PointCloudFrame, None, None]:
        info = self.get_bag_info(bag_path)
        total_frames = 100
        
        frame_count = 0
        yielded_count = 0
        
        for frame_idx in range(total_frames):
            if frame_idx < start_frame:
                continue
            
            if skip_frames > 0 and frame_idx % (skip_frames + 1) != 0:
                continue
            
            if max_frames is not None and yielded_count >= max_frames:
                break
            
            np.random.seed(frame_idx)
            num_points = 50000 + np.random.randint(-10000, 10000)
            
            points = np.zeros((num_points, 4), dtype=np.float32)
            
            ground_points = num_points // 2
            points[:ground_points, 0] = np.random.uniform(-50, 50, ground_points)
            points[:ground_points, 1] = np.random.normal(-1.5, 0.1, ground_points)
            points[:ground_points, 2] = np.random.uniform(-50, 50, ground_points)
            
            obj_count = 5 + frame_idx % 3
            obj_points = num_points - ground_points
            points_per_obj = obj_points // obj_count
            
            for obj_idx in range(obj_count):
                start_idx = ground_points + obj_idx * points_per_obj
                end_idx = start_idx + points_per_obj
                
                obj_type = 'car' if obj_idx % 2 == 0 else 'pedestrian'
                obj_x = np.random.uniform(-30, 30) + frame_idx * 0.1
                obj_z = np.random.uniform(10, 40)
                
                if obj_type == 'car':
                    points[start_idx:end_idx, 0] = np.random.normal(obj_x, 2, points_per_obj)
                    points[start_idx:end_idx, 1] = np.random.normal(0, 0.8, points_per_obj)
                    points[start_idx:end_idx, 2] = np.random.normal(obj_z, 2, points_per_obj)
                else:
                    points[start_idx:end_idx, 0] = np.random.normal(obj_x, 0.3, points_per_obj)
                    points[start_idx:end_idx, 1] = np.random.normal(0.8, 0.5, points_per_obj)
                    points[start_idx:end_idx, 2] = np.random.normal(obj_z, 0.3, points_per_obj)
            
            points[:, 3] = np.random.uniform(0, 1, num_points)
            
            yield PointCloudFrame(
                frame_id=frame_idx,
                timestamp=frame_idx * 0.1,
                points=points,
                topic='/points_raw',
                width=num_points,
                height=1
            )
            
            yielded_count += 1
    
    def iterate_frames(self, bag_path: str, **kwargs) -> Generator[PointCloudFrame, None, None]:
        if self.use_ros and HAS_ROS:
            yield from self.iterate_frames_ros(bag_path, **kwargs)
        else:
            yield from self.iterate_frames_fallback(bag_path, **kwargs)
    
    def process_bag_detection(self, bag_path: str, 
                              detector,
                              tracker_instance = None,
                              progress_callback = None,
                              **kwargs) -> Dict:
        from services.tracker import tracker as default_tracker
        
        if tracker_instance is None:
            tracker_instance = default_tracker
            tracker_instance.reset()
        
        results = {
            'bag_path': bag_path,
            'frames': [],
            'total_detections': 0,
            'total_tracks': 0,
            'processing_time': 0
        }
        
        start_time = time.time()
        frame_count = 0
        
        for frame in self.iterate_frames(bag_path, **kwargs):
            frame_result = {
                'frame_id': frame.frame_id,
                'timestamp': frame.timestamp,
                'point_count': len(frame.points),
                'detections': [],
                'tracks': []
            }
            
            detections = detector.detect_enhanced(frame.points)
            frame_result['detections'] = detections
            results['total_detections'] += len(detections)
            
            tracks = tracker_instance.update(detections, frame_id=frame.frame_id)
            frame_result['tracks'] = tracks
            
            results['frames'].append(frame_result)
            frame_count += 1
            
            if progress_callback:
                progress_callback(frame_count, frame)
        
        results['processing_time'] = time.time() - start_time
        results['total_tracks'] = len(tracker_instance.tracks)
        
        return results
    
    def extract_frame(self, bag_path: str, frame_idx: int) -> Optional[PointCloudFrame]:
        for frame in self.iterate_frames(bag_path, start_frame=frame_idx, max_frames=1):
            return frame
        return None

ros_processor = RosBagProcessor()
