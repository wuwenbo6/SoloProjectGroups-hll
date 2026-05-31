import { LipLandmarks, FaceOrientation } from '../types';

export interface CameraDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

export interface ViewData {
  cameraId: string;
  lipLandmarks: LipLandmarks | null;
  orientation: FaceOrientation | null;
  lipROI: ImageData | null;
  timestamp: number;
  weight: number;
}

export class MultiViewFusion {
  private views: Map<string, ViewData> = new Map();
  private maxViews: number = 2;
  private fusionWindow: number = 100;

  constructor(maxViews: number = 2) {
    this.maxViews = maxViews;
  }

  addView(viewData: ViewData): void {
    if (this.views.size >= this.maxViews) {
      const oldestKey = this.views.keys().next().value;
      if (oldestKey) {
        this.views.delete(oldestKey);
      }
    }
    this.views.set(viewData.cameraId, viewData);
  }

  calculateViewWeight(orientation: FaceOrientation | null): number {
    if (!orientation) return 0.1;

    let weight = orientation.confidence;

    if (orientation.isFrontal) {
      weight *= 1.5;
    }

    const yawPenalty = Math.abs(orientation.yaw) / 30;
    const pitchPenalty = Math.abs(orientation.pitch) / 30;
    const rollPenalty = Math.abs(orientation.roll) / 20;

    weight *= Math.max(0.1, 1 - (yawPenalty + pitchPenalty + rollPenalty) / 3);

    return Math.max(0.1, Math.min(1, weight));
  }

  fuseLandmarks(): LipLandmarks | null {
    const validViews = Array.from(this.views.values())
      .filter(v => v.lipLandmarks && v.orientation)
      .sort((a, b) => b.weight - a.weight);

    if (validViews.length === 0) return null;
    if (validViews.length === 1) return validViews[0].lipLandmarks;

    const primaryView = validViews[0];
    const totalWeight = validViews.reduce((sum, v) => sum + v.weight, 0);

    const fusedUpperLip = primaryView.lipLandmarks!.upperLip.map((_, i) => {
      let sumX = 0, sumY = 0, sumZ = 0;
      
      for (const view of validViews) {
        if (!view.lipLandmarks) continue;
        const point = view.lipLandmarks.upperLip[i];
        if (!point) continue;
        
        const w = view.weight / totalWeight;
        sumX += (point.x || 0) * w;
        sumY += (point.y || 0) * w;
        sumZ += (point.z || 0) * w;
      }
      
      return { x: sumX, y: sumY, z: sumZ };
    });

    const fusedLowerLip = primaryView.lipLandmarks!.lowerLip.map((_, i) => {
      let sumX = 0, sumY = 0, sumZ = 0;
      
      for (const view of validViews) {
        if (!view.lipLandmarks) continue;
        const point = view.lipLandmarks.lowerLip[i];
        if (!point) continue;
        
        const w = view.weight / totalWeight;
        sumX += (point.x || 0) * w;
        sumY += (point.y || 0) * w;
        sumZ += (point.z || 0) * w;
      }
      
      return { x: sumX, y: sumY, z: sumZ };
    });

    return {
      upperLip: fusedUpperLip,
      lowerLip: fusedLowerLip,
      boundingBox: primaryView.lipLandmarks!.boundingBox
    };
  }

  fuseROIs(targetSize: number = 64): ImageData | null {
    const validViews = Array.from(this.views.values())
      .filter(v => v.lipROI && v.orientation)
      .sort((a, b) => b.weight - a.weight);

    if (validViews.length === 0) return null;
    if (validViews.length === 1) return validViews[0].lipROI;

    const primaryROI = validViews[0].lipROI!;
    const fusedData = new Uint8ClampedArray(primaryROI.data.length);
    const totalWeight = validViews.reduce((sum, v) => sum + v.weight, 0);

    for (let i = 0; i < primaryROI.data.length; i += 4) {
      let r = 0, g = 0, b = 0, a = 0;

      for (const view of validViews) {
        if (!view.lipROI) continue;
        const w = view.weight / totalWeight;
        r += view.lipROI.data[i] * w;
        g += view.lipROI.data[i + 1] * w;
        b += view.lipROI.data[i + 2] * w;
        a += view.lipROI.data[i + 3] * w;
      }

      fusedData[i] = Math.round(r);
      fusedData[i + 1] = Math.round(g);
      fusedData[i + 2] = Math.round(b);
      fusedData[i + 3] = Math.round(a);
    }

    return new ImageData(fusedData, targetSize, targetSize);
  }

  getBestView(): ViewData | null {
    const validViews = Array.from(this.views.values())
      .filter(v => v.orientation?.isFrontal)
      .sort((a, b) => b.weight - a.weight);

    return validViews[0] || null;
  }

  getViewCount(): number {
    return this.views.size;
  }

  clear(): void {
    this.views.clear();
  }
}

export async function getAvailableCameras(): Promise<CameraDevice[]> {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true });
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices
      .filter(d => d.kind === 'videoinput')
      .map(d => ({
        deviceId: d.deviceId,
        label: d.label || `摄像头 ${d.deviceId.slice(0, 8)}`,
        kind: d.kind as MediaDeviceKind
      }));

    return cameras;
  } catch (error) {
    console.error('Error enumerating cameras:', error);
    return [];
  }
}

export function selectOptimalCameras(cameras: CameraDevice[], count: number = 2): CameraDevice[] {
  const sorted = [...cameras].sort((a, b) => {
    const aFront = a.label.toLowerCase().includes('front') || a.label.toLowerCase().includes('前置');
    const bFront = b.label.toLowerCase().includes('front') || b.label.toLowerCase().includes('前置');
    
    if (aFront && !bFront) return -1;
    if (!aFront && bFront) return 1;
    return 0;
  });

  return sorted.slice(0, count);
}
