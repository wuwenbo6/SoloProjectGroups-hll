#!/bin/bash

cd "$(dirname "$0")"

echo "创建虚拟环境..."
python3 -m venv venv
source venv/bin/activate

echo "安装依赖..."
pip install -r requirements.txt

echo "启动后端服务..."
cd backend
python main.py
