# 安装指南

## 问题说明

macOS 自带的 LibreSSL 不支持国密算法（SM2/SM3/SM4）。需要安装支持国密的 OpenSSL 3.0+ 或 GmSSL。

## 方案一：使用 Homebrew 安装 OpenSSL 3.0

```bash
# 安装 Homebrew（如果没有）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装 OpenSSL 3.0 和其他依赖
brew install openssl@3 cmake pkg-config macfuse

# 配置环境变量
echo 'export PATH="/usr/local/opt/openssl@3/bin:$PATH"' >> ~/.zshrc
echo 'export PKG_CONFIG_PATH="/usr/local/opt/openssl@3/lib/pkgconfig:$PKG_CONFIG_PATH"' >> ~/.zshrc
echo 'export LDFLAGS="-L/usr/local/opt/openssl@3/lib"' >> ~/.zshrc
echo 'export CPPFLAGS="-I/usr/local/opt/openssl@3/include"' >> ~/.zshrc

source ~/.zshrc

# 验证国密支持
openssl list -digest-algorithms | grep -i sm3
openssl list -cipher-algorithms | grep -i sm4
```

## 方案二：编译安装 GmSSL（推荐用于国密）

GmSSL 是更好的国密支持方案：

```bash
# 下载 GmSSL
git clone https://github.com/guanzhi/GmSSL.git
cd GmSSL

# 编译安装
mkdir build && cd build
cmake ..
make -j$(nproc)
sudo make install

# 验证
gmssl version
gmssl sm3 -help
gmssl sm4 -help
```

## 方案三：使用 Docker（最简单）

```bash
# 创建 Dockerfile
cat > Dockerfile << 'EOF'
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y \
    cmake \
    pkg-config \
    libfuse3-dev \
    libssl-dev \
    fuse3 \
    build-essential
WORKDIR /app
EOF

# 构建并运行
docker build -t gm-fuse-env .
docker run -it --rm --device /dev/fuse --cap-add SYS_ADMIN -v $(pwd):/app gm-fuse-env bash
```

## 编译 GM-FUSE

安装好依赖后：

```bash
mkdir -p build && cd build

# 如果使用 Homebrew OpenSSL
cmake -DOPENSSL_ROOT_DIR=/usr/local/opt/openssl@3 ..

# 如果使用系统 OpenSSL
cmake ..

make -j$(nproc)

# 运行测试
./test_gm_crypto
./test_performance
```

## 常见问题

### 1. macFUSE 权限问题

macOS 需要在「系统设置」->「隐私与安全性」中允许 macFUSE 系统扩展，然后重启电脑。

### 2. `allow_other` 选项

如果需要 allow_other 选项，需要编辑 `/etc/fuse.conf` 取消注释 `user_allow_other`。

### 3. 国密算法不可用

如果 OpenSSL 不支持国密，检查版本：
- OpenSSL 1.1.1+: 部分支持
- OpenSSL 3.0+: 完整支持
- GmSSL: 完整支持

## 验证安装

```bash
# 检查 SM3 支持
echo -n "test" | openssl dgst -sm3

# 检查 SM4 支持
echo -n "test" > /tmp/test.txt
openssl enc -sm4-cbc -e -in /tmp/test.txt -out /tmp/test.enc -K 000102030405060708090a0b0c0d0e0f -iv 000102030405060708090a0b0c0d0e0f
```
