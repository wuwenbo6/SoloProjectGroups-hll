#!/bin/bash

echo "=== Gremlin Graph Studio ==="
echo ""

case "$1" in
  "backend")
    echo "Starting backend server..."
    cd backend
    mvn spring-boot:run
    ;;
  "frontend")
    echo "Starting frontend dev server..."
    cd frontend
    if [ ! -d "node_modules" ]; then
      npm install
    fi
    npm run dev
    ;;
  "install-frontend")
    echo "Installing frontend dependencies..."
    cd frontend
    npm install
    ;;
  *)
    echo "Usage: $0 {backend|frontend|install-frontend}"
    echo ""
    echo "Commands:"
    echo "  backend          Start Spring Boot backend (requires Maven)"
    echo "  frontend         Start Vue frontend dev server"
    echo "  install-frontend Install frontend dependencies"
    echo ""
    echo "To run both servers:"
    echo "  Terminal 1: $0 backend"
    echo "  Terminal 2: $0 frontend"
    ;;
esac
