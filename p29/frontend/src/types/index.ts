export interface Point {
  x: number;
  y: number;
  z?: number;
}

export interface LipLandmarks {
  upperLip: Point[];
  lowerLip: Point[];
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface FaceOrientation {
  yaw: number;
  pitch: number;
  roll: number;
  isFrontal: boolean;
  confidence: number;
}

export interface RecognitionResult {
  consonant: string;
  confidence: number;
  timestamp: number;
}

export interface FrameData {
  imageData: ImageData;
  lipROI: ImageData | null;
  landmarks: LipLandmarks | null;
  orientation: FaceOrientation | null;
  timestamp: number;
}

export interface ProcessedFrame {
  frames: string[];
  timestamp: number;
}

export type Consonant = 'b' | 'p' | 'm' | 'f' | 'd' | 't' | 'n' | 'l' | 
                        'g' | 'k' | 'h' | 'j' | 'q' | 'x' | 'zh' | 'ch' | 
                        'sh' | 'r' | 'z' | 'c' | 's' | 'silence';

export const CONSONANTS: Consonant[] = [
  'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
  'g', 'k', 'h', 'j', 'q', 'x', 'zh', 'ch',
  'sh', 'r', 'z', 'c', 's', 'silence'
];
