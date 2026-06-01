#!/bin/bash

echo "🚀 Starting OSM History Viewer..."

echo ""
echo "📦 Installing dependencies..."
npm install --legacy-peer-deps

echo ""
echo "🔧 Installing backend dependencies..."
cd backend
python3 -m pip install -r requirements.txt --quiet
cd ..

echo ""
echo "🖥️  Starting backend server..."
cd backend
python3 main.py &
BACKEND_PID=$!
cd ..

sleep 3

echo ""
echo "🌐 Starting frontend dev server..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Services started!"
echo "   Backend: http://localhost:8000"
echo "   Frontend: http://localhost:5173"
echo ""
echo "   Press Ctrl+C to stop all services"

trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
