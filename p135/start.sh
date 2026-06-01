#!/bin/bash

set -e

echo "========================================"
echo "  sFlow Traffic Analyzer - 启动脚本"
echo "========================================"

check_go() {
    if command -v go &> /dev/null; then
        echo "✅ Go 已安装: $(go version)"
        return 0
    fi
    echo "❌ Go 未安装，请先安装 Go 1.21+"
    return 1
}

check_node() {
    if command -v node &> /dev/null; then
        echo "✅ Node.js 已安装: $(node --version)"
        return 0
    fi
    echo "❌ Node.js 未安装，请先安装 Node.js 18+"
    return 1
}

build_frontend() {
    echo ""
    echo "📦 构建前端..."
    cd frontend
    if [ ! -d "node_modules" ]; then
        echo "  安装依赖..."
        npm install
    fi
    echo "  编译生产版本..."
    npm run build
    cd ..
    echo "✅ 前端构建完成"
}

build_backend() {
    echo ""
    echo "🔧 构建后端..."
    cd backend
    go mod tidy
    go build -o sflow-analyzer ./cmd/main.go
    cd ..
    echo "✅ 后端构建完成"
}

start_backend() {
    echo ""
    echo "🚀 启动服务..."
    mkdir -p data
    
    if [ -f "./backend/sflow-analyzer" ]; then
        ./backend/sflow-analyzer \
            -sflow-addr ":6343" \
            -http-addr ":8080" \
            -db "./data/sflow.db" \
            -window 5s \
            -windows 60 \
            -topn 10 \
            -mock true
    else
        echo "❌ 后端可执行文件不存在，正在构建..."
        build_backend
        start_backend
    fi
}

echo ""
echo "🔍 环境检查..."
check_go
check_node

echo ""
read -p "是否构建前端? (y/n): " build_fe
if [ "$build_fe" = "y" ] || [ "$build_fe" = "Y" ]; then
    build_frontend
fi

echo ""
read -p "是否构建后端? (y/n): " build_be
if [ "$build_be" = "y" ] || [ "$build_be" = "Y" ]; then
    build_backend
fi

start_backend
