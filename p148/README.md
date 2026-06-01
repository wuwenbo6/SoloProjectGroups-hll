# WAV 重采样服务 (FastAPI + soxr)

## 目录结构

```
.
├── backend/
│   ├── app.py              # FastAPI 服务（soxr 高保真重采样 + 批量处理 + 频谱）
│   └── requirements.txt    # Python 依赖
└── frontend/
    └── index.html          # 波形 + 频谱对比页面（支持批量 ZIP）
```

## 启动后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

健康检查：

```bash
curl http://127.0.0.1:8000/api/health
```

## 支持的重采样算法

| 算法 | 类型 | 抗混叠 | 说明 |
|------|------|--------|------|
| `soxr_vhq` | soxr | ✅ | 最高质量，非常慢 |
| `soxr_hq` | soxr | ✅ | 高质量，适中速度（**默认**） |
| `soxr_mq` | soxr | ✅ | 中等质量，较快 |
| `soxr_lq` | soxr | ✅ | 最低质量，最快 |
| `fft` | FFT | ✅ | FFT 频域重采样，带硬截止抗混叠 |
| `cubic` | 插值 | ❌ | 三次样条插值，无抗混叠 |
| `linear` | 插值 | ❌ | 线性插值，无抗混叠，最快 |

> **提示**：降采样时务必使用带抗混叠的算法（soxr_* / fft），否则会出现严重的高频镜像噪声。

## API

### `POST /api/resample`

单文件重采样，返回 WAV 流。

| 字段       | 类型   | 说明                     |
| ---------- | ------ | ------------------------ |
| file       | File   | WAV 文件（≤100MB）       |
| target_sr  | int    | 目标采样率 (Hz)          |
| algorithm  | string | 可选，默认 `soxr_hq`     |

响应：`audio/wav` 流；Headers：`X-Original-Sr`、`X-Target-Sr`、`X-Algorithm`。

---

### `POST /api/resample-with-spectrum`

单文件重采样 + 返回频谱数据，用于前端对比。返回 JSON：

```json
{
  "orig_sr": 44100,
  "target_sr": 16000,
  "algorithm": "soxr_hq",
  "wav_base64": "hex 编码的 WAV 二进制",
  "spectrum_orig": {"freqs": [...], "times": [...], "data": [...], "max_freq": 22050},
  "spectrum_rs": {...}
}
```

频谱的 `data` 是归一化到 [0, 1] 的 dB 谱图，shape = (n_frames, n_bins)。

---

### `POST /api/batch-resample`

批量处理：上传 ZIP（内含多个 WAV），返回包含所有重采样后 WAV 的 ZIP。

| 字段       | 类型   | 说明                     |
| ---------- | ------ | ------------------------ |
| file       | File   | ZIP 包（≤100MB）         |
| target_sr  | int    | 目标采样率 (Hz)          |
| algorithm  | string | 可选，默认 `soxr_hq`     |

响应：`application/zip` 流。

---

### `GET /api/algorithms`

返回所有支持的算法元信息。

### `POST /api/info`

返回 `{sr, samples, channels, duration_sec}`，仅用于调试。

## 前端

直接用浏览器打开 `frontend/index.html`，或：

```bash
cd frontend && python -m http.server 5173
```

### 功能

1. **单文件模式**：上传 WAV → 选择目标采样率与算法 → 得到：
   - 原始波形 / 重采样后波形
   - 原始频谱 / 重采样后频谱（前 10s 热力图）
   - 音频播放 + WAV 下载

2. **批量模式**：上传 ZIP（内含多个 WAV）→ 统一重采样 → 下载结果 ZIP。

## 大文件波形不崩溃策略

1. **10秒截断**：波形与频谱预览仅渲染前 `PREVIEW_SECONDS = 10` 秒的样本，使用 `subarray` 零拷贝切片。
2. **min/max envelope**：对截断后的样本再做分块 min/max 压缩到 ~4000 对竖线。
3. **音频播放/下载**仍使用完整文件，不受预览限制影响。
