#!/bin/bash

echo "🚀 启动 AI 动作识别训练系统"

# 启动后端服务
echo "📡 启动后端服务 (端口 8001)..."
cd backend && python3 main.py &
BACKEND_PID=$!

# 等待后端启动
sleep 3

# 检查后端是否启动成功
if curl -s http://localhost:8001/health > /dev/null; then
    echo "✅ 后端服务启动成功"
else
    echo "❌ 后端服务启动失败"
    kill $BACKEND_PID
    exit 1
fi

# 启动前端服务
echo "🎨 启动前端服务 (端口 3000)..."
cd ../frontend && npm run dev &
FRONTEND_PID=$!

echo ""
echo "🎉 系统启动完成！"
echo "📊 后端 API: http://localhost:8001"
echo "📚 API 文档: http://localhost:8001/docs"
echo "🌐 前端应用: http://localhost:3000"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 等待用户中断
trap "kill $BACKEND_PID $FRONTEND_PID; echo '👋 服务已停止'; exit" SIGINT
wait
