#!/bin/bash

echo "🚀 启动 CYGNSS 土壤湿度反演系统..."

echo "📦 安装 Python 依赖..."
pip install -r requirements.txt

echo "📦 安装 Node.js 依赖..."
npm install

echo "🔧 构建前端..."
npm run build

echo "🗄️  初始化数据库..."
python -c "from backend.database import init_db; init_db()"

echo "🌐 启动后端服务 (端口 8000)..."
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo "🌐 启动前端服务 (端口 3000)..."
npm run dev &
FRONTEND_PID=$!

echo "✅ 系统启动完成！"
echo "📊 前端地址: http://localhost:3000"
echo "🔌 API 文档: http://localhost:8000/docs"

trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
