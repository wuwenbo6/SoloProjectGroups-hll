#!/bin/bash

echo "============================================="
echo "  PointCloud Detection System - 启动脚本"
echo "============================================="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "启动后端服务..."
echo "---------------------------------------------"

cd "$ROOT_DIR/backend"

if [ ! -d "venv" ]; then
    echo "创建 Python 虚拟环境..."
    python3 -m venv venv
fi

source venv/bin/activate

if [ ! -f "venv/.installed" ]; then
    echo "安装 Python 依赖..."
    pip install --upgrade pip
    pip install -r requirements.txt
    touch venv/.installed
fi

python app.py &
BACKEND_PID=$!

echo ""
echo "启动前端服务..."
echo "---------------------------------------------"

cd "$ROOT_DIR/frontend"

if [ ! -d "node_modules" ]; then
    echo "安装 Node.js 依赖..."
    npm install
fi

npm run dev &
FRONTEND_PID=$!

echo ""
echo "============================================="
echo "  服务启动中..."
echo "  后端: http://localhost:5000"
echo "  前端: http://localhost:3000"
echo ""
echo "  按 Ctrl+C 停止所有服务"
echo "============================================="

trap "echo ''; echo '正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

wait
