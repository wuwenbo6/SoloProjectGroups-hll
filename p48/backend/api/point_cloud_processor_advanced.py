import numpy as np
from collections import deque, defaultdict
import open3d as o3d


class RobustGroundSegmentation:
    def __init__(self, 
                 distance_threshold=0.03,
                 normal_threshold=0.1,
                 ransac_n=3,
                 num_iterations=1500,
                 use_normal_constraint=True,
                 ground_normal=(0, 0, 1),
                 max_inclination_angle=30):
        self.distance_threshold = distance_threshold
        self.normal_threshold = normal_threshold
        self.ransac_n = ransac_n
        self.num_iterations = num_iterations
        self.use_normal_constraint = use_normal_constraint
        self.ground_normal = np.array(ground_normal, dtype=np.float64)
        self.max_inclination_angle = max_inclination_angle

    def segment(self, pcd):
        points = np.asarray(pcd.points)
        if len(points) < 100:
            return None, pcd, pcd

        pcd_denoised = self._remove_outliers(pcd)
        
        plane_model, inliers = self._detect_ground_plane(pcd_denoised)
        
        if plane_model is None:
            plane_model, inliers = self._fallback_detection(pcd_denoised)

        ground_cloud = pcd.select_by_index(inliers)
        objects_cloud = pcd.select_by_index(inliers, invert=True)

        return plane_model, ground_cloud, objects_cloud

    def _remove_outliers(self, pcd, nb_neighbors=20, std_ratio=2.0):
        if len(np.asarray(pcd.points)) < nb_neighbors + 10:
            return pcd
        cl, _ = pcd.remove_statistical_outlier(
            nb_neighbors=nb_neighbors, std_ratio=std_ratio)
        return cl

    def _detect_ground_plane(self, pcd):
        points = np.asarray(pcd.points)
        if len(points) < 100:
            return None, []

        try:
            plane_model, inliers = pcd.segment_plane(
                distance_threshold=self.distance_threshold,
                ransac_n=self.ransac_n,
                num_iterations=self.num_iterations
            )

            if self.use_normal_constraint:
                plane_normal = plane_model[:3]
                plane_normal = plane_normal / np.linalg.norm(plane_normal)
                
                angle = np.arccos(np.abs(np.dot(plane_normal, self.ground_normal)))
                max_angle_rad = np.radians(self.max_inclination_angle)

                if angle > max_angle_rad:
                    return None, []

            return plane_model, inliers
        except Exception:
            return None, []

    def _fallback_detection(self, pcd):
        points = np.asarray(pcd.points)
        
        z_values = points[:, 2]
        z_sorted = np.sort(z_values)
        n = len(z_sorted)
        lower_z = z_sorted[:max(10, int(n * 0.3))]
        z_threshold = np.mean(lower_z) + self.distance_threshold * 3

        inliers = np.where(points[:, 2] <= z_threshold)[0]
        
        if len(inliers) > 10:
            ground_points = points[inliers]
            centroid = np.mean(ground_points, axis=0)
            plane_model = np.array([0, 0, 1, -centroid[2]])
            return plane_model, inliers.tolist()

        return np.array([0, 0, 1, 0]), list(range(min(100, len(points))))


