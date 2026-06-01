import base64
import io
import uuid
from typing import Any, Dict

import numpy as np
import pydicom
from PIL import Image
from pydicom.dataset import FileDataset

from entropy import compute_histogram, compute_optimized_window


_store: Dict[str, Dict[str, Any]] = {}


def parse_dicom(file_bytes: bytes) -> Dict[str, Any]:
    ds: FileDataset = pydicom.dcmread(io.BytesIO(file_bytes))

    pixel_array = ds.pixel_array.astype(np.float64)

    slope = float(getattr(ds, "RescaleSlope", 1))
    intercept = float(getattr(ds, "RescaleIntercept", 0))
    pixel_array = pixel_array * slope + intercept

    doc_id = str(uuid.uuid4())

    default_window = _get_default_window(ds, pixel_array)
    optimized_window = compute_optimized_window(pixel_array)

    bins, counts = compute_histogram(pixel_array, num_bins=256)
    bin_centers = ((bins[:-1] + bins[1:]) / 2.0).tolist()

    original_image = _apply_window(pixel_array, default_window["center"], default_window["width"])
    optimized_image = _apply_window(pixel_array, optimized_window["center"], optimized_window["width"])

    _store[doc_id] = {
        "pixel_array": pixel_array,
        "default_window": default_window,
        "optimized_window": optimized_window,
    }

    return {
        "id": doc_id,
        "metadata": _extract_metadata(ds),
        "default_window": default_window,
        "optimized_window": optimized_window,
        "histogram": {
            "bins": bin_centers,
            "counts": counts.tolist(),
            "total_pixels": int(pixel_array.size),
        },
        "original_image": original_image,
        "optimized_image": optimized_image,
    }


def apply_window(doc_id: str, center: float, width: float) -> Dict[str, Any]:
    if doc_id not in _store:
        raise ValueError("Document not found")
    entry = _store[doc_id]
    image_b64 = _apply_window(entry["pixel_array"], center, width)
    return {
        "image": image_b64,
        "center": center,
        "width": width,
    }


def _get_default_window(ds: FileDataset, pixel_array: np.ndarray) -> Dict[str, float]:
    if hasattr(ds, "WindowCenter") and hasattr(ds, "WindowWidth"):
        wc = ds.WindowCenter
        ww = ds.WindowWidth
        if isinstance(wc, pydicom.multival.MultiValue):
            wc = float(wc[0])
        else:
            wc = float(wc)
        if isinstance(ww, pydicom.multival.MultiValue):
            ww = float(ww[0])
        else:
            ww = float(ww)
        return {"center": wc, "width": ww}

    min_val = float(pixel_array.min())
    max_val = float(pixel_array.max())
    return {"center": (min_val + max_val) / 2.0, "width": max_val - min_val}


def _apply_window(pixel_array: np.ndarray, center: float, width: float) -> str:
    lower = center - width / 2.0
    upper = center + width / 2.0

    windowed = np.clip(pixel_array, lower, upper)
    if upper > lower:
        windowed = (windowed - lower) / (upper - lower) * 255.0
    else:
        windowed = np.zeros_like(windowed)

    img_array = windowed.astype(np.uint8)
    img = Image.fromarray(img_array, mode="L")

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def _extract_metadata(ds: FileDataset) -> Dict[str, Any]:
    patient_name = ""
    try:
        pn = getattr(ds, "PatientName", "")
        patient_name = str(pn) if pn else ""
    except Exception:
        pass

    return {
        "patient_name": patient_name,
        "patient_id": str(getattr(ds, "PatientID", "")),
        "modality": str(getattr(ds, "Modality", "")),
        "study_date": str(getattr(ds, "StudyDate", "")),
        "series_description": str(getattr(ds, "SeriesDescription", "")),
        "rows": int(getattr(ds, "Rows", 0)),
        "columns": int(getattr(ds, "Columns", 0)),
        "bits_allocated": int(getattr(ds, "BitsAllocated", 0)),
        "pixel_spacing": list(getattr(ds, "PixelSpacing", [0, 0])),
    }
