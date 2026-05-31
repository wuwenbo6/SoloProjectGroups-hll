import { Point, LipLandmarks, FaceOrientation } from '../types';

const UPPER_LIP_INDICES = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291,
  308, 415, 310, 311, 312, 13, 82, 81, 80, 191
];

const LOWER_LIP_INDICES = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
  308, 324, 318, 402, 317, 14, 87, 178, 88, 95
];

export function extractLipLandmarks(landmarks: any[]): LipLandmarks | null {
  if (!landmarks || landmarks.length < 468) return null;

  const upperLip: Point[] = UPPER_LIP_INDICES.map(i => ({
    x: landmarks[i].x,
    y: landmarks[i].y,
    z: landmarks[i].z
  }));

  const lowerLip: Point[] = LOWER_LIP_INDICES.map(i => ({
    x: landmarks[i].x,
    y: landmarks[i].y,
    z: landmarks[i].z
  }));

  const allPoints = [...upperLip, ...lowerLip];
  const xs = allPoints.map(p => p.x);
  const ys = allPoints.map(p => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const padding = 0.15;
  const width = maxX - minX;
  const height = maxY - minY;

  return {
    upperLip,
    lowerLip,
    boundingBox: {
      x: Math.max(0, minX - width * padding),
      y: Math.max(0, minY - height * padding),
      width: Math.min(1, maxX - minX + width * padding * 2),
      height: Math.min(1, maxY - minY + height * padding * 2)
    }
  };
}

export function calculateFaceOrientation(landmarks: any[]): FaceOrientation | null {
  if (!landmarks || landmarks.length < 468) return null;

  const noseTip = landmarks[1];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];
  const forehead = landmarks[10];
  const chin = landmarks[152];

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;

  const yaw = (noseTip.x - eyeMidX) * 100;

  const faceMidY = (forehead.y + chin.y) / 2;
  const pitch = (noseTip.y - faceMidY) * 100;

  const eyeAngle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const roll = (eyeAngle * 180) / Math.PI;

  const cheekDistance = Math.abs(leftCheek.x - rightCheek.x);
  const faceWidth = Math.abs(rightEye.x - leftEye.x);
  const symmetryRatio = cheekDistance / (faceWidth + 0.001);

  const isFrontal = 
    Math.abs(yaw) < 12 && 
    Math.abs(pitch) < 15 && 
    Math.abs(roll) < 10 &&
    symmetryRatio > 1.2;

  let confidence = 1.0;
  confidence -= Math.min(Math.abs(yaw) / 30, 0.5);
  confidence -= Math.min(Math.abs(pitch) / 30, 0.3);
  confidence -= Math.min(Math.abs(roll) / 20, 0.2);
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    yaw,
    pitch,
    roll,
    isFrontal,
    confidence
  };
}

export function cropLipROI(
  canvas: HTMLCanvasElement,
  boundingBox: { x: number; y: number; width: number; height: number },
  targetSize: number = 64
): ImageData | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const x = boundingBox.x * canvas.width;
  const y = boundingBox.y * canvas.height;
  const width = boundingBox.width * canvas.width;
  const height = boundingBox.height * canvas.height;

  try {
    const lipCanvas = document.createElement('canvas');
    lipCanvas.width = targetSize;
    lipCanvas.height = targetSize;
    const lipCtx = lipCanvas.getContext('2d');
    if (!lipCtx) return null;

    lipCtx.drawImage(
      canvas,
      x, y, width, height,
      0, 0, targetSize, targetSize
    );

    return lipCtx.getImageData(0, 0, targetSize, targetSize);
  } catch (e) {
    console.error('Error cropping lip ROI:', e);
    return null;
  }
}

export function imageDataToBase64(imageData: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
