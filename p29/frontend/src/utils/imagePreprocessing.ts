export function toGrayscale(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  return new ImageData(data, imageData.width, imageData.height);
}

export function histogramEqualization(imageData: ImageData): ImageData {
  const grayData = toGrayscale(imageData);
  const data = grayData.data;
  const width = imageData.width;
  const height = imageData.height;

  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]]++;
  }

  const cdf = new Array(256).fill(0);
  cdf[0] = histogram[0];
  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + histogram[i];
  }

  const cdfMin = cdf.find(v => v > 0) || 0;
  const totalPixels = width * height;

  for (let i = 0; i < data.length; i += 4) {
    const equalized = ((cdf[data[i]] - cdfMin) / (totalPixels - cdfMin)) * 255;
    data[i] = data[i + 1] = data[i + 2] = Math.round(equalized);
  }

  return grayData;
}

export function gaussianBlur(imageData: ImageData, sigma: number = 1.0): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const src = imageData.data;
  const dst = new Uint8ClampedArray(src.length);

  const kernelSize = Math.ceil(sigma * 3) * 2 + 1;
  const kernel: number[] = [];
  let sum = 0;

  for (let y = 0; y < kernelSize; y++) {
    for (let x = 0; x < kernelSize; x++) {
      const cx = x - Math.floor(kernelSize / 2);
      const cy = y - Math.floor(kernelSize / 2);
      const value = Math.exp(-(cx * cx + cy * cy) / (2 * sigma * sigma));
      kernel.push(value);
      sum += value;
    }
  }

  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= sum;
  }

  const halfKernel = Math.floor(kernelSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;

      for (let ky = 0; ky < kernelSize; ky++) {
        for (let kx = 0; kx < kernelSize; kx++) {
          const px = Math.min(Math.max(x + kx - halfKernel, 0), width - 1);
          const py = Math.min(Math.max(y + ky - halfKernel, 0), height - 1);
          const idx = (py * width + px) * 4;
          const k = kernel[ky * kernelSize + kx];
          r += src[idx] * k;
          g += src[idx + 1] * k;
          b += src[idx + 2] * k;
        }
      }

      const idx = (y * width + x) * 4;
      dst[idx] = r;
      dst[idx + 1] = g;
      dst[idx + 2] = b;
      dst[idx + 3] = src[idx + 3];
    }
  }

  return new ImageData(dst, width, height);
}

export function normalizeIllumination(imageData: ImageData): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const data = new Uint8ClampedArray(imageData.data);

  let sumR = 0, sumG = 0, sumB = 0;
  for (let i = 0; i < data.length; i += 4) {
    sumR += data[i];
    sumG += data[i + 1];
    sumB += data[i + 2];
  }

  const pixelCount = width * height;
  const avgR = sumR / pixelCount;
  const avgG = sumG / pixelCount;
  const avgB = sumB / pixelCount;

  const targetMean = 128;
  const scaleR = targetMean / (avgR + 1);
  const scaleG = targetMean / (avgG + 1);
  const scaleB = targetMean / (avgB + 1);

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, data[i] * scaleR));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * scaleG));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * scaleB));
  }

  return new ImageData(data, width, height);
}

export function adaptiveThreshold(imageData: ImageData, blockSize: number = 11, C: number = 2): ImageData {
  const gray = toGrayscale(imageData);
  const width = gray.width;
  const height = gray.height;
  const src = gray.data;
  const dst = new Uint8ClampedArray(src.length);

  const halfBlock = Math.floor(blockSize / 2);
  const integral = new Array(width * height).fill(0);

  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      sum += src[y * width * 4 + x * 4];
      if (y === 0) {
        integral[y * width + x] = sum;
      } else {
        integral[y * width + x] = integral[(y - 1) * width + x] + sum;
      }
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - halfBlock);
      const y1 = Math.max(0, y - halfBlock);
      const x2 = Math.min(width - 1, x + halfBlock);
      const y2 = Math.min(height - 1, y + halfBlock);

      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      let sum = integral[y2 * width + x2];
      if (y1 > 0) sum -= integral[(y1 - 1) * width + x2];
      if (x1 > 0) sum -= integral[y2 * width + (x1 - 1)];
      if (y1 > 0 && x1 > 0) sum += integral[(y1 - 1) * width + (x1 - 1)];

      const threshold = (sum / count) - C;
      const idx = (y * width + x) * 4;
      const value = src[idx] > threshold ? 255 : 0;
      dst[idx] = dst[idx + 1] = dst[idx + 2] = value;
      dst[idx + 3] = 255;
    }
  }

  return new ImageData(dst, width, height);
}

export function enhanceLipContrast(imageData: ImageData): ImageData {
  let result = normalizeIllumination(imageData);
  result = gaussianBlur(result, 0.5);
  result = histogramEqualization(result);
  return result;
}

export function calculateBrightness(imageData: ImageData): number {
  let sum = 0;
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return sum / (data.length / 4);
}

export function calculateNoiseLevel(imageData: ImageData): number {
  const gray = toGrayscale(imageData);
  const data = gray.data;
  const width = gray.width;
  const height = gray.height;
  
  let noiseSum = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const center = data[idx];
      
      const neighbors = [
        data[((y - 1) * width + x) * 4],
        data[((y + 1) * width + x) * 4],
        data[(y * width + (x - 1)) * 4],
        data[(y * width + (x + 1)) * 4]
      ];
      
      const localMean = neighbors.reduce((a, b) => a + b, 0) / 4;
      noiseSum += Math.abs(center - localMean);
      count++;
    }
  }

  return noiseSum / count;
}

export function preprocessLipROI(imageData: ImageData): ImageData {
  const brightness = calculateBrightness(imageData);
  const noise = calculateNoiseLevel(imageData);

  let result = imageData;

  if (brightness < 50 || brightness > 200) {
    result = normalizeIllumination(result);
  }

  if (noise > 15) {
    result = gaussianBlur(result, 0.8);
  }

  result = histogramEqualization(result);

  return result;
}
