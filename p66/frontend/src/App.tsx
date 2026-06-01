import { useState, useCallback } from 'react';
import { ImageUpload } from './components/ImageUpload';
import { FilterPanel } from './components/FilterPanel';
import { LayerPanel } from './components/LayerPanel';
import { PreviewCanvas } from './components/PreviewCanvas';
import { useImageProcessor } from './hooks/useImageProcessor';
import { FilterType, BlendMode, CustomKernel } from './types';
import { downloadPSD } from './utils/psdExport';

function App() {
  const [showOriginal, setShowOriginal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const {
    layers,
    selectedLayerId,
    selectedLayer,
    canvasSize,
    baseImageData,
    isProcessing,
    canUndo,
    canRedo,
    uploadImage,
    addLayer,
    deleteLayer,
    updateLayerFilter,
    updateLayerOpacity,
    updateLayerBlendMode,
    toggleLayerVisibility,
    moveLayer,
    setSelectedLayerId,
    exportImage,
    undo,
    redo,
  } = useImageProcessor();

  const hasImage = layers.length > 0;

  const handleUpload = useCallback(async (file: File) => {
    await uploadImage(file);
  }, [uploadImage]);

  const handleFilterChange = useCallback((filter: FilterType, intensity: number, kernel?: CustomKernel) => {
    if (selectedLayerId) {
      updateLayerFilter(selectedLayerId, filter, intensity, kernel);
    }
  }, [selectedLayerId, updateLayerFilter]);

  const handleKernelChange = useCallback((kernel: CustomKernel) => {
    if (selectedLayerId && selectedLayer) {
      updateLayerFilter(selectedLayerId, 'custom', selectedLayer.filterIntensity, kernel);
    }
  }, [selectedLayerId, selectedLayer, updateLayerFilter]);

  const handleOpacityChange = useCallback((layerId: string, opacity: number) => {
    updateLayerOpacity(layerId, opacity);
  }, [updateLayerOpacity]);

  const handleBlendModeChange = useCallback((layerId: string, mode: BlendMode) => {
    updateLayerBlendMode(layerId, mode);
  }, [updateLayerBlendMode]);

  const handleExportPNG = useCallback(() => {
    const dataUrl = exportImage('png');
    if (dataUrl) {
      const link = document.createElement('a');
      link.download = `filtered-image-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    }
    setShowExportMenu(false);
  }, [exportImage]);

  const handleExportPSD = useCallback(() => {
    try {
      downloadPSD(layers, canvasSize.width, canvasSize.height, `filtered-image-${Date.now()}.psd`);
    } catch (error) {
      console.error('PSD export failed:', error);
    }
    setShowExportMenu(false);
  }, [layers, canvasSize]);

  const handleUndo = useCallback(() => {
    undo();
  }, [undo]);

  const handleRedo = useCallback(() => {
    redo();
  }, [redo]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <div
        className="fixed inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 212, 255, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 212, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      <header className="relative z-10 border-b border-gray-700/50 backdrop-blur-sm bg-gray-900/50">
        <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                WASM 图像滤镜
              </h1>
              <p className="text-xs text-gray-500">高性能图像处理</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {hasImage && (
              <>
                <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg p-1">
                  <button
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="撤销 (Ctrl+Z)"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="重做 (Ctrl+Y)"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
                    </svg>
                  </button>
                </div>

                <button
                  onClick={() => setShowOriginal(!showOriginal)}
                  onMouseDown={() => setShowOriginal(true)}
                  onMouseUp={() => setShowOriginal(false)}
                  onMouseLeave={() => setShowOriginal(false)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    showOriginal
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/50'
                      : 'bg-gray-700/50 text-gray-300 border border-gray-600 hover:bg-gray-700'
                  }`}
                >
                  {showOriginal ? '显示原图' : '按住对比'}
                </button>

                <div className="relative">
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg text-sm font-medium hover:from-cyan-400 hover:to-blue-400 transition-all duration-300 shadow-lg shadow-cyan-500/25 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    导出
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {showExportMenu && (
                    <div className="absolute right-0 top-full mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50 min-w-[140px]">
                      <button
                        onClick={handleExportPNG}
                        className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                      >
                        <span className="text-lg">🖼️</span>
                        导出 PNG
                      </button>
                      <button
                        onClick={handleExportPSD}
                        className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2"
                      >
                        <span className="text-lg">📄</span>
                        导出 PSD
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-screen-2xl mx-auto p-6">
        {!hasImage ? (
          <div className="max-w-2xl mx-auto py-20">
            <ImageUpload onUpload={handleUpload} hasImage={false} />
            <div className="mt-12 grid grid-cols-5 gap-4">
              {[
                { icon: '🌫️', name: '模糊', desc: '高斯模糊' },
                { icon: '⚡', name: '锐化', desc: '增强细节' },
                { icon: '📐', name: '边缘检测', desc: 'Sobel算子' },
                { icon: '🎨', name: '油画', desc: '艺术效果' },
                { icon: '🔧', name: '自定义', desc: '卷积核' },
              ].map((item) => (
                <div
                  key={item.name}
                  className="text-center p-4 bg-gray-800/30 rounded-xl border border-gray-700/50"
                >
                  <div className="text-3xl mb-2">{item.icon}</div>
                  <div className="text-sm font-medium text-white">{item.name}</div>
                  <div className="text-xs text-gray-500">{item.desc}</div>
                </div>
              ))}
            </div>
            <div className="mt-8 text-center">
              <p className="text-sm text-gray-500">
                支持 <span className="text-cyan-400">撤销/重做</span> • 
                <span className="text-purple-400"> 图层混合</span> • 
                <span className="text-yellow-400"> PSD导出</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-6" style={{ height: 'calc(100vh - 140px)' }}>
            <div className="col-span-3">
              <LayerPanel
                layers={layers}
                selectedLayerId={selectedLayerId}
                onSelectLayer={setSelectedLayerId}
                onAddLayer={addLayer}
                onDeleteLayer={deleteLayer}
                onToggleVisibility={toggleLayerVisibility}
                onOpacityChange={handleOpacityChange}
                onBlendModeChange={handleBlendModeChange}
                onMoveLayer={moveLayer}
                disabled={!hasImage || isProcessing}
              />
            </div>

            <div className="col-span-6 bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-700/50 overflow-hidden">
              <div className="h-full relative">
                <div className="absolute top-4 left-4 z-10">
                  <ImageUpload onUpload={handleUpload} hasImage={true} />
                </div>
                {isProcessing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm text-gray-300">处理中...</span>
                    </div>
                  </div>
                )}
                <PreviewCanvas
                  layers={layers}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  showOriginal={showOriginal}
                  originalImageData={baseImageData}
                />
              </div>
            </div>

            <div className="col-span-3 space-y-4 overflow-y-auto max-h-full pb-4">
              <FilterPanel
                currentFilter={selectedLayer?.filter || null}
                currentIntensity={selectedLayer?.filterIntensity || 0.5}
                customKernel={selectedLayer?.customKernel}
                onFilterChange={handleFilterChange}
                onKernelChange={handleKernelChange}
                disabled={!hasImage || !selectedLayerId || isProcessing}
              />

              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700">
                <h3 className="text-sm font-medium text-gray-300 mb-3">图像信息</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">尺寸</span>
                    <span className="text-white font-mono">
                      {canvasSize.width} × {canvasSize.height}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">图层数</span>
                    <span className="text-white font-mono">{layers.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">当前滤镜</span>
                    <span className="text-cyan-400">
                      {selectedLayer?.filter
                        ? selectedLayer.filter === 'blur' ? '模糊'
                        : selectedLayer.filter === 'sharpen' ? '锐化'
                        : selectedLayer.filter === 'edgeDetect' ? '边缘检测'
                        : selectedLayer.filter === 'oilPaint' ? '油画'
                        : '自定义'
                        : '无'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="relative z-10 text-center py-4 text-xs text-gray-600">
        高性能图像处理引擎 • 支持历史快照 • 自定义卷积核 • PSD导出
      </footer>
    </div>
  );
}

export default App;
