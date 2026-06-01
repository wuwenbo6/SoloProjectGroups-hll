#!/bin/bash

cd "$(dirname "$0")"

echo "========================================"
echo "  Modbus 模糊测试平台"
echo "========================================"
echo ""

echo "检查 Python 依赖..."
cd backend
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install -q -r requirements.txt

echo "启动后端服务..."
python main.py &
BACKEND_PID=$!

echo "等待后端启动..."
sleep 3

echo ""
echo "启动前端服务..."
cd ../frontend

if [ ! -d "node_modules" ]; then
    echo "安装前端依赖..."
    npm install --legacy-peer-deps
fi

npm run dev &
FRONTEND_PID=$!

echo ""
echo "========================================"
echo "  服务启动完成！"
echo "  前端: http://localhost:3000"
echo "  后端API: http://localhost:8000"
echo "  API文档: http://localhost:8000/docs"
echo "========================================"
echo ""
echo "按 Ctrl+C 停止所有服务"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

wait
