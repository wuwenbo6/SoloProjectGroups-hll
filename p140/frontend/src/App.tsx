import { useState, useEffect } from 'react';
import * as THREE from 'three';
import Toolbar from './components/Toolbar';
import ControlPanel from './components/ControlPanel';
import VolumeRenderer from './components/VolumeRenderer';
import MultiPlanarView from './components/MultiPlanarView';
import DicomUploader from './components/DicomUploader';
import { useVolumeStore } from './store/useVolumeStore';

function App() {
  const [gl, setGl] = useState<THREE.WebGLRenderer | null>(null);
  const { volume } = useVolumeStore();

  const handleContextReady = (renderer: THREE.WebGLRenderer) => {
    setGl(renderer);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-900 overflow-hidden">
      <Toolbar glRef={{ current: gl }} />

      <div className="flex-1 flex overflow-hidden">
        <ControlPanel />

        <main className="flex-1 relative">
          <VolumeRenderer onContextReady={handleContextReady} />

          {!volume.loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 pointer-events-none">
              <div className="text-center pointer-events-auto">
                <div className="mb-6">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                    <svg
                      className="w-10 h-10 text-slate-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold text-white mb-2">DICOM 3D 体渲染器</h2>
                  <p className="text-slate-400 text-sm max-w-xs mx-auto">
                    上传 DICOM 医学影像序列，进行三维重建和交互式分析
                  </p>
                </div>
                <DicomUploader />
              </div>
            </div>
          )}
        </main>

        <MultiPlanarView />
      </div>

      <footer className="h-6 bg-slate-800 border-t border-slate-700 flex items-center justify-between px-4 text-xs text-slate-500">
        <span>DICOM Volume Renderer v1.0.0</span>
        <span>
          {volume.loaded && volume.meta
            ? `${volume.meta.dimensions.x} × ${volume.meta.dimensions.y} × ${volume.meta.dimensions.z}`
            : '未加载数据'}
        </span>
      </footer>
    </div>
  );
}

export default App;
