#include "point_cloud_processor.h"
#include <iostream>
#include <boost/property_tree/ptree.hpp>
#include <boost/property_tree/json_parser.hpp>
#include <sstream>

int main(int argc, char** argv) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <input.pcd> [output.pcd]" << std::endl;
        return 1;
    }

    std::string input_file = argv[1];
    std::string output_file = (argc >= 3) ? argv[2] : "output.pcd";

    PointCloudProcessor processor;

    if (!processor.loadPointCloud(input_file)) {
        std::cerr << "Failed to load point cloud: " << input_file << std::endl;
        return 1;
    }

    processor.process();

    auto piles = processor.getPileVolumes();

    boost::property_tree::ptree root;
    boost::property_tree::ptree piles_array;

    for (const auto& pile : piles) {
        boost::property_tree::ptree pile_node;
        pile_node.put("id", pile.id);
        pile_node.put("volume", pile.volume);
        pile_node.put("centroid_x", pile.centroid[0]);
        pile_node.put("centroid_y", pile.centroid[1]);
        pile_node.put("centroid_z", pile.centroid[2]);
        piles_array.push_back(std::make_pair("", pile_node));
    }

    root.add_child("piles", piles_array);
    root.put("total_piles", piles.size());

    std::stringstream ss;
    boost::property_tree::write_json(ss, root);
    std::cout << ss.str() << std::endl;

    if (processor.saveProcessedCloud(output_file)) {
        std::cerr << "Saved processed cloud to: " << output_file << std::endl;
    }

    return 0;
}
