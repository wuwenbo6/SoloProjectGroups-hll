#!/bin/bash

echo "=============================================="
echo "PD雷达信号处理系统 - 启动脚本"
echo "=============================================="

echo ""
echo "[1/3] 检查Python环境..."
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到python3，请先安装Python 3"
    exit 1
fi

echo "[2/3] 安装依赖包..."
python3 -m pip install -r requirements.txt

echo ""
echo "[3/3] 启动后端服务..."
echo "后端API服务将在 http://localhost:8000 启动"
echo "前端页面请直接打开 frontend/index.html"
echo ""
echo "按 Ctrl+C 停止服务"
echo "=============================================="
echo ""

cd backend && python3 app.py
