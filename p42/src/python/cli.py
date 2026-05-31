#!/usr/bin/env python3
import argparse
import os
import sys
import numpy as np


def main():
    parser = argparse.ArgumentParser(
        description='Shallow Water Equation Solver with SWIG-wrapped C++ backend'
    )
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    run_parser = subparsers.add_parser('run', help='Run a simulation')
    run_parser.add_argument('--nx', type=int, default=100, help='Grid size in x direction')
    run_parser.add_argument('--ny', type=int, default=100, help='Grid size in y direction')
    run_parser.add_argument('--dx', type=float, default=1000.0, help='Grid spacing in x (m)')
    run_parser.add_argument('--dy', type=float, default=1000.0, help='Grid spacing in y (m)')
    run_parser.add_argument('--dt', type=float, default=0.1, help='Time step (s)')
    run_parser.add_argument('--steps', type=int, default=100, help='Number of time steps')
    run_parser.add_argument('--g', type=float, default=9.81, help='Gravity acceleration (m/s^2)')
    run_parser.add_argument('--f', type=float, default=1e-4, help='Coriolis parameter (1/s)')
    run_parser.add_argument('--viscosity', type=float, default=100.0, help='Artificial viscosity (m^2/s)')
    run_parser.add_argument('--mean-depth', type=float, default=100.0, help='Mean water depth (m)')
    run_parser.add_argument('--bump-amp', type=float, default=5.0, help='Gaussian bump amplitude (m)')
    run_parser.add_argument('--bump-sigma', type=float, default=20000.0, help='Gaussian bump width (m)')
    run_parser.add_argument('--output', type=str, default='output.nc', help='Output NetCDF file')
    run_parser.add_argument('--plot', action='store_true', help='Plot final results')
    run_parser.add_argument('--save-plot', type=str, default=None, help='Save final plot to file')
    run_parser.add_argument('--realtime', action='store_true', help='Enable real-time visualization')
    run_parser.add_argument('--plot-interval', type=int, default=1, help='Plot every N steps')
    run_parser.add_argument('--save-gif', type=str, default=None, help='Save animation to GIF file')
    run_parser.add_argument('--gif-fps', type=int, default=10, help='GIF frames per second')
    
    benchmark_parser = subparsers.add_parser('benchmark', help='Run performance benchmark')
    benchmark_parser.add_argument('--sizes', type=str, default='32,64,128', 
                                  help='Comma-separated grid sizes to test')
    benchmark_parser.add_argument('--steps', type=int, default=100, 
                                  help='Number of steps for benchmark')
    
    info_parser = subparsers.add_parser('info', help='Show information about the solver')
    
    args = parser.parse_args()
    
    if args.command == 'run':
        run_simulation(args)
    elif args.command == 'benchmark':
        run_benchmark_cmd(args)
    elif args.command == 'info':
        show_info()
    else:
        parser.print_help()


def _import_modules():
    try:
        from .solver import ShallowWaterSolverCPP
        from .netcdf_io import NetCDFIO
        from .visualization import plot_fields, plot_height_with_quiver, RealtimeVisualizer
        return ShallowWaterSolverCPP, NetCDFIO, plot_fields, plot_height_with_quiver, RealtimeVisualizer, "C++ (SWIG)"
    except (ImportError, ValueError):
        pass
    
    try:
        from solver import ShallowWaterSolverCPP
        from netcdf_io import NetCDFIO
        from visualization import plot_fields, plot_height_with_quiver, RealtimeVisualizer
        return ShallowWaterSolverCPP, NetCDFIO, plot_fields, plot_height_with_quiver, RealtimeVisualizer, "C++ (SWIG)"
    except ImportError:
        pass
    
    try:
        from .pure_python_solver import ShallowWaterSolverNumpy
        from .netcdf_io import NetCDFIO
        from .visualization import plot_fields, plot_height_with_quiver, RealtimeVisualizer
        return ShallowWaterSolverNumpy, NetCDFIO, plot_fields, plot_height_with_quiver, RealtimeVisualizer, "NumPy"
    except (ImportError, ValueError):
        pass
    
    from pure_python_solver import ShallowWaterSolverNumpy
    from netcdf_io import NetCDFIO
    from visualization import plot_fields, plot_height_with_quiver, RealtimeVisualizer
    return ShallowWaterSolverNumpy, NetCDFIO, plot_fields, plot_height_with_quiver, RealtimeVisualizer, "NumPy"


