#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================="
echo "  Ceph RBD Management System"
echo "========================================="

trap "echo 'Stopping services...'; kill 0 2>/dev/null; exit" SIGINT SIGTERM

echo "Starting backend service..."
cd "$SCRIPT_DIR/backend"
bash start.sh &
BACKEND_PID=$!

sleep 3

echo "Starting frontend service..."
cd "$SCRIPT_DIR/frontend"
bash start.sh &
FRONTEND_PID=$!

echo ""
echo "========================================="
echo "  Services started!"
echo "  Backend API:  http://localhost:8000"
echo "  API Docs:     http://localhost:8000/docs"
echo "  Frontend:     http://localhost:5173"
echo "========================================="
echo ""
echo "Press Ctrl+C to stop all services"

wait $BACKEND_PID $FRONTEND_PID
