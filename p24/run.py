#!/usr/bin/env python
import os
import sys
import uvicorn
from pathlib import Path

sys.path.append(str(Path(__file__).parent / 'backend'))


def main():
    print("=" * 60)
    print("Defect Detection System - 缺陷检测系统")
    print("=" * 60)
    print("\nStarting server...")
    print("Access the web interface at: http://localhost:8000")
    print("API documentation at: http://localhost:8000/docs")
    print()
    
    os.chdir(str(Path(__file__).parent))
    
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )


if __name__ == "__main__":
    main()
