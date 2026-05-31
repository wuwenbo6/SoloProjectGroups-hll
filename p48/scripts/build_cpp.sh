#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CPP_DIR="$PROJECT_ROOT/backend/cpp"
BUILD_DIR="$CPP_DIR/build"

echo "Building C++ Point Cloud Processor..."
echo "Project root: $PROJECT_ROOT"

if [ ! -d "$BUILD_DIR" ]; then
    echo "Creating build directory..."
    mkdir -p "$BUILD_DIR"
fi

cd "$BUILD_DIR"

echo "Running CMake..."
cmake ..

if [ $? -ne 0 ]; then
    echo "CMake configuration failed!"
    exit 1
fi

echo "Building..."
make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu)

if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi

echo "Build completed successfully!"
echo "Executable: $BUILD_DIR/point_cloud_processor"
