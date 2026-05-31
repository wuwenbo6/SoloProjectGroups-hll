#!/bin/bash

cd "$(dirname "$0")/.."

echo "🚗 启动无人车仿真系统后端..."

if [ ! -d "venv" ]; then
    echo "📦 创建虚拟环境..."
    python3 -m venv venv
fi

echo "🔧 激活虚拟环境..."
source venv/bin/activate

echo "📦 安装Python依赖..."
pip install -r requirements.txt

echo "🚀 启动后端服务器..."
cd src/server && python main.py
