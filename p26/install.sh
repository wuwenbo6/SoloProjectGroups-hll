#!/bin/bash

echo "=== DICOM Annotator Installation ==="
echo ""

echo "Fixing npm cache permissions (requires sudo)..."
sudo chown -R $(whoami) "$HOME/.npm"

echo ""
echo "Installing Node.js dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "Node.js dependencies installation failed!"
    exit 1
fi

echo ""
echo "Setting up Python backend..."
cd backend

if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment and installing Python dependencies..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

if [ $? -ne 0 ]; then
    echo "Python dependencies installation failed!"
    exit 1
fi

cd ..

echo ""
echo "=== Installation Complete! ==="
echo ""
echo "To start the application, run:"
echo "  ./start.sh"
echo ""
echo "Or manually:"
echo "  Terminal 1: cd backend && source venv/bin/activate && python app.py"
echo "  Terminal 2: npm run dev"
