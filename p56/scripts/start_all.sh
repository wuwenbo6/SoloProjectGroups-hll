#!/bin/bash

cd "$(dirname "$0")/.."

echo "🚗🚗🚗 启动完整无人车仿真系统..."

trap "echo '🔴 正在停止所有服务...'; pkill -P $$; exit" SIGINT SIGTERM

echo "📦 安装Python依赖..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt > /dev/null 2>&1

echo "📦 安装Node.js依赖..."
npm install > /dev/null 2>&1

echo "🚀 启动后端服务器 (端口 8000)..."
cd src/server && python main.py &
BACKEND_PID=$!

sleep 3

echo "🌐 系统已启动！"
echo ""
echo "📋 访问地址：http://localhost:8000"
echo ""
echo "🔧 控制："
echo "   - 鼠标左键拖动：旋转视角"
echo "   - 鼠标滚轮：缩放"
echo "   - 鼠标右键拖动：平移"
echo ""
echo "🔴 按 Ctrl+C 停止所有服务"

wait $BACKEND_PID
