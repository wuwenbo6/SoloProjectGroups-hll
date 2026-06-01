# 音频隐写术应用 (Audio Steganography)

基于Electron和Python的音频隐写术应用，可以将图像隐藏在音频的FFT相位中（LSB算法）。

## 功能特性

- 🔒 **图像嵌入**: 将图像隐藏在WAV音频文件的FFT相位中
- 🔓 **图像提取**: 从已处理的音频中恢复隐藏的图像
- 📊 **音频可视化**: 实时显示波形图和频谱图
- 🎧 **MP3鲁棒性测试**: 测试不同MP3压缩比特率下隐藏数据的可恢复性
- 💾 **历史记录**: SQLite数据库存储所有操作记录

## 技术栈

- **前端**: Electron + Chart.js
- **后端**: Python (numpy, scipy, pillow, pydub)
- **算法**: FFT相位LSB隐写术

## 安装

### 1. 安装Node.js依赖

```bash
npm install
```

### 2. 安装Python依赖

```bash
pip3 install -r python/requirements.txt
```

**注意**: MP3鲁棒性测试功能需要安装`pydub`和`ffmpeg`:

```bash
# 安装ffmpeg (macOS)
brew install ffmpeg
```

## 运行

```bash
npm start
```

开发模式（带开发者工具）:
```bash
npm run dev
```

## 使用说明

### 1. 嵌入图像

1. 选择一个WAV音频文件作为载体
2. 选择要隐藏的图像文件（PNG/JPG等）
3. 选择输出音频文件路径
4. 点击"开始嵌入"

### 2. 提取图像

1. 选择包含隐藏数据的WAV音频文件
2. 选择输出图像文件路径
3. 点击"开始提取"

### 3. 可视化

1. 选择WAV音频文件
2. 点击"加载可视化"查看波形图和频谱图

### 4. 鲁棒性测试

1. 选择WAV音频和测试图像
2. 点击"开始测试"
3. 查看不同MP3比特率下的PSNR（峰值信噪比）结果

### 5. 历史记录

- 查看所有嵌入和提取操作的历史记录
- 支持搜索和删除记录

## 项目结构

```
.
├── electron/
│   └── main.js              # Electron主进程
├── renderer/
│   ├── index.html           # 前端界面
│   ├── styles.css           # 样式文件
│   └── renderer.js          # 前端逻辑
├── python/
│   ├── steganography.py     # 核心隐写术算法
│   ├── robustness.py        # MP3鲁棒性测试
│   ├── database.py          # SQLite数据库操作
│   └── requirements.txt     # Python依赖
└── package.json
```

## 算法原理

本应用使用基于FFT相位的LSB（最低有效位）隐写算法：

1. 将音频信号分帧进行FFT变换
2. 对相位值进行量化（以π/2为单位）
3. 将图像比特数据嵌入到量化相位的最低有效位
4. 进行IFFT变换回时域信号

## 注意事项

- 仅支持WAV格式音频文件
- 图像会被自动调整为灰度图（最大256x256像素）
- 音频时长建议至少10秒以上以确保有足够的嵌入空间
- MP3压缩可能会破坏隐藏数据，高比特率（320kbps）鲁棒性更好
