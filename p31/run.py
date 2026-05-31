#!/usr/bin/env python3
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend'))

from backend.app import app

if __name__ == '__main__':
    print("=" * 60)
    print("  三相电压监测系统")
    print("=" * 60)
    print("  正在启动服务器...")
    print("  访问地址: http://localhost:8080")
    print("=" * 60)
    print()
    
    app.run(host='0.0.0.0', port=8080, debug=True)
