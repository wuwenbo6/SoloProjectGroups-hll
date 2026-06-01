import open3d as o3d
import numpy as np
import json
import os
import copy
from typing import Tuple, Dict, List, Optional


class RegistrationResult:
    def __init__(self, transformation, fitness, inlier_rmse, correspondence_set_size,
                 stage=None, voxel_size=None):
        self.transformation = transformation
        self.fitness = fitness
        self.inlier_rmse = inlier_rmse
        self.correspondence_set_size = correspondence_set_size
        self.stage = stage
        self.voxel_size = voxel_size


class NDTRegistration:
    def __init__(self, voxel_size: float = 0.1, distance_threshold: float = 0.5,
                 max_iterations: int = 30, tolerance: float = 1e-6,
                 use_multi_scale: bool = True, min_fitness_threshold: float = 0.3,
                 max_registration_attempts: int = 5):
        self.voxel_size_coarse = voxel_size * 2.0
        self.voxel_size_medium = voxel_size
        self.voxel_size_fine = voxel_size * 0.5
        self.distance_threshold = distance_threshold
        self.max_iterations = max_iterations
        self.tolerance = tolerance
        self.use_multi_scale = use_multi_scale
        self.min_fitness_threshold = min_fitness_threshold
        self.max_registration_attempts = max_registration_attempts

        self.source = None
        self.target = None
        self.source_full = None
        self.target_full = None
        self.source_normals = None
        self.target_normals = None

        self.source_coarse = None
        self.target_coarse = None
        self.source_fpfh_coarse = None
        self.target_fpfh_coarse = None

        self.source_medium = None
        self.target_medium = None
        self.source_fpfh_medium = None
        self.target_fpfh_medium = None

        self.source_fine = None
        self.target_fine = None

        self.transformation = np.eye(4)
        self.fitness = 0.0
        self.inlier_rmse = 0.0
        self.correspondence_set_size = 0
        self.registration_history = []
        self.overlap_before = 0.0
        self.overlap_after = 0.0
        self.used_fallback = False
        self.warnings = []

    def load_point_cloud(self, file_path: str) -> o3d.geometry.PointCloud:
        ext = os.path.splitext(file_path)[1].lower()
        if ext == '.pcd':
            pcd = o3d.io.read_point_cloud(file_path)
        elif ext == '.ply':
            pcd = o3d.io.read_point_cloud(file_path)
        elif ext in ['.las', '.laz']:
            try:
                import laspy
                las = laspy.read(file_path)
                points = np.column_stack((las.x, las.y, las.z))
                pcd = o3d.geometry.PointCloud()
                pcd.points = o3d.utility.Vector3dVector(points)
                if hasattr(las, 'red') and hasattr(las, 'green') and hasattr(las, 'blue'):
                    colors = np.column_stack((las.red, las.green, las.blue)).astype(np.float64) / 65535.0
                    pcd.colors = o3d.utility.Vector3dVector(colors)
            except ImportError:
                raise ImportError("laspy is required for LAS/LAZ files: pip install laspy")
        else:
            pcd = o3d.io.read_point_cloud(file_path)
        return pcd

    def _estimate_point_density(self, pcd: o3d.geometry.PointCloud, sample_size: int = 1000) -> float:
        points = np.asarray(pcd.points)
        if len(points) < sample_size:
            sample_size = len(points)
        indices = np.random.choice(len(points), sample_size, replace=False)
        sample = points[indices]

        pcd_tree = o3d.geometry.KDTreeFlann(pcd)
        distances = []
        for pt in sample:
            [k, idx, dist] = pcd_tree.search_knn_vector_3d(pt, 2)
            if len(dist) > 1:
                distances.append(np.sqrt(dist[1]))

        return np.median(distances) if distances else 0.01

    def _adaptive_voxel_sizes(self, pcd: o3d.geometry.PointCloud, base_voxel: float):
        density = self._estimate_point_density(pcd)
        adaptive_coarse = max(base_voxel * 2.0, density * 3.0)
        adaptive_medium = max(base_voxel, density * 1.5)
        adaptive_fine = max(base_voxel * 0.5, density * 0.75)
        return adaptive_coarse, adaptive_medium, adaptive_fine

    def preprocess_multi_scale(self, source: o3d.geometry.PointCloud, target: o3d.geometry.PointCloud):
        self.source_full = source
        self.target_full = target

        coarse_v, medium_v, fine_v = self._adaptive_voxel_sizes(
            source, self.voxel_size_medium
        )
        self.voxel_size_coarse = coarse_v
        self.voxel_size_medium = medium_v
        self.voxel_size_fine = fine_v

        self.source_coarse, self.source_fpfh_coarse = self._preprocess_scale(
            source, self.voxel_size_coarse
        )
        self.target_coarse, self.target_fpfh_coarse = self._preprocess_scale(
            target, self.voxel_size_coarse
        )

        self.source_medium, self.source_fpfh_medium = self._preprocess_scale(
            source, self.voxel_size_medium
        )
        self.target_medium, self.target_fpfh_medium = self._preprocess_scale(
            target, self.voxel_size_medium
        )

        self.source_fine, _ = self._preprocess_scale(source, self.voxel_size_fine, compute_fpfh=False)
        self.target_fine, _ = self._preprocess_scale(target, self.voxel_size_fine, compute_fpfh=False)

        source_full_copy = copy.deepcopy(source)
        target_full_copy = copy.deepcopy(target)
        source_full_copy.estimate_normals(
            o3d.geometry.KDTreeSearchParamHybrid(radius=self.voxel_size_medium * 2, max_nn=30)
        )
        target_full_copy.estimate_normals(
            o3d.geometry.KDTreeSearchParamHybrid(radius=self.voxel_size_medium * 2, max_nn=30)
        )
        self.source_full = source_full_copy
        self.target_full = target_full_copy

        self.source = self.source_medium
        self.target = self.target_medium
        self.source_down = self.source_medium
        self.target_down = self.target_medium
        self.source_fpfh = self.source_fpfh_medium
        self.target_fpfh = self.target_fpfh_medium

    def _preprocess_scale(self, pcd: o3d.geometry.PointCloud, voxel_size: float,
                          compute_fpfh: bool = True) -> Tuple[o3d.geometry.PointCloud, Optional[o3d.pipelines.registration.Feature]]:
        pcd_down = pcd.voxel_down_sample(voxel_size)
        pcd_down.estimate_normals(
            o3d.geometry.KDTreeSearchParamHybrid(radius=voxel_size * 2, max_nn=30)
        )

        fpfh = None
        if compute_fpfh:
            fpfh = o3d.pipelines.registration.compute_fpfh_feature(
                pcd_down,
                o3d.geometry.KDTreeSearchParamHybrid(radius=voxel_size * 5, max_nn=100)
            )
        return pcd_down, fpfh

    def compute_overlap_ratio(self, source: o3d.geometry.PointCloud, target: o3d.geometry.PointCloud,
                              threshold: Optional[float] = None) -> float:
        if threshold is None:
            threshold = self.distance_threshold

        source_np = np.asarray(source.points)
        target_tree = o3d.geometry.KDTreeFlann(target)

        close_count = 0
        for pt in source_np:
            [k, idx, dist] = target_tree.search_radius_vector_3d(pt, threshold)
            if k > 0:
                close_count += 1

        return close_count / len(source_np) if len(source_np) > 0 else 0.0

    def global_registration_ransac(self, source_down, target_down, source_fpfh, target_fpfh,
                                   distance_threshold, max_iterations=None, edge_length_threshold=0.9):
        if max_iterations is None:
            max_iterations = self.max_iterations

        result = o3d.pipelines.registration.registration_ransac_based_on_feature_matching(
            source_down, target_down,
            source_fpfh, target_fpfh,
            mutual_filter=True,
            max_correspondence_distance=distance_threshold,
            estimation_method=o3d.pipelines.registration.TransformationEstimationPointToPoint(False),
            ransac_n=4,
            checkers=[
                o3d.pipelines.registration.CorrespondenceCheckerBasedOnEdgeLength(edge_length_threshold),
                o3d.pipelines.registration.CorrespondenceCheckerBasedOnDistance(distance_threshold)
            ],
            criteria=o3d.pipelines.registration.RANSACConvergenceCriteria(max_iterations * 3, 1e-6)
        )
        return result

    def fast_global_registration(self, source_down, target_down, source_fpfh, target_fpfh,
                                 distance_threshold):
        result = o3d.pipelines.registration.registration_fgr_based_on_feature_matching(
            source_down, target_down,
            source_fpfh, target_fpfh,
            o3d.pipelines.registration.FastGlobalRegistrationOption(
                maximum_correspondence_distance=distance_threshold,
                iteration_number=200,
                tuple_scale=0.95,
                maximum_tuple_count=1000
            )
        )
        return result

    def _evaluate_registration(self, source, target, transformation, distance_threshold=None):
        if distance_threshold is None:
            distance_threshold = self.distance_threshold

        source_tf = copy.deepcopy(source)
        source_tf.transform(transformation)

        evaluation = o3d.pipelines.registration.evaluate_registration(
            source_tf, target, distance_threshold
        )
        return evaluation

    def _icp_refine(self, source, target, init_transformation, distance_threshold,
                    max_iterations, use_point_to_plane=True):
        if use_point_to_plane and source.has_normals() and target.has_normals():
            estimation = o3d.pipelines.registration.TransformationEstimationPointToPlane()
        else:
            estimation = o3d.pipelines.registration.TransformationEstimationPointToPoint()

        result = o3d.pipelines.registration.registration_icp(
            source, target,
            distance_threshold, init_transformation,
            estimation,
            o3d.pipelines.registration.ICPConvergenceCriteria(
                max_iteration=max_iterations,
                relative_fitness=self.tolerance,
                relative_rmse=self.tolerance
            )
        )
        return result

    def _robust_icp_refine(self, source, target, init_transformation, distance_threshold,
                           max_iterations):
        result = o3d.pipelines.registration.registration_icp(
            source, target,
            distance_threshold, init_transformation,
            o3d.pipelines.registration.TransformationEstimationPointToPoint(),
            o3d.pipelines.registration.ICPConvergenceCriteria(
                max_iteration=max_iterations,
                relative_fitness=self.tolerance,
                relative_rmse=self.tolerance
            )
        )
        return result

    def multi_scale_registration(self) -> Dict:
        self.registration_history = []
        self.warnings = []

        self.overlap_before = self.compute_overlap_ratio(
            self.source_coarse, self.target_coarse, self.distance_threshold * 2
        )

        if self.overlap_before < 0.1:
            self.warnings.append(f"Low initial overlap detected: {self.overlap_before:.2%}. "
                                 f"Registration may fail or be inaccurate.")
        elif self.overlap_before < self.min_fitness_threshold:
            self.warnings.append(f"Moderate initial overlap: {self.overlap_before:.2%}. "
                                 f"Consider adding more overlapping regions.")

        best_global_result = None
        best_global_fitness = -1
        best_global_transformation = np.eye(4)

        ransac_attempts = [
            (self.voxel_size_coarse, self.distance_threshold * 3.0, 0.5, 300),
            (self.voxel_size_coarse, self.distance_threshold * 2.0, 0.7, 300),
            (self.voxel_size_coarse, self.distance_threshold * 1.5, 0.8, 500),
            (self.voxel_size_medium, self.distance_threshold, 0.9, 800),
            (self.voxel_size_coarse, self.distance_threshold * 2.0, 0.6, 1000),
        ]

        for attempt_idx, (vs, dist_thresh, edge_thresh, max_iter) in enumerate(ransac_attempts):
            if vs == self.voxel_size_coarse:
                src_down, tgt_down = self.source_coarse, self.target_coarse
                src_fpfh, tgt_fpfh = self.source_fpfh_coarse, self.target_fpfh_coarse
            else:
                src_down, tgt_down = self.source_medium, self.target_medium
                src_fpfh, tgt_fpfh = self.source_fpfh_medium, self.target_fpfh_medium

            try:
                result = self.global_registration_ransac(
                    src_down, tgt_down, src_fpfh, tgt_fpfh,
                    distance_threshold=dist_thresh,
                    max_iterations=max_iter,
                    edge_length_threshold=edge_thresh
                )

                if result.fitness > best_global_fitness:
                    best_global_fitness = result.fitness
                    best_global_result = result
                    best_global_transformation = result.transformation

                if result.fitness >= self.min_fitness_threshold:
                    break
            except Exception as e:
                continue

        used_fgr = False
        if best_global_fitness < self.min_fitness_threshold:
            self.warnings.append(f"RANSAC fitness low ({best_global_fitness:.4f}), trying Fast Global Registration...")
            try:
                fgr_attempts = [
                    self.distance_threshold * 3.0,
                    self.distance_threshold * 2.0,
                    self.distance_threshold * 1.5,
                ]
                for fgr_dist in fgr_attempts:
                    fgr_result = self.fast_global_registration(
                        self.source_coarse, self.target_coarse,
                        self.source_fpfh_coarse, self.target_fpfh_coarse,
                        fgr_dist
                    )
                    if fgr_result.fitness > best_global_fitness:
                        best_global_fitness = fgr_result.fitness
                        best_global_result = fgr_result
                        best_global_transformation = fgr_result.transformation
                        used_fgr = True
                    if fgr_result.fitness >= self.min_fitness_threshold:
                        break
                self.used_fallback = used_fgr
            except Exception as e:
                self.warnings.append(f"FGR also failed: {str(e)}")

        if best_global_result is None:
            self.warnings.append("All global registration methods failed. Using identity as initial guess.")
            best_global_result = o3d.pipelines.registration.RegistrationResult()
            best_global_result.transformation = np.eye(4)
            best_global_result.fitness = 0.0
            best_global_result.inlier_rmse = 0.0
            best_global_result.correspondence_set = o3d.utility.Vector2iVector()
            best_global_transformation = np.eye(4)

        if best_global_fitness < self.min_fitness_threshold:
            self.warnings.append(f"Global registration fitness is low ({best_global_fitness:.4f}). "
                                 f"Will try ICP from identity with relaxed parameters.")

        self.registration_history.append({
            'stage': 'global',
            'voxel_size': self.voxel_size_coarse,
            'fitness': best_global_fitness,
            'inlier_rmse': best_global_result.inlier_rmse if hasattr(best_global_result, 'inlier_rmse') else 0.0,
            'correspondence_set_size': len(best_global_result.correspondence_set),
            'transformation': best_global_transformation.tolist(),
            'method': 'FGR' if used_fgr else 'RANSAC'
        })

        candidate_transforms = [
            ('global_best', best_global_transformation, self.distance_threshold),
        ]

        if best_global_fitness < 0.5:
            candidate_transforms.append(('identity', np.eye(4), self.distance_threshold * 2.0))

        if self.overlap_before > 0.3:
            small_init = best_global_transformation.copy()
            small_init[0:3, 3] *= 0.5
            candidate_transforms.append(('conservative', small_init, self.distance_threshold * 1.5))

        best_refined_fitness = -1
        best_refined_transform = np.eye(4)
        best_refined_rmse = float('inf')
        best_refined_corr = 0
        best_refined_history = []

        for cand_name, cand_init, cand_dist in candidate_transforms:
            current_transform = cand_init.copy()
            cand_history = []

            refinement_stages = [
                ('medium', self.source_medium, self.target_medium, cand_dist * 1.2, self.max_iterations),
                ('fine', self.source_fine, self.target_fine, cand_dist * 0.8, self.max_iterations * 2),
                ('full_res', self.source_full, self.target_full, cand_dist * 0.6, self.max_iterations * 3),
            ]

            stage_prev_fitness = 0
            for stage_name, src, tgt, dist_thresh, max_iter in refinement_stages:
                for attempt in range(self.max_registration_attempts):
                    try:
                        refined = self._icp_refine(
                            src, tgt, current_transform,
                            distance_threshold=dist_thresh,
                            max_iterations=max_iter,
                            use_point_to_plane=True
                        )
                    except Exception:
                        refined = self._robust_icp_refine(
                            src, tgt, current_transform,
                            distance_threshold=dist_thresh,
                            max_iterations=max_iter
                        )

                    if refined.fitness <= stage_prev_fitness + 1e-6:
                        break
                    current_transform = refined.transformation
                    stage_prev_fitness = refined.fitness

                    if refined.fitness >= 0.95:
                        break

                eval_result = self._evaluate_registration(src, tgt, current_transform, dist_thresh)
                cand_history.append({
                    'stage': stage_name,
                    'voxel_size': 'full' if stage_name == 'full_res' else (
                        self.voxel_size_medium if stage_name == 'medium' else self.voxel_size_fine
                    ),
                    'fitness': eval_result.fitness,
                    'inlier_rmse': eval_result.inlier_rmse,
                    'correspondence_set_size': len(eval_result.correspondence_set),
                    'transformation': current_transform.tolist(),
                    'candidate': cand_name
                })

                if eval_result.fitness > best_refined_fitness:
                    best_refined_fitness = eval_result.fitness
                    best_refined_transform = current_transform.copy()
                    best_refined_rmse = eval_result.inlier_rmse
                    best_refined_corr = len(eval_result.correspondence_set)
                    best_refined_history = cand_history.copy()

        for entry in best_refined_history:
            self.registration_history.append(entry)

        final_eval = self._evaluate_registration(
            self.source_full, self.target_full, best_refined_transform, self.distance_threshold
        )

        source_tf = copy.deepcopy(self.source_full)
        source_tf.transform(best_refined_transform)
        self.overlap_after = self.compute_overlap_ratio(
            source_tf, self.target_full, self.distance_threshold
        )

        overlap_improvement = self.overlap_after - self.overlap_before

        if overlap_improvement < 0.01 and self.overlap_after < 0.5:
            self.warnings.append(f"Minimal overlap improvement ({overlap_improvement:.2%}). "
                                 f"Registration may have converged to local optimum. "
                                 f"Consider adjusting parameters or adding more control points.")
        elif overlap_improvement < -0.05:
            self.warnings.append(f"Overlap decreased by {(-overlap_improvement):.2%}). "
                                 f"Registration likely converged to wrong local optimum. "
                                 f"Try increasing distance_threshold or voxel_size.")

        self.transformation = best_refined_transform
        self.fitness = final_eval.fitness
        self.inlier_rmse = final_eval.inlier_rmse
        self.correspondence_set_size = len(final_eval.correspondence_set)

        self.source = self.source_full
        self.target = self.target_full
        self.source_down = self.source_medium
        self.target_down = self.target_medium

        return {
            'fitness': self.fitness,
            'inlier_rmse': self.inlier_rmse,
            'correspondence_set_size': self.correspondence_set_size,
            'transformation': self.transformation.tolist(),
            'source_points': len(self.source_full.points),
            'target_points': len(self.target_full.points),
            'overlap_before': self.overlap_before,
            'overlap_after': self.overlap_after,
            'registration_history': self.registration_history,
            'used_fallback': self.used_fallback,
            'warnings': self.warnings,
            'voxel_sizes': {
                'coarse': self.voxel_size_coarse,
                'medium': self.voxel_size_medium,
                'fine': self.voxel_size_fine
            }
        }

    def register(self, source_path: str, target_path: str, use_ndt: bool = True) -> Dict:
        source_raw = self.load_point_cloud(source_path)
        target_raw = self.load_point_cloud(target_path)

        if self.use_multi_scale:
            self.preprocess_multi_scale(source_raw, target_raw)
            return self.multi_scale_registration()
        else:
            self.source = source_raw
            self.target = target_raw
            self.source_full = source_raw
            self.target_full = target_raw

            self.source_down, self.source_fpfh = self._preprocess_scale(
                source_raw, self.voxel_size_medium
            )
            self.target_down, self.target_fpfh = self._preprocess_scale(
                target_raw, self.voxel_size_medium
            )

            ransac_result = self.global_registration_ransac(
                self.source_down, self.target_down,
                self.source_fpfh, self.target_fpfh,
                distance_threshold=self.distance_threshold
            )

            if use_ndt:
                final_result = self._robust_icp_refine(
                    self.source_down, self.target_down,
                    ransac_result.transformation,
                    distance_threshold=self.distance_threshold,
                    max_iterations=self.max_iterations * 3
                )
            else:
                final_result = self._icp_refine(
                    self.source_down, self.target_down,
                    ransac_result.transformation,
                    distance_threshold=self.distance_threshold,
                    max_iterations=self.max_iterations * 3,
                    use_point_to_plane=True
                )

            final_eval = self._evaluate_registration(
                self.source_full, self.target_full,
                final_result.transformation, self.distance_threshold
            )

            self.transformation = final_result.transformation
            self.fitness = final_eval.fitness
            self.inlier_rmse = final_eval.inlier_rmse
            self.correspondence_set_size = len(final_eval.correspondence_set)

            return {
                'fitness': self.fitness,
                'inlier_rmse': self.inlier_rmse,
                'correspondence_set_size': self.correspondence_set_size,
                'transformation': self.transformation.tolist(),
                'source_points': len(self.source_full.points),
                'target_points': len(self.target_full.points),
                'overlap_before': 0.0,
                'overlap_after': 0.0,
                'registration_history': [],
                'used_fallback': False,
                'warnings': []
            }

    def get_transformed_source(self) -> o3d.geometry.PointCloud:
        if self.source_full is not None:
            source_transformed = copy.deepcopy(self.source_full)
        else:
            source_transformed = copy.deepcopy(self.source)
        source_transformed.transform(self.transformation)
        return source_transformed

    def get_merged_point_cloud(self) -> o3d.geometry.PointCloud:
        source_transformed = self.get_transformed_source()
        if self.target_full is not None:
            merged = source_transformed + self.target_full
        else:
            merged = source_transformed + self.target
        return merged

    def save_point_cloud_json(self, pcd: o3d.geometry.PointCloud, output_path: str,
                              max_points: int = 100000) -> str:
        points = np.asarray(pcd.points)
        colors = None
        if pcd.has_colors():
            colors = np.asarray(pcd.colors)

        if len(points) > max_points:
            indices = np.random.choice(len(points), max_points, replace=False)
            points = points[indices]
            if colors is not None:
                colors = colors[indices]

        data = {
            'points': points.tolist(),
            'colors': colors.tolist() if colors is not None else []
        }

        with open(output_path, 'w') as f:
            json.dump(data, f)
        return output_path

    def compute_overlap_heatmap(self, resolution: int = 64) -> Dict:
        source_transformed = self.get_transformed_source()
        source_points = np.asarray(source_transformed.points)
        target_points = np.asarray(self.target.points) if self.target_full is None else np.asarray(self.target_full.points)

        all_points = np.vstack([source_points, target_points])
        mins = all_points.min(axis=0)
        maxs = all_points.max(axis=0)

        heatmap = np.zeros((resolution, resolution))
        source_grid = np.zeros((resolution, resolution))
        target_grid = np.zeros((resolution, resolution))

        def points_to_grid(points):
            grid = np.zeros((resolution, resolution))
            for pt in points:
                if maxs[0] > mins[0] and maxs[1] > mins[1]:
                    ix = min(int((pt[0] - mins[0]) / (maxs[0] - mins[0]) * (resolution - 1)), resolution - 1)
                    iy = min(int((pt[1] - mins[1]) / (maxs[1] - mins[1]) * (resolution - 1)), resolution - 1)
                    ix = max(0, ix)
                    iy = max(0, iy)
                    grid[iy, ix] += 1
            return grid

        source_grid = points_to_grid(source_points)
        target_grid = points_to_grid(target_points)

        overlap = np.minimum(source_grid, target_grid)
        max_overlap = overlap.max() if overlap.max() > 0 else 1
        heatmap = overlap / max_overlap

        return {
            'heatmap': heatmap.tolist(),
            'source_density': (source_grid / (source_grid.max() if source_grid.max() > 0 else 1)).tolist(),
            'target_density': (target_grid / (target_grid.max() if target_grid.max() > 0 else 1)).tolist(),
            'resolution': resolution,
            'mins': mins.tolist(),
            'maxs': maxs.tolist(),
            'min_overlap': float(overlap.min()),
            'max_overlap': float(overlap.max()),
            'overlap_ratio_before': float(self.overlap_before),
            'overlap_ratio_after': float(self.overlap_after)
        }

    def get_registration_metrics(self) -> Dict:
        return {
            'fitness': self.fitness,
            'inlier_rmse': self.inlier_rmse,
            'correspondence_set_size': self.correspondence_set_size,
            'voxel_size': self.voxel_size_medium,
            'distance_threshold': self.distance_threshold,
            'max_iterations': self.max_iterations,
            'overlap_before': self.overlap_before,
            'overlap_after': self.overlap_after,
            'used_fallback': self.used_fallback
        }


