import { useState, useEffect } from 'react'
import { Brain, User, Car, Play, Square, RefreshCw, Camera as CameraIcon } from 'lucide-react'
import axios from 'axios'

export default function Analytics() {
  const [cameras, setCameras] = useState([])
  const [selectedCamera, setSelectedCamera] = useState('')
  const [detections, setDetections] = useState([])
  const [activeAnalyses, setActiveAnalyses] = useState([])
  const [analysisInterval, setAnalysisInterval] = useState(5000)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadCameras()
    loadDetections()
    loadActiveAnalyses()
  }, [])

  const loadCameras = async () => {
    try {
      const res = await axios.get('/api/cameras')
      setCameras(res.data.cameras)
      if (res.data.cameras.length > 0) {
        setSelectedCamera(res.data.cameras[0].id)
      }
    } catch (err) {
      console.error('Failed to load cameras:', err)
    }
  }

  const loadDetections = async () => {
    try {
      const res = await axios.get('/api/analytics/detections')
      setDetections(res.data.detections)
    } catch (err) {
      console.error('Failed to load detections:', err)
    }
  }

  const loadActiveAnalyses = async () => {
    try {
      const res = await axios.get('/api/analytics/continuous/active')
      setActiveAnalyses(res.data.active)
    } catch (err) {
      console.error('Failed to load active analyses:', err)
    }
  }

  const isCameraActive = (cameraId) => {
    return activeAnalyses.includes(`analysis_${cameraId}`)
  }

  const detectFaces = async () => {
    if (!selectedCamera) return
    setLoading(true)
    try {
      await axios.post('/api/analytics/detect/faces', { camera_id: selectedCamera })
      loadDetections()
    } catch (err) {
      console.error('Face detection failed:', err)
    }
    setLoading(false)
  }

  const detectLicensePlates = async () => {
    if (!selectedCamera) return
    setLoading(true)
    try {
      await axios.post('/api/analytics/detect/license-plates', { camera_id: selectedCamera })
      loadDetections()
    } catch (err) {
      console.error('License plate detection failed:', err)
    }
    setLoading(false)
  }

  const startContinuousAnalysis = async () => {
    if (!selectedCamera) return
    try {
      await axios.post('/api/analytics/continuous/start', {
        camera_id: selectedCamera,
        interval: analysisInterval,
        types: ['face', 'license_plate']
      })
      loadActiveAnalyses()
    } catch (err) {
      console.error('Failed to start analysis:', err)
    }
  }

  const stopContinuousAnalysis = async () => {
    if (!selectedCamera) return
    try {
      await axios.post('/api/analytics/continuous/stop', {
        camera_id: selectedCamera
      })
      loadActiveAnalyses()
    } catch (err) {
      console.error('Failed to stop analysis:', err)
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Brain size={28} />
          智能分析
        </h2>
        <button
          onClick={loadDetections}
          className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
        >
          <RefreshCw size={18} />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-4">分析控制</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">选择摄像头</label>
                <select
                  value={selectedCamera}
                  onChange={(e) => setSelectedCamera(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {cameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>{cam.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">分析间隔 (毫秒)</label>
                <input
                  type="number"
                  value={analysisInterval}
                  onChange={(e) => setAnalysisInterval(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={detectFaces}
                  disabled={loading || !selectedCamera}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  <User size={18} />
                  人脸检测
                </button>
                <button
                  onClick={detectLicensePlates}
                  disabled={loading || !selectedCamera}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
                >
                  <Car size={18} />
                  车牌检测
                </button>
              </div>

              {isCameraActive(selectedCamera) ? (
                <button
                  onClick={stopContinuousAnalysis}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  <Square size={18} />
                  停止连续分析
                </button>
              ) : (
                <button
                  onClick={startContinuousAnalysis}
                  disabled={!selectedCamera}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                >
                  <Play size={18} />
                  开始连续分析
                </button>
              )}
            </div>
          </div>

          {activeAnalyses.length > 0 && (
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold mb-3">正在分析</h3>
              <div className="space-y-2">
                {activeAnalyses.map((key) => {
                  const cameraId = key.replace('analysis_', '')
                  const camera = cameras.find(c => c.id == cameraId)
                  return (
                    <div key={key} className="flex items-center gap-2 p-2 bg-green-50 rounded">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-sm">{camera?.name || cameraId}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b">
              <h3 className="font-semibold">检测结果</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">类型</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">摄像头</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">置信度</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {detections.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        暂无检测结果
                      </td>
                    </tr>
                  ) : (
                    detections.slice(0, 20).map((det) => (
                      <tr key={det.id}>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 text-xs rounded ${
                            det.detection_type === 'face' 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-purple-100 text-purple-700'
                          }`}>
                            {det.detection_type === 'face' ? '人脸' : '车牌'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {det.camera_name || '未知'}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {(det.confidence * 100).toFixed(0)}%
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600">
                          {new Date(det.created_at).toLocaleString('zh-CN')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
