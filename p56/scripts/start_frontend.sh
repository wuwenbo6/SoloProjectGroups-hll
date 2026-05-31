#!/bin/bash

cd "$(dirname "$0")/.."

echo "🌐 启动前端开发服务器..."

echo "📦 安装Node.js依赖..."
npm install

echo "🚀 启动Vite开发服务器..."
npm run dev
