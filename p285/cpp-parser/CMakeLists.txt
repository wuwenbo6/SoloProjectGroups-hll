cmake_minimum_required(VERSION 3.14)
project(hpav-parser LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(hpav-parser
    src/main.cpp
    src/FrameParser.cpp
    src/MacHeaderParser.cpp
    src/SofParser.cpp
    src/SignalingParser.cpp
    src/JsonBuilder.cpp
)

target_include_directories(hpav-parser PRIVATE src)
