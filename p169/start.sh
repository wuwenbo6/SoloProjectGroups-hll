#!/bin/bash

echo "=========================================="
echo "  SIM卡ISO 7816-4文件解析器"
echo "=========================================="
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
echo "启动Flask服务器..."
echo "访问地址: http://localhost:5001"
echo ""

python app.py
