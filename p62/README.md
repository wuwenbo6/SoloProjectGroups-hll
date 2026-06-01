# DeepSpeech 实时语音识别字幕应用

基于 Electron 和 Mozilla DeepSpeech 实现的本地语音识别应用，支持实时生成字幕。

## 功能特性

- 🎤 实时语音录制和波形可视化
- 🌐 中英文双语识别（需要对应语言的模型）
- 💾 字幕导出为 SRT 格式
- 📝 实时显示识别文本和字幕列表
- 🔒 完全本地运行，保护隐私

## 安装步骤

### 1. 安装 Node.js 依赖

```bash
npm install
```

### 2. 下载 DeepSpeech 模型文件

需要下载对应语言的模型文件和 scorer 文件：

#### 英文模型 (v0.9.3)
- 模型文件: `deepspeech-0.9.3-models.pbmm`
- Scorer 文件: `deepspeech-0.9.3-models.scorer`

下载地址: https://github.com/mozilla/DeepSpeech/releases/tag/v0.9.3

#### 中文模型
可以使用社区训练的中文模型，例如:
- https://github.com/mozilla/DeepSpeech/issues/3328
- 或其他开源中文语音识别模型

## 使用方法

### 启动应用

```bash
npm start
```

### 操作步骤

1. **选择语言**: 点击顶部的 English/中文 按钮切换识别语言
2. **加载模型**:
   - 点击"选择"按钮选择 `.pbmm` 模型文件
   - （可选）选择 `.scorer` 语言模型文件提高准确率
   - 点击"加载模型"按钮
3. **开始录音**: 点击"开始录音"按钮，允许麦克风权限
4. **查看结果**: 实时波形和识别文本会显示在界面上
5. **停止录音**: 点击"停止录音"完成本次识别
6. **保存字幕**: 点击"保存字幕 (SRT)"导出字幕文件

## SRT 字幕格式

导出的字幕文件格式如下:

```
1
00:00:05,000 --> 00:00:10,000
hello world this is a test

2
00:00:12,000 --> 00:00:17,000
this is another subtitle
```

## 项目结构

```
.
├── main.js          # Electron 主进程
├── renderer.js      # 渲染进程（业务逻辑）
├── index.html       # 前端界面
├── style.css        # 样式文件
├── package.json     # 项目配置
└── README.md        # 说明文档
```

## 技术栈

- **Electron**: 跨平台桌面应用框架
- **DeepSpeech**: Mozilla 开源语音识别引擎
- **Web Audio API**: 音频处理和波形可视化
- **Canvas API**: 波形绘制

## 注意事项

1. DeepSpeech 模型文件较大（约 100MB+），请确保有足够的磁盘空间
2. 首次加载模型可能需要几秒钟时间
3. 建议在安静环境下使用以获得最佳识别效果
4. 中文识别需要专门训练的中文模型

## 故障排除

### 模型加载失败
- 确保模型文件路径正确
- 检查模型版本与 deepspeech npm 包版本兼容

### 无法访问麦克风
- 检查系统麦克风权限设置
- 重启应用并重试

### 识别准确率低
- 确保使用对应的语言模型和 scorer
- 在安静环境下录音
- 说话清晰，语速适中
