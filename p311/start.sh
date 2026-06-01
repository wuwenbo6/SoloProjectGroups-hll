#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Code Server Manager ==="
echo ""

check_code_server() {
    if ! command -v code-server &> /dev/null; then
        echo "code-server not found. Installing..."
        curl -fsSL https://code-server.dev/install.sh | sh
    else
        echo "✓ code-server found at: $(command -v code-server)"
    fi

    CODE_SERVER_PATH=$(command -v code-server)
    sed -i '' "s|binary_path:.*|binary_path: ${CODE_SERVER_PATH}|" config.yaml 2>/dev/null || \
    sed -i "s|binary_path:.*|binary_path: ${CODE_SERVER_PATH}|" config.yaml
    echo "✓ Updated config with code-server path: ${CODE_SERVER_PATH}"
}

check_go() {
    if ! command -v go &> /dev/null; then
        echo "✗ Go not found. Please install Go 1.21+ first."
        exit 1
    fi
    echo "✓ Go found: $(go version)"
}

echo "Checking dependencies..."
check_go
check_code_server
echo ""

echo "Downloading Go dependencies..."
go mod download
go mod tidy
echo "✓ Dependencies downloaded"
echo ""

echo "Building..."
mkdir -p bin
go build -o bin/code-server-manager ./cmd/server
echo "✓ Build complete: bin/code-server-manager"
echo ""

echo "Starting server..."
echo "  Web UI: http://localhost:8080"
echo "  Admin token: admin-secret-token"
echo ""
echo "Press Ctrl+C to stop"
echo ""

./bin/code-server-manager config.yaml
