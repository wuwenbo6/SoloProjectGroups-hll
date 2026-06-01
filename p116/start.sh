#!/bin/bash

echo "======================================"
echo "   卫星轨道跟踪系统 - 启动脚本"
echo "======================================"
echo ""

if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

echo "激活虚拟环境..."
source venv/bin/activate

echo "安装依赖..."
pip install -r requirements.txt

echo ""
echo "======================================"
echo "   启动服务..."
echo "   服务地址: http://localhost:5000"
echo "   按 Ctrl+C 停止服务"
echo "======================================"
echo ""

python run.py
