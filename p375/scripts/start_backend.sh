#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "启动 P4 模拟器后端服务..."
echo "项目目录: $PROJECT_DIR"

cd "$PROJECT_DIR/backend"
exec python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
