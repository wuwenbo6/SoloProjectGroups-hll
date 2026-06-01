#!/usr/bin/env python3
import sys
import os
import time
import threading
import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import (
    ISCSI_TARGET_NAME, ISCSI_HOST, ISCSI_PORT,
    STORAGE_DIR, WEB_HOST, WEB_PORT, LUNS,
    USE_CHAP, CHAP_USERS
)
from iscsi_target import ISCSITarget
from web.app import set_iscsi_target, run_web_server

def create_default_luns(target):
    for lun_config in LUNS:
        lun_id = lun_config['id']
        filename = lun_config['filename']
        size_mb = lun_config.get('size_mb', 100)
        size_bytes = size_mb * 1024 * 1024
        
        try:
            target.add_lun(lun_id, filename, size_bytes)
            print(f"[✓] LUN {lun_id} 已加载: {filename} ({size_mb} MB)")
        except Exception as e:
            if "already exists" not in str(e):
                print(f"[!] 加载 LUN {lun_id} 失败: {e}")

def signal_handler(signum, frame):
    print("\n[*] 正在关闭服务...")
    sys.exit(0)

def main():
    print("=" * 60)
    print("  iSCSI 目标器 - Python 实现")
    print("=" * 60)
    
    target = ISCSITarget(
        host=ISCSI_HOST,
        port=ISCSI_PORT,
        target_name=ISCSI_TARGET_NAME,
        storage_dir=STORAGE_DIR,
        use_chap=USE_CHAP,
        chap_users=CHAP_USERS
    )
    
    print(f"[*] 目标名称: {ISCSI_TARGET_NAME}")
    print(f"[*] 监听地址: {ISCSI_HOST}:{ISCSI_PORT}")
    print(f"[*] 存储目录: {STORAGE_DIR}")
    print()
    
    print("[*] 正在初始化 LUN...")
    create_default_luns(target)
    print()
    
    set_iscsi_target(target)
    
    print("[*] 启动 iSCSI 服务...")
    target.start()
    print("[✓] iSCSI 服务已启动")
    print()
    
    print("[*] 启动 Web 管理面板...")
    web_thread = threading.Thread(
        target=run_web_server,
        args=(WEB_HOST, WEB_PORT),
        daemon=True
    )
    web_thread.start()
    print(f"[✓] Web 管理面板已启动: http://{WEB_HOST}:{WEB_PORT}")
    print()
    
    print("=" * 60)
    print("  连接说明:")
    print(f"  - iSCSI 目标: {ISCSI_TARGET_NAME}")
    print(f"  - 服务器地址: <你的IP>:{ISCSI_PORT}")
    print(f"  - Web 面板: http://localhost:{WEB_PORT}")
    print("=" * 60)
    print()
    print("[*] 服务运行中，按 Ctrl+C 停止...")
    
    signal.signal(signal.SIGINT, signal_handler)
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        print("\n[*] 正在关闭服务...")
        target.stop()
        print("[✓] 服务已关闭")

if __name__ == '__main__':
    main()