def register_multiple_stations(file_paths: List[str], voxel_size: float = 0.1,
                                distance_threshold: float = 0.5,
                                max_iterations: int = 30,
                                use_multi_scale: bool = True) -> Dict:
    if len(file_paths) < 2:
        raise ValueError("At least 2 point cloud files are required for registration")

    ndt = NDTRegistration(
        voxel_size=voxel_size,
        distance_threshold=distance_threshold,
        max_iterations=max_iterations,
        use_multi_scale=use_multi_scale
    )

    merged = None
    transformations = []
    results = []
    all_warnings = []

    for i in range(len(file_paths) - 1):
        result = ndt.register(file_paths[i], file_paths[i + 1], use_ndt=True)
        transformations.append(ndt.transformation.tolist())
        results.append(result)
        if result.get('warnings'):
            all_warnings.extend([f"Pair {i}-{i+1}: {w}" for w in result['warnings']])

        if i == 0:
            merged = ndt.get_merged_point_cloud()
        else:
            new_source = ndt.get_transformed_source()
            merged = merged + new_source

    heatmap_data = ndt.compute_overlap_heatmap()

    return {
        'transformations': transformations,
        'results': results,
        'metrics': ndt.get_registration_metrics(),
        'heatmap': heatmap_data,
        'total_points': len(merged.points) if merged is not None else 0,
        'warnings': all_warnings
    }


