#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "[pci-browser] building helper..."
make
echo "[pci-browser] starting server on http://0.0.0.0:5000"
echo "[pci-browser] note: for write/inject, pci-helper must be setuid-root:"
echo "                sudo make install-root"
exec python3 app.py
