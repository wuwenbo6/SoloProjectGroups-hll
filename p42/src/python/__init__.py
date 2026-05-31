from .solver import ShallowWaterSolverCPP
from .netcdf_io import NetCDFIO
from .visualization import (
    plot_fields, plot_height_with_quiver, animate_simulation,
    RealtimeVisualizer, run_simulation_with_visualization
)
from .benchmark import benchmark_pure_python, benchmark_cpp, run_benchmark

__version__ = "0.1.0"
__all__ = [
    "ShallowWaterSolverCPP",
    "NetCDFIO",
    "plot_fields",
    "plot_height_with_quiver",
    "animate_simulation",
    "RealtimeVisualizer",
    "run_simulation_with_visualization",
    "benchmark_pure_python",
    "benchmark_cpp",
    "run_benchmark"
]
