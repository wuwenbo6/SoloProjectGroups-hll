function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function downscaleImageData(imageData: ImageData, maxDimension: number = 2048): ImageData {
  const { width, height, data } = imageData;
  
  if (width <= maxDimension && height <= maxDimension) {
    return imageData;
  }

  const scale = Math.min(maxDimension / width, maxDimension / height);
  const newWidth = Math.floor(width * scale);
  const newHeight = Math.floor(height * scale);

  const result = new ImageData(newWidth, newHeight);
  const resultData = result.data;

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = Math.floor(x / scale);
      const srcY = Math.floor(y / scale);
      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (y * newWidth + x) * 4;

      resultData[dstIdx] = data[srcIdx];
      resultData[dstIdx + 1] = data[srcIdx + 1];
      resultData[dstIdx + 2] = data[srcIdx + 2];
      resultData[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  return result;
}

export function applyBlur(imageData: ImageData, intensity: number): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  const radius = Math.floor(intensity * 5) + 1;

  const temp = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, count = 0;

      for (let kx = -radius; kx <= radius; kx++) {
        const px = x + kx;
        if (px >= 0 && px < width) {
          const idx = (y * width + px) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          count++;
        }
      }

      const idx = (y * width + x) * 4;
      temp[idx] = r / count;
      temp[idx + 1] = g / count;
      temp[idx + 2] = b / count;
      temp[idx + 3] = data[idx + 3];
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, count = 0;

      for (let ky = -radius; ky <= radius; ky++) {
        const py = y + ky;
        if (py >= 0 && py < height) {
          const idx = (py * width + x) * 4;
          r += temp[idx];
          g += temp[idx + 1];
          b += temp[idx + 2];
          count++;
        }
      }

      const idx = (y * width + x) * 4;
      resultData[idx] = r / count;
      resultData[idx + 1] = g / count;
      resultData[idx + 2] = b / count;
      resultData[idx + 3] = data[idx + 3];
    }
  }

  return result;
}

export function applySharpen(imageData: ImageData, intensity: number): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  const amount = intensity * 2;

  const kernel = [
    0, -1, 0,
    -1, 5 + amount, -1,
    0, -1, 0
  ];
  const kernelSum = 1 + amount;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        const idx = (y * width + x) * 4;
        resultData[idx] = data[idx];
        resultData[idx + 1] = data[idx + 1];
        resultData[idx + 2] = data[idx + 2];
        resultData[idx + 3] = data[idx + 3];
        continue;
      }

      let r = 0, g = 0, b = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const px = x + kx;
          const py = y + ky;
          const kidx = (ky + 1) * 3 + (kx + 1);
          const idx = (py * width + px) * 4;

          r += data[idx] * kernel[kidx];
          g += data[idx + 1] * kernel[kidx];
          b += data[idx + 2] * kernel[kidx];
        }
      }

      const idx = (y * width + x) * 4;
      resultData[idx] = clamp(r / kernelSum, 0, 255);
      resultData[idx + 1] = clamp(g / kernelSum, 0, 255);
      resultData[idx + 2] = clamp(b / kernelSum, 0, 255);
      resultData[idx + 3] = data[idx + 3];
    }
  }

  return result;
}

export function applyEdgeDetect(imageData: ImageData, intensity: number): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;

  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  const grayData = new Float32Array(width * height);
  
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    grayData[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        const idx = (y * width + x) * 4;
        resultData[idx] = 0;
        resultData[idx + 1] = 0;
        resultData[idx + 2] = 0;
        resultData[idx + 3] = data[idx + 3];
        continue;
      }

      let gx = 0, gy = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const px = x + kx;
          const py = y + ky;
          const kidx = (ky + 1) * 3 + (kx + 1);
          const gidx = py * width + px;

          gx += grayData[gidx] * sobelX[kidx];
          gy += grayData[gidx] * sobelY[kidx];
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy) * intensity * 2;
      const edge = clamp(magnitude, 0, 255);

      const idx = (y * width + x) * 4;
      resultData[idx] = edge;
      resultData[idx + 1] = edge;
      resultData[idx + 2] = edge;
      resultData[idx + 3] = data[idx + 3];
    }
  }

  return result;
}

