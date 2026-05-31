#!/bin/bash

echo "=== 智能药盒前端启动 ==="

echo "检查 Node.js 环境..."
node --version
npm --version

echo "安装依赖..."
npm install

echo "启动开发服务器..."
npm run dev
