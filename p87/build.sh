#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"

echo "Building C++ option pricing library..."

if [ ! -d "$BUILD_DIR" ]; then
    mkdir -p "$BUILD_DIR"
fi

cd "$BUILD_DIR"
cmake "$SCRIPT_DIR/cpp"
make -j4

if [ $? -eq 0 ]; then
    echo "Build successful! Executable at: $BUILD_DIR/option_pricing"
else
    echo "Build failed!"
    exit 1
fi
