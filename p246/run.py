#!/usr/bin/env python3
import os
import sys

if __name__ == '__main__':
    os.environ.setdefault('FLASK_ENV', 'development')
    
    try:
        from backend.app import socketio, app
        print("=" * 60)
        print("WEP 密钥破解工具 Web 界面")
        print("=" * 60)
        print("\n启动服务器...")
        print("访问地址: http://localhost:8080")
        print("\n注意: 数据包捕获需要 root 权限和监控模式的无线网卡")
        print("=" * 60 + "\n")
        
        socketio.run(app, host='0.0.0.0', port=8080, debug=False)
        
    except KeyboardInterrupt:
        print("\n\n服务器已停止")
        sys.exit(0)
    except ImportError as e:
        print(f"错误: 缺少依赖模块 - {e}")
        print("\n请先安装依赖:")
        print("  pip install -r requirements.txt")
        sys.exit(1)
    except Exception as e:
        print(f"错误: {e}")
        sys.exit(1)
