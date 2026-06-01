#!/bin/bash

echo "Starting TWAMP Reflector Server..."

cd "$(dirname "$0")"

if [ ! -f "go.mod" ]; then
    echo "Error: go.mod not found"
    exit 1
fi

echo "Downloading dependencies..."
go mod download

echo "Building server..."
go build -o bin/server ./cmd/server

if [ $? -ne 0 ]; then
    echo "Build failed"
    exit 1
fi

echo "Starting server on ports 862 (control), 863 (test), 8080 (http)"
echo "Web interface: http://localhost:8080"
echo ""
echo "Press Ctrl+C to stop"

./bin/server
