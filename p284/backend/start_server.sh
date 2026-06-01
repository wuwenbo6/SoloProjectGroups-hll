#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "=== GMR帧解析系统 - 启动脚本"
echo ""

echo "检查Python环境..."
if ! command -v python3 &> /dev/null; then
    PYTHON=python3
elif ! command -v python &> /dev/null; then
    PYTHON=python
else
    echo "错误: 未找到Python"
    exit 1
fi

echo "使用Python: $($PYTHON --version)"
echo ""

echo "检查虚拟环境..."
if [ -d "$SCRIPT_DIR/venv" ]; then
    echo "激活虚拟环境..."
    source "$SCRIPT_DIR/venv/bin/activate"
else
    echo "创建虚拟环境..."
    $PYTHON -m venv "$SCRIPT_DIR/venv"
    source "$SCRIPT_DIR/venv/bin/activate"
    echo "安装依赖..."
    pip install --upgrade pip
    pip install -r "$SCRIPT_DIR/requirements.txt"
fi

echo ""
echo "检查依赖..."
pip list | grep -E "flask|bitarray|numpy"

echo ""
echo "启动Flask服务器..."
echo "服务器将在 http://localhost:5000 运行"
echo "按 Ctrl+C 停止服务器"
echo ""

cd "$SCRIPT_DIR"
$PYTHON app.py
