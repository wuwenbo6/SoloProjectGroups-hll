#include "volume_calculator.h"
#include <pcl/surface/convex_hull.h>
#include <pcl/common/centroid.h>
#include <pcl/Vertices.h>
#include <cmath>

VolumeCalculator::VolumeCalculator() : resolution_(0.01) {}

VolumeCalculator::~VolumeCalculator() {}

void VolumeCalculator::setInputCloud(pcl::PointCloud<pcl::PointXYZ>::Ptr cloud) {
    input_cloud_ = cloud;
}

void VolumeCalculator::setGroundPlane(pcl::ModelCoefficients::Ptr ground_coeffs) {
    ground_coeffs_ = ground_coeffs;
}

void VolumeCalculator::setResolution(double resolution) {
    resolution_ = resolution;
}

double VolumeCalculator::calculateVolume() {
    if (!input_cloud_ || input_cloud_->empty()) return 0.0;
    return calculateIntegrationVolume();
}

double VolumeCalculator::calculateConvexHullVolume() {
    pcl::PointCloud<pcl::PointXYZ>::Ptr hull_cloud(new pcl::PointCloud<pcl::PointXYZ>);
    pcl::ConvexHull<pcl::PointXYZ> convex_hull;
    convex_hull.setInputCloud(input_cloud_);
    convex_hull.setComputeAreaVolume(true);

    std::vector<pcl::Vertices> polygons;
    convex_hull.reconstruct(*hull_cloud, polygons);

    return convex_hull.getTotalVolume();
}

double VolumeCalculator::calculateVoxelVolume() {
    Eigen::Vector4f min_pt, max_pt;
    pcl::getMinMax3D(*input_cloud_, min_pt, max_pt);

    int nx = static_cast<int>((max_pt[0] - min_pt[0]) / resolution_) + 1;
    int ny = static_cast<int>((max_pt[1] - min_pt[1]) / resolution_) + 1;
    int nz = static_cast<int>((max_pt[2] - min_pt[2]) / resolution_) + 1;

    std::vector<std::vector<std::vector<bool>>> voxel_grid(
        nx, std::vector<std::vector<bool>>(ny, std::vector<bool>(nz, false)));

    for (const auto& point : *input_cloud_) {
        int i = static_cast<int>((point.x - min_pt[0]) / resolution_);
        int j = static_cast<int>((point.y - min_pt[1]) / resolution_);
        int k = static_cast<int>((point.z - min_pt[2]) / resolution_);
        if (i >= 0 && i < nx && j >= 0 && j < ny && k >= 0 && k < nz) {
            voxel_grid[i][j][k] = true;
        }
    }

    int filled_voxels = 0;
    for (int i = 0; i < nx; ++i) {
        for (int j = 0; j < ny; ++j) {
            for (int k = 0; k < nz; ++k) {
                if (voxel_grid[i][j][k]) filled_voxels++;
            }
        }
    }

    return filled_voxels * resolution_ * resolution_ * resolution_;
}

double VolumeCalculator::calculateIntegrationVolume() {
    if (!ground_coeffs_ || ground_coeffs_->values.size() < 4) {
        return calculateConvexHullVolume();
    }

    double a = ground_coeffs_->values[0];
    double b = ground_coeffs_->values[1];
    double c = ground_coeffs_->values[2];
    double d = ground_coeffs_->values[3];
    double plane_norm = std::sqrt(a*a + b*b + c*c);

    std::vector<double> heights;
    for (const auto& point : *input_cloud_) {
        double dist = std::abs(a * point.x + b * point.y + c * point.z + d) / plane_norm;
        heights.push_back(dist);
    }

    if (heights.empty()) return 0.0;

    std::sort(heights.begin(), heights.end());
    double median_height = heights[heights.size() / 2];

    Eigen::Vector4f min_pt, max_pt;
    pcl::getMinMax3D(*input_cloud_, min_pt, max_pt);

    double area = (max_pt[0] - min_pt[0]) * (max_pt[1] - min_pt[1]);

    return area * median_height * 0.5;
}

Eigen::Vector4f VolumeCalculator::getCentroid() {
    Eigen::Vector4f centroid;
    if (input_cloud_ && !input_cloud_->empty()) {
        pcl::compute3DCentroid(*input_cloud_, centroid);
    } else {
        centroid.setZero();
    }
    return centroid;
}
