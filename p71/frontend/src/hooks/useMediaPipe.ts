import { useState, useEffect, useRef, useCallback } from 'react'
import { Pose, POSE_CONNECTIONS } from '@mediapipe/pose'
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils'
import { PoseLandmark, PoseFrame } from '../types/pose'

interface UseMediaPipeOptions {
  onPoseDetected?: (landmarks: PoseLandmark[]) => void
  minDetectionConfidence?: number
  minTrackingConfidence?: number
}

export function useMediaPipe(options: UseMediaPipeOptions = {}) {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [landmarks, setLandmarks] = useState<PoseLandmark[]>([])
  const poseRef = useRef<Pose | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const initializePose = useCallback(async () => {
    try {
      const pose = new Pose({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        }
      })

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: true,
        minDetectionConfidence: options.minDetectionConfidence || 0.5,
        minTrackingConfidence: options.minTrackingConfidence || 0.5
      })

      pose.onResults((results) => {
        if (results.poseLandmarks) {
          const newLandmarks = results.poseLandmarks.map(lm => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
            visibility: lm.visibility || 0
          }))
          
          setLandmarks(newLandmarks)
          
          if (options.onPoseDetected) {
            options.onPoseDetected(newLandmarks)
          }

          if (canvasRef.current) {
            drawOverlay(canvasRef.current, results)
          }
        }
        setIsDetecting(true)
      })

      poseRef.current = pose
      setIsInitialized(true)
    } catch (error) {
      console.error('Failed to initialize MediaPipe Pose:', error)
    }
  }, [options])

  const drawOverlay = useCallback((canvas: HTMLCanvasElement, results: any) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.save()
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (results.poseLandmarks) {
      drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS as any, {
        color: 'rgba(6, 182, 212, 0.8)',
        lineWidth: 2
      })

      drawLandmarks(ctx, results.poseLandmarks, {
        color: 'rgba(16, 185, 129, 0.9)',
        lineWidth: 1,
        radius: 4
      })
    }

    ctx.restore()
  }, [])

  const detect = useCallback(async (videoElement: HTMLVideoElement) => {
    if (!poseRef.current || !isInitialized) return
    
    try {
      await poseRef.current.send({ image: videoElement })
    } catch (error) {
      console.error('Pose detection error:', error)
    }
  }, [isInitialized])

  const setCanvasElement = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas
  }, [])

  useEffect(() => {
    initializePose()
    
    return () => {
      if (poseRef.current) {
        poseRef.current.close()
      }
    }
  }, [initializePose])

  return {
    isInitialized,
    isDetecting,
    landmarks,
    detect,
    setCanvasElement
  }
}
