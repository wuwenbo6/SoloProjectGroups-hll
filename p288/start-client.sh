#!/bin/bash

echo "Starting TWAMP Test Client..."

cd "$(dirname "$0")"

if [ ! -f "go.mod" ]; then
    echo "Error: go.mod not found"
    exit 1
fi

echo "Building client..."
go build -o bin/client ./cmd/client

if [ $? -ne 0 ]; then
    echo "Build failed"
    exit 1
fi

TARGET=${1:-127.0.0.1}
PORT=${2:-863}
INTERVAL=${3:-100}

echo "Sending test packets to $TARGET:$PORT (interval: ${INTERVAL}ms)"
echo "Press Ctrl+C to stop"

./bin/client -target="$TARGET" -port="$PORT" -interval="$INTERVAL"
