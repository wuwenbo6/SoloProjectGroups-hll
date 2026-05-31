import { useState } from 'react';
import { Download, Image, ChevronDown, ChevronUp, Loader2, Settings2 } from 'lucide-react';
import { PathTracingRenderer, DenoiseSettings } from '../lib/PathTracingRenderer';
import { useSceneStore } from '../store/useSceneStore';

interface ExportPanelProps {
  renderer: PathTracingRenderer | null;
}

const PRESETS = [
  { name: 'HD', width: 1280, height: 720 },
  { name: 'Full HD', width: 1920, height: 1080 },
  { name: '2K', width: 2560, height: 1440 },
  { name: '4K', width: 3840, height: 2160 },
];

const EXPORT_FORMATS = [
  { value: 'png', label: 'PNG', desc: '8-bit sRGB' },
  { value: 'exr', label: 'EXR', desc: '16-bit 浮点 HDR' },
];

const DENOISE_TYPES = [
  { value: 'fxaa', label: 'FXAA', desc: '快速抗锯齿' },
  { value: 'smaa', label: 'SMAA', desc: '高质量抗锯齿' },
];

export function ExportPanel({ renderer }: ExportPanelProps) {
  const { currentScene } = useSceneStore();
  const [expanded, setExpanded] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState(1);
  const [customWidth, setCustomWidth] = useState(1920);
  const [customHeight, setCustomHeight] = useState(1080);
  const [exportFormat, setExportFormat] = useState<'png' | 'exr'>('png');
  const [isExporting, setIsExporting] = useState(false);
  const [denoiseSettings, setDenoiseSettings] = useState<DenoiseSettings>({
    enabled: true,
    type: 'fxaa',
    intensity: 1.0
  });

  const preset = PRESETS[selectedPreset];
  const width = preset ? preset.width : customWidth;
  const height = preset ? preset.height : customHeight;

  const handleDenoiseChange = (settings: Partial<DenoiseSettings>) => {
    const newSettings = { ...denoiseSettings, ...settings };
    setDenoiseSettings(newSettings);
    if (renderer) {
      renderer.setDenoiseSettings(newSettings);
    }
  };

  const downloadEXR = (data: Uint8Array, filename: string) => {
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    if (!renderer) return;
    
    setIsExporting(true);
    try {
      const baseName = `${currentScene?.name || 'render'}_${width}x${height}`;
      
      if (exportFormat === 'exr') {
        const exrData = await renderer.exportEXR(width, height);
        downloadEXR(exrData, `${baseName}.exr`);
      } else {
        const dataUrl = await renderer.exportImage(width, height);
        const link = document.createElement('a');
        link.download = `${baseName}.png`;
        link.href = dataUrl;
        link.click();
      }
    } catch (error) {
      console.error('导出失败:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="absolute bottom-4 right-4 w-80 bg-[#0d0d14]/95 backdrop-blur-sm border border-cyan-500/20 rounded-xl shadow-2xl overflow-hidden">
      <div 
        className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 cursor-pointer hover:bg-cyan-500/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Image className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-semibold text-white">渲染导出</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-2">输出格式</label>
            <div className="grid grid-cols-2 gap-2">
              {EXPORT_FORMATS.map((fmt) => (
                <button
                  key={fmt.value}
                  onClick={() => setExportFormat(fmt.value as 'png' | 'exr')}
                  className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-colors ${
                    exportFormat === fmt.value
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  <span className="text-sm font-medium">{fmt.label}</span>
                  <span className="text-[10px] opacity-70">{fmt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-2">分辨率预设</label>
            <div className="grid grid-cols-4 gap-1">
              {PRESETS.map((p, i) => (
                <button
                  key={p.name}
                  onClick={() => setSelectedPreset(i)}
                  className={`px-2 py-1.5 text-xs rounded-lg transition-colors ${
                    selectedPreset === i
                      ? 'bg-cyan-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">宽度</label>
              <input
                type="number"
                value={width}
                onChange={(e) => {
                  setSelectedPreset(-1);
                  setCustomWidth(parseInt(e.target.value) || 0);
                }}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">高度</label>
              <input
                type="number"
                value={height}
                onChange={(e) => {
                  setSelectedPreset(-1);
                  setCustomHeight(parseInt(e.target.value) || 0);
                }}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-cyan-500/10">
            <div className="flex items-center gap-2 mb-2">
              <Settings2 className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-400 font-medium">降噪设置</span>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">启用降噪</span>
                <button
                  onClick={() => handleDenoiseChange({ enabled: !denoiseSettings.enabled })}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    denoiseSettings.enabled ? 'bg-cyan-500' : 'bg-gray-700'
                  }`}
                >
                  <div 
                    className={`w-4 h-4 bg-white rounded-full transition-transform ${
                      denoiseSettings.enabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {denoiseSettings.enabled && (
                <>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">降噪类型</label>
                    <div className="grid grid-cols-2 gap-1">
                      {DENOISE_TYPES.map((type) => (
                        <button
                          key={type.value}
                          onClick={() => handleDenoiseChange({ type: type.value as 'fxaa' | 'smaa' })}
                          className={`px-2 py-1.5 text-xs rounded-lg transition-colors ${
                            denoiseSettings.type === type.value
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-cyan-500/10">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
              <span>输出尺寸</span>
              <span className="font-mono">{width} × {height} · {exportFormat.toUpperCase()}</span>
            </div>
            <button
              onClick={handleExport}
              disabled={!renderer || isExporting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-orange-600 hover:from-cyan-500 hover:to-orange-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-all"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  渲染中...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  导出 {exportFormat.toUpperCase()}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
