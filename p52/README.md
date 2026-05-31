# FM-Index 基因序列比对工具

基于 FM-Index 的高效 DNA/RNA 序列比对工具，支持精确匹配、错配匹配、Gap比对（插入/删除），并提供 SAM 格式输出和 HTTP 服务。

## ✨ 新功能

- 🎯 **Gap 比对**: 支持插入/删除的编辑距离计算
- 📄 **SAM 格式输出**: 标准 SAM 格式比对结果，可直接用于后续分析
- 🧬 **RNA 序列支持**: 支持 U 碱基的 RNA 序列
- 📊 **FASTQ 批量比对**: 支持对 FASTQ 文件进行批量比对

## 功能特性

- 🚀 **FM-Index 压缩索引**: 高效存储和查询基因序列
- 🎯 **精确匹配**: 快速定位完全匹配的序列位置
- 🔄 **错配匹配**: 支持最多 10 个错配的模糊查询
- ➕➖ **Gap 比对**: 支持插入/删除的编辑距离（Levenshtein距离）
- 📄 **SAM 输出**: 标准 SAM 格式比对结果
- 🧬 **DNA/RNA 支持**: 同时支持 DNA (T) 和 RNA (U) 序列
- 📄 **FASTA/FASTQ 支持**: 支持多记录 FASTA 和 FASTQ 文件
- 🌐 **HTTP 服务**: 内置 Web 服务器和友好的前端界面
- 💾 **序列化**: 索引可保存到磁盘，重复使用

## 安装

### 依赖

- Rust 1.70+

### 编译

```bash
cargo build --release
```

编译完成后，可执行文件位于 `target/release/fm_index_gene`

## 使用方法

### 1. 构建索引

从 FASTA 文件构建 FM-Index:

```bash
fm_index_gene build --input input.fasta --output index.fm
```

高级选项:
```bash
fm_index_gene build -i input.fasta -o index.fm \
  --sa-sample-rate 32 \
  --occ-sample-rate 64
```

参数:
- `--input`: 输入 FASTA 文件路径
- `--output`: 输出索引文件路径
- `--sa-sample-rate`: 后缀数组采样率 (默认: 32)，值越大内存越小但查询越慢
- `--occ-sample-rate`: Occurrence表采样率 (默认: 64)

### 2. 序列查询

#### 精确匹配
```bash
fm_index_gene search --index index.fm --pattern ATCGATCG
```

#### 错配匹配（允许1个错配）
```bash
fm_index_gene search -i index.fm -p ATCGATCG --mismatches 1
```

#### Gap比对（支持插入/删除，最大编辑距离2）
```bash
fm_index_gene search -i index.fm -p ATCGATCG --gapped --max-edit 2
```

#### 包含反向互补链
```bash
fm_index_gene search -i index.fm -p ATCGATCG --rc
```

#### 输出 SAM 格式
```bash
fm_index_gene search -i index.fm -p ATCGATCG --sam output.sam
```

### 3. FASTQ 批量比对

```bash
fm_index_gene align -i index.fm -f reads.fastq -o output.sam --max-edit 3
```

### 4. 启动 HTTP 服务

```bash
fm_index_gene serve --index index.fm --host 127.0.0.1 --port 8080
```

然后在浏览器中访问 http://localhost:8080

### 5. 查看索引信息

```bash
fm_index_gene info --index index.fm
```

## API 接口

### 获取索引信息

```
GET /api/info
```

响应示例:
```json
{
  "total_records": 3,
  "total_length": 1000000,
  "is_rna": false,
  "memory_mb": 12.5,
  "records": [
    {"name": "chr1", "description": "Chromosome 1", "length": 500000}
  ]
}
```

### 精确匹配查询

```
GET /api/search/exact?pattern=ATCG&rc=true
```

### Gap比对查询

```
GET /api/search/approx?pattern=ATCG&mismatches=2&rc=true&gapped=true&max_edit=2
```

### 导出 SAM 格式

```
GET /api/search/approx?pattern=ATCG&mismatches=2&format=sam
```

