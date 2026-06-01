#!/bin/bash

cd "$(dirname "$0")"

echo "=========================================="
echo "OpenFlow Meter Controller"
echo "=========================================="
echo ""
echo "Starting Ryu Controller with Web UI..."
echo ""
echo "Web UI:      http://localhost:5000"
echo "OpenFlow:    tcp:6633"
echo ""
echo "Press Ctrl+C to stop"
echo "=========================================="
echo ""

python3 web_server.py
