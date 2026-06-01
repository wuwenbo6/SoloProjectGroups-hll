#!/bin/bash

echo "=== Log Analyzer 启动脚本 ==="

echo ""
echo "1. 启动 Elasticsearch 和 Kibana..."
docker-compose up -d

echo ""
echo "等待 Elasticsearch 启动..."
until curl -s http://localhost:9200/_cluster/health | grep -q '"status":"green"\|"status":"yellow"'; do
  sleep 2
  echo -n "."
done
echo ""
echo "Elasticsearch 已就绪!"

echo ""
echo "2. 安装 Go 依赖..."
go mod download

echo ""
echo "3. 构建前端..."
cd frontend
npm install
npm run build
cd ..

echo ""
echo "4. 启动后端服务..."
echo "服务地址: http://localhost:8080"
echo "按 Ctrl+C 停止服务"
echo ""

go run cmd/server/main.go
