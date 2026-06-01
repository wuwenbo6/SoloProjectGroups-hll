import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Alerts from './pages/Alerts'
import Events from './pages/Events'
import Rules from './pages/Rules'
import Logs from './pages/Logs'

function App() {
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/ws`
    const ws = new WebSocket(wsUrl)

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'alert') {
        setAlerts(prev => [data.alert, ...prev])
      }
    }

    return () => ws.close()
  }, [])

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard newAlerts={alerts} />}
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/events" element={<Events />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/logs" element={<Logs />} />
      </Routes>
    </Layout>
  )
}

export default App
