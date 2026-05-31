#!/bin/bash

set -e

USE_MPI=OFF

while [[ $# -gt 0 ]]; do
    case $1 in
        --mpi)
            USE_MPI=ON
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "========================================"
echo "Building Shallow Water Solver"
if [ "$USE_MPI" = "ON" ]; then
    echo "  MPI support: enabled"
fi
echo "========================================"

mkdir -p build
cd build

echo "Configuring with CMake..."
cmake .. -DCMAKE_BUILD_TYPE=Release -DUSE_MPI=$USE_MPI

echo "Building..."
make -j4

echo "Copying Python modules..."
cp *.so ../src/python/ 2>/dev/null || true
cp shallow_water.py ../src/python/ 2>/dev/null || true

cd ..

echo "========================================"
echo "Build completed!"
echo "========================================"
echo ""
echo "To use the module, add the src/python directory to your PYTHONPATH:"
echo "  export PYTHONPATH=\$PWD/src/python:\$PYTHONPATH"
echo ""
echo "Or install in development mode:"
echo "  pip install -e ."
echo ""
if [ "$USE_MPI" = "ON" ]; then
echo "To run with MPI:"
echo "  mpirun -np 4 python3 your_script.py"
fi
