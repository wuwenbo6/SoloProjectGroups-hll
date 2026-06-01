import React from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { LiveRecognition } from './pages/LiveRecognition'
import { History } from './pages/History'

const App: React.FC = () => {
  const location = useLocation()

  const navItems = [
    { path: '/', label: '实时识别', icon: '🎯' },
    { path: '/history', label: '训练历史', icon: '📊' },
  ]

  return (
    <div className="min-h-screen bg-dark-bg">
      <nav className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
        <div className="glass rounded-full px-4 py-3 flex items-center gap-2 neon-border">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`px-6 py-2 rounded-full flex items-center gap-2 transition-all ${
                location.pathname === item.path
                  ? 'bg-gradient-to-r from-neon-cyan to-neon-green text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<LiveRecognition />} />
        <Route path="/history" element={<History />} />
      </Routes>

      <div className="h-24" />
    </div>
  )
}

export default App
