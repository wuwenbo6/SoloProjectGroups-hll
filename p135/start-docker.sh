#!/bin/bash

set -e

echo "========================================"
echo "  sFlow Traffic Analyzer - Docker 启动"
echo "========================================"

echo ""
echo "📦 构建前端..."
cd frontend
npm install
npm run build
cd ..

echo ""
echo "🐳 启动 Docker 容器..."
mkdir -p data
docker-compose up -d --build

echo ""
echo "✅ 服务已启动!"
echo ""
echo "📊 前端地址: http://localhost"
echo "🔌 API 地址:  http://localhost:8080"
echo "📡 sFlow 监听: UDP 6343"
echo ""
echo "📝 查看日志: docker-compose logs -f"
echo "⏹️  停止服务: docker-compose down"
