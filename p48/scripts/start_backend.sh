#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
API_DIR="$PROJECT_ROOT/backend/api"

echo "Starting Backend API Server..."
cd "$API_DIR"

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

if [ ! -f "venv/installed" ]; then
    echo "Installing dependencies..."
    pip install -r requirements.txt
    touch venv/installed
fi

echo "Starting Flask server on http://localhost:5000"
python app.py
