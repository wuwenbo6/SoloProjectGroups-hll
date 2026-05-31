#!/bin/bash

cd "$(dirname "$0")/frontend"

echo "安装前端依赖..."
npm install

echo "启动前端开发服务器..."
npm run dev
