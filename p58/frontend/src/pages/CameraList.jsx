import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Trash2, Edit, Play, RefreshCw, Wifi } from 'lucide-react'
import axios from 'axios'

export default function CameraList() {
  const [cameras, setCameras] = useState([])
  const [discovering, setDiscovering] = useState(false)
  const [discoveredDevices, setDiscoveredDevices] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [newCamera, setNewCamera] = useState({
    ip_address: '',
    port: 80,
    username: '',
    password: '',
    name: ''
  })
  const navigate = useNavigate()

  useEffect(() => {
    loadCameras()
  }, [])

  const loadCameras = async () => {
    try {
      const res = await axios.get('/api/cameras')
      setCameras(res.data.cameras)
    } catch (err) {
      console.error('Failed to load cameras:', err)
    }
  }

  const discoverDevices = async () => {
    setDiscovering(true)
    try {
      const res = await axios.get('/api/cameras/discover')
      setDiscoveredDevices(res.data.devices)
    } catch (err) {
      console.error('Discovery failed:', err)
    }
    setDiscovering(false)
  }

  const addCamera = async () => {
    try {
      await axios.post('/api/cameras', newCamera)
      setShowAddModal(false)
      setNewCamera({ ip_address: '', port: 80, username: '', password: '', name: '' })
      loadCameras()
    } catch (err) {
      alert('添加失败: ' + err.response?.data?.error)
    }
  }

  const addDiscoveredDevice = async (device) => {
    try {
      await axios.post('/api/cameras', {
        ip_address: device.ip_address,
        port: device.port || 80,
        username: '',
        password: '',
        name: device.name || device.ip_address
      })
      loadCameras()
    } catch (err) {
      alert('添加失败: ' + err.response?.data?.error)
    }
  }

  const deleteCamera = async (id) => {
    if (confirm('确定要删除这个摄像头吗？')) {
      try {
        await axios.delete(`/api/cameras/${id}`)
        loadCameras()
      } catch (err) {
        console.error('Delete failed:', err)
      }
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">摄像头列表</h2>
        <div className="flex gap-3">
          <button
            onClick={discoverDevices}
            disabled={discovering}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            <Wifi size={18} />
            {discovering ? '搜索中...' : '搜索设备'}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
          >
            <Plus size={18} />
            手动添加
          </button>
        </div>
      </div>

      {discoveredDevices.length > 0 && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold mb-3">发现的设备 ({discoveredDevices.length})</h3>
          <div className="grid gap-3">
            {discoveredDevices.map((device, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-lg shadow">
                <div>
                  <div className="font-medium">{device.name || '未知设备'}</div>
                  <div className="text-sm text-gray-500">{device.ip_address}:{device.port}</div>
                </div>
                <button
                  onClick={() => addDiscoveredDevice(device)}
                  className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                >
                  添加
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cameras.map((camera) => (
          <div key={camera.id} className="bg-white rounded-lg shadow overflow-hidden">
            <div className="h-40 bg-gray-800 flex items-center justify-center">
              {camera.rtsp_uri ? (
                <img
                  src={`https://picsum.photos/400/200?random=${camera.id}`}
                  alt={camera.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-gray-500">无视频流</div>
              )}
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-lg">{camera.name}</h3>
              <p className="text-sm text-gray-500">{camera.ip_address}:{camera.port}</p>
              <p className="text-xs text-gray-400 mt-1">
                {camera.manufacturer} {camera.model}
              </p>
              <div className="flex items-center gap-2 mt-2">
                {camera.ptz_supported ? (
                  <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">PTZ</span>
                ) : null}
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => navigate(`/camera/${camera.id}`)}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                >
                  <Play size={16} />
                  控制
                </button>
                <button
                  onClick={() => deleteCamera(camera.id)}
                  className="px-3 py-2 bg-red-100 text-red-600 rounded hover:bg-red-200"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">添加摄像头</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">IP 地址</label>
                <input
                  type="text"
                  value={newCamera.ip_address}
                  onChange={(e) => setNewCamera({ ...newCamera, ip_address: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="192.168.1.100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">端口</label>
                <input
                  type="number"
                  value={newCamera.port}
                  onChange={(e) => setNewCamera({ ...newCamera, port: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">名称</label>
                <input
                  type="text"
                  value={newCamera.name}
                  onChange={(e) => setNewCamera({ ...newCamera, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="摄像头名称"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">用户名</label>
                <input
                  type="text"
                  value={newCamera.username}
                  onChange={(e) => setNewCamera({ ...newCamera, username: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">密码</label>
                <input
                  type="password"
                  value={newCamera.password}
                  onChange={(e) => setNewCamera({ ...newCamera, password: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={addCamera}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