class PoseGraphOptimizer:
    def __init__(self, voxel_size: float = 0.1, distance_threshold: float = 0.5,
                 max_iterations: int = 30, loop_closure_fitness_threshold: float = 0.3):
        self.voxel_size = voxel_size
        self.distance_threshold = distance_threshold
        self.max_iterations = max_iterations
        self.loop_closure_fitness_threshold = loop_closure_fitness_threshold

    def compute_relative_transform(self, source_path: str, target_path: str) -> Dict:
        ndt = NDTRegistration(
            voxel_size=self.voxel_size,
            distance_threshold=self.distance_threshold,
            max_iterations=self.max_iterations,
            use_multi_scale=True,
            min_fitness_threshold=0.3
        )
        result = ndt.register(source_path, target_path, use_ndt=True)
        return {
            'transformation': ndt.transformation,
            'fitness': result['fitness'],
            'inlier_rmse': result['inlier_rmse'],
            'correspondence_set_size': result['correspondence_set_size'],
            'source_path': source_path,
            'target_path': target_path
        }

    def detect_loop_closure(self, file_paths: List[str]) -> Optional[Dict]:
        if len(file_paths) < 3:
            return None

        first_path = file_paths[0]
        last_path = file_paths[-1]

        print(f"[LoopClosure] Testing loop closure between station 0 and station {len(file_paths)-1}...")

        result = self.compute_relative_transform(first_path, last_path)

        if result['fitness'] >= self.loop_closure_fitness_threshold:
            print(f"[LoopClosure] Loop closure detected! Fitness={result['fitness']:.4f}, "
                  f"RMSE={result['inlier_rmse']:.4f}")
            return {
                'detected': True,
                'from_station': 0,
                'to_station': len(file_paths) - 1,
                'fitness': result['fitness'],
                'inlier_rmse': result['inlier_rmse'],
                'transformation': result['transformation'].tolist(),
                'correspondence_set_size': result['correspondence_set_size']
            }
        else:
            print(f"[LoopClosure] No loop closure. Fitness={result['fitness']:.4f} "
                  f"(threshold={self.loop_closure_fitness_threshold})")
            return {
                'detected': False,
                'from_station': 0,
                'to_station': len(file_paths) - 1,
                'fitness': result['fitness'],
                'inlier_rmse': result['inlier_rmse'],
                'transformation': result['transformation'].tolist(),
                'correspondence_set_size': result['correspondence_set_size']
            }

    def build_pose_graph(self, transformations: List[np.ndarray],
                         loop_closure: Optional[Dict] = None) -> o3d.pipelines.registration.PoseGraph:
        pose_graph = o3d.pipelines.registration.PoseGraph()

        n = len(transformations) + 1

        identity = np.eye(4)
        pose_graph.nodes.append(o3d.pipelines.registration.PoseGraphNode(identity))

        cumulative_transform = np.eye(4)
        for i in range(1, n):
            cumulative_transform = cumulative_transform @ transformations[i - 1]
            pose_graph.nodes.append(
                o3d.pipelines.registration.PoseGraphNode(np.linalg.inv(cumulative_transform))
            )

        for i in range(n - 1):
            transform = transformations[i]
            info = np.eye(6)
            info[5, 5] = 0.001
            pose_graph.edges.append(
                o3d.pipelines.registration.PoseGraphEdge(
                    i, i + 1, transform, info, uncertain=False
                )
            )

        if loop_closure and loop_closure['detected']:
            loop_transform = np.array(loop_closure['transformation'])
            cumulative_inv = np.eye(4)
            for t in transformations:
                cumulative_inv = cumulative_inv @ t

            loop_info = np.eye(6)
            fitness = loop_closure['fitness']
            loop_info *= max(0.1, 1.0 - fitness)
            loop_info[5, 5] = 0.001

            pose_graph.edges.append(
                o3d.pipelines.registration.PoseGraphEdge(
                    0, n - 1, loop_transform, loop_info, uncertain=True
                )
            )
            print(f"[PoseGraph] Added loop closure edge: 0 -> {n-1}")

        return pose_graph

    def optimize_pose_graph(self, pose_graph: o3d.pipelines.registration.PoseGraph,
                            max_iteration: int = 1000) -> o3d.pipelines.registration.PoseGraph:
        option = o3d.pipelines.registration.GlobalOptimizationOption(
            max_correspondence_distance=self.distance_threshold,
            edge_prune_threshold=0.25,
            reference_node=0,
            preference_loop_closure=0.1
        )
        criterion = o3d.pipelines.registration.GlobalOptimizationConvergenceCriteria()
        criterion.max_iteration = max_iteration
        criterion.min_relative_increment = 1e-6
        criterion.min_relative_residual_increment = 1e-6
        criterion.min_right_term = 1e-6
        criterion.min_residual = 1e-6

        o3d.pipelines.registration.global_optimization(
            pose_graph,
            o3d.pipelines.registration.GlobalOptimizationLevenbergMarquardt(),
            criterion,
            option
        )
        return pose_graph

    def extract_optimized_transformations(self, pose_graph: o3d.pipelines.registration.PoseGraph) -> List[np.ndarray]:
        n = len(pose_graph.nodes)
        optimized_transforms = []

        for i in range(n - 1):
            t_i = np.linalg.inv(pose_graph.nodes[i].pose)
            t_j = np.linalg.inv(pose_graph.nodes[i + 1].pose)
            relative_transform = t_i @ np.linalg.inv(t_j)
            optimized_transforms.append(relative_transform)

        return optimized_transforms

    def optimize_multiple_stations(self, file_paths: List[str],
                                    transformations: List[np.ndarray]) -> Dict:
        if len(file_paths) < 3:
            return {
                'loop_closure': None,
                'optimized_transformations': [t.tolist() for t in transformations],
                'optimized': False,
                'message': 'Need at least 3 stations for pose graph optimization'
            }

        loop_closure = self.detect_loop_closure(file_paths)

        pose_graph = self.build_pose_graph(transformations, loop_closure)
        optimized_graph = self.optimize_pose_graph(pose_graph)
        optimized_transforms = self.extract_optimized_transformations(optimized_graph)

        return {
            'loop_closure': loop_closure,
            'optimized_transformations': [t.tolist() for t in optimized_transforms],
            'original_transformations': [t.tolist() for t in transformations],
            'optimized': loop_closure['detected'] if loop_closure else False,
            'num_stations': len(file_paths),
            'num_edges': len(pose_graph.edges)
        }


