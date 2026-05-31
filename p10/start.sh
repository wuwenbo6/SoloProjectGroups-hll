#!/bin/bash

echo "====================================="
echo "    IoT 物联网系统启动脚本"
echo "====================================="

echo ""
echo "检查 Mosquitto MQTT Broker..."
if ! pgrep -x "mosquitto" > /dev/null; then
    echo "启动 Mosquitto..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew services start mosquitto 2>/dev/null || /usr/local/sbin/mosquitto -d 2>/dev/null
    else
        sudo systemctl start mosquitto 2>/dev/null || mosquitto -d 2>/dev/null
    fi
    sleep 2
fi
echo "✓ MQTT Broker 运行中"

echo ""
echo "启动 Go 后端服务..."
cd backend
go mod tidy
go run cmd/main.go &
BACKEND_PID=$!
echo "✓ 后端服务已启动 (PID: $BACKEND_PID)"
cd ..

sleep 3

echo ""
echo "安装前端依赖并启动..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
fi
npm run dev &
FRONTEND_PID=$!
echo "✓ 前端服务已启动 (PID: $FRONTEND_PID)"
cd ..

echo ""
echo "====================================="
echo "    服务启动完成！"
echo "====================================="
echo "后端 API: http://localhost:8080"
echo "前端页面: http://localhost:3000"
echo "MQTT Broker: tcp://localhost:1883"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo "====================================="

trap "echo ''; echo '正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

wait
