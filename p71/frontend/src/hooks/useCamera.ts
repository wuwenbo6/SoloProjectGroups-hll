import { useState, useRef, useEffect, useCallback } from 'react'

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isCameraReady, setIsCameraReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')

  const getVideoDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter(d => d.kind === 'videoinput')
      setDevices(videoDevices)
      if (videoDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevices[0].deviceId)
      }
    } catch (e) {
      console.error('Failed to get video devices:', e)
    }
  }, [selectedDeviceId])

  const startCamera = useCallback(async (deviceId?: string) => {
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          ...(deviceId ? { deviceId: { exact: deviceId } } : {})
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play()
          setIsCameraReady(true)
        }
      }
      
      setError(null)
    } catch (e: any) {
      setError(e.message || 'Failed to access camera')
      setIsCameraReady(false)
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(track => track.stop())
      videoRef.current.srcObject = null
      setIsCameraReady(false)
    }
  }, [])

  const switchCamera = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId)
    stopCamera()
    setTimeout(() => startCamera(deviceId), 100)
  }, [stopCamera, startCamera])

  useEffect(() => {
    getVideoDevices()
    return () => {
      stopCamera()
    }
  }, [getVideoDevices, stopCamera])

  return {
    videoRef,
    isCameraReady,
    error,
    devices,
    selectedDeviceId,
    startCamera,
    stopCamera,
    switchCamera
  }
}
