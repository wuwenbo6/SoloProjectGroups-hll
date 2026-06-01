import io
import uuid
import zipfile
from typing import Dict, List, Optional, Tuple

import numpy as np
import soundfile as sf
import soxr
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

MAX_FILE_SIZE = 100 * 1024 * 1024
ALLOWED_EXTENSIONS = {".wav", ".wave"}
ALLOWED_ZIP_EXTENSIONS = {".zip"}

ALGORITHMS = {
    "soxr_vhq": {"name": "soxr VHQ", "category": "soxr", "antialias": True},
    "soxr_hq": {"name": "soxr HQ", "category": "soxr", "antialias": True},
    "soxr_mq": {"name": "soxr MQ", "category": "soxr", "antialias": True},
    "soxr_lq": {"name": "soxr LQ", "category": "soxr", "antialias": True},
    "linear": {"name": "线性插值", "category": "interp", "antialias": False},
    "cubic": {"name": "三次插值", "category": "interp", "antialias": False},
    "fft": {"name": "FFT 重采样", "category": "fft", "antialias": True},
}

app = FastAPI(title="Audio Resample API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Original-Sr", "X-Target-Sr", "X-Algorithm"],
)


def _validate_file(file: UploadFile, allowed_exts) -> None:
    name = (file.filename or "").lower()
    if not any(name.endswith(ext) for ext in allowed_exts):
        raise HTTPException(
            status_code=400,
            detail=f"Only {', '.join(sorted(allowed_exts))} files are allowed.",
        )


def _read_wav_bytes(data: bytes) -> Tuple[np.ndarray, int]:
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds the 100MB limit.")
    try:
        y, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=False)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to decode WAV: {exc}")
    return y, sr


