#ifndef GROUND_SEGMENTATION_H
#define GROUND_SEGMENTATION_H

#include <pcl/point_cloud.h>
#include <pcl/point_types.h>
#include <pcl/ModelCoefficients.h>
#include <pcl/PointIndices.h>
#include <Eigen/Core>

class RobustGroundSegmentation {
public:
    RobustGroundSegmentation();
    ~RobustGroundSegmentation();

    void setInputCloud(pcl::PointCloud<pcl::PointXYZ>::Ptr cloud);
    void setDistanceThreshold(double threshold);
    void setNormalThreshold(double threshold);
    void setMaxInclinationAngle(double angle_degrees);
    void setUseNormalConstraint(bool use);
    void setGroundNormal(const Eigen::Vector3f& normal);
    
    void segment();

    pcl::PointCloud<pcl::PointXYZ>::Ptr getGroundCloud();
    pcl::PointCloud<pcl::PointXYZ>::Ptr getObjectsCloud();
    pcl::ModelCoefficients::Ptr getGroundCoefficients();
    bool getSegmentationSuccess() const;

private:
    pcl::PointCloud<pcl::PointXYZ>::Ptr input_cloud_;
    pcl::PointCloud<pcl::PointXYZ>::Ptr filtered_cloud_;
    pcl::PointCloud<pcl::PointXYZ>::Ptr ground_cloud_;
    pcl::PointCloud<pcl::PointXYZ>::Ptr objects_cloud_;
    pcl::ModelCoefficients::Ptr ground_coefficients_;
    pcl::PointIndices::Ptr ground_inliers_;

    double distance_threshold_;
    double normal_threshold_;
    double max_inclination_angle_rad_;
    bool use_normal_constraint_;
    Eigen::Vector3f ground_normal_;
    bool segmentation_success_;

    void removeOutliers();
    bool detectGroundPlane();
    bool validateGroundPlane();
    void fallbackDetection();
};

#endif