class RegistrationQualityAssessor:
    def __init__(self):
        pass

    def compute_point_to_point_distances(self, source: o3d.geometry.PointCloud,
                                         target: o3d.geometry.PointCloud,
                                         max_distance: float = 0.5) -> Dict:
        source_np = np.asarray(source.points)
        target_tree = o3d.geometry.KDTreeFlann(target)

        distances = []
        for pt in source_np:
            [k, idx, dist] = target_tree.search_knn_vector_3d(pt, 1)
            if k > 0 and np.sqrt(dist[0]) < max_distance:
                distances.append(np.sqrt(dist[0]))

        if not distances:
            return {'error': 'No correspondences found within threshold'}

        distances = np.array(distances)
        return {
            'num_correspondences': len(distances),
            'mean_distance': float(np.mean(distances)),
            'median_distance': float(np.median(distances)),
            'std_distance': float(np.std(distances)),
            'min_distance': float(np.min(distances)),
            'max_distance': float(np.max(distances)),
            'rmse': float(np.sqrt(np.mean(distances ** 2))),
            'percentile_90': float(np.percentile(distances, 90)),
            'percentile_95': float(np.percentile(distances, 95)),
            'percentile_99': float(np.percentile(distances, 99)),
            'histogram': self._compute_histogram(distances, bins=20)
        }

    def _compute_histogram(self, distances: np.ndarray, bins: int = 20) -> Dict:
        counts, edges = np.histogram(distances, bins=bins)
        return {
            'counts': counts.tolist(),
            'edges': edges.tolist(),
            'bin_centers': ((edges[:-1] + edges[1:]) / 2).tolist()
        }

    def compute_angular_error(self, transform1: np.ndarray, transform2: np.ndarray) -> Dict:
        R1 = transform1[:3, :3]
        R2 = transform2[:3, :3]

        R_rel = R1.T @ R2
        trace = np.trace(R_rel)
        cos_theta = (trace - 1.0) / 2.0
        cos_theta = np.clip(cos_theta, -1.0, 1.0)
        theta = np.arccos(cos_theta)

        return {
            'angular_error_rad': float(theta),
            'angular_error_deg': float(np.degrees(theta)),
            'rotation_trace': float(trace)
        }

    def compute_translation_error(self, transform1: np.ndarray, transform2: np.ndarray) -> Dict:
        t1 = transform1[:3, 3]
        t2 = transform2[:3, 3]
        diff = t1 - t2
        distance = np.linalg.norm(diff)
        return {
            'translation_error': float(distance),
            'x_diff': float(diff[0]),
            'y_diff': float(diff[1]),
            'z_diff': float(diff[2]),
            't1': t1.tolist(),
            't2': t2.tolist()
        }

    def assess_registration_quality(self, source_path: str, target_path: str,
                                     transformation: np.ndarray,
                                     reference_transformation: Optional[np.ndarray] = None,
                                     voxel_size: float = 0.1) -> Dict:
        ndt = NDTRegistration(voxel_size=voxel_size)
        source = ndt.load_point_cloud(source_path)
        target = ndt.load_point_cloud(target_path)

        source_down = source.voxel_down_sample(voxel_size * 2)
        target_down = target.voxel_down_sample(voxel_size * 2)

        source_transformed = copy.deepcopy(source_down)
        source_transformed.transform(transformation)

        distance_analysis = self.compute_point_to_point_distances(
            source_transformed, target_down, max_distance=voxel_size * 5
        )

        eval_result = o3d.pipelines.registration.evaluate_registration(
            source_transformed, target_down, voxel_size * 3
        )

        quality = {
            'fitness': eval_result.fitness,
            'inlier_rmse': eval_result.inlier_rmse,
            'correspondence_set_size': len(eval_result.correspondence_set),
            'distance_analysis': distance_analysis,
            'source_points': len(source.points),
            'target_points': len(target.points),
            'source_downsampled': len(source_down.points),
            'target_downsampled': len(target_down.points)
        }

        if reference_transformation is not None:
            quality['reference_comparison'] = {
                'angular_error': self.compute_angular_error(transformation, reference_transformation),
                'translation_error': self.compute_translation_error(transformation, reference_transformation)
            }

        quality['quality_grade'] = self._assign_quality_grade(
            eval_result.fitness, eval_result.inlier_rmse, distance_analysis
        )

        return quality

    def _assign_quality_grade(self, fitness: float, rmse: float,
                               distance_analysis: Dict) -> str:
        if isinstance(distance_analysis, dict) and 'rmse' in distance_analysis:
            point_rmse = distance_analysis['rmse']
        else:
            point_rmse = rmse

        if fitness >= 0.9 and point_rmse < 0.05:
            return 'Excellent'
        elif fitness >= 0.7 and point_rmse < 0.1:
            return 'Good'
        elif fitness >= 0.5 and point_rmse < 0.2:
            return 'Acceptable'
        elif fitness >= 0.3:
            return 'Poor'
        else:
            return 'Failed'

    def assess_multiple_stations(self, file_paths: List[str],
                                  transformations: List[np.ndarray],
                                  voxel_size: float = 0.1) -> Dict:
        ndt = NDTRegistration(voxel_size=voxel_size)
        all_assessments = []
        cumulative_fitness = 0.0
        cumulative_rmse = 0.0

        for i in range(len(file_paths) - 1):
            assessment = self.assess_registration_quality(
                file_paths[i], file_paths[i + 1],
                transformations[i], voxel_size=voxel_size
            )
            assessment['pair'] = f'{i}-{i+1}'
            all_assessments.append(assessment)
            cumulative_fitness += assessment['fitness']
            cumulative_rmse += assessment.get('distance_analysis', {}).get('rmse', assessment['inlier_rmse'])

        overall = {
            'num_pairs': len(all_assessments),
            'avg_fitness': cumulative_fitness / len(all_assessments),
            'avg_rmse': cumulative_rmse / len(all_assessments),
            'worst_fitness': min(a['fitness'] for a in all_assessments),
            'worst_rmse': max(a.get('distance_analysis', {}).get('rmse', a['inlier_rmse']) for a in all_assessments),
            'assessments': all_assessments
        }

        worst = min(a['quality_grade'] for a in all_assessments)
        grades_order = ['Failed', 'Poor', 'Acceptable', 'Good', 'Excellent']
        overall['overall_grade'] = worst if worst in grades_order else 'Unknown'

        return overall


