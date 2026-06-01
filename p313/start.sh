#!/bin/bash

echo "=== PCEP Server Starter ==="

echo "Checking Go installation..."
if ! command -v go &> /dev/null; then
    echo "Error: Go is not installed. Please install Go 1.21 or later."
    exit 1
fi

echo "Go version: $(go version)"

echo "Downloading dependencies..."
go mod download

echo "Building the server..."
go build -o bin/pcep-server ./cmd/server

if [ $? -ne 0 ]; then
    echo "Error: Build failed."
    exit 1
fi

echo "Build successful!"
echo ""
echo "Starting PCEP Server..."
echo ""
echo "  PCEP Protocol Port: 4189"
echo "  Web Interface:      http://localhost:8080"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""

./bin/pcep-server