class PileTracker:
    def __init__(self, max_history=10, distance_threshold=0.3):
        self.max_history = max_history
        self.distance_threshold = distance_threshold
        self.piles_history = defaultdict(lambda: deque(maxlen=max_history))
        self.next_pile_id = 0
        self.active_piles = {}
        self.frame_count = 0

    def track_piles(self, current_piles):
        self.frame_count += 1
        matched_piles = {}
        unmatched_detections = list(range(len(current_piles)))
        unmatched_tracks = list(self.active_piles.keys())

        costs = np.zeros((len(current_piles), len(unmatched_tracks)))
        for i, pile in enumerate(current_piles):
            centroid_i = np.array([pile['centroid_x'], pile['centroid_y'], pile['centroid_z']])
            for j, track_id in enumerate(unmatched_tracks):
                track = self.active_piles[track_id]
                centroid_j = np.array([track['centroid_x'], track['centroid_y'], track['centroid_z']])
                costs[i, j] = np.linalg.norm(centroid_i - centroid_j)

        while len(unmatched_detections) > 0 and len(unmatched_tracks) > 0:
            min_idx = np.unravel_index(np.argmin(costs), costs.shape)
            min_cost = costs[min_idx]

            if min_cost > self.distance_threshold:
                break

            det_idx = min_idx[0]
            track_idx = min_idx[1]
            pile_idx = unmatched_detections[det_idx]
            track_id = unmatched_tracks[track_idx]

            matched_piles[track_id] = current_piles[pile_idx]

            unmatched_detections.pop(det_idx)
            unmatched_tracks.pop(track_idx)
            costs = np.delete(costs, det_idx, axis=0)
            costs = np.delete(costs, track_idx, axis=1)

        for pile_idx in unmatched_detections:
            new_id = self.next_pile_id
            self.next_pile_id += 1
            matched_piles[new_id] = current_piles[pile_idx]

        self.active_piles = matched_piles

        result = []
        for track_id, pile in matched_piles.items():
            self.piles_history[track_id].append(pile)
            
            smoothed_pile = self._smooth_pile(track_id)
            smoothed_pile['track_id'] = track_id
            result.append(smoothed_pile)

        return result

    def _smooth_pile(self, track_id):
        history = list(self.piles_history[track_id])
        if len(history) == 0:
            return {}

        weights = np.linspace(0.5, 1.0, len(history))
        weights = weights / np.sum(weights)

        volumes = np.array([p['volume'] for p in history])
        centroids_x = np.array([p['centroid_x'] for p in history])
        centroids_y = np.array([p['centroid_y'] for p in history])
        centroids_z = np.array([p['centroid_z'] for p in history])

        smoothed = {
            'id': history[-1]['id'],
            'volume': float(np.sum(volumes * weights)),
            'centroid_x': float(np.sum(centroids_x * weights)),
            'centroid_y': float(np.sum(centroids_y * weights)),
            'centroid_z': float(np.sum(centroids_z * weights)),
            'points': history[-1].get('points', []),
            'history_count': len(history)
        }

        return smoothed

    def get_smoothed_volumes(self):
        result = []
        for track_id in self.active_piles.keys():
            smoothed = self._smooth_pile(track_id)
            smoothed['track_id'] = track_id
            result.append(smoothed)
        return result

    def reset(self):
        self.piles_history.clear()
        self.active_piles.clear()
        self.next_pile_id = 0
        self.frame_count = 0


class KalmanFilter1D:
    def __init__(self, process_noise=0.01, measurement_noise=0.1, estimation_error=1.0):
        self.Q = process_noise
        self.R = measurement_noise
        self.P = estimation_error
        self.x = 0.0
        self.initialized = False

    def update(self, measurement):
        if not self.initialized:
            self.x = measurement
            self.initialized = True
            return self.x

        self.P = self.P + self.Q
        K = self.P / (self.P + self.R)
        self.x = self.x + K * (measurement - self.x)
        self.P = (1 - K) * self.P
        return self.x

    def get_value(self):
        return self.x


class VolumeSmoother:
    def __init__(self, 
                 method='ema',
                 window_size=10,
                 alpha=0.3,
                 process_noise=0.005,
                 measurement_noise=0.08):
        self.method = method
        self.window_size = window_size
        self.alpha = alpha
        self.process_noise = process_noise
        self.measurement_noise = measurement_noise
        
        self.volume_history = defaultdict(lambda: deque(maxlen=window_size))
        self.kalman_filters = defaultdict(lambda: KalmanFilter1D(
            process_noise=process_noise,
            measurement_noise=measurement_noise
        ))
        self.ema_values = {}

    def smooth(self, piles):
        smoothed_piles = []
        
        for pile in piles:
            pile_id = pile.get('track_id', pile['id'])
            volume = pile['volume']
            
            if self.method == 'moving_average':
                smoothed_volume = self._moving_average(pile_id, volume)
            elif self.method == 'ema':
                smoothed_volume = self._ema(pile_id, volume)
            elif self.method == 'kalman':
                smoothed_volume = self._kalman(pile_id, volume)
            else:
                smoothed_volume = volume

            smoothed_pile = pile.copy()
            smoothed_pile['raw_volume'] = volume
            smoothed_pile['volume'] = smoothed_volume
            smoothed_piles.append(smoothed_pile)

        return smoothed_piles

    def _moving_average(self, pile_id, volume):
        self.volume_history[pile_id].append(volume)
        return float(np.mean(self.volume_history[pile_id]))

    def _ema(self, pile_id, volume):
        if pile_id not in self.ema_values:
            self.ema_values[pile_id] = volume
        else:
            self.ema_values[pile_id] = (
                self.alpha * volume + 
                (1 - self.alpha) * self.ema_values[pile_id]
            )
        return self.ema_values[pile_id]

    def _kalman(self, pile_id, volume):
        return self.kalman_filters[pile_id].update(volume)

    def reset(self):
        self.volume_history.clear()
        self.kalman_filters.clear()
        self.ema_values.clear()


