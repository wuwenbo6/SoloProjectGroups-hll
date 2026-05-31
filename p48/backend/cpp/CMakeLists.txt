cmake_minimum_required(VERSION 3.10)
project(PointCloudProcessor)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(PCL 1.8 REQUIRED)
find_package(Boost REQUIRED COMPONENTS system filesystem)

include_directories(${PCL_INCLUDE_DIRS} ${Boost_INCLUDE_DIRS} include)
link_directories(${PCL_LIBRARY_DIRS})
add_definitions(${PCL_DEFINITIONS})

add_executable(point_cloud_processor
    src/main.cpp
    src/point_cloud_processor.cpp
    src/ground_segmentation.cpp
    src/pile_segmentation.cpp
    src/volume_calculator.cpp
)

target_link_libraries(point_cloud_processor
    ${PCL_LIBRARIES}
    ${Boost_LIBRARIES}
)

install(TARGETS point_cloud_processor DESTINATION bin)
