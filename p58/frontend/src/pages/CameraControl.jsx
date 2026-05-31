import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ZoomIn, ZoomOut, Home, Square, ChevronLeft } from 'lucide-react'
import axios from 'axios'

export default function CameraControl() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [camera, setCamera] = useState(null)
  const [loading, setLoading] = useState(true)
  const [speed, setSpeed] = useState(0.5)
  const [isMoving, setIsMoving] = useState(false)
  const [isZooming, setIsZooming] = useState(false)
  
  const moveStateRef = useRef({ direction: null, isMoving: false })
  const stopDebounceRef = useRef(null)
  const pendingStopRef = useRef(false)

  useEffect(() => {
    loadCamera()
    
    return () => {
      forceStopPTZ()
      if (stopDebounceRef.current) {
        clearTimeout(stopDebounceRef.current)
      }
    }
  }, [id])

  const loadCamera = async () => {
    try {
      const res = await axios.get(`/api/cameras/${id}`)
      setCamera(res.data.camera)
    } catch (err) {
      console.error('Failed to load camera:', err)
    }
    setLoading(false)
  }

  const sendStopCommand = useCallback(async () => {
    try {
      await axios.post('/api/ptz/stop', { cameraId: id })
    } catch (err) {
      console.error('PTZ stop failed:', err)
    }
  }, [id])

  const forceStopPTZ = useCallback(async () => {
    moveStateRef.current = { direction: null, isMoving: false }
    setIsMoving(false)
    setIsZooming(false)
    pendingStopRef.current = false
    
    for (let i = 0; i < 2; i++) {
      await sendStopCommand()
      await new Promise(r => setTimeout(r, 50))
    }
  }, [sendStopCommand])

  const debouncedStop = useCallback(() => {
    if (stopDebounceRef.current) {
      clearTimeout(stopDebounceRef.current)
    }
    
    pendingStopRef.current = true
    stopDebounceRef.current = setTimeout(() => {
      if (pendingStopRef.current) {
        forceStopPTZ()
      }
    }, 100)
  }, [forceStopPTZ])

  const cancelPendingStop = useCallback(() => {
    if (stopDebounceRef.current) {
      clearTimeout(stopDebounceRef.current)
      stopDebounceRef.current = null
    }
    pendingStopRef.current = false
  }, [])

  const handlePTZMoveStart = useCallback((direction) => {
    cancelPendingStop()
    
    if (moveStateRef.current.direction === direction && moveStateRef.current.isMoving) {
      return
    }
    
    moveStateRef.current = { direction, isMoving: true }
    setIsMoving(true)
    
    axios.post('/api/ptz/move', {
      cameraId: id,
      direction,
      speed
    }).catch(err => console.error('PTZ move failed:', err))
  }, [id, speed, cancelPendingStop])

  const handlePTZMoveStop = useCallback(() => {
    moveStateRef.current = { direction: null, isMoving: false }
    setIsMoving(false)
    debouncedStop()
  }, [debouncedStop])

  const stopPTZ = useCallback(() => {
    forceStopPTZ()
  }, [forceStopPTZ])

  const handleZoomStart = useCallback((direction) => {
    cancelPendingStop()
    setIsZooming(true)
    
    axios.post('/api/ptz/zoom', {
      cameraId: id,
      direction,
      speed
    }).catch(err => console.error('Zoom failed:', err))
  }, [id, speed, cancelPendingStop])

  const handleZoomStop = useCallback(() => {
    setIsZooming(false)
    debouncedStop()
  }, [debouncedStop])

  const goHome = async () => {
    try {
      await axios.post('/api/ptz/home', { cameraId: id })
    } catch (err) {
      console.error('Go home failed:', err)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full">加载中...</div>
  }

  if (!camera) {
    return <div className="flex items-center justify-center h-full">摄像头不存在</div>
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/')}
          className="p-2 hover:bg-gray-200 rounded-lg"
        >
          <ChevronLeft size={24} />
        </button>
        <h2 className="text-2xl font-bold">{camera.name}</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-black rounded-lg overflow-hidden aspect-video">
            <img
              src={`https://picsum.photos/800/450?random=${camera.id}`}
              alt={camera.name}
              className="w-full h-full object-cover"
            />
          </div>
          {camera.rtsp_uri && (
            <div className="mt-2 p-3 bg-gray-100 rounded text-sm">
              <span className="font-medium">RTSP流地址:</span> {camera.rtsp_uri}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {camera.ptz_supported ? (
            <>
              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="font-semibold mb-4">PTZ 控制</h3>
                
                <div className="flex flex-col items-center gap-2">
                  <button
                    onMouseDown={() => handlePTZMoveStart('up')}
                    onMouseUp={handlePTZMoveStop}
                    onMouseLeave={handlePTZMoveStop}
                    onTouchStart={(e) => { e.preventDefault(); handlePTZMoveStart('up'); }}
                    onTouchEnd={(e) => { e.preventDefault(); handlePTZMoveStop(); }}
                    onTouchCancel={(e) => { e.preventDefault(); handlePTZMoveStop(); }}
                    className={`ptz-btn ${isMoving ? 'bg-blue-200' : ''}`}
                  >
                    <ArrowUp size={24} />
                  </button>
                  
                  <div className="flex gap-2">
                    <button
                      onMouseDown={() => handlePTZMoveStart('left')}
                      onMouseUp={handlePTZMoveStop}
                      onMouseLeave={handlePTZMoveStop}
                      onTouchStart={(e) => { e.preventDefault(); handlePTZMoveStart('left'); }}
                      onTouchEnd={(e) => { e.preventDefault(); handlePTZMoveStop(); }}
                      onTouchCancel={(e) => { e.preventDefault(); handlePTZMoveStop(); }}
                      className={`ptz-btn ${isMoving ? 'bg-blue-200' : ''}`}
                    >
                      <ArrowLeft size={24} />
                    </button>
                    <button
                      onClick={stopPTZ}
                      className="ptz-btn bg-red-100 hover:bg-red-200 active:bg-red-300"
                    >
                      <Square size={20} />
                    </button>
                    <button
                      onMouseDown={() => handlePTZMoveStart('right')}
                      onMouseUp={handlePTZMoveStop}
                      onMouseLeave={handlePTZMoveStop}
                      onTouchStart={(e) => { e.preventDefault(); handlePTZMoveStart('right'); }}
                      onTouchEnd={(e) => { e.preventDefault(); handlePTZMoveStop(); }}
                      onTouchCancel={(e) => { e.preventDefault(); handlePTZMoveStop(); }}
                      className={`ptz-btn ${isMoving ? 'bg-blue-200' : ''}`}
                    >
                      <ArrowRight size={24} />
                    </button>
                  </div>
                  
                  <button
                    onMouseDown={() => handlePTZMoveStart('down')}
                    onMouseUp={handlePTZMoveStop}
                    onMouseLeave={handlePTZMoveStop}
                    onTouchStart={(e) => { e.preventDefault(); handlePTZMoveStart('down'); }}
                    onTouchEnd={(e) => { e.preventDefault(); handlePTZMoveStop(); }}
                    onTouchCancel={(e) => { e.preventDefault(); handlePTZMoveStop(); }}
                    className={`ptz-btn ${isMoving ? 'bg-blue-200' : ''}`}
                  >
                    <ArrowDown size={24} />
                  </button>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium mb-2">速度: {speed.toFixed(1)}</label>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.1"
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                <button
                  onClick={goHome}
                  className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  <Home size={18} />
                  回到预设位
                </button>
              </div>

              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="font-semibold mb-4">变焦</h3>
                <div className="flex gap-4 justify-center">
                  <button
                    onMouseDown={() => handleZoomStart('in')}
                    onMouseUp={handleZoomStop}
                    onMouseLeave={handleZoomStop}
                    onTouchStart={(e) => { e.preventDefault(); handleZoomStart('in'); }}
                    onTouchEnd={(e) => { e.preventDefault(); handleZoomStop(); }}
                    onTouchCancel={(e) => { e.preventDefault(); handleZoomStop(); }}
                    className={`w-16 h-16 flex flex-col items-center justify-center bg-blue-100 hover:bg-blue-200 rounded-lg ${isZooming ? 'bg-blue-300' : ''}`}
                  >
                    <ZoomIn size={28} />
                    <span className="text-xs">放大</span>
                  </button>
                  <button
                    onMouseDown={() => handleZoomStart('out')}
                    onMouseUp={handleZoomStop}
                    onMouseLeave={handleZoomStop}
                    onTouchStart={(e) => { e.preventDefault(); handleZoomStart('out'); }}
                    onTouchEnd={(e) => { e.preventDefault(); handleZoomStop(); }}
                    onTouchCancel={(e) => { e.preventDefault(); handleZoomStop(); }}
                    className={`w-16 h-16 flex flex-col items-center justify-center bg-blue-100 hover:bg-blue-200 rounded-lg ${isZooming ? 'bg-blue-300' : ''}`}
                  >
                    <ZoomOut size={28} />
                    <span className="text-xs">缩小</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-yellow-50 rounded-lg p-4 text-center">
              <p className="text-yellow-700">此摄像头不支持 PTZ 控制</p>
            </div>
          )}

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-3">设备信息</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">IP地址:</span>
                <span>{camera.ip_address}:{camera.port}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">厂商:</span>
                <span>{camera.manufacturer || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">型号:</span>
                <span>{camera.model || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">序列号:</span>
                <span>{camera.serial_number || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">固件版本:</span>
                <span>{camera.firmware_version || '-'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
