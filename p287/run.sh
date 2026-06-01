#!/bin/bash

echo "=== PCIe TLP Parser ==="

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

echo "Installing dependencies..."
pip install -r requirements.txt

echo "Starting server..."
echo "Open http://localhost:5002 in your browser"
python3 app.py
