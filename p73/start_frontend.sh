#!/bin/bash
cd "$(dirname "$0")/frontend"

echo "Starting RT Dose Planning Frontend..."

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo "Starting React development server..."
npm start
