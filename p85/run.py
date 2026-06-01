#!/usr/bin/env python3
from backend.app import app

if __name__ == '__main__':
    print("🚀 Modbus 协议解析器启动中...")
    print("📡 访问 http://localhost:8080 查看界面")
    print("💡 按 Ctrl+C 停止服务")
    app.run(debug=True, host='0.0.0.0', port=8080)
