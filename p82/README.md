# GM-FUSE 国密加密虚拟文件系统

一个基于 FUSE 的虚拟文件系统，使用国密算法进行加密保护。

## 功能特性

- **SM4 加密**: 文件内容使用 SM4 对称加密算法加密存储
- **SM3 哈希**: 文件元数据使用 SM3 哈希算法进行完整性校验
- **SM2 签名**: 文件名使用 SM2 椭圆曲线签名算法进行签名
- **国密证书**: 支持 X.509 国密证书格式
- **性能测试**: 内置加解密性能测试工具

## 系统要求

### macOS

1. 安装 Homebrew (如果未安装):
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

2. 安装依赖:
```bash
brew install cmake pkg-config macfuse openssl@3
```

3. 配置 OpenSSL 路径:
```bash
echo 'export PATH="/usr/local/opt/openssl@3/bin:$PATH"' >> ~/.zshrc
echo 'export LDFLAGS="-L/usr/local/opt/openssl@3/lib"' >> ~/.zshrc
echo 'export CPPFLAGS="-I/usr/local/opt/openssl@3/include"' >> ~/.zshrc
```

### Linux (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install -y cmake pkg-config libfuse3-dev libssl-dev fuse3
```

## 编译安装

```bash
mkdir build && cd build
cmake ..
make -j$(nproc)
```

## 使用方法

### 1. 生成 SM2 密钥对

```bash
./gm-fuse -g -k ./certs/sm2_key.pem
```

### 2. 生成自签名国密证书

```bash
./gm-fuse -r -c ./certs/sm2_cert.pem -k ./certs/sm2_key.pem
```

### 3. 运行性能测试

```bash
./gm-fuse -t --test-size 4096 --test-iter 20
```

### 4. 挂载文件系统

```bash
mkdir -p /tmp/gm_mount
./gm-fuse -f -s ./data -k ./certs/sm2_key.pem /tmp/gm_mount
```

选项说明:
- `-f`: 前台运行
- `-s <path>`: 指定数据存储目录
- `-k <file>`: 指定 SM2 私钥文件
- `-c <file>`: 指定国密证书文件 (可选)
- `-d`: 调试模式

### 5. 卸载文件系统

```bash
# macOS
umount /tmp/gm_mount

# Linux
fusermount -u /tmp/gm_mount
```

## 文件结构

```
.
├── CMakeLists.txt      # CMake 构建配置
├── include/            # 头文件
│   ├── common.h        # 公共定义
│   ├── gm_crypto.h     # 国密算法封装
│   ├── virtual_fs.h    # 虚拟文件系统
│   ├── fuse_operations.h  # FUSE 操作接口
│   ├── metadata.h      # 元数据管理
│   └── performance_test.h  # 性能测试
├── src/                # 源文件
│   ├── main.cpp        # 主程序入口
│   ├── gm_crypto.cpp   # 国密算法实现
│   ├── virtual_fs.cpp  # 虚拟文件系统实现
│   ├── fuse_operations.cpp  # FUSE 操作实现
│   ├── metadata.cpp    # 元数据管理实现
│   └── performance_test.cpp  # 性能测试实现
└── tests/              # 测试文件
```

## 算法说明

### SM4 对称加密
- 分组长度: 128 位
- 密钥长度: 128 位
- 工作模式: CBC
- 用途: 文件内容加密

### SM3 哈希算法
- 输出长度: 256 位 (32 字节)
- 用途: 元数据完整性校验

### SM2 椭圆曲线签名
- 曲线参数: SM2P256V1
- 签名长度: 64 字节 (R+S)
- 用途: 文件名签名、证书签名

## 安全特性

1. **文件内容加密**: 所有文件内容使用 SM4 加密后存储
2. **密钥隔离**: 每个文件使用独立的加密密钥和 IV
3. **完整性保护**: 元数据包含 SM3 哈希，防止篡改
4. **身份认证**: 文件名使用 SM2 签名，确保真实性
5. **证书支持**: 支持 X.509 国密证书进行密钥管理

## 性能测试

性能测试会测量以下指标:
- SM4 加密/解密吞吐量
- SM3 哈希计算速度
- SM2 签名/验签速度

测试结果示例:
```
=== 国密算法性能测试结果 ===

算法      操作      数据大小         平均耗时(ms)     吞吐量(MB/s)     操作/秒
--------------------------------------------------------------------------------
SM4       Encrypt   1024 KB          0.5234           1862.4563        1910.56
SM4       Decrypt   1024 KB          0.5123           1903.2345        1952.34
SM3       Hash      1024 KB          0.2345           4264.3456        4264.35
SM2       Sign      32 B             0.8765           0.0347           1140.90
SM2       Verify    32 B             1.2345           0.0247           810.12
```

## 注意事项

1. **备份密钥**: 请妥善备份 SM2 私钥，丢失后无法解密文件
2. **性能影响**: 文件加密会有一定的性能开销
3. **macFUSE 权限**: macOS 上需要允许 macFUSE 系统扩展
4. **数据备份**: 建议定期备份加密数据

## 许可证

本项目仅供学习和研究使用。
