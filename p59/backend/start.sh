#!/bin/bash

echo "=== 智能药盒后端服务启动 ==="

echo "检查 Python 环境..."
python3 --version

echo "安装依赖..."
pip3 install -r requirements.txt

echo "复制环境配置文件..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "已创建 .env 文件，请根据实际情况修改配置"
fi

echo "启动后端服务..."
cd app && python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