def run_simulation(args):
    print("="*60)
    print("Shallow Water Equation Solver")
    print("="*60)
    print(f"Grid size: {args.nx} x {args.ny}")
    print(f"Grid spacing: dx={args.dx}, dy={args.dy}")
    print(f"Time step: {args.dt}s")
    print(f"Number of steps: {args.steps}")
    print("="*60)
    
    SolverClass, NetCDFIO, plot_fields, plot_height_with_quiver, RealtimeVisualizer, solver_backend = _import_modules()
    
    if solver_backend == "NumPy":
        print("Note: C++ module not available, using NumPy backend")
    print(f"Using backend: {solver_backend}")
    
    if args.realtime:
        print("Real-time visualization: enabled")
    if args.save_gif:
        print(f"GIF export: {args.save_gif}")
    print("="*60)
    
    solver = SolverClass(
        args.nx, args.ny, args.dx, args.dy,
        g=args.g, f=args.f, dt=args.dt, viscosity=args.viscosity
    )
    
    x0 = args.nx * args.dx / 2.0
    y0 = args.ny * args.dy / 2.0
    solver.initialize_gaussian_bump(
        args.mean_depth, args.bump_amp, x0, y0, args.bump_sigma
    )
    
    print("\nRunning simulation...")
    import time
    start_time = time.time()
    
    viz = None
    if args.realtime or args.save_gif:
        viz = RealtimeVisualizer()
    
    try:
        for step in range(args.steps):
            solver.step()
            
            if (args.realtime or args.save_gif) and (step % args.plot_interval == 0):
                h = solver.h
                u = solver.u
                v = solver.v
                
                if args.realtime:
                    viz.update(h, u, v, step=step)
                else:
                    viz.record_frame(h, u, v)
        
        if args.save_gif:
            print(f"\nSaving GIF animation to {args.save_gif}...")
            viz.save_gif(args.save_gif, fps=args.gif_fps)
    
    except KeyboardInterrupt:
        print("\nSimulation interrupted by user")
    finally:
        if viz:
            viz.close()
    
    elapsed_time = time.time() - start_time
    
    print(f"Simulation completed in {elapsed_time:.4f} seconds")
    print(f"Average time per step: {elapsed_time/args.steps:.6f} seconds")
    
    print(f"\nSaving output to {args.output}...")
    h = solver.h
    u = solver.u
    v = solver.v
    
    NetCDFIO.write_simulation(
        args.output, h, u, v,
        args.dx, args.dy, args.steps, args.steps * args.dt
    )
    print("Output saved successfully!")
    
    if args.plot or args.save_plot:
        print("\nGenerating plots...")
        import matplotlib
        if args.save_plot and not args.plot:
            matplotlib.use('Agg')
        
        title = f"Shallow Water Simulation - Step {args.steps}"
        
        if args.save_plot:
            plot_fields(h, u, v, title=title, save_path=args.save_plot, show=args.plot)
            print(f"Plot saved to {args.save_plot}")
        else:
            plot_fields(h, u, v, title=title, show=True)


def run_benchmark_cmd(args):
    sizes = [int(s) for s in args.sizes.split(',')]
    grid_sizes = [(s, s) for s in sizes]
    
    print("="*60)
    print("Performance Benchmark: Pure Python vs NumPy vs C++")
    print("="*60)
    
    try:
        from .benchmark import run_benchmark, print_benchmark_results
    except (ImportError, ValueError):
        from benchmark import run_benchmark, print_benchmark_results
    
    results = run_benchmark(grid_sizes=grid_sizes, num_steps=args.steps)
    print_benchmark_results(results)


def show_info():
    print("="*60)
    print("Shallow Water Equation Solver")
    print("="*60)
    print("\nThis package provides:")
    print("  1. C++ implementation of shallow water equations")
    print("  2. SWIG wrapper for Python integration")
    print("  3. NetCDF input/output support")
    print("  4. Matplotlib visualization")
    print("  5. Performance comparison tools")
    print("\nUsage examples:")
    print("  shallow-water run --nx 100 --ny 100 --steps 500 --plot")
    print("  shallow-water run --nx 200 --ny 200 --steps 1000 --output result.nc")
    print("  shallow-water benchmark --sizes 32,64,128,256 --steps 100")
    print("\nFor more details, use --help with each subcommand.")


if __name__ == '__main__':
    main()
