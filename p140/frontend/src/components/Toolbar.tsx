import { useState, useRef } from 'react';
import { Upload, Download, Camera, RotateCcw, Home, Layers } from 'lucide-react';
import { useThree } from '@react-three/fiber';
import { useVolumeStore } from '../store/useVolumeStore';
import DicomUploader from './DicomUploader';
import { exportScreenshot } from '../services/api';

interface ToolbarProps {
  glRef: React.RefObject<THREE.WebGLRenderer | null>;
}

export default function Toolbar({ glRef }: ToolbarProps) {
  const [showUploader, setShowUploader] = useState(false);
  const { sessionId, volume, resetVolume } = useVolumeStore();

  const handleExportScreenshot = async () => {
    if (!glRef.current) return;

    try {
      const gl = glRef.current;
      const dataUrl = gl.domElement.toDataURL('image/png');

      const result = await exportScreenshot(dataUrl, sessionId || undefined);
      
      const link = document.createElement('a');
      link.download = `volume_render_${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Failed to export screenshot:', error);
    }
  };

  const handleResetView = () => {
    window.dispatchEvent(new CustomEvent('resetCamera'));
  };

  return (
    <>
      <div className="h-12 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            <h1 className="text-sm font-semibold text-white">DICOM 3D 体渲染器</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {volume.loaded ? (
            <>
              <button
                onClick={handleResetView}
                className="p-2 hover:bg-slate-700 rounded transition-colors group"
                title="重置视角"
              >
                <RotateCcw className="w-4 h-4 text-slate-400 group-hover:text-white" />
              </button>
              <button
                onClick={handleExportScreenshot}
                className="p-2 hover:bg-slate-700 rounded transition-colors group"
                title="导出截图"
              >
                <Camera className="w-4 h-4 text-slate-400 group-hover:text-white" />
              </button>
              <div className="w-px h-5 bg-slate-700 mx-1" />
              <button
                onClick={() => {
                  resetVolume();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded transition-colors text-sm"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>重新上传</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowUploader(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors text-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>上传 DICOM</span>
            </button>
          )}
        </div>
      </div>

      {showUploader && <DicomUploader onClose={() => setShowUploader(false)} />}
    </>
  );
}