class PointCloudExporter:
    def __init__(self):
        pass

    def export_to_pcd(self, pcd: o3d.geometry.PointCloud, output_path: str,
                       ascii_mode: bool = False) -> str:
        pcd_copy = copy.deepcopy(pcd)
        if ascii_mode:
            o3d.io.write_point_cloud(output_path, pcd_copy,
                                     write_ascii=True, compressed=False, print_progress=False)
        else:
            o3d.io.write_point_cloud(output_path, pcd_copy,
                                     write_ascii=False, compressed=True, print_progress=False)
        return output_path

    def export_to_ply(self, pcd: o3d.geometry.PointCloud, output_path: str,
                       ascii_mode: bool = False) -> str:
        pcd_copy = copy.deepcopy(pcd)
        o3d.io.write_point_cloud(output_path, pcd_copy,
                                 write_ascii=ascii_mode, compressed=False, print_progress=False)
        return output_path

    def export_merged_point_cloud(self, file_paths: List[str],
                                   transformations: List[np.ndarray],
                                   output_path: str,
                                   file_format: str = 'ply',
                                   ascii_mode: bool = False,
                                   voxel_size: Optional[float] = None) -> Dict:
        if len(file_paths) < 2:
            raise ValueError("At least 2 point cloud files are required")

        ndt = NDTRegistration(voxel_size=voxel_size or 0.1)

        merged = None
        cumulative_transform = np.eye(4)

        for i, file_path in enumerate(file_paths):
            pcd = ndt.load_point_cloud(file_path)

            if i == 0:
                pcd_copy = copy.deepcopy(pcd)
                pcd_copy.transform(cumulative_transform)
                merged = pcd_copy
            else:
                cumulative_transform = cumulative_transform @ transformations[i - 1]
                pcd_copy = copy.deepcopy(pcd)
                pcd_copy.transform(cumulative_transform)
                merged = merged + pcd_copy

        if merged is None:
            raise ValueError("Failed to merge point clouds")

        if voxel_size and voxel_size > 0:
            merged = merged.voxel_down_sample(voxel_size)

        if not output_path.endswith(f'.{file_format}'):
            output_path = f"{output_path}.{file_format}"

        if file_format == 'pcd':
            actual_path = self.export_to_pcd(merged, output_path, ascii_mode)
        elif file_format == 'ply':
            actual_path = self.export_to_ply(merged, output_path, ascii_mode)
        else:
            raise ValueError(f"Unsupported format: {file_format}. Use 'pcd' or 'ply'.")

        file_size = os.path.getsize(actual_path)

        return {
            'file_path': actual_path,
            'file_name': os.path.basename(actual_path),
            'file_format': file_format,
            'file_size': file_size,
            'file_size_mb': file_size / (1024 * 1024),
            'num_points': len(merged.points),
            'has_colors': merged.has_colors(),
            'has_normals': merged.has_normals(),
            'voxel_size': voxel_size,
            'ascii_mode': ascii_mode
        }

    def get_available_formats(self) -> List[str]:
        return ['ply', 'pcd']


