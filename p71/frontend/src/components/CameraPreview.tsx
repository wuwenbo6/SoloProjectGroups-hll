import React, { useEffect, useRef } from 'react'
import { useCamera } from '../hooks/useCamera'
import { useMediaPipe } from '../hooks/useMediaPipe'
import { PoseLandmark } from '../types/pose'

interface CameraPreviewProps {
  onPoseDetected?: (landmarks: PoseLandmark[]) => void
  className?: string
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({ onPoseDetected, className = '' }) => {
  const { videoRef, isCameraReady, error, startCamera } = useCamera()
  const { isInitialized, detect, setCanvasElement } = useMediaPipe({
    onPoseDetected
  })
  
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>()

  useEffect(() => {
    startCamera()
  }, [startCamera])

  useEffect(() => {
    if (overlayCanvasRef.current) {
      setCanvasElement(overlayCanvasRef.current)
    }
  }, [setCanvasElement])

  useEffect(() => {
    if (!isCameraReady || !isInitialized || !videoRef.current) return

    const processFrame = async () => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        await detect(videoRef.current)
      }
      animationFrameRef.current = requestAnimationFrame(processFrame)
    }

    animationFrameRef.current = requestAnimationFrame(processFrame)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isCameraReady, isInitialized, detect])

  useEffect(() => {
    const video = videoRef.current
    const canvas = overlayCanvasRef.current
    if (!video || !canvas) return

    const resizeCanvas = () => {
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480
    }

    video.addEventListener('loadedmetadata', resizeCanvas)
    return () => video.removeEventListener('loadedmetadata', resizeCanvas)
  }, [])

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-dark-card rounded-xl ${className}`}>
        <div className="text-center p-8">
          <div className="text-6xl mb-4">📷</div>
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => startCamera()}
            className="px-6 py-2 bg-neon-cyan text-white rounded-full hover:bg-cyan-500 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`video-container relative ${className}`}>
      <video
        ref={videoRef}
        className="w-full h-full object-cover rounded-xl transform scale-x-[-1]"
        playsInline
        muted
      />
      
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 w-full h-full rounded-xl transform scale-x-[-1]"
        style={{ zIndex: 10 }}
      />
      
      {!isCameraReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-dark-bg/80 rounded-xl">
          <div className="text-center">
            <div className="animate-spin w-12 h-12 border-4 border-neon-cyan border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-400">正在初始化摄像头...</p>
          </div>
        </div>
      )}
      
      {isCameraReady && isInitialized && (
        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 bg-green-500/20 border border-green-500/50 rounded-full" style={{ zIndex: 20 }}>
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-green-400 text-sm">检测中</span>
        </div>
      )}
    </div>
  )
}
