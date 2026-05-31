#!/bin/bash

echo "=========================================="
echo "  OpenSCAD 参数化 3D 建模应用启动脚本"
echo "=========================================="
echo ""

check_openscad() {
    if ! command -v openscad &> /dev/null; then
        echo "❌ 错误: 未找到 OpenSCAD"
        echo ""
        echo "请先安装 OpenSCAD:"
        echo "  macOS:    brew install openscad"
        echo "  Ubuntu:   sudo apt install openscad"
        echo "  Windows:  从 https://openscad.org/ 下载安装"
        echo ""
        exit 1
    fi
    echo "✅ OpenSCAD 已安装: $(openscad --version)"
}

check_node() {
    if ! command -v node &> /dev/null; then
        echo "❌ 错误: 未找到 Node.js"
        echo "请先安装 Node.js (>= 16.0)"
        exit 1
    fi
    echo "✅ Node.js 已安装: $(node --version)"
}

install_deps() {
    echo ""
    echo "📦 检查后端依赖..."
    if [ ! -d "backend/node_modules" ]; then
        echo "安装后端依赖..."
        cd backend && npm install && cd ..
    else
        echo "后端依赖已存在"
    fi

    echo ""
    echo "📦 检查前端依赖..."
    if [ ! -d "frontend/node_modules" ]; then
        echo "安装前端依赖..."
        cd frontend && npm install && cd ..
    else
        echo "前端依赖已存在"
    fi
}

start_services() {
    echo ""
    echo "🚀 启动服务..."
    echo ""
    
    trap "kill 0" EXIT
    
    echo "启动后端服务 (端口 3001)..."
    cd backend && npm start &
    BACKEND_PID=$!
    
    sleep 3
    
    echo ""
    echo "启动前端开发服务器 (端口 3000)..."
    cd ../frontend && npm start &
    FRONTEND_PID=$!
    
    echo ""
    echo "=========================================="
    echo "  服务已启动!"
    echo "  访问: http://localhost:3000"
    echo "  按 Ctrl+C 停止所有服务"
    echo "=========================================="
    
    wait
}

check_openscad
check_node
install_deps
start_services