#!/bin/bash

echo "========================================"
echo "  唇语识别系统 - Lip Reading System"
echo "========================================"

echo ""
echo "Starting backend server..."
cd backend
pip install -q -r requirements.txt
python app.py &
BACKEND_PID=$!

sleep 3

echo ""
echo "Starting frontend dev server..."
cd ../frontend
npm install
npm run dev &
FRONTEND_PID=$!

echo ""
echo "========================================"
echo "  Servers started!"
echo "  Backend:  http://localhost:5000"
echo "  Frontend: http://localhost:5173"
echo "========================================"
echo "Press Ctrl+C to stop all servers"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

wait
