#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MININET_DIR="$PROJECT_DIR/mininet"

echo "=========================================="
echo "  启动 Mininet 网络拓扑"
echo "=========================================="
echo ""

if [ "$EUID" -ne 0 ]; then
    echo "错误: 需要 root 权限运行 Mininet"
    echo "请使用: sudo $0"
    exit 1
fi

cd "$MININET_DIR"

echo "当前目录: $(pwd)"
echo ""

echo "清理之前的 Mininet 环境..."
mn -c
echo "✓ Mininet 环境已清理"
echo ""

echo "检查 Open vSwitch 服务..."
if service openvswitch-switch status > /dev/null 2>&1; then
    echo "✓ Open vSwitch 服务运行中"
else
    echo "启动 Open vSwitch 服务..."
    service openvswitch-switch start
    echo "✓ Open vSwitch 服务已启动"
fi
echo ""

echo "检查 iperf..."
if ! command -v iperf &> /dev/null; then
    echo "警告: 未找到 iperf，部分功能可能受限"
else
    echo "✓ iperf 已安装"
fi
echo ""

echo "检查控制器连接..."
if ! nc -z 127.0.0.1 6653 > /dev/null 2>&1; then
    echo "警告: 无法连接到控制器 (127.0.0.1:6653)"
    echo "请先启动 Ryu 控制器"
    echo ""
    read -p "是否继续? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✓ 控制器连接正常"
fi
echo ""

echo "=========================================="
echo "  启动 Mininet CLI"
echo "=========================================="
echo ""
echo "网络拓扑: 1 交换机 + 4 主机"
echo "输入 'pingall' 测试连通性"
echo "输入 'xterm h1' 打开主机终端"
echo "输入 'quit' 退出"
echo ""

python3 topology.py cli
