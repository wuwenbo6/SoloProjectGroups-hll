#!/bin/bash

echo "🚀 自动分层存储模拟器启动中..."

if [ ! -d "venv" ]; then
    echo "📦 创建虚拟环境..."
    python3 -m venv venv
fi

echo "🔧 激活虚拟环境..."
source venv/bin/activate

echo "📚 安装依赖..."
pip install -r requirements.txt

echo "🌐 启动服务器..."
echo "📱 请在浏览器中访问: http://localhost:5000"
python3 app.py