class AdvancedPointCloudProcessor:
    def __init__(self, 
                 enable_tracking=True,
                 enable_smoothing=True,
                 smoothing_method='ema',
                 smoothing_window=10,
                 ground_distance_threshold=0.03,
                 cluster_eps=0.05,
                 min_cluster_points=50,
                 max_inclination_angle=30):
        
        self.ground_segmenter = RobustGroundSegmentation(
            distance_threshold=ground_distance_threshold,
            max_inclination_angle=max_inclination_angle
        )
        
        self.pile_tracker = PileTracker(
            max_history=smoothing_window,
            distance_threshold=0.3
        ) if enable_tracking else None
        
        self.volume_smoother = VolumeSmoother(
            method=smoothing_method,
            window_size=smoothing_window
        ) if enable_smoothing else None
        
        self.cluster_eps = cluster_eps
        self.min_cluster_points = min_cluster_points
        self.enable_tracking = enable_tracking
        self.enable_smoothing = enable_smoothing

    def process(self, pcd):
        plane_model, ground_cloud, objects_cloud = self.ground_segmenter.segment(pcd)

        piles = self._segment_piles(objects_cloud, plane_model)

        if self.enable_tracking:
            piles = self.pile_tracker.track_piles(piles)

        if self.enable_smoothing:
            piles = self.volume_smoother.smooth(piles)

        result = {
            'piles': piles,
            'total_piles': len(piles),
            'total_volume': sum(p['volume'] for p in piles),
            'ground_plane': plane_model.tolist() if plane_model is not None else None,
            'ground_points': np.asarray(ground_cloud.points).tolist()
        }

        for pile in result['piles']:
            if 'points' in pile:
                pile.pop('points')

        result['pile_clouds'] = [p['points'] for p in piles if 'points' in p]

        return result

    def _segment_piles(self, objects_cloud, plane_model):
        piles = []
        
        points = np.asarray(objects_cloud.points)
        if len(points) < self.min_cluster_points:
            return piles

        try:
            labels = np.array(objects_cloud.cluster_dbscan(
                eps=self.cluster_eps,
                min_points=self.min_cluster_points
            ))
        except Exception:
            return piles

        max_label = labels.max() if len(labels) > 0 else -1

        for i in range(max_label + 1):
            pile_indices = np.where(labels == i)[0]
            if len(pile_indices) < self.min_cluster_points:
                continue

            pile_cloud = objects_cloud.select_by_index(pile_indices)
            pile_points = np.asarray(pile_cloud.points)

            volume = self._calculate_volume(pile_points, plane_model)
            centroid = pile_points.mean(axis=0)

            piles.append({
                'id': i,
                'volume': float(volume),
                'centroid_x': float(centroid[0]),
                'centroid_y': float(centroid[1]),
                'centroid_z': float(centroid[2]),
                'points': pile_points.tolist()
            })

        return piles

    def _calculate_volume(self, points, plane_model):
        if plane_model is None or len(plane_model) < 4:
            return self._convex_hull_volume(points)

        a, b, c, d = plane_model
        normal_norm = np.sqrt(a**2 + b**2 + c**2)

        if normal_norm < 1e-6:
            return self._convex_hull_volume(points)

        heights = np.abs(a * points[:, 0] + b * points[:, 1] + c * points[:, 2] + d) / normal_norm

        min_x, max_x = points[:, 0].min(), points[:, 0].max()
        min_y, max_y = points[:, 1].min(), points[:, 1].max()
        area = (max_x - min_x) * (max_y - min_y)

        median_height = np.median(heights)
        volume = area * median_height * 0.55

        return max(0, volume)

    def _convex_hull_volume(self, points):
        try:
            hull = o3d.geometry.TriangleMesh.create_from_point_cloud_alpha_shape(
                o3d.geometry.PointCloud(o3d.utility.Vector3dVector(points)),
                alpha=0.1
            )
            hull.compute_vertex_normals()
            return hull.get_volume() if hasattr(hull, 'get_volume') else 0
        except Exception:
            return 0

    def reset_tracking(self):
        if self.pile_tracker:
            self.pile_tracker.reset()
        if self.volume_smoother:
            self.volume_smoother.reset()