register_multiple_stations_with_loop_closure = None


def register_multiple_stations_optimized(file_paths: List[str],
                                          voxel_size: float = 0.1,
                                          distance_threshold: float = 0.5,
                                          max_iterations: int = 30,
                                          use_loop_closure: bool = True,
                                          loop_closure_fitness_threshold: float = 0.3) -> Dict:
    if len(file_paths) < 2:
        raise ValueError("At least 2 point cloud files are required")

    ndt = NDTRegistration(
        voxel_size=voxel_size,
        distance_threshold=distance_threshold,
        max_iterations=max_iterations,
        use_multi_scale=True
    )

    transformations = []
    results = []
    all_warnings = []

    for i in range(len(file_paths) - 1):
        result = ndt.register(file_paths[i], file_paths[i + 1], use_ndt=True)
        transformations.append(ndt.transformation.copy())
        results.append(result)
        if result.get('warnings'):
            all_warnings.extend([f"Pair {i}-{i+1}: {w}" for w in result['warnings']])

    loop_closure_result = None
    optimized_transformations = None

    if use_loop_closure and len(file_paths) >= 3:
        optimizer = PoseGraphOptimizer(
            voxel_size=voxel_size,
            distance_threshold=distance_threshold,
            max_iterations=max_iterations,
            loop_closure_fitness_threshold=loop_closure_fitness_threshold
        )
        opt_result = optimizer.optimize_multiple_stations(file_paths, transformations)
        loop_closure_result = opt_result['loop_closure']
        optimized_transformations = opt_result['optimized_transformations']

        if opt_result['optimized']:
            transformations = [np.array(t) for t in optimized_transformations]
            all_warnings.append("Pose graph optimization applied with loop closure")

    heatmap_data = ndt.compute_overlap_heatmap()

    assessor = RegistrationQualityAssessor()
    quality_assessment = assessor.assess_multiple_stations(
        file_paths, transformations, voxel_size=voxel_size
    )

    return {
        'transformations': [t.tolist() for t in transformations],
        'optimized_transformations': optimized_transformations,
        'loop_closure': loop_closure_result,
        'results': results,
        'metrics': ndt.get_registration_metrics(),
        'heatmap': heatmap_data,
        'quality_assessment': quality_assessment,
        'total_points': quality_assessment['assessments'][0]['source_points'] +
                         quality_assessment['assessments'][-1]['target_points'],
        'warnings': all_warnings,
        'optimized': loop_closure_result['detected'] if loop_closure_result else False
    }
