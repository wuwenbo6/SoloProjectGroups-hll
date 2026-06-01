# LSTM 和弦伴奏生成器

一个基于 Electron + Python 的伴奏生成应用，使用 LSTM 模型根据和弦进行生成鼓、贝斯、钢琴三轨伴奏。

## 功能特性

- 🎹 **和弦输入**：支持手动输入和弦进行或通过 MIDI 键盘实时识别
- 🎵 **多风格生成**：支持爵士 (Jazz)、摇滚 (Rock)、流行 (Pop) 三种音乐风格
- 🥁 **三轨伴奏**：自动生成鼓组、贝斯、钢琴伴奏
- 💾 **MIDI 导出**：导出标准 MIDI 文件
- 📋 **预设管理**：SQLite 数据库存储用户预设
- 🎹 **MIDI 支持**：支持 MIDI 键盘输入自动识别和弦

## 项目结构

```
p77/
├── main.js                    # Electron 主进程
├── package.json               # Node.js 依赖
├── renderer/                  # 前端界面
│   ├── index.html            # 主界面 HTML
│   ├── styles.css            # 样式文件
│   └── renderer.js           # 前端逻辑
├── backend/                   # Python 后端
│   ├── app.py                # Flask API 服务器
│   ├── lstm_generator.py     # LSTM 伴奏生成器
│   └── requirements.txt      # Python 依赖
└── README.md
```

## 安装说明

### 1. 安装 Node.js 依赖

```bash
npm install
```

### 2. 安装 Python 依赖

```bash
cd backend
pip3 install -r requirements.txt
```

## 运行应用

```bash
npm start
```

开发者模式（带控制台）：

```bash
npm run dev
```

## 使用说明

### 输入和弦进行

1. **手动输入**：在文本框中输入和弦，每行一个或用空格分隔
   ```
   C Am F G
   ```

2. **MIDI 键盘输入**：
   - 连接 MIDI 键盘
   - 从下拉菜单选择设备
   - 点击「启用MIDI输入」
   - 弹奏和弦（3个音以上），系统会自动识别并添加

### 生成伴奏

1. 选择音乐风格（爵士/摇滚/流行）
2. 设置 BPM（速度）
3. 设置生成长度（小节数）
4. 点击「生成伴奏」按钮

### 导出 MIDI

生成完成后，点击「导出MIDI」按钮保存 MIDI 文件。

### 管理预设

- **保存预设**：输入预设名称，点击「保存预设」
- **加载预设**：点击预设卡片上的「加载」按钮
- **删除预设**：点击预设卡片上的「删除」按钮

## 风格说明

### 🎷 爵士 (Jazz)
- Walking Bass 线条
- Swing 节奏
- 钢琴 Comping 伴奏
- 复杂的鼓点模式

### 🎸 摇滚 (Rock)
- 强力和弦
- 稳定的贝斯根音
- 强劲的 4/4 拍鼓点
- 持续的钢琴节奏

### 🎤 流行 (Pop)
- 抓耳的节奏型
- 旋律化的琶音贝斯
- 和弦式钢琴伴奏
- 多样化的 hi-hat 节奏

## 技术栈

### 前端 (Electron)
- Electron 28
- Node.js
- SQLite3 (数据存储)
- easymidi (MIDI 输入)
- midi-writer-js (MIDI 生成)

### 后端 (Python)
- Flask (API 服务器)
- NumPy (数值计算)
- MIDIUtil (MIDI 文件生成)
- TensorFlow (LSTM 模型框架)

## API 接口

### Python 后端 (端口 5000)

- `GET /health` - 健康检查
- `POST /generate` - 生成伴奏
- `GET /styles` - 获取可用风格

### Express 服务器 (端口 3001)

- `GET /api/presets` - 获取所有预设
- `POST /api/presets` - 保存预设
- `DELETE /api/presets/:id` - 删除预设

## 支持的和弦

大三和弦: C, C#, D, D#, E, F, F#, G, G#, A, A#, B  
小三和弦: Cm, C#m, Dm, D#m, Em, Fm, F#m, Gm, G#m, Am, A#m, Bm

## 注意事项

1. 首次运行需要安装所有依赖
2. MIDI 功能需要系统支持 MIDI 设备
3. Python 后端会在应用启动时自动运行
4. 预设数据存储在用户数据目录下的 SQLite 数据库中
