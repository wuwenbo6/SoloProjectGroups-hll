#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

echo "Starting Frontend Server..."
cd "$FRONTEND_DIR"

PORT=8080

echo "Starting HTTP server on http://localhost:$PORT"
python3 -m http.server $PORT
