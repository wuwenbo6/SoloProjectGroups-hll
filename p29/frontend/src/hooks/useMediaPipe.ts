import { useState, useEffect, useRef, useCallback } from 'react';
import { FaceMesh, Results } from '@mediapipe/face_mesh';
import { LipLandmarks, FaceOrientation } from '../types';
import { extractLipLandmarks, calculateFaceOrientation } from '../utils/lipExtraction';

interface UseMediaPipeOptions {
  onResults?: (results: {
    landmarks: any[];
    lipLandmarks: LipLandmarks | null;
    orientation: FaceOrientation | null;
  }) => void;
}

interface UseMediaPipeReturn {
  isInitialized: boolean;
  isDetecting: boolean;
  error: string | null;
  lastResults: {
    lipLandmarks: LipLandmarks | null;
    orientation: FaceOrientation | null;
  } | null;
  detect: (imageCanvas: HTMLCanvasElement | HTMLVideoElement) => Promise<void>;
}

export function useMediaPipe(options: UseMediaPipeOptions = {}): UseMediaPipeReturn {
  const { onResults } = options;

  const faceMeshRef = useRef<FaceMesh | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResults, setLastResults] = useState<{
    lipLandmarks: LipLandmarks | null;
    orientation: FaceOrientation | null;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initFaceMesh = async () => {
      try {
        const faceMesh = new FaceMesh({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
          }
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        faceMesh.onResults((results: Results) => {
          if (!isMounted) return;

          const landmarks = results.multiFaceLandmarks?.[0];
          
          if (landmarks) {
            const lipLandmarks = extractLipLandmarks(landmarks);
            const orientation = calculateFaceOrientation(landmarks);

            const resultData = { lipLandmarks, orientation };
            setLastResults(resultData);

            if (onResults) {
              onResults({ landmarks, lipLandmarks, orientation });
            }
          } else {
            setLastResults({ lipLandmarks: null, orientation: null });
          }

          setIsDetecting(false);
        });

        await faceMesh.initialize();
        
        if (isMounted) {
          faceMeshRef.current = faceMesh;
          setIsInitialized(true);
        }
      } catch (err) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : 'MediaPipe初始化失败';
          setError(message);
          console.error('MediaPipe initialization error:', err);
        }
      }
    };

    initFaceMesh();

    return () => {
      isMounted = false;
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
      }
    };
  }, [onResults]);

  const detect = useCallback(async (imageCanvas: HTMLCanvasElement | HTMLVideoElement) => {
    if (!faceMeshRef.current || !isInitialized) {
      return;
    }

    try {
      setIsDetecting(true);
      await faceMeshRef.current.send({ image: imageCanvas });
    } catch (err) {
      setIsDetecting(false);
      const message = err instanceof Error ? err.message : '检测失败';
      setError(message);
      console.error('FaceMesh detection error:', err);
    }
  }, [isInitialized]);

  return {
    isInitialized,
    isDetecting,
    error,
    lastResults,
    detect
  };
}