响应示例:
```json
{
  "success": true,
  "count": 5,
  "results": [
    {
      "record_name": "chr1",
      "position": 100,
      "edit_distance": 0,
      "strand": "+",
      "alignment": {
        "query": "ATCGATCG",
        "reference": "ATCGATCG",
        "cigar": "8M"
      }
    }
  ]
}
```

## SAM 格式说明

输出的 SAM 格式包含标准字段:

| 字段 | 说明 |
|------|------|
| QNAME | 查询序列名称 |
| FLAG | 比对标志 (16 表示负链) |
| RNAME | 参考序列名称 |
| POS | 比对位置 (1-based) |
| MAPQ | 比对质量 (默认60) |
| CIGAR | CIGAR 字符串 (M/I/D) |
| RNEXT | 下一片段位置 (*) |
| PNEXT | 下一片段偏移 (0) |
| TLEN | 模板长度 (0) |
| SEQ | 查询序列 |
| QUAL | 质量值 (*) |

CIGAR 操作符:
- `M`: 匹配或错配
- `I`: 插入（相对于参考）
- `D`: 删除（相对于参考）

## 示例

### 示例 1: DNA 序列比对

创建测试 FASTA 文件:
```fasta
>chr1 Human chromosome 1
ATCGATCGATCGATCGATCGATCG
>chr2 Human chromosome 2
GCTAGCTAGCTAGCTAGCTA
```

构建索引并查询:
```bash
# 构建索引
fm_index_gene build -i test.fasta -o test.fm

# Gap比对查询，允许1个插入/删除
fm_index_gene search -i test.fm -p ATXCG --gapped --max-edit 2 --sam out.sam
```

### 示例 2: RNA 序列比对

```fasta
>mrna1 mRNA transcript
AUGCUAGCUAGCUAGCGAUCGAUCGAUCG
```

```bash
# RNA 索引会自动检测
fm_index_gene build -i rna.fasta -o rna.fm

# RNA 序列查询
fm_index_gene search -i rna.fm -p AUCGAUCG --gapped --max-edit 1
```

### 示例 3: Web 界面使用

```bash
fm_index_gene serve -i test.fm -p 8080
```

访问 http://localhost:8080，在界面中:
1. 输入查询序列
2. 选择比对类型（精确/错配/Gap）
3. 设置参数
4. 点击"比对"
5. 查看结果，可导出 CSV 或 SAM

## 技术实现

### Gap 比对算法

使用带状态的回溯搜索:
- `Match`: 碱基匹配
- `Mismatch`: 碱基错配
- `Insertion`: 查询序列有额外碱基
- `Deletion`: 参考序列有额外碱基

### 内存优化

| 组件 | 优化方式 | 节省比例 |
|------|----------|----------|
| 后缀数组 | 采样存储 + u32 | ~97% |
| Occurrence表 | 采样存储 + u32 | ~98% |
| 数值类型 | usize → u32 | 50% |

### 性能特征

- 精确匹配: O(m)，m 为模式串长度
- 错配匹配: O(4^k × m)，k 为错配数
- Gap比对: O(4^k × m)，k 为最大编辑距离

## 项目结构

```
p52/
├── Cargo.toml              # Rust 项目配置
├── README.md               # 使用说明文档
├── test.fasta              # DNA 测试文件
├── test_rna.fasta          # RNA 测试文件
├── src/
│   ├── main.rs             # CLI 入口程序
│   ├── lib.rs              # 库模块导出
│   ├── fm_index.rs         # FM-Index 核心实现
│   ├── fasta.rs            # FASTA/FASTQ 文件解析器
│   ├── query.rs            # 查询处理与 SAM 输出
│   └── server.rs           # HTTP 服务
└── static/
    └── index.html          # 前端比对界面
```

## 命令行参数总览

```
fm_index_gene <SUBCOMMAND>

SUBCOMMANDS:
    build    构建 FM-Index
    search   序列查询
    align    FASTQ 批量比对
    serve    启动 HTTP 服务
    info     查看索引信息
```
