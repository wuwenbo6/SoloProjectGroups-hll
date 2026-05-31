#!/bin/bash

echo "=========================================="
echo "  Sentinel-2 影像处理系统 - 启动脚本"
echo "=========================================="
echo ""

cd "$(dirname "$0")"

echo "检查 Python 环境..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装，请先安装 Python3"
    exit 1
fi

echo "检查虚拟环境..."
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

echo "激活虚拟环境..."
source venv/bin/activate

echo "安装依赖..."
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "=========================================="
echo "  启动服务器..."
echo "  访问地址: http://localhost:8000"
echo "  API文档: http://localhost:8000/docs"
echo "=========================================="
echo ""

python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
