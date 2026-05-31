#ifndef POINT_CLOUD_PROCESSOR_H
#define POINT_CLOUD_PROCESSOR_H

#include <pcl/point_cloud.h>
#include <pcl/point_types.h>
#include <pcl/ModelCoefficients.h>
#include <vector>
#include <string>

struct PileVolume {
    int id;
    double volume;
    Eigen::Vector4f centroid;
    pcl::PointCloud<pcl::PointXYZRGB>::Ptr cloud;
};

class PointCloudProcessor {
public:
    PointCloudProcessor();
    ~PointCloudProcessor();

    bool loadPointCloud(const std::string& filename);
    bool loadFromPoints(const std::vector<float>& points);
    void process();
    std::vector<PileVolume> getPileVolumes() const;
    pcl::PointCloud<pcl::PointXYZRGB>::Ptr getColoredCloud() const;
    pcl::PointCloud<pcl::PointXYZ>::Ptr getGroundCloud() const;
    bool saveProcessedCloud(const std::string& filename);

    void setGroundDistanceThreshold(double threshold);
    void setPileClusterTolerance(double tolerance);
    void setMinPileSize(int min_size);
    void setMaxPileSize(int max_size);
    void setVoxelGridLeafSize(double size);

private:
    pcl::PointCloud<pcl::PointXYZ>::Ptr input_cloud_;
    pcl::PointCloud<pcl::PointXYZ>::Ptr ground_cloud_;
    pcl::PointCloud<pcl::PointXYZ>::Ptr objects_cloud_;
    pcl::PointCloud<pcl::PointXYZRGB>::Ptr colored_cloud_;
    std::vector<PileVolume> pile_volumes_;

    double ground_distance_threshold_;
    double pile_cluster_tolerance_;
    int min_pile_size_;
    int max_pile_size_;
    double voxel_leaf_size_;

    void removeGround();
    void segmentPiles();
    void calculateVolumes();
    void colorizeCloud();
};

#endif
