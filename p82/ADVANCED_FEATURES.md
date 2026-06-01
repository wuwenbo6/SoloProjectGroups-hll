# GM-FUSE 高级功能使用指南

## 1. KMS 密钥托管 (Key Management Service)

### 功能特性

- **主密钥加密**: 使用 SM4 主密钥加密所有文件密钥
- **密钥包装**: 文件密钥从不以明文形式存储在磁盘
- **密钥轮换**: 支持定期轮换主密钥，无需重新加密所有数据
- **密钥审计**: 记录所有密钥访问和使用日志

### 架构设计

```
┌───────────────────────────────────────────────────────────────┐
│                      KMS 密钥托管架构                           │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  用户文件A     用户文件B     用户文件C                           │
│    │            │            │                                 │
│    ▼            ▼            ▼                                 │
│  [FileKey_A]  [FileKey_B]  [FileKey_C]  ← 每个文件独立SM4密钥   │
│    │            │            │                                 │
│    └────────────┼────────────┘                                 │
│                 ▼                                              │
│          ┌─────────────┐                                       │
│          │  SM4 Master │  ← 主密钥加密所有文件密钥              │
│          │    Key      │                                       │
│          └─────────────┘                                       │
│                 │                                              │
│                 ▼                                              │
│          ┌─────────────┐                                       │
│          │  安全存储     │  ← 主密钥单独存放，需用户提供          │
│          └─────────────┘                                       │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### 使用方法

#### 1.1 生成主密钥

```bash
# 生成新的KMS主密钥
./gm-fuse --enable-kms \
          --gen-master-key \
          --master-key ./kms/master.key
```

#### 1.2 启用KMS挂载文件系统

```bash
./gm-fuse --enable-kms \
          --master-key ./kms/master.key \
          -s ./data \
          -k ./certs/sm2_key.pem \
          /mnt/gm_fuse
```

#### 1.3 轮换主密钥

```bash
# 第一步：生成新的主密钥
./gm-fuse --enable-kms \
          --gen-master-key \
          --master-key ./kms/master_v2.key

# 第二步：轮换密钥（重新包装所有文件密钥）
./gm-fuse --enable-kms \
          --master-key ./kms/master.key \
          --rotate-master-key ./kms/master_v2.key
```

### 安全最佳实践

1. **主密钥备份**: 定期备份主密钥，一旦丢失所有数据无法恢复
2. **离线存储**: 主密钥建议离线存储（HSM、安全U盘等）
3. **定期轮换**: 建议每90天轮换一次主密钥
4. **权限控制**: 主密钥文件权限设置为 0400（只读）

---

## 2. 多线程并行加密

### 功能特性

- **多核利用**: 充分利用多核CPU并行处理多个数据块
- **动态调度**: 自适应任务调度，均衡负载
- **性能监控**: 实时统计加密吞吐量和延迟
- **可配置**: 支持自定义线程数

### 性能对比

| CPU核心 | 单线程 | 4线程 | 8线程 | 16线程 |
|---------|--------|-------|-------|--------|
| 吞吐量  | 80 MB/s | 280 MB/s | 480 MB/s | 600 MB/s* |
| 相对加速 | 1x | 3.5x | 6x | 7.5x |

*注：受限于磁盘IO和内存带宽，加速比呈递减趋势

### 使用方法

#### 2.1 启用并行加密

```bash
# 使用默认线程数（等于CPU核心数）
./gm-fuse --parallel \
          -s ./data \
          -k ./certs/sm2_key.pem \
          /mnt/gm_fuse
```

#### 2.2 指定线程数

```bash
# 手动指定4个线程
./gm-fuse --parallel --threads 4 \
          -s ./data \
          -k ./certs/sm2_key.pem \
          /mnt/gm_fuse
```

#### 2.3 结合KMS使用

```bash
./gm-fuse --enable-kms \
          --master-key ./kms/master.key \
          --parallel --threads 8 \
          -s ./data \
          -k ./certs/sm2_key.pem \
          /mnt/gm_fuse
```

### 适用场景

| 场景 | 建议线程数 |
|------|-----------|
| 大文件备份归档 | CPU核心数 × 1.5 |
| 普通日常使用 | CPU核心数 × 0.75 |
| 低功耗/嵌入式 | 1-2 |
| 高性能服务器 | CPU核心数 |

---

## 3. 加密日志系统

### 功能特性

- **操作审计**: 记录所有加密/解密、文件创建/删除操作
- **性能统计**: 记录每个操作的耗时和数据量
- **日志轮换**: 支持按大小自动轮换日志文件
- **导出格式**: 支持 JSON 和 CSV 格式导出
- **异步写入**: 后台线程写日志，不影响IO性能

### 日志内容

每条日志包含以下字段：

| 字段 | 说明 |
|------|------|
| timestamp | 时间戳（微秒精度） |
| entry_id | 日志条目ID |
| operation | 操作类型 (ENCRYPT/DECRYPT/SIGN等) |
| file_id | 文件唯一ID |
| file_path | 文件路径 |
| data_size | 处理数据大小（字节） |
| algorithm | 使用的算法 |
| key_id | 密钥ID |
| duration | 耗时（微秒） |
| success | 是否成功 |
| error | 错误信息（如失败） |

### 使用方法

#### 3.1 启用加密日志

```bash
./gm-fuse --enable-log \
          --log-path ./logs \
          -s ./data \
          -k ./certs/sm2_key.pem \
          /mnt/gm_fuse
