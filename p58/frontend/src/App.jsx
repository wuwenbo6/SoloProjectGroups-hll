import { Routes, Route, Link } from 'react-router-dom'
import { Camera, Video, Clock, AlertCircle, Brain, DatabaseBackup } from 'lucide-react'
import CameraList from './pages/CameraList'
import CameraControl from './pages/CameraControl'
import RecordingSchedules from './pages/RecordingSchedules'
import EventLog from './pages/EventLog'
import Analytics from './pages/Analytics'
import ConfigBackup from './pages/ConfigBackup'

function App() {
  return (
    <div className="flex h-screen bg-gray-100">
      <nav className="w-64 bg-gray-800 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Camera size={24} />
            摄像头管理
          </h1>
        </div>
        <div className="flex-1 p-4 space-y-2">
          <Link
            to="/"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Video size={20} />
            摄像头列表
          </Link>
          <Link
            to="/schedules"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Clock size={20} />
            录像计划
          </Link>
          <Link
            to="/events"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <AlertCircle size={20} />
            事件日志
          </Link>
          <Link
            to="/analytics"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Brain size={20} />
            智能分析
          </Link>
          <Link
            to="/config"
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <DatabaseBackup size={20} />
            配置备份
          </Link>
        </div>
      </nav>
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<CameraList />} />
          <Route path="/camera/:id" element={<CameraControl />} />
          <Route path="/schedules" element={<RecordingSchedules />} />
          <Route path="/events" element={<EventLog />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/config" element={<ConfigBackup />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
