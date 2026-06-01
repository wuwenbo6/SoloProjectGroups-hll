#!/bin/bash

echo "========================================"
echo "MongoDB Change Streams 模拟器"
echo "========================================"
echo ""

echo "[1/3] 检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "正在安装依赖..."
    npm_config_cache=~/.npm-cache npm install --legacy-peer-deps --ignore-scripts
    if [ $? -ne 0 ]; then
        echo "依赖安装失败，请手动运行: npm install --legacy-peer-deps"
        exit 1
    fi
fi

echo ""
echo "[2/3] 启动后端服务 (端口 3001)..."
npm run server:dev &
SERVER_PID=$!

echo ""
echo "[3/3] 启动前端服务 (端口 5173)..."
sleep 3
npm run client:dev &
CLIENT_PID=$!

echo ""
echo "========================================"
echo "服务已启动！"
echo "后端: http://localhost:3001"
echo "前端: http://localhost:5173"
echo "========================================"
echo ""
echo "按 Ctrl+C 停止所有服务"

cleanup() {
    echo ""
    echo "正在停止服务..."
    kill $SERVER_PID $CLIENT_PID 2>/dev/null
    wait $SERVER_PID $CLIENT_PID 2>/dev/null
    echo "服务已停止"
    exit 0
}

trap cleanup SIGINT SIGTERM

wait
