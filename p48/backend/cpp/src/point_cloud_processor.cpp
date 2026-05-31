#include "point_cloud_processor.h"
#include "ground_segmentation.h"
#include "pile_segmentation.h"
#include "volume_calculator.h"
#include <pcl/io/pcd_io.h>
#include <pcl/filters/voxel_grid.h>
#include <pcl/common/centroid.h>

PointCloudProcessor::PointCloudProcessor()
    : ground_distance_threshold_(0.02),
      pile_cluster_tolerance_(0.05),
      min_pile_size_(100),
      max_pile_size_(50000),
      voxel_leaf_size_(0.01) {
    input_cloud_.reset(new pcl::PointCloud<pcl::PointXYZ>);
    colored_cloud_.reset(new pcl::PointCloud<pcl::PointXYZRGB>);
}

PointCloudProcessor::~PointCloudProcessor() {}

bool PointCloudProcessor::loadPointCloud(const std::string& filename) {
    if (pcl::io::loadPCDFile<pcl::PointXYZ>(filename, *input_cloud_) == -1) {
        return false;
    }
    return true;
}

bool PointCloudProcessor::loadFromPoints(const std::vector<float>& points) {
    input_cloud_->clear();
    if (points.size() % 3 != 0) return false;

    for (size_t i = 0; i < points.size(); i += 3) {
        pcl::PointXYZ point(points[i], points[i+1], points[i+2]);
        input_cloud_->push_back(point);
    }
    input_cloud_->width = input_cloud_->size();
    input_cloud_->height = 1;
    input_cloud_->is_dense = true;
    return true;
}

void PointCloudProcessor::process() {
    if (!input_cloud_ || input_cloud_->empty()) return;

    pcl::PointCloud<pcl::PointXYZ>::Ptr filtered_cloud(new pcl::PointCloud<pcl::PointXYZ>);
    pcl::VoxelGrid<pcl::PointXYZ> vg;
    vg.setInputCloud(input_cloud_);
    vg.setLeafSize(voxel_leaf_size_, voxel_leaf_size_, voxel_leaf_size_);
    vg.filter(*filtered_cloud);

    GroundSegmentation ground_seg;
    ground_seg.setInputCloud(filtered_cloud);
    ground_seg.setDistanceThreshold(ground_distance_threshold_);
    ground_seg.segment();

    ground_cloud_ = ground_seg.getGroundCloud();
    objects_cloud_ = ground_seg.getObjectsCloud();
    auto ground_coeffs = ground_seg.getGroundCoefficients();

    PileSegmentation pile_seg;
    pile_seg.setInputCloud(objects_cloud_);
    pile_seg.setClusterTolerance(pile_cluster_tolerance_);
    pile_seg.setMinClusterSize(min_pile_size_);
    pile_seg.setMaxClusterSize(max_pile_size_);
    pile_seg.segment();

    auto pile_clouds = pile_seg.getPileClouds();

    pile_volumes_.clear();
    int pile_id = 0;
    for (auto& pile_cloud : pile_clouds) {
        VolumeCalculator calculator;
        calculator.setInputCloud(pile_cloud);
        calculator.setGroundPlane(ground_coeffs);
        double volume = calculator.calculateVolume();
        Eigen::Vector4f centroid = calculator.getCentroid();

        PileVolume pv;
        pv.id = pile_id++;
        pv.volume = volume;
        pv.centroid = centroid;
        pv.cloud.reset(new pcl::PointCloud<pcl::PointXYZRGB>);
        pcl::copyPointCloud(*pile_cloud, *pv.cloud);
        pile_volumes_.push_back(pv);
    }

    colorizeCloud();
}

void PointCloudProcessor::colorizeCloud() {
    colored_cloud_->clear();

    uint8_t colors[][3] = {
        {255, 0, 0}, {0, 255, 0}, {0, 0, 255},
        {255, 255, 0}, {255, 0, 255}, {0, 255, 255},
        {255, 128, 0}, {128, 0, 255}, {0, 255, 128}
    };

    for (size_t i = 0; i < pile_volumes_.size(); ++i) {
        uint8_t r = colors[i % 9][0];
        uint8_t g = colors[i % 9][1];
        uint8_t b = colors[i % 9][2];

        for (auto& point : *pile_volumes_[i].cloud) {
            point.r = r;
            point.g = g;
            point.b = b;
            colored_cloud_->push_back(point);
        }
    }

    for (const auto& point : *ground_cloud_) {
        pcl::PointXYZRGB colored_point;
        colored_point.x = point.x;
        colored_point.y = point.y;
        colored_point.z = point.z;
        colored_point.r = 128;
        colored_point.g = 128;
        colored_point.b = 128;
        colored_cloud_->push_back(colored_point);
    }
}

std::vector<PileVolume> PointCloudProcessor::getPileVolumes() const {
    return pile_volumes_;
}

pcl::PointCloud<pcl::PointXYZRGB>::Ptr PointCloudProcessor::getColoredCloud() const {
    return colored_cloud_;
}

pcl::PointCloud<pcl::PointXYZ>::Ptr PointCloudProcessor::getGroundCloud() const {
    return ground_cloud_;
}

bool PointCloudProcessor::saveProcessedCloud(const std::string& filename) {
    if (!colored_cloud_ || colored_cloud_->empty()) return false;
    return pcl::io::savePCDFileBinary(filename, *colored_cloud_) == 0;
}

void PointCloudProcessor::setGroundDistanceThreshold(double threshold) {
    ground_distance_threshold_ = threshold;
}

void PointCloudProcessor::setPileClusterTolerance(double tolerance) {
    pile_cluster_tolerance_ = tolerance;
}

void PointCloudProcessor::setMinPileSize(int min_size) {
    min_pile_size_ = min_size;
}

void PointCloudProcessor::setMaxPileSize(int max_size) {
    max_pile_size_ = max_size;
}

void PointCloudProcessor::setVoxelGridLeafSize(double size) {
    voxel_leaf_size_ = size;
}
