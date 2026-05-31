#!/bin/bash

echo "=== Starting DICOM Annotator ==="
echo ""

cleanup() {
    echo ""
    echo "Stopping services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
    echo "Done."
    exit
}

trap cleanup SIGINT SIGTERM

echo "Starting Python backend..."
cd backend
source venv/bin/activate
python app.py &
BACKEND_PID=$!

cd ..

sleep 3

echo "Starting Electron frontend..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Both services are running."
echo "Backend: http://localhost:8000"
echo "Press Ctrl+C to stop."

wait
