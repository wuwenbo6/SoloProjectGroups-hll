# 视频增强处理器 (GTK + GStreamer + OpenCV)

一个基于 GTK4 的桌面应用，实现 USB 摄像头视频采集、视频去抖动和超分辨率处理。

## 功能特性

- **视频去抖动**: 使用 Lucas-Kanade 光流法跟踪特征点，通过移动平均平滑变换矩阵
- **ESPCN 超分辨率**: 2倍超分辨率处理，支持加载预训练模型或使用增强插值算法
- **视频录制**: 可保存处理后的视频为 MP4 格式
- **参数可调**: 平滑强度可通过滑块调节 (1-60)
- **实时预览**: GTK4 原生窗口显示处理后的视频

## 系统要求

- Python 3.8+
- GTK 4.0
- GStreamer 1.0
- OpenCV 4.0+

## 安装依赖

### macOS

```bash
brew install gtk4 gst-python
pip install -r requirements.txt
```

### Ubuntu/Debian

```bash
sudo apt-get install libgtk-4-dev python3-gi python3-gst-1.0 gstreamer1.0-plugins-good
pip install -r requirements.txt
```

## 使用方法

1. 运行应用程序:

```bash
python main.py
```

2. 点击"开始"按钮启动摄像头
3. 可切换"视频去抖动"和"超分辨率"开关
4. 调节"平滑强度"滑块控制去抖动强度
5. 点击"开始录制"保存处理后的视频

## 下载 ESPCN 预训练模型（可选）

为获得更好的超分辨率效果，可下载 OpenCV 官方提供的 ESPCN 预训练模型：

1. 下载模型文件:
   - ESPCN_x2.pb: https://github.com/fannymonori/TF-ESPCN/raw/master/export/ESPCN_x2.pb

2. 将模型文件放在项目目录下，并修改 `main.py` 中的模型路径:

```python
self.super_res = ESPCNSuperResolution(scale=2, model_path="ESPCN_x2.pb")
```

## 项目结构

```
.
├── main.py                 # 主程序入口和 GTK 界面
├── video_stabilizer.py     # 视频去抖动模块
├── super_resolution.py     # ESPCN 超分辨率模块
├── requirements.txt        # Python 依赖
└── README.md               # 说明文档
```

## 技术实现

### 视频去抖动

1. 使用 `cv2.goodFeaturesToTrack()` 检测角点特征
2. 使用 `cv2.calcOpticalFlowPyrLK()` (Lucas-Kanade) 计算光流
3. 使用 `cv2.estimateAffinePartial2D()` 估计仿射变换矩阵
4. 使用移动平均滤波器平滑变换参数 (dx, dy, da)
5. 使用 `cv2.warpAffine()` 应用变换

### 超分辨率

- 模式 1: 使用 OpenCV DNN 模块加载预训练的 ESPCN 模型
- 模式 2: 使用 YCrCb 色彩空间的增强双三次插值（后备方案）

## 许可证

MIT License
