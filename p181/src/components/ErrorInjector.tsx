import React, { useState, useMemo, useCallback } from 'react';
import { Zap, RefreshCw, Download, RotateCcw, AlertCircle, ShieldCheck, RefreshCw as RecalcIcon } from 'lucide-react';
import { useTLPStore } from '@/store/tlpStore';
import { toHexString, recalculateECRC, hasECRC } from '@/utils/tlpParser';
import { cn } from '@/lib/utils';

export const ErrorInjector: React.FC = () => {
  const {
    selectedTLP,
    modifiedTLPs,
    injectError,
    clearModifications,
    exportModified,
    getCurrentTLPData,
    parseResult,
  } = useTLPStore();

  const [byteOffset, setByteOffset] = useState(0);
  const [bitPosition, setBitPosition] = useState(0);
  const [previewData, setPreviewData] = useState<Uint8Array | null>(null);
  const [autoRecalculateECRC, setAutoRecalculateECRC] = useState(true);

  const currentData = useMemo(() => {
    if (!selectedTLP) return null;
    return getCurrentTLPData(selectedTLP);
  }, [selectedTLP, getCurrentTLPData]);

  const modified = useMemo(() => {
    return selectedTLP ? modifiedTLPs.has(selectedTLP.index) : false;
  }, [selectedTLP, modifiedTLPs]);

  const originalMod = useMemo(() => {
    return selectedTLP ? modifiedTLPs.get(selectedTLP.index) : null;
  }, [selectedTLP, modifiedTLPs]);

  const maxByteOffset = useMemo(() => {
    return currentData ? currentData.length - 1 : 0;
  }, [currentData]);

  const hasECRCFlag = useMemo(() => {
    return currentData ? hasECRC(currentData) : false;
  }, [currentData]);

  const handlePreview = useCallback(() => {
    if (!currentData) return;
    try {
      let newData = new Uint8Array(currentData);
      newData[byteOffset] ^= (1 << bitPosition);

      if (autoRecalculateECRC && (hasECRCFlag || selectedTLP?.ecrc?.hasECRC)) {
        newData = recalculateECRC(newData);
      }

      setPreviewData(newData);
    } catch (e) {
      console.error('预览失败', e);
    }
  }, [currentData, byteOffset, bitPosition, autoRecalculateECRC, hasECRCFlag, selectedTLP]);

  const handleInject = useCallback(() => {
    if (!selectedTLP) return;
    injectError({
      tlpIndex: selectedTLP.index,
      byteOffset,
      bitPosition,
      autoRecalculateECRC,
    });
    setPreviewData(null);
  }, [selectedTLP, byteOffset, bitPosition, injectError, autoRecalculateECRC]);

  const handleInjectECRC = useCallback(() => {
    if (!selectedTLP || !currentData) return;
    const newData = recalculateECRC(currentData);
    injectError({
      tlpIndex: selectedTLP.index,
      byteOffset: 0,
      bitPosition: 0,
      autoRecalculateECRC: false,
    });
    setPreviewData(null);
  }, [selectedTLP, currentData, injectError]);

  const handleExport = useCallback(() => {
    const blob = exportModified();
    if (!blob || !parseResult) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = parseResult.fileName.replace(/\.[^/.]+$/, '');
    a.download = `${baseName}_modified.bin`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportModified, parseResult]);

  const getBitDiffClass = useCallback((offset: number, bit: number) => {
    if (!previewData || !currentData) return '';
    const origBit = (currentData[offset] >> bit) & 1;
    const newBit = (previewData[offset] >> bit) & 1;
    return origBit !== newBit ? 'bg-red-500 text-white' : '';
  }, [previewData, currentData]);

  if (!selectedTLP || !currentData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8">
        <Zap className="w-12 h-12 mb-4 text-slate-600" />
        <p>选择一个TLP以进行错误注入</p>
      </div>
    );
  }

  const displayData = previewData || currentData;
  const currentByte = displayData[byteOffset];
  const originalByte = currentData[byteOffset];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-semibold text-slate-200">错误注入</h3>
          {modified && (
            <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded border border-amber-500/50">
              已修改
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto space-y-4 pr-2">
        <div className="bg-slate-800/50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-slate-400 mb-3">注入参数</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                字节偏移 (0 - {maxByteOffset})
              </label>
              <input
                type="number"
                min="0"
                max={maxByteOffset}
                value={byteOffset}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setByteOffset(Math.max(0, Math.min(maxByteOffset, val || 0)));
                  setPreviewData(null);
                }}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Bit 位置 (0 - 7)
              </label>
              <input
                type="number"
                min="0"
                max="7"
                value={bitPosition}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setBitPosition(Math.max(0, Math.min(7, val || 0)));
                  setPreviewData(null);
                }}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-900/50 rounded border border-slate-700">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block mb-1">原值</span>
                <span className="font-mono text-slate-300">
                  0x{originalByte.toString(16).padStart(2, '0').toUpperCase()}
                  <span className="text-slate-500 ml-2">
                    ({originalByte.toString(2).padStart(8, '0')})
                  </span>
                </span>
              </div>
              {previewData && (
                <div>
                  <span className="text-slate-500 block mb-1">翻转后</span>
                  <span className="font-mono text-amber-400">
                    0x{currentByte.toString(16).padStart(2, '0').toUpperCase()}
                    <span className="text-slate-500 ml-2">
                      ({currentByte.toString(2).padStart(8, '0')})
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-900/50 rounded border border-slate-700">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRecalculateECRC}
                onChange={(e) => setAutoRecalculateECRC(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded bg-slate-700 border-slate-600 text-amber-500 focus:ring-amber-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs text-slate-300 mb-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  注入后自动重新计算ECRC
                </div>
                <p className="text-[10px] text-slate-500">
                  {hasECRCFlag ? 'TLP包含ECRC，注入后将更新校验和' : 'TLP无ECRC，勾选后将为TLP添加ECRC'}
                </p>
              </div>
            </label>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={handlePreview}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-200 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              预览
            </button>
            <button
              onClick={handleInject}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded text-sm text-white transition-colors"
            >
              <Zap className="w-4 h-4" />
              注入错误
            </button>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-slate-400 mb-3">
            Bit 视图 (偏移 {byteOffset})
          </h4>
          <div className="flex gap-1">
            {[7, 6, 5, 4, 3, 2, 1, 0].map((bit) => (
              <div
                key={bit}
                className={cn(
                  "flex-1 text-center py-2 rounded font-mono text-xs",
                  getBitDiffClass(byteOffset, bit),
                  bit === bitPosition && !previewData && "bg-amber-500/30 border border-amber-500",
                  !getBitDiffClass(byteOffset, bit) && bit !== bitPosition && "bg-slate-700"
                )}
              >
                <div className="text-slate-400 text-[10px] mb-1">{bit}</div>
                <div className="font-bold">{(currentByte >> bit) & 1}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2 text-center">
            点击"翻转"将改变第 {bitPosition} 位 (从0开始，LSB)
          </p>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-slate-400 mb-3">
            {previewData ? '预览数据' : '当前数据'}
          </h4>
          <pre className="text-xs font-mono text-slate-300 overflow-auto bg-slate-900/50 p-3 rounded">
            {toHexString(displayData, ' ')}
          </pre>
          {originalMod && (
            <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-400">
                  <p className="font-medium mb-1">历史修改</p>
                  <p className="text-slate-400">
                    字节偏移: {originalMod.injection.byteOffset}, 
                    Bit位置: {originalMod.injection.bitPosition}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleInjectECRC}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 rounded text-sm text-white transition-colors"
          >
            <RecalcIcon className="w-4 h-4" />
            添加/更新ECRC
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={clearModifications}
            disabled={modifiedTLPs.size === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-4 h-4" />
            重置所有修改
          </button>
          <button
            onClick={handleExport}
            disabled={modifiedTLPs.size === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-sm text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            导出修改
          </button>
        </div>
      </div>
    </div>
  );
};
