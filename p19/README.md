# 颗粒分析系统

一个基于Electron + Python + OpenCV的颗粒分析应用，支持分水岭算法和U-Net深度学习分割，批量处理，标尺校准，手动修正，数据库存储，Excel和ImageJ导出。

## 功能特性

### 核心分析功能
- **分水岭算法**: 传统形态学分水岭算法，支持自适应阈值
- **U-Net深度学习**: 基于U-Net架构的机器学习分割（可选TensorFlow加速）
- **标尺校准**: 像素到纳米的自动转换，支持手动校准
- **粘连颗粒优化**: 改进的距离变换和局部最大值检测

### 高级功能
- **批量处理**: 文件夹级别的批量图像分析，支持进度显示
- **ImageJ导出**: 导出为ImageJ Macro (.ijm) 或 Groovy Script (.groovy)
- **Excel导出**: 详细的颗粒数据和统计摘要导出
- **数据库存储**: SQLite保存分析历史记录

### 交互功能
- **手动修正**: 选择查看、删除误检、手绘添加漏检颗粒
- **实时预览**: 标注图像显示，轮廓和质心标记
- **统计可视化**: 尺寸分布和圆形度分布直方图

## 安装步骤

### 1. 修复npm缓存权限（如需要）
```bash
sudo chown -R 501:20 "/Users/wuwenbo/.npm"
```

### 2. 安装Node.js依赖
```bash
npm install
```

### 3. 安装Python依赖
```bash
pip3 install -r python/requirements.txt
```

可选：安装TensorFlow启用U-Net GPU加速
```bash
pip3 install tensorflow>=2.13.0
```

## 运行应用

```bash
npm start
```

开发模式（带开发者工具）：
```bash
npm run dev
```

## 使用说明

### 单图分析
1. **上传图像**: 点击"选择图像"按钮上传待分析的颗粒图像
2. **标尺校准**（可选）:
   - 点击"校准标尺"
   - 在图像上点击两点绘制参考线
   - 输入实际距离（nm），点击"应用校准"
3. **选择分割方法**:
   - **分水岭**: 快速，适合大多数情况
   - **U-Net**: 深度学习方法，对复杂图像效果更好
4. **调整参数**:
   - 最小/最大面积过滤
   - 前景阈值（控制分水岭敏感度）
   - 自适应阈值（光照不均图像）
5. **开始分析**: 点击"开始分析"
6. **手动修正**:
   - 选择模式: 点击颗粒查看详细信息
   - 删除模式: 点击颗粒删除误检
   - 添加模式: 在图像上绘制轮廓添加漏检颗粒
7. **保存/导出**:
   - 保存到数据库
   - 导出Excel
   - 导出ImageJ脚本

### 批量处理
1. 点击"批量处理"按钮
2. 选择图像文件夹
3. 选择输出文件夹（可选，用于保存JSON汇总）
4. 设置参数和分割方法
5. 点击"开始批量处理"

### ImageJ导出说明
导出的ImageJ脚本包含：
- 图像自动打开
- 比例尺自动设置
- 所有颗粒的ROI（多边形轮廓）
- 完整的结果表格（ID、面积、周长、圆形度、质心坐标）
- 统计摘要

在ImageJ中使用：
1. 打开ImageJ
2. Plugins > Macros > Run... 选择.ijm文件
3. 或直接拖放脚本到ImageJ窗口

## 项目结构

```
.
├── main.js                  # Electron主进程
├── renderer.js              # 前端渲染逻辑
├── database.js              # 数据库模块
├── index.html               # 前端界面
├── styles.css               # 样式文件
├── package.json             # Node.js依赖配置
├── python/
│   ├── particle_analyzer.py   # 分水岭算法
│   ├── unet_segmenter.py      # U-Net分割
│   ├── batch_processor.py     # 批量处理
│   ├── imagej_exporter.py     # ImageJ导出
│   └── requirements.txt       # Python依赖
└── README.md
```

## 技术栈

- **前端**: Electron, Chart.js, HTML5 Canvas
- **后端**: Python, OpenCV
- **深度学习**: TensorFlow/Keras (可选)
- **数据库**: SQLite (better-sqlite3)
- **数据导出**: ExcelJS, ImageJ Macro/Groovy

## 分割算法说明

### 分水岭算法
- 自适应阈值或Otsu阈值
- 形态学开闭运算预处理
- 距离变换确定前景种子点
- 局部最大值检测优化粘连分割
- 可调节前景阈值控制过分割/欠分割

### U-Net风格分割
- CLAHE对比度增强
- Blackhat变换提取暗区域
- Canny边缘检测辅助
- 形态学后处理
- 可选TensorFlow模型加速
