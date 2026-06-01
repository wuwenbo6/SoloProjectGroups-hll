import subprocess
import os
import json
from typing import List, Dict, Any

CPP_EXECUTABLE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "build", "option_pricing")

def run_cpp_pricing(
    option_style: str,
    option_type: str,
    S0: float,
    K: float,
    T: float,
    r: float,
    sigma: float,
    num_paths: int,
    num_steps: int = 252
) -> Dict[str, float]:
    args = [
        CPP_EXECUTABLE,
        option_style,
        option_type,
        str(S0),
        str(K),
        str(T),
        str(r),
        str(sigma),
        str(num_paths)
    ]
    
    if option_style in ["asian", "american"]:
        args.append(str(num_steps))
    
    result = subprocess.run(args, capture_output=True, text=True)
    
    if result.returncode != 0:
        raise Exception(f"C++ error: {result.stderr}")
    
    output = result.stdout.strip().split()
    return {
        "price": float(output[0]),
        "ci_lower": float(output[1]),
        "ci_upper": float(output[2]),
        "std_error": float(output[3]),
        "time_taken": float(output[4])
    }

def price_option(
    option_style: str,
    option_type: str,
    S0: float,
    K: float,
    T: float,
    r: float,
    sigma: float,
    num_paths: int = 100000,
    num_steps: int = 252,
    underlying_name: str = "Asset"
) -> Dict[str, Any]:
    result = run_cpp_pricing(
        option_style, option_type, S0, K, T, r, sigma, num_paths, num_steps
    )
    result["underlying_name"] = underlying_name
    result["option_style"] = option_style
    result["option_type"] = option_type
    result["params"] = {
        "S0": S0,
        "K": K,
        "T": T,
        "r": r,
        "sigma": sigma,
        "num_paths": num_paths,
        "num_steps": num_steps
    }
    return result

def price_multi_asset(options: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    results = []
    for option in options:
        result = price_option(**option)
        results.append(result)
    return results
