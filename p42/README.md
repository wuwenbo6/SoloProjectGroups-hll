# Shallow Water Equation Solver - SWIG + C++

This project implements a 2D shallow water equation solver with:
- C++ core implementation for high performance
- SWIG wrapper for Python integration
- NetCDF input/output support
- Matplotlib visualization
- Performance comparison (Pure Python vs NumPy vs C++)

## Prerequisites

### System Dependencies
```bash
# macOS (using Homebrew)
brew install cmake swig netcdf

# Ubuntu/Debian
sudo apt-get install cmake swig libnetcdf-dev
```

### Python Dependencies
```bash
pip install numpy matplotlib netCDF4
```

## Building

```bash
# Build using CMake
./build.sh

# Or install in development mode
pip install -e .
```

## Usage

### Command Line Interface

```bash
# Run a simulation
shallow-water run --nx 100 --ny 100 --steps 500 --plot

# Run with custom parameters
shallow-water run --nx 200 --ny 200 --steps 1000 --output simulation.nc

# Run performance benchmark
shallow-water benchmark --sizes 32,64,128,256 --steps 100

# Show info
shallow-water info
```

### Python API

```python
from shallow_water import ShallowWaterSolverCPP, plot_fields, run_benchmark

# Create solver
solver = ShallowWaterSolverCPP(nx=100, ny=100, dx=1000.0, dy=1000.0, dt=0.1)

# Initialize with Gaussian bump
solver.initialize_gaussian_bump(
    mean_depth=100.0, amp=5.0,
    x0=50000.0, y0=50000.0, sigma=20000.0
)

# Run simulation
solver.run(500)

# Plot results
plot_fields(solver.h, solver.u, solver.v)

# Run performance benchmark
results = run_benchmark(grid_sizes=[(32,32), (64,64), (128,128)])
```

## Project Structure

```
.
├── CMakeLists.txt          # CMake build configuration
├── setup.py                # Python package setup
├── build.sh                # Build script
├── src/
│   ├── cpp/                # C++ source code
│   │   ├── shallow_water_solver.h
│   │   ├── shallow_water_solver.cpp
│   │   ├── netcdf_io.h
│   │   └── netcdf_io.cpp
│   ├── swig/               # SWIG interface
│   │   └── shallow_water.i
│   └── python/             # Python modules
│       ├── __init__.py
│       ├── solver.py       # C++ solver wrapper
│       ├── pure_python_solver.py
│       ├── netcdf_io.py
│       ├── visualization.py
│       ├── benchmark.py
│       └── cli.py          # Command line interface
├── examples/               # Example scripts
└── tests/                  # Tests
```

## Performance Expectations

| Grid Size | Pure Python | NumPy | C++ (SWIG) | Speedup vs NumPy |
|-----------|-------------|-------|------------|------------------|
| 32x32     | ~10s        | ~0.05s| ~0.01s     | ~5x              |
| 64x64     | ~40s        | ~0.2s | ~0.05s     | ~4x              |
| 128x128   | N/A         | ~0.8s | ~0.2s      | ~4x              |
| 256x256   | N/A         | ~3s   | ~0.8s      | ~4x              |

## Mathematical Formulation

The shallow water equations solved are:

∂h/∂t + ∇·(h u) = 0

∂(h u)/∂t + ∇·(h u u) + g h ∇h = f h v

∂(h v)/∂t + ∇·(h v v) + g h ∇h = -f h u

where:
- h is the water depth
- u, v are velocity components
- g is gravitational acceleration
- f is the Coriolis parameter