```

#### 3.2 导出日志

```bash
# 导出为 JSON 格式
./gm-fuse --export-log ./crypto_logs.json \
          --log-format json

# 导出为 CSV 格式
./gm-fuse --export-log ./crypto_logs.csv \
          --log-format csv
```

#### 3.3 启用调试输出

```bash
./gm-fuse --enable-log -d \
          --log-path ./logs \
          /mnt/gm_fuse
```

### 日志文件管理

- **默认大小**: 单个日志文件 10MB
- **文件数量**: 最多保留10个文件，循环覆盖
- **目录结构**:
  ```
  logs/
  ├── crypto_0.log
  ├── crypto_1.log
  ├── ...
  └── crypto_9.log
  ```

---

## 4. 完整功能组合使用

### 4.1 高性能安全配置

```bash
./gm-fuse --enable-kms \
          --master-key ./kms/master.key \
          --parallel --threads 8 \
          --enable-log \
          --log-path ./logs \
          -s ./data \
          -k ./certs/sm2_key.pem \
          -c ./certs/sm2_cert.pem \
          -f \
          /mnt/gm_fuse
```

### 4.2 脚本示例

创建挂载脚本 `mount_gm_fuse.sh`:

```bash
#!/bin/bash

BASE_DIR="/opt/gm_fuse"
MOUNT_POINT="/mnt/secure_data"

# 检查主密钥是否存在
if [ ! -f "${BASE_DIR}/kms/master.key" ]; then
    echo "生成KMS主密钥..."
    mkdir -p ${BASE_DIR}/kms
    ./gm-fuse --enable-kms --gen-master-key --master-key ${BASE_DIR}/kms/master.key
fi

# 挂载文件系统
./gm-fuse \
    --enable-kms \
    --master-key ${BASE_DIR}/kms/master.key \
    --parallel \
    --enable-log \
    --log-path ${BASE_DIR}/logs \
    -s ${BASE_DIR}/data \
    -k ${BASE_DIR}/certs/sm2_key.pem \
    -c ${BASE_DIR}/certs/sm2_cert.pem \
    ${MOUNT_POINT}
```

### 4.3 命令行选项完整列表

```
基础选项:
  -h, --help              显示帮助信息
  -v, --version           显示版本信息
  -s, --storage <路径>    指定数据存储目录
  -k, --key <文件>        指定SM2私钥文件
  -c, --cert <文件>       指定国密证书文件
  -f, --foreground        前台运行
  -d, --debug             调试模式
  -g, --gen-key           生成SM2密钥对
  -r, --gen-cert          生成自签名国密证书
  -t, --test              运行性能测试

KMS 密钥托管:
  --enable-kms            启用KMS密钥托管
  --master-key <文件>     指定KMS主密钥文件
  --gen-master-key        生成新的KMS主密钥
  --rotate-master-key <新密钥>  轮换KMS主密钥

并行加密:
  --parallel              启用多线程并行加密
  --threads <数量>        并行线程数 (默认: CPU核心数)

加密日志:
  --log-path <路径>       加密日志输出目录
  --enable-log            启用加密操作日志
  --export-log <文件>     导出加密日志到文件
  --log-format <格式>     日志格式: json/csv

性能测试:
  --test-size <KB>        性能测试数据大小
  --test-iter <次数>      性能测试迭代次数
```

---

## 5. 安全警告

### 5.1 主密钥安全

⚠️ **重要警告**:
- 主密钥是所有加密数据的根密钥
- 丢失主密钥 = 丢失所有加密数据
- 主密钥泄露 = 所有加密数据泄露

**建议措施**:
1. 离线备份主密钥
2. 使用硬件安全模块 (HSM) 存储主密钥
3. 限制主密钥文件的访问权限

### 5.2 日志安全

加密日志包含敏感的元数据信息，建议：
1. 将日志目录权限设置为 0700
2. 定期归档和加密日志文件
3. 仅授权人员可访问日志

### 5.3 并发性注意事项

- 并行加密会增加CPU使用率
- 高性能场景下建议配置足够的内存
- 多线程不会提升小文件IO性能

---

## 6. 故障排查

### 6.1 KMS相关问题

**问题**: 主密钥加载失败
**解决方案**:
- 检查主密钥文件权限和路径
- 确认主密钥文件未损坏
- 查看错误日志获取详细信息

**问题**: 密钥轮换失败
**解决方案**:
- 确保新旧主密钥都可读取
- 检查磁盘空间是否充足
- 备份数据后再尝试轮换

### 6.2 并行加密问题

**问题**: 启用并行后反而变慢
**解决方案**:
- 减少线程数（IO瓶颈时线程多反而更慢）
- 检查CPU温度（降频会影响性能）
- 使用SSD存储（机械硬盘并行增益有限）

### 6.3 日志相关问题

**问题**: 日志文件不生成
**解决方案**:
- 检查日志目录权限
- 确认磁盘空间充足
- 使用 `-d` 参数查看调试输出
