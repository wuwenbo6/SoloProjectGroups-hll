#!/bin/bash

echo "🚀 污染扩散模拟系统启动中..."

echo "📦 检查并安装依赖..."
pip3 install -r requirements.txt

echo "🔧 启动后端服务..."
cd /Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p99
PYTHONPATH=/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p99 python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
