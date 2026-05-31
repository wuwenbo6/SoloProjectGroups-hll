#include "pile_segmentation.h"
#include <pcl/segmentation/extract_clusters.h>
#include <pcl/kdtree/kdtree.h>

PileSegmentation::PileSegmentation()
    : cluster_tolerance_(0.05), min_cluster_size_(100), max_cluster_size_(50000) {}

PileSegmentation::~PileSegmentation() {}

void PileSegmentation::setInputCloud(pcl::PointCloud<pcl::PointXYZ>::Ptr cloud) {
    input_cloud_ = cloud;
}

void PileSegmentation::setClusterTolerance(double tolerance) {
    cluster_tolerance_ = tolerance;
}

void PileSegmentation::setMinClusterSize(int min_size) {
    min_cluster_size_ = min_size;
}

void PileSegmentation::setMaxClusterSize(int max_size) {
    max_cluster_size_ = max_size;
}

void PileSegmentation::segment() {
    pile_clouds_.clear();
    if (!input_cloud_ || input_cloud_->empty()) return;

    typename pcl::search::KdTree<pcl::PointXYZ>::Ptr tree(new pcl::search::KdTree<pcl::PointXYZ>);
    tree->setInputCloud(input_cloud_);

    std::vector<pcl::PointIndices> cluster_indices;
    pcl::EuclideanClusterExtraction<pcl::PointXYZ> ec;
    ec.setClusterTolerance(cluster_tolerance_);
    ec.setMinClusterSize(min_cluster_size_);
    ec.setMaxClusterSize(max_cluster_size_);
    ec.setSearchMethod(tree);
    ec.setInputCloud(input_cloud_);
    ec.extract(cluster_indices);

    for (const auto& indices : cluster_indices) {
        pcl::PointCloud<pcl::PointXYZ>::Ptr pile_cloud(new pcl::PointCloud<pcl::PointXYZ>);
        for (const auto& idx : indices.indices) {
            pile_cloud->push_back((*input_cloud_)[idx]);
        }
        pile_cloud->width = pile_cloud->size();
        pile_cloud->height = 1;
        pile_cloud->is_dense = true;
        pile_clouds_.push_back(pile_cloud);
    }
}

std::vector<pcl::PointCloud<pcl::PointXYZ>::Ptr> PileSegmentation::getPileClouds() {
    return pile_clouds_;
}