export function applyOilPaint(imageData: ImageData, intensity: number): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  const radius = Math.floor(intensity * 3) + 1;
  const levels = 24;

  const counts = new Int32Array(levels);
  const rSum = new Int32Array(levels);
  const gSum = new Int32Array(levels);
  const bSum = new Int32Array(levels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      counts.fill(0);
      rSum.fill(0);
      gSum.fill(0);
      bSum.fill(0);

      for (let ky = -radius; ky <= radius; ky++) {
        const py = y + ky;
        if (py < 0 || py >= height) continue;
        
        for (let kx = -radius; kx <= radius; kx++) {
          const px = x + kx;
          if (px < 0 || px >= width) continue;

          const idx = (py * width + px) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const gray = Math.floor((0.299 * r + 0.587 * g + 0.114 * b) / (256 / levels));

          counts[gray]++;
          rSum[gray] += r;
          gSum[gray] += g;
          bSum[gray] += b;
        }
      }

      let maxIdx = 0;
      let maxCount = counts[0];
      for (let i = 1; i < levels; i++) {
        if (counts[i] > maxCount) {
          maxCount = counts[i];
          maxIdx = i;
        }
      }

      const idx = (y * width + x) * 4;
      resultData[idx] = rSum[maxIdx] / maxCount;
      resultData[idx + 1] = gSum[maxIdx] / maxCount;
      resultData[idx + 2] = bSum[maxIdx] / maxCount;
      resultData[idx + 3] = data[idx + 3];
    }
  }

  return result;
}

export interface CustomKernel {
  size: 3 | 5;
  values: number[];
  divisor: number;
  offset: number;
}

export function applyCustomKernel(
  imageData: ImageData,
  kernel: CustomKernel,
  intensity: number = 1
): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const resultData = result.data;
  const { size, values, divisor, offset } = kernel;
  const half = Math.floor(size / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isEdge = x < half || x >= width - half || y < half || y >= height - half;
      
      if (isEdge) {
        const idx = (y * width + x) * 4;
        resultData[idx] = data[idx];
        resultData[idx + 1] = data[idx + 1];
        resultData[idx + 2] = data[idx + 2];
        resultData[idx + 3] = data[idx + 3];
        continue;
      }

      let r = 0, g = 0, b = 0;

      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const px = x + kx;
          const py = y + ky;
          const kidx = (ky + half) * size + (kx + half);
          const idx = (py * width + px) * 4;

          r += data[idx] * values[kidx];
          g += data[idx + 1] * values[kidx];
          b += data[idx + 2] * values[kidx];
        }
      }

      const idx = (y * width + x) * 4;
      const originalR = data[idx];
      const originalG = data[idx + 1];
      const originalB = data[idx + 2];

      const filteredR = (r / divisor) + offset;
      const filteredG = (g / divisor) + offset;
      const filteredB = (b / divisor) + offset;

      resultData[idx] = clamp(originalR + (filteredR - originalR) * intensity, 0, 255);
      resultData[idx + 1] = clamp(originalG + (filteredG - originalG) * intensity, 0, 255);
      resultData[idx + 2] = clamp(originalB + (filteredB - originalB) * intensity, 0, 255);
      resultData[idx + 3] = data[idx + 3];
    }
  }

  return result;
}

export function applyFilter(
  filterType: string | null,
  imageData: ImageData,
  intensity: number,
  customKernel?: CustomKernel
): ImageData {
  if (!filterType) return imageData;

  switch (filterType) {
    case 'blur':
      return applyBlur(imageData, intensity);
    case 'sharpen':
      return applySharpen(imageData, intensity);
    case 'edgeDetect':
      return applyEdgeDetect(imageData, intensity);
    case 'oilPaint':
      return applyOilPaint(imageData, intensity);
    case 'custom':
      return customKernel ? applyCustomKernel(imageData, customKernel, intensity) : imageData;
    default:
      return imageData;
  }
}
