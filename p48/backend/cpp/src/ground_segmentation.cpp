#include "ground_segmentation.h"
#include <pcl/segmentation/sac_segmentation.h>
#include <pcl/filters/extract_indices.h>
#include <pcl/filters/statistical_outlier_removal.h>
#include <pcl/common/centroid.h>
#include <cmath>
#include <algorithm>

RobustGroundSegmentation::RobustGroundSegmentation()
    : distance_threshold_(0.03),
      normal_threshold_(0.1),
      max_inclination_angle_rad_(M_PI / 6.0),
      use_normal_constraint_(true),
      segmentation_success_(false) {
    ground_normal_ << 0.0f, 0.0f, 1.0f;
    ground_coefficients_.reset(new pcl::ModelCoefficients);
    ground_inliers_.reset(new pcl::PointIndices);
}

RobustGroundSegmentation::~RobustGroundSegmentation() {}

void RobustGroundSegmentation::setInputCloud(pcl::PointCloud<pcl::PointXYZ>::Ptr cloud) {
    input_cloud_ = cloud;
    segmentation_success_ = false;
}

void RobustGroundSegmentation::setDistanceThreshold(double threshold) {
    distance_threshold_ = threshold;
}

void RobustGroundSegmentation::setNormalThreshold(double threshold) {
    normal_threshold_ = threshold;
}

void RobustGroundSegmentation::setMaxInclinationAngle(double angle_degrees) {
    max_inclination_angle_rad_ = angle_degrees * M_PI / 180.0;
}

void RobustGroundSegmentation::setUseNormalConstraint(bool use) {
    use_normal_constraint_ = use;
}

void RobustGroundSegmentation::setGroundNormal(const Eigen::Vector3f& normal) {
    ground_normal_ = normal.normalized();
}

void RobustGroundSegmentation::removeOutliers() {
    if (!input_cloud_ || input_cloud_->size() < 50) {
        filtered_cloud_ = input_cloud_;
        return;
    }

    pcl::StatisticalOutlierRemoval<pcl::PointXYZ> sor;
    sor.setInputCloud(input_cloud_);
    sor.setMeanK(20);
    sor.setStddevMulThresh(2.0);
    
    filtered_cloud_.reset(new pcl::PointCloud<pcl::PointXYZ>);
    sor.filter(*filtered_cloud_);
}

bool RobustGroundSegmentation::detectGroundPlane() {
    if (!filtered_cloud_ || filtered_cloud_->empty()) return false;

    pcl::SACSegmentation<pcl::PointXYZ> seg;
    seg.setOptimizeCoefficients(true);
    seg.setModelType(pcl::SACMODEL_PLANE);
    seg.setMethodType(pcl::SAC_RANSAC);
    seg.setMaxIterations(1500);
    seg.setDistanceThreshold(distance_threshold_);
    seg.setInputCloud(filtered_cloud_);
    seg.segment(*ground_inliers_, *ground_coefficients_);

    return ground_inliers_->indices.size() > 50;
}

bool RobustGroundSegmentation::validateGroundPlane() {
    if (!use_normal_constraint_) return true;
    if (ground_coefficients_->values.size() < 4) return false;

    Eigen::Vector3f plane_normal(
        ground_coefficients_->values[0],
        ground_coefficients_->values[1],
        ground_coefficients_->values[2]
    );
    plane_normal.normalize();

    float dot_product = std::abs(plane_normal.dot(ground_normal_));
    float angle = std::acos(std::min(1.0f, std::max(-1.0f, dot_product)));

    return angle <= max_inclination_angle_rad_;
}

void RobustGroundSegmentation::fallbackDetection() {
    if (!filtered_cloud_ || filtered_cloud_->empty()) return;

    std::vector<float> z_values;
    z_values.reserve(filtered_cloud_->size());
    for (const auto& point : *filtered_cloud_) {
        z_values.push_back(point.z);
    }

    std::sort(z_values.begin(), z_values.end());
    size_t n = z_values.size();
    size_t lower_count = std::max(size_t(50), n / 3);
    
    float sum = 0.0f;
    for (size_t i = 0; i < lower_count; ++i) {
        sum += z_values[i];
    }
    float mean_z = sum / lower_count;
    float z_threshold = mean_z + distance_threshold_ * 3.0f;

    ground_inliers_->indices.clear();
    for (size_t i = 0; i < filtered_cloud_->size(); ++i) {
        if ((*filtered_cloud_)[i].z <= z_threshold) {
            ground_inliers_->indices.push_back(static_cast<int>(i));
        }
    }

    ground_coefficients_->values.resize(4);
    ground_coefficients_->values[0] = 0.0;
    ground_coefficients_->values[1] = 0.0;
    ground_coefficients_->values[2] = 1.0;
    ground_coefficients_->values[3] = -mean_z;
}

void RobustGroundSegmentation::segment() {
    segmentation_success_ = false;

    if (!input_cloud_ || input_cloud_->empty()) {
        ground_cloud_.reset(new pcl::PointCloud<pcl::PointXYZ>);
        objects_cloud_.reset(new pcl::PointCloud<pcl::PointXYZ>);
        return;
    }

    removeOutliers();

    bool plane_detected = detectGroundPlane();
    bool plane_valid = plane_detected && validateGroundPlane();

    if (!plane_valid) {
        fallbackDetection();
    }

    pcl::ExtractIndices<pcl::PointXYZ> extract;
    extract.setInputCloud(filtered_cloud_);
    extract.setIndices(ground_inliers_);

    ground_cloud_.reset(new pcl::PointCloud<pcl::PointXYZ>);
    extract.setNegative(false);
    extract.filter(*ground_cloud_);

    objects_cloud_.reset(new pcl::PointCloud<pcl::PointXYZ>);
    extract.setNegative(true);
    extract.filter(*objects_cloud_);

    segmentation_success_ = !ground_cloud_->empty();
}

pcl::PointCloud<pcl::PointXYZ>::Ptr RobustGroundSegmentation::getGroundCloud() {
    return ground_cloud_;
}

pcl::PointCloud<pcl::PointXYZ>::Ptr RobustGroundSegmentation::getObjectsCloud() {
    return objects_cloud_;
}

pcl::ModelCoefficients::Ptr RobustGroundSegmentation::getGroundCoefficients() {
    return ground_coefficients_;
}

bool RobustGroundSegmentation::getSegmentationSuccess() const {
    return segmentation_success_;
}
