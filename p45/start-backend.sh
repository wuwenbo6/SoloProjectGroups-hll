#!/bin/bash

echo "Starting AGV RFID Inventory Backend..."

cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

echo "Installing dependencies..."
pip install -r requirements.txt

echo "Starting backend server on port 5000..."
cd backend && python app.py
