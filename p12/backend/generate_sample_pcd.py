#!/usr/bin/env python3
import numpy as np
import open3d as o3d
import os

def generate_sample_pcd(output_path: str, num_points: int = 50000):
    np.random.seed(42)
    
    points = []
    
    ground = np.random.rand(num_points // 2, 3)
    ground[:, 0] = (ground[:, 0] - 0.5) * 100
    ground[:, 1] = -1.5 + np.random.normal(0, 0.05, num_points // 2)
    ground[:, 2] = (ground[:, 1] - 0.5) * 100
    points.append(ground)
    
    car_center = np.array([5, 0, 10])
    car_points = np.random.normal(0, 1, (5000, 3))
    car_points[:, 0] = car_points[:, 0] * 2 + car_center[0]
    car_points[:, 1] = car_points[:, 1] * 0.75 + car_center[1]
    car_points[:, 2] = car_points[:, 2] * 4 + car_center[2]
    points.append(car_points)
    
    car2_center = np.array([-3, 0, 5])
    car2_points = np.random.normal(0, 1, (4000, 3))
    car2_points[:, 0] = car2_points[:, 0] * 1.8 + car2_center[0]
    car2_points[:, 1] = car2_points[:, 1] * 0.7 + car2_center[1]
    car2_points[:, 2] = car2_points[:, 2] * 3.8 + car2_center[2]
    points.append(car2_points)
    
    person_center = np.array([0, 0, 15])
    person_points = np.random.normal(0, 1, (800, 3))
    person_points[:, 0] = person_points[:, 0] * 0.3 + person_center[0]
    person_points[:, 1] = person_points[:, 1] * 0.85 + person_center[1]
    person_points[:, 2] = person_points[:, 2] * 0.3 + person_center[2]
    points.append(person_points)
    
    person2_center = np.array([8, 0, 8])
    person2_points = np.random.normal(0, 1, (600, 3))
    person2_points[:, 0] = person2_points[:, 0] * 0.25 + person2_center[0]
    person2_points[:, 1] = person2_points[:, 1] * 0.8 + person2_center[1]
    person2_points[:, 2] = person2_points[:, 2] * 0.25 + person2_center[2]
    points.append(person2_points)
    
    all_points = np.vstack(points)
    
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(all_points)
    
    o3d.io.write_point_cloud(output_path, pcd)
    print(f"Sample PCD generated: {output_path}")
    print(f"Total points: {len(all_points)}")
    
    return output_path

if __name__ == '__main__':
    output_dir = 'sample_data'
    os.makedirs(output_dir, exist_ok=True)
    
    output_path = os.path.join(output_dir, 'sample.pcd')
    generate_sample_pcd(output_path)
