# 全景图拼接工具

基于 Electron + Python + OpenCV 的全景图拼接应用，使用 SIFT 特征匹配算法实现多张图片的自动拼接。

## 功能特性

- 📷 **多图片选择**: 支持选择多张图片进行拼接
- 🔍 **SIFT 特征提取**: 使用 Scale-Invariant Feature Transform 算法提取特征点
- 🔗 **特征匹配可视化**: 实时显示特征点连线匹配过程
- 📐 **单应性矩阵计算**: 使用 RANSAC 算法计算图像变换矩阵
- 🖼️ **图像拼接**: 自动进行透视变换和图像融合
- 💾 **结果导出**: 支持导出拼接后的全景图

## 技术栈

- **前端**: Electron + HTML5 Canvas
- **后端**: Python 3 + OpenCV
- **通信**: python-shell (JSON IPC)
- **算法**: SIFT + BFMatcher + RANSAC Homography

## 安装

### 1. 安装 Node.js 依赖

```bash
npm install
```

### 2. 安装 Python 依赖

```bash
pip install -r requirements.txt
```

## 运行

```bash
npm start
```

开发模式（带开发者工具）:
```bash
npm run dev
```

## 使用方法

1. 点击 **"选择图片"** 按钮，选择 2 张或更多需要拼接的图片
2. 图片会显示在左侧缩略图区域，点击缩略图可以预览
3. 点击 **"开始拼接"** 按钮开始处理
4. 观察进度条和特征匹配预览
5. 拼接完成后，结果会显示在下方
6. 点击 **"导出结果"** 保存全景图

## 拼接流程

1. **特征提取**: 对每张图片提取 SIFT 特征点和描述符
2. **特征匹配**: 使用 Brute-Force Matcher 进行特征匹配，应用 Lowe's ratio test 筛选
3. **单应性矩阵**: 使用 RANSAC 算法计算图像间的透视变换矩阵
4. **图像变换**: 对图像进行透视变换
5. **融合拼接**: 将变换后的图像拼接并进行边界裁剪

## 文件结构

```
p76/
├── main.js              # Electron 主进程
├── index.html           # 前端界面
├── renderer.js          # 渲染进程逻辑
├── stitcher.py          # Python 图像拼接核心
├── package.json         # Node.js 配置
└── requirements.txt     # Python 依赖
```

## 注意事项

- 图片需要有足够的重叠区域（建议 30%-50%）
- 建议按从左到右的顺序选择图片
- 特征点数量不足时可能导致拼接失败
- 高分辨率图片处理时间较长
