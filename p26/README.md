# DICOM Annotator

医学影像标注工具，支持DICOM序列加载、多边形标注、AI自动分割、3D体积渲染和NIfTI/DICOM-SEG导出。

## 功能特性

- **DICOM查看器**: 基于Cornerstone.js，支持CT/MRI序列加载和浏览
- **多边形标注**: 自定义多边形工具，支持病变区域标注
- **半自动分割**: 区域生长算法，点击即可智能生长标注
- **3D体积渲染**: 基于Three.js的3D点云渲染，可调节阈值和透明度
- **AI分割**: 基于MONAI的肝脏预训练分割模型，支持低剂量CT降噪
- **NIfTI导出**: 将标注导出为标准NIfTI格式
- **DICOM-SEG导出**: 导出标准DICOM Segmentation格式
- **撤销/重做**: 完整的历史记录管理
- **模型训练**: 可提交标注数据进行模型训练
- **数据存储**: SQLite数据库存储标注和训练任务

## 项目结构

```
p26/
├── electron/
│   └── main.js              # Electron主进程
├── backend/
│   ├── app.py               # FastAPI后端主应用
│   ├── database.py          # SQLite数据库模型
│   ├── segmentation.py      # MONAI分割模型（含降噪）
│   ├── nifti_export.py      # NIfTI导出功能
│   ├── dicom_seg_export.py  # DICOM-SEG导出功能
│   └── requirements.txt     # Python依赖
├── index.html               # 前端界面
├── styles.css               # 样式文件
├── app.js                   # 前端逻辑（含3D渲染和区域生长）
├── package.json             # Node.js依赖
└── README.md
```

## 安装步骤

### 1. 前端依赖安装

```bash
cd /path/to/p26
npm install
```

### 2. 后端Python环境设置

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
```

## 运行方式

### 方式一：同时启动前后端（推荐）

```bash
npm start
```

### 方式二：分开启动

**启动后端：**
```bash
cd backend
source venv/bin/activate
python app.py
```

**启动前端（新终端）：**
```bash
npm run dev
```

## 使用说明

### 1. 加载DICOM序列

1. 点击 "Load DICOM" 按钮
2. 选择包含DICOM文件的文件夹
3. 等待序列加载完成

### 2. 多边形标注

1. 点击 "Polygon Tool" 按钮激活标注工具
2. 在图像上点击添加多边形顶点
3. 右键点击或按Enter完成多边形
4. 按Escape取消当前标注

### 3. 半自动分割（区域生长）

1. 点击 "Region Grow" 按钮激活工具
2. 在右侧调整生长参数：
   - **Intensity Tolerance**: 灰度容差（值越大生长范围越广）
   - **Max Growth**: 最大生长像素数
   - **3D Growth**: 是否跨层3D生长
3. 在图像上点击种子点
4. 算法自动生长生成多边形标注

### 4. 3D体积渲染

1. 加载DICOM序列后
2. 点击 "3D Volume" 按钮
3. 使用鼠标旋转查看3D结构
4. 滚轮缩放视角
5. 底部控制面板调节：
   - **Threshold**: 显示阈值（只显示高于此值的体素）
   - **Opacity**: 点云透明度
6. 点击 "Close 3D View" 返回2D视图

### 5. 快捷键

- `↑` / `k`: 上一层
- `↓` / `j`: 下一层
- `Enter`: 完成多边形
- `Escape`: 取消标注
- `Ctrl+Z` / `Cmd+Z`: 撤销
- `Ctrl+Y` / `Cmd+Shift+Z`: 重做

### 6. AI自动分割（支持低剂量CT）

1. 加载DICOM序列后
2. 在右侧 "Denoise Settings" 调整降噪强度：
   - 常规剂量CT: 0.5-1.0
   - 低剂量CT: 1.0-1.5
3. 点击 "AI Segmentation (Liver)" 按钮
4. 等待模型处理完成

### 7. 导出标注

1. **导出NIfTI**: 点击 "Export NIfTI" 导出为.nii.gz格式
2. **导出DICOM-SEG**: 点击 "Export DICOM-SEG" 导出标准DICOM Segmentation格式
3. **保存JSON**: 点击 "Save Annotation" 保存为JSON格式

### 8. 提交训练任务

1. 完成标注后
2. 点击 "Submit for Training"
3. 在右侧面板查看训练任务状态

## API接口

后端运行在 `http://localhost:8000`

- `GET /` - API状态
- `POST /segment/liver` - 肝脏分割
- `POST /export/nifti` - 导出NIfTI
- `POST /export/dicom-seg` - 导出DICOM-SEG
- `POST /training/submit` - 提交训练任务
- `GET /training/jobs` - 获取训练任务列表

## 技术栈

**前端:**
- Electron
- Cornerstone.js (医学影像渲染)
- HTML/CSS/JavaScript

**后端:**
- FastAPI
- MONAI (医学影像AI框架)
- PyTorch
- SQLAlchemy + SQLite
- NiBabel (NIfTI处理)
- Pydicom (DICOM处理)

## 注意事项

1. 首次运行会自动创建 `models/` 和 `data/` 目录
2. AI分割模型首次运行时会随机初始化，需要训练后才能获得良好效果
3. 大型DICOM序列加载可能需要较长时间
4. 训练任务在后台异步执行，可在右侧面板查看状态
