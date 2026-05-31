# AVR Firmware Analyzer

一个基于 Python 和 Capstone 的 AVR (Atmega328) 固件分析工具。

## 功能特性

- **反汇编**: 使用 Capstone 引擎解析 AVR 二进制固件
- **危险模式识别**: 检测多种危险代码模式
  - WDT (看门狗定时器) 禁用
  - 中断禁用后未重新启用
  - 栈不平衡
  - EEPROM 访问无等待
  - 空指针访问
  - 未处理的中断向量
- **控制流图 (CFG)**: 生成函数级别的控制流图和全局调用图
- **字符串提取**: 提取 ASCII 和 UTF-16 字符串
- **函数识别**: 自动识别函数边界和调用关系
- **数据库存储**: 使用 SQLite 持久化存储分析结果

## 安装

```bash
pip install -r requirements.txt
pip install -e .
```

依赖:
- capstone >= 5.0.0
- graphviz >= 0.20.0

## 快速开始

### 分析固件

```bash
# 基本分析
avr-analyzer analyze sample_firmware.bin

# 显示反汇编、函数、字符串和风险分析
avr-analyzer analyze sample_firmware.bin --disasm --functions --strings --risks

# 生成控制流图
avr-analyzer analyze sample_firmware.bin --output-cfg ./cfg_output

# 不使用数据库存储
avr-analyzer analyze sample_firmware.bin --no-db
```

### 查询已存储的分析

```bash
# 列出所有分析
avr-analyzer list

# 显示分析摘要
avr-analyzer show 1

# 列出函数
avr-analyzer functions 1

# 列出字符串（支持搜索）
avr-analyzer strings 1
avr-analyzer strings 1 -s "hello"

# 列出风险（可按级别过滤）
avr-analyzer risks 1
avr-analyzer risks 1 -l critical

# 查看反汇编
avr-analyzer disasm 1
avr-analyzer disasm 1 -s 0x0100 -l 200

# 导出字符串到 CSV
avr-analyzer export 1 -o strings.csv
```

## 命令详解

### analyze - 分析固件

| 参数 | 说明 |
|------|------|
| `firmware` | 固件文件路径 |
| `-b, --base-address` | 基地址 (默认: 0x0000) |
| `--disasm` | 显示反汇编 |
| `--disasm-limit N` | 限制反汇编输出行数 |
| `--functions` | 显示函数列表 |
| `--strings` | 显示字符串 |
| `--string-limit N` | 限制字符串输出行数 |
| `--min-string-length N` | 最小字符串长度 (默认: 4) |
| `--risks` | 显示风险分析报告 |
| `--output-cfg DIR` | CFG 图像输出目录 |
| `--no-db` | 不存储到数据库 |
| `-d, --database` | 指定数据库路径 |

### list - 列出已存储的分析

```bash
avr-analyzer list
```

### show - 显示分析摘要

```bash
avr-analyzer show <firmware_id>
```

### functions - 列出函数

```bash
avr-analyzer functions <firmware_id>
```

### strings - 列出字符串

```bash
avr-analyzer strings <firmware_id> [-s keyword] [-l limit]
```

### risks - 列出风险

```bash
avr-analyzer risks <firmware_id> [-l level]
```

风险级别: `critical`, `high`, `medium`, `low`

### disasm - 查看反汇编

```bash
avr-analyzer disasm <firmware_id> [-s start_addr] [-l limit]
```

### export - 导出字符串

```bash
avr-analyzer export <firmware_id> -o output.csv
```

## 风险检测模式

### Critical (严重)
- **WDT_DISABLE_DANGEROUS**: 禁用看门狗定时器

### High (高)
- **WDT_CONFIGURED_BUT_NOT_RESET**: 配置 WDT 但不执行 WDR 复位
- **INTERRUPTS_DISABLED_WITHOUT_REENABLE**: 禁用中断后未重新启用
- **STACK_IMBALANCE**: 栈操作不平衡
- **NULL_POINTER_ACCESS**: 潜在的空指针访问

### Medium (中)
- **EEPROM_ACCESS_NO_WAIT**: EEPROM 访问未检查就绪标志
- **UNHANDLED_*_INTERRUPT**: 中断向量未处理

## 项目结构

```
avr_analyzer/
├── __init__.py
├── cli.py              # CLI 入口
├── disassembler.py     # 核心反汇编模块
├── risk_analyzer.py    # 风险分析模块
├── cfg_generator.py    # 控制流图生成
├── string_extractor.py # 字符串提取
└── database.py         # 数据库存储
```

## 示例

```bash
# 完整分析示例
avr-analyzer analyze sample_firmware.bin \
  --disasm --functions --strings --risks \
  --output-cfg ./cfg_output
```

## 许可证

MIT License