def _resample_linear(y: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
    ratio = target_sr / orig_sr
    if y.ndim == 1:
        n_orig = len(y)
        n_new = int(np.round(n_orig * ratio))
        x_orig = np.arange(n_orig)
        x_new = np.linspace(0, n_orig - 1, n_new)
        return np.interp(x_new, x_orig, y).astype(np.float32)
    else:
        n_orig = y.shape[0]
        n_new = int(np.round(n_orig * ratio))
        x_orig = np.arange(n_orig)
        x_new = np.linspace(0, n_orig - 1, n_new)
        out = np.empty((n_new, y.shape[1]), dtype=np.float32)
        for ch in range(y.shape[1]):
            out[:, ch] = np.interp(x_new, x_orig, y[:, ch])
        return out


def _resample_cubic(y: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
    ratio = target_sr / orig_sr
    if y.ndim == 1:
        n_orig = len(y)
        n_new = int(np.round(n_orig * ratio))
        x_orig = np.arange(n_orig)
        x_new = np.linspace(0, n_orig - 1, n_new)
        return _cubic_interp(x_orig, y, x_new).astype(np.float32)
    else:
        n_orig = y.shape[0]
        n_new = int(np.round(n_orig * ratio))
        x_orig = np.arange(n_orig)
        x_new = np.linspace(0, n_orig - 1, n_new)
        out = np.empty((n_new, y.shape[1]), dtype=np.float32)
        for ch in range(y.shape[1]):
            out[:, ch] = _cubic_interp(x_orig, y[:, ch], x_new)
        return out


def _cubic_interp(x: np.ndarray, y: np.ndarray, x_new: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    x_new = np.asarray(x_new, dtype=np.float64)
    n = len(x)
    indices = np.searchsorted(x[1:-1], x_new)
    indices = np.clip(indices, 1, n - 2)
    x0 = x[indices - 1]
    x1 = x[indices]
    x2 = x[indices + 1]
    x3 = x[np.minimum(indices + 2, n - 1)]
    y0 = y[indices - 1]
    y1 = y[indices]
    y2 = y[indices + 1]
    y3 = y[np.minimum(indices + 2, n - 1)]
    t = (x_new - x1) / (x2 - x1 + 1e-12)
    a0 = y3 - y2 - y0 + y1
    a1 = y0 - y1 - a0
    a2 = y2 - y0
    a3 = y1
    return a0 * t**3 + a1 * t**2 + a2 * t + a3


def _resample_fft(y: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
    if y.ndim == 1:
        return _resample_fft_mono(y, orig_sr, target_sr)
    else:
        channels = [_resample_fft_mono(y[:, ch], orig_sr, target_sr) for ch in range(y.shape[1])]
        return np.stack(channels, axis=1)


def _resample_fft_mono(y: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
    ratio = target_sr / orig_sr
    n_orig = len(y)
    n_new = int(np.round(n_orig * ratio))
    fft_len = n_orig
    fft_y = np.fft.rfft(y, fft_len)
    nyquist_new = target_sr / 2
    nyquist_orig = orig_sr / 2
    if target_sr < orig_sr:
        cutoff_bin = int(np.floor(nyquist_new / nyquist_orig * (fft_len // 2 + 1)))
        fft_y[cutoff_bin:] = 0
    if n_new > fft_len:
        new_fft_len = n_new // 2 + 1
        pad_len = new_fft_len - len(fft_y)
        fft_y = np.pad(fft_y, (0, pad_len), mode="constant")
    elif n_new < fft_len:
        new_fft_len = n_new // 2 + 1
        fft_y = fft_y[:new_fft_len]
    y_rs = np.fft.irfft(fft_y, n_new)
    gain = np.sqrt(n_new / n_orig)
    return (y_rs * gain).astype(np.float32)


def resample(y: np.ndarray, orig_sr: int, target_sr: int, algorithm: str) -> np.ndarray:
    if algorithm not in ALGORITHMS:
        raise HTTPException(
            status_code=400,
            detail=f"algorithm must be one of {sorted(ALGORITHMS.keys())}.",
        )
    if target_sr <= 0:
        raise HTTPException(status_code=400, detail="target_sr must be positive.")
    if target_sr == orig_sr:
        return y

    if algorithm.startswith("soxr_"):
        quality = algorithm.split("_", 1)[1].upper()
        return soxr.resample(y, orig_sr, target_sr, quality=quality)
    elif algorithm == "linear":
        return _resample_linear(y, orig_sr, target_sr)
    elif algorithm == "cubic":
        return _resample_cubic(y, orig_sr, target_sr)
    elif algorithm == "fft":
        return _resample_fft(y, orig_sr, target_sr)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown algorithm: {algorithm}")


def compute_spectrum(y: np.ndarray, sr: int, n_fft: int = 2048, hop: int = 512) -> Dict:
    if y.ndim > 1:
        y = y[:, 0]
    y = y[: int(sr * min(10, len(y) / sr))]
    n_frames = max(1, (len(y) - n_fft) // hop + 1)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    spec = np.zeros((n_fft // 2 + 1, n_frames), dtype=np.float32)
    window = np.hanning(n_fft).astype(np.float32)
    for i in range(n_frames):
        start = i * hop
        frame = y[start : start + n_fft] * window[: len(frame)]
        if len(frame) < n_fft:
            frame = np.pad(frame, (0, n_fft - len(frame)))
        spec[:, i] = np.abs(np.fft.rfft(frame))
    spec_db = 20 * np.log10(spec / (np.max(spec) + 1e-12) + 1e-9)
    spec_db = np.clip(spec_db, -80, 0)
    spec_db = (spec_db + 80) / 80
    return {
        "freqs": freqs.tolist(),
        "times": (np.arange(n_frames) * hop / sr).tolist(),
        "data": spec_db.T.tolist(),
        "max_freq": float(np.max(freqs)),
    }


def _wav_to_buf(y: np.ndarray, sr: int) -> io.BytesIO:
    buf = io.BytesIO()
    sf.write(buf, y, sr, format="WAV", subtype="FLOAT")
    buf.seek(0)
    return buf


@app.get("/api/health")
def health():
    return {"status": "ok", "algorithms": list(ALGORITHMS.keys())}


@app.get("/api/algorithms")
def list_algorithms():
    return {"algorithms": ALGORITHMS}


@app.post("/api/resample")
async def resample_wav(
    file: UploadFile = File(...),
    target_sr: int = Form(...),
    algorithm: str = Form("soxr_hq"),
):
    _validate_file(file, ALLOWED_EXTENSIONS)
    data = file.file.read()
    y, orig_sr = _read_wav_bytes(data)
    y_rs = resample(y, orig_sr, target_sr, algorithm)
    buf = _wav_to_buf(y_rs, target_sr)
    out_name = f"resampled_{uuid.uuid4().hex[:8]}.wav"
    headers = {
        "Content-Disposition": f'attachment; filename="{out_name}"',
        "X-Original-Sr": str(orig_sr),
        "X-Target-Sr": str(target_sr),
        "X-Algorithm": algorithm,
    }
    return StreamingResponse(buf, media_type="audio/wav", headers=headers)


@app.post("/api/resample-with-spectrum")
async def resample_wav_with_spectrum(
    file: UploadFile = File(...),
    target_sr: int = Form(...),
    algorithm: str = Form("soxr_hq"),
):
    _validate_file(file, ALLOWED_EXTENSIONS)
    data = file.file.read()
    y, orig_sr = _read_wav_bytes(data)
    y_rs = resample(y, orig_sr, target_sr, algorithm)
    spec_orig = compute_spectrum(y, orig_sr)
    spec_rs = compute_spectrum(y_rs, target_sr)
    wav_buf = _wav_to_buf(y_rs, target_sr)
    out_name = f"resampled_{uuid.uuid4().hex[:8]}.wav"
    headers = {
        "Content-Disposition": f'attachment; filename="{out_name}"',
        "X-Original-Sr": str(orig_sr),
        "X-Target-Sr": str(target_sr),
        "X-Algorithm": algorithm,
        "X-Spectrum-Orig": "true",
        "X-Spectrum-Rs": "true",
    }
    return {
        "orig_sr": orig_sr,
        "target_sr": target_sr,
        "algorithm": algorithm,
        "wav_base64": wav_buf.getvalue().hex(),
        "spectrum_orig": spec_orig,
        "spectrum_rs": spec_rs,
    }


@app.post("/api/batch-resample")
async def batch_resample(
    file: UploadFile = File(...),
    target_sr: int = Form(...),
    algorithm: str = Form("soxr_hq"),
):
    _validate_file(file, ALLOWED_ZIP_EXTENSIONS)
    zip_data = file.file.read()
    if len(zip_data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="ZIP exceeds the 100MB limit.")

    results: List[Dict] = []
    out_buf = io.BytesIO()

    with zipfile.ZipFile(io.BytesIO(zip_data), "r") as z_in:
        with zipfile.ZipFile(out_buf, "w", zipfile.ZIP_DEFLATED) as z_out:
            for name in z_in.namelist():
                if not name.lower().endswith(tuple(ALLOWED_EXTENSIONS)):
                    continue
                try:
                    wav_data = z_in.read(name)
                    y, orig_sr = _read_wav_bytes(wav_data)
                    y_rs = resample(y, orig_sr, target_sr, algorithm)
                    rs_buf = _wav_to_buf(y_rs, target_sr)
                    out_name = name.replace(".wav", f"_sr{target_sr}_{algorithm}.wav")
                    out_name = out_name.replace(".wave", f"_sr{target_sr}_{algorithm}.wave")
                    z_out.writestr(out_name, rs_buf.getvalue())
                    results.append(
                        {
                            "name": name,
                            "out_name": out_name,
                            "orig_sr": orig_sr,
                            "target_sr": target_sr,
                            "status": "ok",
                        }
                    )
                except Exception as exc:
                    results.append({"name": name, "status": "error", "error": str(exc)})

    out_buf.seek(0)
    zip_name = f"batch_resampled_{uuid.uuid4().hex[:8]}.zip"
    headers = {
        "Content-Disposition": f'attachment; filename="{zip_name}"',
        "X-Target-Sr": str(target_sr),
        "X-Algorithm": algorithm,
    }
    return StreamingResponse(
        out_buf,
        media_type="application/zip",
        headers=headers,
    )


@app.post("/api/info")
async def info_wav(file: UploadFile = File(...)):
    _validate_file(file, ALLOWED_EXTENSIONS)
    data = file.file.read()
    y, sr = _read_wav_bytes(data)
    duration = float(len(y) / sr) if y.ndim == 1 else float(y.shape[0] / sr)
    channels = 1 if y.ndim == 1 else y.shape[1]
    return {
        "sr": sr,
        "samples": int(len(y) if y.ndim == 1 else y.shape[0]),
        "channels": int(channels),
        "duration_sec": round(duration, 6),
    }
