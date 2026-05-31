#!/usr/bin/env python3
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src', 'python'))

import numpy as np
from solver import ShallowWaterSolverCPP
from visualization import plot_fields, plot_height_with_quiver
from netcdf_io import NetCDFIO


def main():
    nx, ny = 100, 100
    dx, dy = 1000.0, 1000.0
    dt = 0.1
    num_steps = 200
    
    print(f"Creating solver with {nx}x{ny} grid...")
    solver = ShallowWaterSolverCPP(nx, ny, dx, dy, dt=dt)
    
    x0 = nx * dx / 2.0
    y0 = ny * dy / 2.0
    solver.initialize_gaussian_bump(100.0, 10.0, x0, y0, 20000.0)
    
    print("Initial state:")
    print(f"  h range: [{solver.h.min():.2f}, {solver.h.max():.2f}]")
    
    print(f"\nRunning {num_steps} steps...")
    import time
    start = time.time()
    solver.run(num_steps)
    elapsed = time.time() - start
    
    print(f"Completed in {elapsed:.2f} seconds")
    print(f"  Average: {elapsed/num_steps*1000:.2f} ms/step")
    
    print(f"\nFinal state:")
    print(f"  h range: [{solver.h.min():.2f}, {solver.h.max():.2f}]")
    print(f"  u range: [{solver.u.min():.2e}, {solver.u.max():.2e}]")
    print(f"  v range: [{solver.v.min():.2e}, {solver.v.max():.2e}]")
    
    output_file = 'example_output.nc'
    print(f"\nSaving to {output_file}...")
    NetCDFIO.write_simulation(
        output_file, solver.h, solver.u, solver.v,
        dx, dy, num_steps, num_steps * dt
    )
    print("Done!")
    
    print("\nReading back data...")
    h_read, u_read, v_read = NetCDFIO.read_simulation(output_file)
    print(f"  Read h shape: {h_read.shape}")
    print(f"  Max diff h: {np.max(np.abs(h_read - solver.h)):.2e}")
    
    print("\nGenerating plots...")
    import matplotlib
    matplotlib.use('Agg')
    
    plot_fields(
        solver.h, solver.u, solver.v,
        title=f"Shallow Water Simulation - {num_steps} Steps",
        save_path='example_fields.png',
        show=False
    )
    print("Saved example_fields.png")
    
    plot_height_with_quiver(
        solver.h, solver.u, solver.v, step=5,
        title=f"Water Height with Velocity Vectors",
        save_path='example_quiver.png',
        show=False
    )
    print("Saved example_quiver.png")
    
    print("\nExample completed successfully!")


if __name__ == '__main__':
    main()
