#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "=========================================="
echo "  启动前端服务"
echo "=========================================="
echo ""

cd "$FRONTEND_DIR"

echo "当前目录: $(pwd)"
echo ""

PORT=8000

echo "检查端口 $PORT..."
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "警告: 端口 $PORT 已被占用"
    lsof -Pi :$PORT -sTCP:LISTEN
    echo ""
    read -p "是否继续使用其他端口? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    PORT=8001
fi

echo "=========================================="
echo "  启动 HTTP 服务器"
echo "=========================================="
echo ""
echo "前端地址: http://localhost:$PORT"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

python3 -m http.server $PORT
