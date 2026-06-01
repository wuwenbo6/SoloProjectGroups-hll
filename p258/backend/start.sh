#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    echo "Installing dependencies..."
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

export PYTHONPATH="$SCRIPT_DIR:$PYTHONPATH"

HOST="${CEPH_API_HOST:-0.0.0.0}"
PORT="${CEPH_API_PORT:-8000}"

echo "Starting Ceph RBD Management API on $HOST:$PORT..."
exec uvicorn app.main:app --host "$HOST" --port "$PORT" --reload
