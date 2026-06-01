# TFTP Server with blksize Option (RFC 2347)

基于 Go 语言实现的 TFTP 服务器，支持 RFC 2347 定义的 `blksize` 选项协商功能。

## 功能特性

- ✅ 完整的 TFTP 协议实现 (RRQ/WRQ/DATA/ACK/ERROR/OACK)
- ✅ RFC 2347 blksize 选项支持
- ✅ 可配置的块大小范围: 512 - 1468 字节
- ✅ Web 前端测试工具
- ✅ 实时协商日志记录
- ✅ 传输效率分析

## 项目结构

```
.
├── main.go      # TFTP 服务器核心实现
├── http.go      # HTTP 服务器和前端界面
├── cmd.go       # 程序入口
├── go.mod       # Go 模块定义
└── tftp_root/   # TFTP 根目录
```

## 快速开始

### 编译运行

```bash
# 编译
go build -o tftp-server

# 运行 (需要 sudo 权限绑定 69 端口)
sudo ./tftp-server
```

### 访问 Web 界面

打开浏览器访问: http://localhost:8080

## TFTP 协议说明

### blksize 选项协商流程

1. **客户端请求 (RRQ/WRQ):
```
| Opcode (2 bytes) | Filename | 0 | Mode | 0 | "blksize" | 0 | Value | 0 |
```

2. **服务器响应 (OACK)**:
```
| Opcode (2 bytes) | "blksize" | 0 | Negotiated Value | 0 |
```

### 支持的操作码

| Opcode | 类型     | 说明
|---------|----------|----------------
| 1       | RRQ      | 读请求
| 2       | WRQ      | 写请求
| 3       | DATA     | 数据报文
| 4       | ACK      | 确认报文
| 5       | ERROR    | 错误报文
| 6       | OACK     | 选项确认

## 使用标准 TFTP 客户端测试

```bash
# 使用 atftp 客户端 (支持 blksize 选项)
atftp -b 1024 localhost
tftp> get testfile.bin
```

## Web 界面功能

1. **块大小滑块**: 256 - 2048 字节
2. **协商测试**: 模拟 blksize 协商过程
3. **实时日志**: 查看所有协商记录
4. **效率分析**: 显示数据包数量优化比例

## RFC 参考

- [RFC 1350] - TFTP Protocol (Revision 2)
- [RFC 2347] - TFTP Option Extension
- [RFC 2348] - TFTP Blocksize Option
