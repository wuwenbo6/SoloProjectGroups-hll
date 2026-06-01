import { BrowserRouter, Routes, Route } from 'react-router-dom';
import UploadPage from './pages/Upload';
import HeatmapPage from './pages/Heatmap';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/map/:fileId" element={<HeatmapPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
