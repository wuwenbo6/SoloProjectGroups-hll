#!/bin/bash

echo "🚀 启动液位监测系统..."

echo ""
echo "📦 检查 Docker..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker"
    exit 1
fi

echo ""
echo "🐳 启动 InfluxDB..."
cd "$(dirname "$0")"

if [ "$(docker ps -q -f name=influxdb-liquid-level)" ]; then
    echo "✅ InfluxDB 已在运行"
else
    if [ "$(docker ps -aq -f name=influxdb-liquid-level)" ]; then
        echo "🔄 启动现有容器..."
        docker start influxdb-liquid-level
    else
        echo "🆕 创建新容器..."
        docker run -d \
          --name influxdb-liquid-level \
          -p 8086:8086 \
          -e DOCKER_INFLUXDB_INIT_MODE=setup \
          -e DOCKER_INFLUXDB_INIT_USERNAME=admin \
          -e DOCKER_INFLUXDB_INIT_PASSWORD=admin123456 \
          -e DOCKER_INFLUXDB_INIT_ORG=liquid-level-org \
          -e DOCKER_INFLUXDB_INIT_BUCKET=liquid-level-bucket \
          -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=liquid-level-token \
          --restart unless-stopped \
          influxdb:2.7
    fi
fi

echo ""
echo "⏳ 等待 InfluxDB 启动..."
sleep 5

echo ""
echo "🔙 启动后端服务..."
cd backend

if [ ! -d "venv" ]; then
    echo "📦 创建虚拟环境..."
    python3 -m venv venv
fi

source venv/bin/activate

if [ ! -f "venv/bin/uvicorn" ]; then
    echo "📦 安装依赖..."
    pip install -r requirements.txt
fi

echo ""
echo "🎉 系统启动完成！"
echo ""
echo "📋 访问地址："
echo "   后端 API: http://localhost:8000"
echo "   API 文档: http://localhost:8000/docs"
echo "   InfluxDB: http://localhost:8086 (admin/admin123456)"
echo ""
echo "💡 前端请在新终端执行: cd frontend && npm install && npm run dev"
echo ""

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
