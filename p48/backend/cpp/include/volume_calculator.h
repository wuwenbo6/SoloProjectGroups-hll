#ifndef VOLUME_CALCULATOR_H
#define VOLUME_CALCULATOR_H

#include <pcl/point_cloud.h>
#include <pcl/point_types.h>
#include <pcl/ModelCoefficients.h>

class VolumeCalculator {
public:
    VolumeCalculator();
    ~VolumeCalculator();

    void setInputCloud(pcl::PointCloud<pcl::PointXYZ>::Ptr cloud);
    void setGroundPlane(pcl::ModelCoefficients::Ptr ground_coeffs);
    void setResolution(double resolution);
    double calculateVolume();
    Eigen::Vector4f getCentroid();

private:
    pcl::PointCloud<pcl::PointXYZ>::Ptr input_cloud_;
    pcl::ModelCoefficients::Ptr ground_coeffs_;
    double resolution_;

    double calculateConvexHullVolume();
    double calculateVoxelVolume();
    double calculateIntegrationVolume();
};

#endif
