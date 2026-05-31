#ifndef PILE_SEGMENTATION_H
#define PILE_SEGMENTATION_H

#include <pcl/point_cloud.h>
#include <pcl/point_types.h>
#include <vector>

class PileSegmentation {
public:
    PileSegmentation();
    ~PileSegmentation();

    void setInputCloud(pcl::PointCloud<pcl::PointXYZ>::Ptr cloud);
    void setClusterTolerance(double tolerance);
    void setMinClusterSize(int min_size);
    void setMaxClusterSize(int max_size);
    void segment();

    std::vector<pcl::PointCloud<pcl::PointXYZ>::Ptr> getPileClouds();

private:
    pcl::PointCloud<pcl::PointXYZ>::Ptr input_cloud_;
    std::vector<pcl::PointCloud<pcl::PointXYZ>::Ptr> pile_clouds_;

    double cluster_tolerance_;
    int min_cluster_size_;
    int max_cluster_size_;
};

#endif
