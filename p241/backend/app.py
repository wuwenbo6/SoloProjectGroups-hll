from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from rdma_simulator import run_simulation, NUMA_MODES
import json
from datetime import datetime

app = Flask(__name__)
CORS(app)


@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "version": "1.2.0"})


@app.route("/api/numa-modes")
def numa_modes():
    return jsonify({
        mode: {"label": cfg["label"], "latency_multiplier": cfg["latency_multiplier"], "bandwidth_penalty": cfg["bandwidth_penalty"]}
        for mode, cfg in NUMA_MODES.items()
    })


@app.route("/api/simulate")
def simulate():
    iterations = request.args.get("iterations", default=100, type=int)
    include_traditional = request.args.get(
        "include_traditional", default="true", type=str
    ).lower() in ("true", "1", "yes")
    pcie_version = request.args.get("pcie_version", default="gen4", type=str)
    gpu_count = request.args.get("gpu_count", default=1, type=int)
    numa_mode = request.args.get("numa_mode", default="local", type=str)

    iterations = max(1, min(iterations, 10000))
    if pcie_version not in ("gen3", "gen4"):
        pcie_version = "gen4"
    gpu_count = max(1, min(gpu_count, 8))
    if numa_mode not in NUMA_MODES:
        numa_mode = "local"

    result = run_simulation(
        iterations=iterations,
        include_traditional=include_traditional,
        pcie_version=pcie_version,
        gpu_count=gpu_count,
        numa_mode=numa_mode,
    )
    return jsonify(result)


@app.route("/api/export")
def export_json():
    iterations = request.args.get("iterations", default=100, type=int)
    include_traditional = request.args.get(
        "include_traditional", default="true", type=str
    ).lower() in ("true", "1", "yes")
    pcie_version = request.args.get("pcie_version", default="gen4", type=str)
    gpu_count = request.args.get("gpu_count", default=1, type=int)
    numa_mode = request.args.get("numa_mode", default="local", type=str)

    iterations = max(1, min(iterations, 10000))
    if pcie_version not in ("gen3", "gen4"):
        pcie_version = "gen4"
    gpu_count = max(1, min(gpu_count, 8))
    if numa_mode not in NUMA_MODES:
        numa_mode = "local"

    result = run_simulation(
        iterations=iterations,
        include_traditional=include_traditional,
        pcie_version=pcie_version,
        gpu_count=gpu_count,
        numa_mode=numa_mode,
    )

    result["export_meta"] = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "simulator_version": "1.2.0",
        "model": "GPUDirect RDMA Simulator",
    }

    json_str = json.dumps(result, indent=2, ensure_ascii=False)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"rdma_sim_{pcie_version}_{gpu_count}gpu_{numa_mode}_{timestamp}.json"

    return Response(
        json_str,
        mimetype="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
