#!/bin/bash

cd "$(dirname "$0")"

echo "=========================================="
echo "OpenFlow Group Table Throughput Test"
echo "=========================================="
echo ""

echo "Installing dependencies..."
pip3 install -r requirements.txt

echo ""
echo "Starting simulator..."
echo "WebSocket server will run on port 6789"
echo "HTTP server will run on port 8080"
echo ""

python3 backend/http_server.py &
HTTP_PID=$!

python3 backend/simulator.py &
SIM_PID=$!

echo "HTTP Server PID: $HTTP_PID"
echo "Simulator PID: $SIM_PID"
echo ""
echo "Open http://localhost:8080 in your browser"
echo ""
echo "Press Ctrl+C to stop all services"

trap "echo 'Stopping services...'; kill $HTTP_PID $SIM_PID 2>/dev/null; exit" INT

wait
