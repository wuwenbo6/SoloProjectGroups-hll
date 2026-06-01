#!/bin/bash
cd "$(dirname "$0")"

echo "Starting RT Dose Planning Backend..."

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

echo "Installing dependencies..."
pip install -r backend/requirements.txt

echo "Starting FastAPI server..."
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
