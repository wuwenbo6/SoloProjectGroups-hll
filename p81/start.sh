#!/bin/bash

echo "🦌 野生动物检测系统 - 启动脚本"
echo "================================="

echo ""
echo "📦 检查Python环境..."
if ! command -v python3 &> /dev/null; then
    echo "❌ 请先安装Python 3"
    exit 1
fi

echo ""
echo "📦 安装依赖..."
pip3 install -r requirements.txt

echo ""
echo "🚀 启动后端服务器..."
echo "📡 API文档: http://localhost:8000/docs"
echo "🌐 前端页面: 直接打开 frontend/index.html"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

cd backend && python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
