#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                P4 模拟器启动脚本                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"

echo ""
echo "项目目录: $PROJECT_DIR"
echo ""

trap "echo ''; echo '正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

echo "[1/3] 启动后端 API 服务 (端口 8000)..."
cd "$PROJECT_DIR/backend"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "  后端 PID: $BACKEND_PID"

sleep 2

echo ""
echo "[2/3] 启动前端开发服务 (端口 5173)..."
cd "$PROJECT_DIR"
npm run dev &
FRONTEND_PID=$!
echo "  前端 PID: $FRONTEND_PID"

sleep 3

echo ""
echo "[3/3] 服务启动完成!"
echo ""
echo "  后端 API:    http://localhost:8000"
echo "  API 文档:    http://localhost:8000/docs"
echo "  前端界面:    http://localhost:5173"
echo ""
echo "  按 Ctrl+C 停止所有服务"
echo ""

wait $BACKEND_PID $FRONTEND_PID
