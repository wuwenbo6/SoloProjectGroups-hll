import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from '@/pages/Home'
import Overview from '@/pages/Overview'
import SnrAnalysis from '@/pages/SnrAnalysis'
import Layout from '@/components/Layout'

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/overview/:fileId" element={<Overview />} />
          <Route path="/snr/:fileId" element={<SnrAnalysis />} />
        </Routes>
      </Layout>
    </Router>
  )
}
