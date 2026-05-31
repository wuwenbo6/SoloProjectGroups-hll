import time
import numpy as np

try:
    from .pure_python_solver import ShallowWaterSolverPurePython, ShallowWaterSolverNumpy
except (ImportError, ValueError):
    from pure_python_solver import ShallowWaterSolverPurePython, ShallowWaterSolverNumpy

try:
    from .solver import ShallowWaterSolverCPP
    CPP_AVAILABLE = True
except (ImportError, ValueError):
    try:
        from solver import ShallowWaterSolverCPP
        CPP_AVAILABLE = True
    except ImportError:
        CPP_AVAILABLE = False
        ShallowWaterSolverCPP = None


def benchmark_pure_python(nx, ny, num_steps):
    solver = ShallowWaterSolverPurePython(nx, ny, dx=1000.0, dy=1000.0, dt=0.1)
    solver.initialize_gaussian_bump(100.0, 5.0, nx * 500.0, ny * 500.0, 20000.0)
    
    start_time = time.time()
    solver.run(num_steps)
    elapsed_time = time.time() - start_time
    
    return elapsed_time, solver.h.copy()


def benchmark_numpy(nx, ny, num_steps):
    solver = ShallowWaterSolverNumpy(nx, ny, dx=1000.0, dy=1000.0, dt=0.1)
    solver.initialize_gaussian_bump(100.0, 5.0, nx * 500.0, ny * 500.0, 20000.0)
    
    start_time = time.time()
    solver.run(num_steps)
    elapsed_time = time.time() - start_time
    
    return elapsed_time, solver.h.copy()


def benchmark_cpp(nx, ny, num_steps):
    if not CPP_AVAILABLE:
        raise RuntimeError("C++ module not available")
    
    solver = ShallowWaterSolverCPP(nx, ny, dx=1000.0, dy=1000.0, dt=0.1)
    solver.initialize_gaussian_bump(100.0, 5.0, nx * 500.0, ny * 500.0, 20000.0)
    
    start_time = time.time()
    solver.run(num_steps)
    elapsed_time = time.time() - start_time
    
    return elapsed_time, solver.h.copy()


def run_benchmark(grid_sizes=[(32, 32), (64, 64), (128, 128)], num_steps=100):
    results = []
    
    for nx, ny in grid_sizes:
        print(f"\nBenchmarking grid size: {nx}x{ny}, Steps: {num_steps}")
        
        if nx <= 64 and ny <= 64:
            time_py, h_py = benchmark_pure_python(nx, ny, num_steps)
            print(f"  Pure Python: {time_py:.4f}s")
        else:
            time_py = None
            h_py = None
            print(f"  Pure Python: skipped (too slow)")
        
        time_np, h_np = benchmark_numpy(nx, ny, num_steps)
        print(f"  NumPy: {time_np:.4f}s")
        
        if CPP_AVAILABLE:
            time_cpp, h_cpp = benchmark_cpp(nx, ny, num_steps)
            print(f"  C++ (SWIG): {time_cpp:.4f}s")
        else:
            time_cpp = None
            h_cpp = None
            print(f"  C++ (SWIG): not available")
        
        if h_py is not None:
            error_py_np = np.max(np.abs(h_py - h_np))
            print(f"  Error (Py vs NP): {error_py_np:.6e}")
        else:
            error_py_np = None
        
        error_np_cpp = None
        if h_cpp is not None:
            error_np_cpp = np.max(np.abs(h_np - h_cpp))
            print(f"  Error (NP vs C++): {error_np_cpp:.6e}")
        
        speedup_vs_numpy = None
        if time_cpp is not None and time_cpp > 0:
            speedup_vs_numpy = time_np / time_cpp
            print(f"  Speedup (C++ vs NumPy): {speedup_vs_numpy:.2f}x")
        
        speedup_vs_purepy = None
        if time_py is not None and time_cpp is not None and time_cpp > 0:
            speedup_vs_purepy = time_py / time_cpp
            print(f"  Speedup (C++ vs Pure Python): {speedup_vs_purepy:.2f}x")
        
        results.append({
            'grid_size': (nx, ny),
            'num_steps': num_steps,
            'time_pure_python': time_py,
            'time_numpy': time_np,
            'time_cpp': time_cpp,
            'speedup_vs_numpy': speedup_vs_numpy,
            'speedup_vs_purepy': speedup_vs_purepy,
            'error_py_np': error_py_np,
            'error_np_cpp': error_np_cpp
        })
    
    return results


def print_benchmark_results(results):
    print("\n" + "="*80)
    print("PERFORMANCE COMPARISON SUMMARY")
    print("="*80)
    
    has_cpp = any(r['time_cpp'] is not None for r in results)
    
    if has_cpp:
        print(f"{'Grid Size':<15} {'Pure Python':<15} {'NumPy':<15} {'C++':<15} {'Speedup (C++/NP)':<20}")
        print("-"*80)
        
        for r in results:
            nx, ny = r['grid_size']
            grid_str = f"{nx}x{ny}"
            py_str = f"{r['time_pure_python']:.4f}s" if r['time_pure_python'] else "N/A"
            np_str = f"{r['time_numpy']:.4f}s"
            cpp_str = f"{r['time_cpp']:.4f}s" if r['time_cpp'] else "N/A"
            speedup_str = f"{r['speedup_vs_numpy']:.2f}x" if r['speedup_vs_numpy'] else "N/A"
            
            print(f"{grid_str:<15} {py_str:<15} {np_str:<15} {cpp_str:<15} {speedup_str:<20}")
    else:
        print(f"{'Grid Size':<15} {'Pure Python':<15} {'NumPy':<15} {'Speedup (NP/Py)':<20}")
        print("-"*80)
        
        for r in results:
            nx, ny = r['grid_size']
            grid_str = f"{nx}x{ny}"
            py_str = f"{r['time_pure_python']:.4f}s" if r['time_pure_python'] else "N/A"
            np_str = f"{r['time_numpy']:.4f}s"
            speedup_str = f"{r['time_pure_python']/r['time_numpy']:.2f}x" if r['time_pure_python'] else "N/A"
            
            print(f"{grid_str:<15} {py_str:<15} {np_str:<15} {speedup_str:<20}")
    
    print("="*80)
