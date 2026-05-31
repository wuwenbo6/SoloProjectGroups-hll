#!/bin/bash

echo "Starting AGV RFID Inventory Frontend..."

cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo "Starting Vite dev server on port 5173..."
npm run dev
