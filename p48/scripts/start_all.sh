#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "  3D料堆体积测量系统 - 启动脚本"
echo "=========================================="
echo ""

echo "Starting backend server in background..."
"$SCRIPT_DIR/start_backend.sh" &
BACKEND_PID=$!

sleep 3

echo ""
echo "Starting frontend server..."
echo ""
echo "=========================================="
echo "  服务地址:"
echo "  前端: http://localhost:8080"
echo "  后端API: http://localhost:5000"
echo "=========================================="
echo ""
echo "按 Ctrl+C 停止所有服务"

"$SCRIPT_DIR/start_frontend.sh" &
FRONTEND_PID=$!

trap "echo ''; echo 'Stopping services...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

wait
