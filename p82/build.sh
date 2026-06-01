#!/bin/bash

set -e

echo "=== GM-FUSE 构建脚本 ==="

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$PROJECT_DIR/build"

echo "项目目录: $PROJECT_DIR"
echo "构建目录: $BUILD_DIR"

check_dependency() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ 未找到: $1"
        return 1
    fi
    echo "✓ 找到: $1"
    return 0
}

echo ""
echo "检查依赖..."

check_dependency cmake
check_dependency make
check_dependency pkg-config

echo ""
echo "检查 OpenSSL 国密支持..."
if command -v openssl &> /dev/null; then
    OPENSSL_VERSION=$(openssl version)
    echo "OpenSSL 版本: $OPENSSL_VERSION"
    if openssl list -digest-algorithms 2>/dev/null | grep -q -i sm3; then
        echo "✓ SM3 哈希支持"
    else
        echo "⚠️  SM3 哈希不支持 (需要 OpenSSL 3.0+ 或 GmSSL)"
    fi
    if openssl list -cipher-algorithms 2>/dev/null | grep -q -i sm4; then
        echo "✓ SM4 加密支持"
    else
        echo "⚠️  SM4 加密不支持 (需要 OpenSSL 3.0+ 或 GmSSL)"
    fi
else
    echo "❌ 未找到 OpenSSL"
fi

echo ""
echo "检查 FUSE..."
if pkg-config --exists fuse3 2>/dev/null; then
    echo "✓ FUSE 3 已安装"
    FUSE_VERSION=$(pkg-config --modversion fuse3)
    echo "  版本: $FUSE_VERSION"
else
    echo "⚠️  FUSE 3 未找到"
fi

echo ""
read -p "是否继续构建? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "构建已取消"
    exit 0
fi

echo ""
echo "创建构建目录..."
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

echo ""
echo "运行 CMake..."
if [ -d "/usr/local/opt/openssl@3" ]; then
    echo "使用 Homebrew OpenSSL 3.0..."
    cmake -DOPENSSL_ROOT_DIR=/usr/local/opt/openssl@3 ..
else
    cmake ..
fi

echo ""
echo "编译..."
make -j$(sysctl -n hw.ncpu 2>/dev/null || echo "4")

echo ""
echo "=== 构建完成 ==="
echo ""
echo "可执行文件位于: $BUILD_DIR/"
ls -la "$BUILD_DIR"/gm-fuse* "$BUILD_DIR"/test_* 2>/dev/null || true
echo ""
echo "运行测试:"
echo "  $BUILD_DIR/test_gm_crypto"
echo "  $BUILD_DIR/test_performance"
echo ""
echo "挂载文件系统:"
echo "  mkdir -p /tmp/gm_mount"
echo "  $BUILD_DIR/gm-fuse -f /tmp/gm_mount"
