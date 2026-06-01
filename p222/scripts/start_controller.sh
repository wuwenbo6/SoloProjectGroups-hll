#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONTROLLER_DIR="$PROJECT_DIR/controller"

echo "=========================================="
echo "  启动 Ryu OpenFlow 控制器"
echo "=========================================="
echo ""

cd "$CONTROLLER_DIR"

echo "当前目录: $(pwd)"
echo ""

echo "检查 Ryu 是否安装..."
if ! command -v ryu-manager &> /dev/null; then
    echo "错误: 未找到 ryu-manager，请先安装 ryu:"
    echo "  pip3 install ryu"
    exit 1
fi
echo "✓ Ryu 已安装"
echo ""

echo "检查控制器文件..."
if [ ! -f "rest_api.py" ]; then
    echo "错误: 未找到 rest_api.py"
    exit 1
fi
echo "✓ 控制器文件存在"
echo ""

echo "检查端口占用..."
if lsof -Pi :6653 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "警告: 6653 端口已被占用"
fi
if lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "警告: 8080 端口已被占用"
fi
echo ""

echo "=========================================="
echo "  启动控制器..."
echo "=========================================="
echo ""
echo "OpenFlow 端口: 6653"
echo "REST API 端口: 8080"
echo ""
echo "按 Ctrl+C 停止控制器"
echo ""

PYTHONPATH="$CONTROLLER_DIR" ryu-manager --observe-links rest_api.py
