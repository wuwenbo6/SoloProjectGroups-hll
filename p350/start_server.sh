#!/bin/bash

cd "$(dirname "$0")"

echo "=========================================="
echo "  UPnP AV 媒体服务器启动脚本"
echo "=========================================="
echo ""

echo "检查 Python 环境..."
if ! command -v python3 &> /dev/null; then
    echo "❌ 未找到 Python3，请先安装 Python"
    exit 1
fi
echo "✅ Python3 已安装"

echo ""
echo "检查依赖包..."
python3 -c "import flask, requests, lxml" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  缺少依赖包，正在安装..."
    pip3 install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi
fi
echo "✅ 依赖包已安装"

MEDIA_DIR="${1:-./media}"
PORT="${2:-8088}"

echo ""
echo "=========================================="
echo "  服务器配置"
echo "=========================================="
echo "媒体目录: $MEDIA_DIR"
echo "端口: $PORT"
echo ""

echo "启动媒体服务器..."
echo "控制点访问地址: http://localhost:$PORT/"
echo "按 Ctrl+C 停止服务器"
echo ""

python3 media_server.py "$MEDIA_DIR" "$PORT"
