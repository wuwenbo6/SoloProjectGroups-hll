import numpy as np
import open3d as o3d
import os
from config import Config
from typing import Tuple, Dict, List

class PointCloudProcessor:
    def __init__(self):
        self.ground_threshold = 0.3
        self.max_distance = 80.0
        self.far_distance_threshold = 50.0
        self.mid_distance_threshold = 30.0
    
    def load_pcd(self, file_path: str) -> np.ndarray:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        ext = os.path.splitext(file_path)[1].lower()
        
        if ext == '.pcd':
            pcd = o3d.io.read_point_cloud(file_path)
            points = np.asarray(pcd.points, dtype=np.float32)
            
            if pcd.has_colors():
                colors = np.asarray(pcd.colors, dtype=np.float32)
                points = np.hstack([points, colors])
            return points
        
        elif ext == '.bin':
            points = np.fromfile(file_path, dtype=np.float32)
            points = points.reshape(-1, 4)
            return points
        
        else:
            raise ValueError(f"Unsupported file format: {ext}")
    
    def remove_ground_ransac(self, points: np.ndarray, 
                           distance_threshold: float = 0.3,
                           ransac_n: int = 3,
                           num_iterations: int = 1000) -> Tuple[np.ndarray, np.ndarray]:
        if points.shape[1] > 3:
            xyz = points[:, :3]
            extra = points[:, 3:]
        else:
            xyz = points
            extra = None
        
        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(xyz)
        
        plane_model, inliers = pcd.segment_plane(
            distance_threshold=distance_threshold,
            ransac_n=ransac_n,
            num_iterations=num_iterations
        )
        
        inlier_indices = np.array(inliers)
        outlier_indices = np.setdiff1d(np.arange(xyz.shape[0]), inlier_indices)
        
        non_ground = xyz[outlier_indices]
        ground = xyz[inlier_indices]
        
        if extra is not None:
            non_ground = np.hstack([non_ground, extra[outlier_indices]])
            ground = np.hstack([ground, extra[inlier_indices]])
        
        return non_ground, ground, plane_model
    
    def remove_ground_simple(self, points: np.ndarray, 
                            ground_height: float = None,
                            height_threshold: float = 0.2) -> Tuple[np.ndarray, np.ndarray]:
        if points.shape[1] > 3:
            xyz = points[:, :3]
            extra = points[:, 3:]
        else:
            xyz = points
            extra = None
        
        if ground_height is None:
            height_percentile = np.percentile(xyz[:, 1], 10)
            ground_height = height_percentile
        
        ground_mask = xyz[:, 1] < (ground_height + height_threshold)
        non_ground_mask = ~ground_mask
        
        non_ground = xyz[non_ground_mask]
        ground = xyz[ground_mask]
        
        if extra is not None:
            non_ground = np.hstack([non_ground, extra[non_ground_mask]])
            ground = np.hstack([ground, extra[ground_mask]])
        
        return non_ground, ground, ground_height
    
    def calculate_point_density(self, points: np.ndarray, 
                                radius: float = 1.0) -> np.ndarray:
        if points.shape[1] > 3:
            xyz = points[:, :3]
        else:
            xyz = points
        
        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(xyz)
        
        kdtree = o3d.geometry.KDTreeFlann(pcd)
        
        densities = np.zeros(xyz.shape[0])
        for i in range(xyz.shape[0]):
            [k, _, _] = kdtree.search_radius_vector_3d(xyz[i], radius)
            densities[i] = k
        
        return densities
    
    def split_by_distance(self, points: np.ndarray, 
                          origin: np.ndarray = None) -> Dict[str, np.ndarray]:
        if points.shape[1] > 3:
            xyz = points[:, :3]
            extra = points[:, 3:]
        else:
            xyz = points
            extra = None
        
        if origin is None:
            origin = np.array([0, 0, 0])
        
        distances = np.sqrt(np.sum((xyz[:, [0, 2]] - origin[[0, 2]]) ** 2, axis=1))
        
        near_mask = distances <= self.mid_distance_threshold
        mid_mask = (distances > self.mid_distance_threshold) & (distances <= self.far_distance_threshold)
        far_mask = distances > self.far_distance_threshold
        
        result = {}
        
        if extra is not None:
            result['near'] = np.hstack([xyz[near_mask], extra[near_mask]])
            result['mid'] = np.hstack([xyz[mid_mask], extra[mid_mask]])
            result['far'] = np.hstack([xyz[far_mask], extra[far_mask]])
        else:
            result['near'] = xyz[near_mask]
            result['mid'] = xyz[mid_mask]
            result['far'] = xyz[far_mask]
        
        result['near_count'] = np.sum(near_mask)
        result['mid_count'] = np.sum(mid_mask)
        result['far_count'] = np.sum(far_mask)
        
        return result
    
    def enhance_sparse_points(self, points: np.ndarray, 
                              density_threshold: int = 10,
                              augment_ratio: float = 2.0) -> np.ndarray:
        if len(points) == 0:
            return points
        
        if points.shape[1] > 3:
            xyz = points[:, :3]
            extra = points[:, 3:]
        else:
            xyz = points
            extra = None
        
        if len(xyz) < 50:
            if augment_ratio > 1:
                num_augment = int(len(xyz) * (augment_ratio - 1))
                if num_augment > 0 and len(xyz) > 0:
                    indices = np.random.choice(len(xyz), num_augment, replace=True)
                    noise = np.random.normal(0, 0.05, (num_augment, 3))
                    augmented = xyz[indices] + noise
                    
                    if extra is not None:
                        xyz_enhanced = np.vstack([xyz, augmented])
                        extra_enhanced = np.vstack([extra, extra[indices]])
                        return np.hstack([xyz_enhanced, extra_enhanced])
                    else:
                        return np.vstack([xyz, augmented])
        
        return points
    
    def multi_scale_detection_preprocess(self, points: np.ndarray,
                                         num_points: int = 16384,
                                         remove_ground: bool = True) -> Dict[str, np.ndarray]:
        result = {}
        
        non_ground = points
        ground_points = None
        plane_model = None
        
        if remove_ground:
            try:
                non_ground, ground_points, plane_model = self.remove_ground_ransac(
                    points, 
                    distance_threshold=self.ground_threshold
                )
                result['ground_removed'] = True
                result['ground_count'] = len(ground_points)
            except Exception as e:
                print(f"RANSAC ground removal failed, using simple method: {e}")
                non_ground, ground_points, _ = self.remove_ground_simple(points)
                result['ground_removed'] = True
                result['ground_count'] = len(ground_points)
        
        result['non_ground'] = non_ground
        
        split_result = self.split_by_distance(non_ground)
        result.update(split_result)
        
        processed_regions = {}
        for region in ['near', 'mid', 'far']:
            region_points = split_result[region]
            if len(region_points) > 0:
                if region == 'far':
                    region_points = self.enhance_sparse_points(
                        region_points, 
                        augment_ratio=3.0
                    )
                processed_regions[region] = self.preprocess_single(region_points, num_points // 3)
            else:
                processed_regions[region] = np.zeros((num_points // 3, 3), dtype=np.float32)
        
        result['processed_combined'] = np.vstack([
            processed_regions['near'],
            processed_regions['mid'],
            processed_regions['far']
        ])
        
        result['processed_full'] = self.preprocess_single(non_ground, num_points)
        
        return result
    
    def preprocess_single(self, points: np.ndarray, num_points: int = 16384) -> np.ndarray:
        if len(points.shape) == 1:
            points = points.reshape(-1, 3)
        
        if points.shape[1] > 3:
            xyz = points[:, :3]
        else:
            xyz = points
        
        centroid = np.mean(xyz, axis=0)
        xyz_centered = xyz - centroid
        
        max_dist = np.max(np.sqrt(np.sum(xyz_centered ** 2, axis=1)))
        if max_dist > 0:
            xyz_normalized = xyz_centered / max_dist
        else:
            xyz_normalized = xyz_centered
        
        if xyz_normalized.shape[0] > num_points:
            indices = np.random.choice(xyz_normalized.shape[0], num_points, replace=False)
            xyz_sampled = xyz_normalized[indices]
        elif xyz_normalized.shape[0] < num_points:
            if xyz_normalized.shape[0] > 0:
                indices = np.random.choice(xyz_normalized.shape[0], num_points - xyz_normalized.shape[0], replace=True)
                xyz_sampled = np.vstack([xyz_normalized, xyz_normalized[indices]])
            else:
                xyz_sampled = np.zeros((num_points, 3), dtype=np.float32)
        else:
            xyz_sampled = xyz_normalized
        
        return xyz_sampled.astype(np.float32)
    
    def preprocess(self, points: np.ndarray, num_points: int = 16384) -> np.ndarray:
        non_ground, _, _ = self.remove_ground_ransac(
            points, 
            distance_threshold=self.ground_threshold
        )
        return self.preprocess_single(non_ground, num_points)
    
    def to_kitti_format(self, points: np.ndarray) -> np.ndarray:
        if points.shape[1] == 3:
            reflectance = np.zeros((points.shape[0], 1), dtype=np.float32)
            points = np.hstack([points, reflectance])
        return points.astype(np.float32)
    
    def get_point_cloud_info(self, file_path: str) -> dict:
        try:
            points = self.load_pcd(file_path)
            return {
                'point_count': points.shape[0],
                'dimensions': points.shape[1],
                'min_bounds': np.min(points[:, :3], axis=0).tolist(),
                'max_bounds': np.max(points[:, :3], axis=0).tolist()
            }
        except Exception as e:
            return {'error': str(e)}
    
    def downsample(self, points: np.ndarray, voxel_size: float = 0.1) -> np.ndarray:
        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(points[:, :3])
        downsampled = pcd.voxel_down_sample(voxel_size=voxel_size)
        return np.asarray(downsampled.points, dtype=np.float32)
    
    def remove_outliers(self, points: np.ndarray, nb_neighbors: int = 20, std_ratio: float = 2.0) -> np.ndarray:
        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(points[:, :3])
        cl, ind = pcd.remove_statistical_outlier(nb_neighbors=nb_neighbors, std_ratio=std_ratio)
        return points[ind]
    
    def serialize_points(self, points: np.ndarray) -> list:
        return points.flatten().tolist()

processor = PointCloudProcessor()
