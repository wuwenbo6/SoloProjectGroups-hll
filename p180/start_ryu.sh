#!/bin/bash

cd "$(dirname "$0")"

echo "=========================================="
echo "OpenFlow Group Table Test - Ryu + Mininet"
echo "=========================================="
echo ""

if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (required for Mininet)"
    exit 1
fi

echo "Installing dependencies..."
pip3 install -r requirements.txt

echo ""
echo "Starting services..."
echo "Ryu controller: port 6653"
echo "WebSocket server: port 6789"
echo "HTTP server: port 8080"
echo ""

python3 backend/http_server.py &
HTTP_PID=$!

ryu-manager backend/group_controller.py &
RYU_PID=$!

echo "HTTP Server PID: $HTTP_PID"
echo "Ryu Controller PID: $RYU_PID"
echo ""
echo "Open http://localhost:8080 in your browser"
echo ""
echo "To start Mininet, run in another terminal:"
echo "  sudo python3 backend/network_topology.py"
echo ""
echo "Press Ctrl+C to stop services"

trap "echo 'Stopping services...'; kill $HTTP_PID $RYU_PID 2>/dev/null; mn -c 2>/dev/null; exit" INT

wait
