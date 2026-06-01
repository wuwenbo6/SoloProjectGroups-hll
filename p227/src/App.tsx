import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import PatientDetail from '@/pages/PatientDetail'
import Messages from '@/pages/Messages'
import Status from '@/pages/Status'

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/patient/:id" element={<PatientDetail />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/status" element={<Status />} />
        </Routes>
      </Layout>
    </Router>
  )
}
