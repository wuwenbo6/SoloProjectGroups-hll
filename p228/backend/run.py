import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api import create_app
from config import API_HOST, API_PORT, API_DEBUG

app = create_app()

if __name__ == '__main__':
    print(f"Starting SAS Backplane Management API on http://{API_HOST}:{API_PORT}")
    app.run(host=API_HOST, port=API_PORT, debug=API_DEBUG)
