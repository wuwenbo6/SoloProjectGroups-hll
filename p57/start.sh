#!/bin/bash

set -e

echo "🚀 启动实时行情系统..."

echo ""
echo "📦 启动 Docker 服务 (RabbitMQ + PostgreSQL)..."
docker-compose up -d

echo ""
echo "⏳ 等待服务就绪..."
sleep 10

echo ""
echo "🐹 下载 Go 依赖..."
cd backend
go mod download

echo ""
echo "📊 启动行情模拟服务..."
cd cmd/marketfeed
go run main.go &
MARKETFEED_PID=$!
cd ../../..

echo ""
echo "🔌 启动 WebSocket 网关 1 (端口 8081)..."
cd backend/cmd/gateway
go run main.go -port 8081 -instance 1 &
GATEWAY1_PID=$!
cd ../../..

echo ""
echo "🔌 启动 WebSocket 网关 2 (端口 8082)..."
cd backend/cmd/gateway
go run main.go -port 8082 -instance 2 &
GATEWAY2_PID=$!
cd ../../..

echo ""
echo "📦 安装前端依赖..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
fi

echo ""
echo "🎨 启动 React 前端..."
npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ 系统启动完成！"
echo ""
echo "📋 服务列表："
echo "   - RabbitMQ:     http://localhost:15672 (admin/admin123)"
echo "   - PostgreSQL:   localhost:5432 (trader/trader123)"
echo "   - 行情服务:     后台运行"
echo "   - WebSocket 1:  ws://localhost:8081/ws"
echo "   - WebSocket 2:  ws://localhost:8082/ws"
echo "   - 前端页面:     http://localhost:3000"
echo ""
echo "⚠️  按 Ctrl+C 停止所有服务"

trap "echo ''; echo '🛑 正在停止服务...'; kill $MARKETFEED_PID $GATEWAY1_PID $GATEWAY2_PID $FRONTEND_PID; docker-compose down; echo '✅ 所有服务已停止'" INT

wait
