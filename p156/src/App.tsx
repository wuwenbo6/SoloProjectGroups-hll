import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Upload from '@/pages/Upload'
import Browse from '@/pages/Browse'
import Query from '@/pages/Query'

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Upload />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/query" element={<Query />} />
      </Routes>
    </Router>
  )
}
