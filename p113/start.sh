#!/bin/bash

echo "🚀 GNSS数据质量分析系统启动脚本"
echo "================================="

# 检查Python是否安装
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未找到Python3，请先安装Python"
    exit 1
fi

# 创建虚拟环境
if [ ! -d "venv" ]; then
    echo "📦 创建Python虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
echo "🔧 激活虚拟环境..."
source venv/bin/activate

# 安装依赖
echo "📚 安装依赖包..."
pip install -r requirements.txt

# 启动后端服务
echo "🌐 启动后端服务 (端口: 8000)..."
echo "📖 API文档: http://localhost:8000/docs"
echo "📖 前端页面: 打开 frontend/index.html"
echo ""
echo "按 Ctrl+C 停止服务"

cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
