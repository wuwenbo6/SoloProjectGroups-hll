# HEVC/H.265 SEI 处理工具

一个基于Electron的桌面应用，用于解析HEVC（H.265）视频码流的NAL单元，提取SEI（补充增强信息），以及在SEI中插入用户自定义时间戳数据。

## 功能特性

- **NAL单元解析**：完整解析HEVC/H.265码流中的所有NAL单元，显示详细的头部信息和类型
- **SEI信息提取**：自动识别并提取PREFIX_SEI和SUFFIX_SEI NAL单元中的SEI消息
- **SEI时间戳插入**：在I帧（IDR/BLA帧）前插入包含当前时间戳的SEI NAL单元
- **可视化界面**：直观的图形界面，支持NAL单元搜索、过滤和详情查看
- **操作日志**：完整记录所有操作历史

## 技术实现

### HEVC NAL单元结构

```
+---------------+---------------+---------------+
| 起始码 (3/4B) | NAL头 (2B)    | EBSP数据      |
+---------------+---------------+---------------+
```

### NAL头部格式 (2字节)

```
  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5
 +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 |F|   Type  |  LayerID  | TID+1 |
 +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

- F (1 bit): 禁止位，必须为0
- Type (6 bits): NAL单元类型 (0-63)
- LayerID (6 bits): 层级ID，通常为0
- TID+1 (3 bits): 时间ID + 1

### 主要NAL单元类型

| 类型值 | 类型名称 | 描述 |
|--------|----------|------|
| 0-31 | VCL NAL | 视频编码层数据 |
| 19 | IDR_W_RADL | 即时解码刷新帧 |
| 20 | IDR_N_LP | 即时解码刷新帧（低延迟） |
| 32 | VPS_NUT | 视频参数集 |
| 33 | SPS_NUT | 序列参数集 |
| 34 | PPS_NUT | 图像参数集 |
| 39 | PREFIX_SEI_NUT | 前缀SEI |
| 40 | SUFFIX_SEI_NUT | 后缀SEI |

### SEI消息结构

```
+------------------+------------------+------------------+
| payload_type     | payload_size     | payload_data     |
| (可变长度)       | (可变长度)       | (payload_size字节)|
+------------------+------------------+------------------+
```

- payload_type：使用0xFF逐字节编码，直到非0xFF字节
- payload_size：同上，使用0xFF逐字节编码
- payload_data：实际的SEI数据

## 项目结构

```
p177/
├── main.js              # Electron主进程
├── renderer.js          # 渲染进程（UI逻辑）
├── index.html           # 应用界面
├── styles.css           # 样式文件
├── package.json         # 项目配置
├── src/
│   └── hevcParser.js    # HEVC解析核心模块
├── scripts/
│   └── generateTestData.js  # 测试数据生成脚本
└── test_data/           # 测试数据目录
```

## 安装和运行

### 1. 安装依赖

```bash
npm install
```

### 2. 运行应用

```bash
npm start
```

### 3. 生成测试数据

```bash
node scripts/generateTestData.js
```

这将在`test_data/`目录下生成一个包含SEI消息的测试HEVC文件。

## 使用说明

### 1. 选择文件

点击"选择文件"按钮，选择一个HEVC/H.265码流文件（.h265, .hevc, .265）。

### 2. 解析NAL单元

点击"解析NAL单元"按钮，应用将：
- 扫描并识别所有NAL单元
- 显示NAL单元列表（索引、类型、位置、长度等）
- 显示统计信息（VCL/非VCL数量、SEI数量等）

### 3. 提取SEI信息

点击"提取SEI信息"按钮，应用将：
- 解析所有SEI NAL单元
- 在SEI信息标签页显示提取到的SEI消息
- 显示SEI消息的类型、大小和内容

### 4. 插入时间戳SEI

点击"插入时间戳SEI"按钮，选择输出文件路径，应用将：
- 在每个I帧（IDR/BLA）前插入一个SEI NAL单元
- SEI消息包含当前时间戳（格式：TIMESTAMP:毫秒时间戳）
- 生成新的HEVC文件

### 5. 查看NAL单元详情

在NAL单元列表中，点击"查看详情"按钮可以查看：
- 基本信息（索引、位置、长度）
- 头部信息（类型、LayerID、TemporalID等）
- SEI消息内容（如果是SEI NAL单元）
- RBSP数据的十六进制视图

### 6. 搜索和过滤

在NAL单元列表上方的搜索框中输入关键词，可以按NAL单元类型或类型名称过滤显示结果。

## 核心模块API

### parseHEVCFile(filePath)

解析HEVC文件，返回所有NAL单元的详细信息。

```javascript
const { parseHEVCFile } = require('./src/hevcParser');
const result = parseHEVCFile('input.h265');
// 返回: { filePath, fileSize, nalUnitCount, nalUnits: [...] }
```

### extractSEI(filePath)

提取文件中的所有SEI信息。

```javascript
const { extractSEI } = require('./src/hevcParser');
const result = extractSEI('input.h265');
// 返回包含seiNalUnits数组的解析结果
```

### insertSEITimestamp(inputPath, outputPath)

在I帧前插入时间戳SEI，生成新文件。

```javascript
const { insertSEITimestamp } = require('./src/hevcParser');
const result = insertSEITimestamp('input.h265', 'output.h265');
// 返回: { inputFile, outputFile, inputSize, outputSize, seiInsertedCount }
```

## 注意事项

1. **文件格式**：本工具处理的是原始HEVC码流文件（Annex B格式，使用起始码分隔NAL单元），不是封装在MP4、MKV等容器中的视频文件。

2. **兼容性**：生成的包含SEI的HEVC文件兼容标准的H.265解码器，SEI消息不会影响视频解码。

3. **SEI类型**：当前实现使用`user_data_unregistered`（类型5）来携带时间戳数据，这是一种用户自定义数据类型，不会与标准SEI消息冲突。

4. **大文件处理**：对于非常大的HEVC文件（几GB以上），建议分块处理，当前实现会一次性加载整个文件到内存。

## 许可证

MIT License
