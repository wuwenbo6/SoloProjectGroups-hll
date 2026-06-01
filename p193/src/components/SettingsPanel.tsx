import { useAppStore } from '../store/useAppStore';

export function SettingsPanel() {
  const {
    showSettings,
    setShowSettings,
    timeReference,
    setTimeReference,
    pcmDeinterleave,
    setPcmDeinterleave,
    useIndexCache,
    setUseIndexCache
  } = useAppStore();

  if (!showSettings) {
    return (
      <button
        onClick={() => setShowSettings(true)}
        className="fixed top-4 right-4 z-50 px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium"
      >
        ⚙️ 解析设置
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-xl mx-4 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-800/50">
          <h2 className="text-lg font-semibold">解析设置</h2>
          <button
            onClick={() => setShowSettings(false)}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wide">时间参考 (Time Reference)</h3>
            
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={timeReference.enabled}
                onChange={(e) => setTimeReference({ enabled: e.target.checked })}
                className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900"
              />
              <span className="text-sm">启用时间戳重新计算</span>
            </label>

            {timeReference.enabled && (
              <div className="ml-8 space-y-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={timeReference.autoDetectFromTmats}
                    onChange={(e) => setTimeReference({ autoDetectFromTmats: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="text-sm">从TMATS自动检测参考时间</span>
                </label>

                {!timeReference.autoDetectFromTmats && (
                  <>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">参考时间 (ISO 格式)</label>
                      <input
                        type="datetime-local"
                        value={timeReference.referenceTime?.slice(0, 16) || ''}
                        onChange={(e) => setTimeReference({ referenceTime: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">或者参考纪元纳秒数</label>
                      <input
                        type="text"
                        value={timeReference.referenceEpochNs?.toString() || ''}
                        onChange={(e) => setTimeReference({ referenceEpochNs: BigInt(e.target.value || '0') })}
                        placeholder="0"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">PCM 反交错 (De-interleave)</h3>
            
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={pcmDeinterleave.enabled}
                onChange={(e) => setPcmDeinterleave({ enabled: e.target.checked })}
                className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
              />
              <span className="text-sm">启用PCM反交错解析</span>
            </label>

            {pcmDeinterleave.enabled && (
              <div className="ml-8 space-y-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">通道数</label>
                    <input
                      type="number"
                      min="1"
                      max="64"
                      value={pcmDeinterleave.channelCount}
                      onChange={(e) => setPcmDeinterleave({ channelCount: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">帧大小 (字节)</label>
                    <input
                      type="number"
                      min="2"
                      value={pcmDeinterleave.frameSize}
                      onChange={(e) => setPcmDeinterleave({ frameSize: parseInt(e.target.value) || 2 })}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">通道名称 (逗号分隔，可选)</label>
                  <input
                    type="text"
                    value={pcmDeinterleave.channelNames?.join(', ') || ''}
                    onChange={(e) => setPcmDeinterleave({ 
                      channelNames: e.target.value.split(',').map(s => s.trim()).filter(Boolean) 
                    })}
                    placeholder="Ch1, Ch2, Ch3, Ch4"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">索引缓存 (Index Cache)</h3>
            
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={useIndexCache}
                onChange={(e) => setUseIndexCache(e.target.checked)}
                className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900"
              />
              <span className="text-sm">启用预读索引文件缓存</span>
            </label>

            <p className="ml-8 text-xs text-slate-500">
              缓存文件偏移量索引，大幅提升重复解析大文件时的性能
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-700 bg-slate-800/30 flex justify-end gap-3">
          <button
            onClick={() => setShowSettings(false)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
