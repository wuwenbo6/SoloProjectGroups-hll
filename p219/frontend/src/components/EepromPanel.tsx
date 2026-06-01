import React, { useState, useRef, useCallback } from 'react';
import { FlashStatus, UploadResponse } from '../types';

interface EepromPanelProps {
  eepromData: string | null;
  eepromSize: number;
  eepromFile: string | null;
  onReadEeprom: () => void;
  onWriteEeprom: () => void;
  onUploadEeprom: (file: File) => Promise<UploadResponse | null>;
  status: FlashStatus;
}

const EepromPanel: React.FC<EepromPanelProps> = ({
  eepromData,
  eepromSize,
  eepromFile,
  onReadEeprom,
  onWriteEeprom,
  onUploadEeprom,
  status
}) => {
  const [uploading, setUploading] = useState(false);
  const [hexViewData, setHexViewData] = useState<Uint8Array | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isBusy = status !== 'idle' && status !== 'complete' && status !== 'error';

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      await onUploadEeprom(file);
      setUploading(false);
    }
  }, [onUploadEeprom]);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.hex') || file.name.endsWith('.eep'))) {
      setUploading(true);
      await onUploadEeprom(file);
      setUploading(false);
    }
  }, [onUploadEeprom]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const formatHexData = (data: string): Uint8Array | null => {
    try {
      const decoded = atob(data);
      const bytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) {
        bytes[i] = decoded.charCodeAt(i);
      }
      return bytes;
    } catch {
      return null;
    }
  };

  const renderHexView = (bytes: Uint8Array) => {
    const rows: JSX.Element[] = [];
    const bytesPerRow = 16;
    
    for (let i = 0; i < bytes.length; i += bytesPerRow) {
      const rowBytes = bytes.slice(i, i + bytesPerRow);
      const hexParts: string[] = [];
      const asciiParts: string[] = [];
      
      for (let j = 0; j < bytesPerRow; j++) {
        if (j < rowBytes.length) {
          hexParts.push(rowBytes[j].toString(16).padStart(2, '0').toUpperCase());
          const char = rowBytes[j];
          asciiParts.push(char >= 32 && char <= 126 ? String.fromCharCode(char) : '.');
        } else {
          hexParts.push('  ');
          asciiParts.push(' ');
        }
      }
      
      rows.push(
        <div key={i} className="flex font-mono text-sm">
          <span className="w-20 text-accent-blue">
            {i.toString(16).padStart(4, '0').toUpperCase()}
          </span>
          <span className="flex-1 text-text-primary">
            {hexParts.map((h, idx) => (
              <span 
                key={idx} 
                className={`inline-block w-6 ${
                  idx === 7 ? 'mr-4' : ''
                }`}
              >
                {h}
              </span>
            ))}
          </span>
          <span className="w-32 text-accent-green font-mono">
            {asciiParts.join('')}
          </span>
        </div>
      );
    }
    
    return (
      <div className="bg-dark-bg rounded-lg p-4 overflow-auto max-h-80 font-mono text-xs">
        {rows}
      </div>
    );
  };

  const viewEepromData = () => {
    if (eepromData) {
      const bytes = formatHexData(eepromData);
      setHexViewData(bytes);
    }
  };

  const downloadEeprom = () => {
    if (eepromData) {
      const bytes = formatHexData(eepromData);
      if (bytes) {
        const hexContent = generateIntelHex(bytes);
        const blob = new Blob([hexContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eeprom_${Date.now()}.hex`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  };

  const generateIntelHex = (data: Uint8Array): string => {
    const lines: string[] = [];
    const bytesPerLine = 16;
    
    for (let addr = 0; addr < data.length; addr += bytesPerLine) {
      const chunk = data.slice(addr, addr + bytesPerLine);
      const byteCount = chunk.length;
      const address = addr & 0xFFFF;
      const recordType = 0x00;
      
      let checksum = byteCount + ((address >> 8) & 0xFF) + (address & 0xFF) + recordType;
      
      let hexData = '';
      chunk.forEach(byte => {
        checksum += byte;
        hexData += byte.toString(16).padStart(2, '0').toUpperCase();
      });
      
      checksum = (~checksum + 1) & 0xFF;
      
      const line = `:${byteCount.toString(16).padStart(2, '0')}${address.toString(16).padStart(4, '0')}${recordType.toString(16).padStart(2, '0')}${hexData}${checksum.toString(16).padStart(2, '0')}`;
      lines.push(line.toUpperCase());
    }
    
    lines.push(':00000001FF');
    
    return lines.join('\n');
  };

  return (
    <div className="bg-dark-bg rounded-lg p-6">
      <h2 className="text-xl font-bold text-white mb-6">💾 EEPROM 操作</h2>
      
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">读取 EEPROM</h3>
          <p className="text-text-secondary text-sm mb-4">
            从芯片读取 EEPROM 数据并保存为 Intel HEX 格式文件
          </p>
          
          <button
            onClick={onReadEeprom}
            disabled={isBusy}
            className="w-full px-4 py-3 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors mb-4"
          >
            读取 EEPROM
          </button>
          
          {eepromData && (
            <div className="space-y-3">
              <div className="p-3 bg-accent-green/10 border border-accent-green/30 rounded-lg">
                <p className="text-accent-green text-sm">✓ EEPROM 数据已读取</p>
                <p className="text-text-secondary text-xs mt-1">
                  大小: {eepromSize || '?'} 字节
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={viewEepromData}
                  className="flex-1 px-3 py-2 bg-dark-card hover:bg-dark-card/80 text-white rounded text-sm transition-colors"
                >
                  查看数据
                </button>
                <button
                  onClick={downloadEeprom}
                  className="flex-1 px-3 py-2 bg-dark-card hover:bg-dark-card/80 text-accent-green rounded text-sm transition-colors"
                >
                  下载 HEX
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">写入 EEPROM</h3>
          <p className="text-text-secondary text-sm mb-4">
            上传 EEPROM 文件（.hex 或 .eep）并写入芯片
          </p>
          
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              uploading 
                ? 'border-accent-blue bg-accent-blue/10' 
                : 'border-dark-border hover:border-accent-blue/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".hex,.eep"
              onChange={handleFileChange}
              className="hidden"
            />
            
            {uploading ? (
              <div className="text-accent-blue">
                <div className="animate-spin w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full mx-auto mb-2"></div>
                <p>上传中...</p>
              </div>
            ) : eepromFile ? (
              <div>
                <p className="text-accent-green mb-2">✓ 文件已上传</p>
                <p className="text-text-secondary text-sm truncate">{eepromFile}</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 text-accent-blue text-sm hover:underline"
                >
                  重新选择
                </button>
              </div>
            ) : (
              <div>
                <p className="text-text-secondary mb-2">
                  拖拽文件到此处或
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-accent-blue hover:underline"
                >
                  点击选择文件
                </button>
                <p className="text-text-secondary text-xs mt-2">
                  支持 .hex 和 .eep 格式
                </p>
              </div>
            )}
          </div>
          
          <button
            onClick={onWriteEeprom}
            disabled={isBusy || !eepromFile}
            className="w-full mt-4 px-4 py-3 bg-accent-orange hover:bg-accent-orange/80 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            写入 EEPROM
          </button>
        </div>
      </div>
      
      {hexViewData && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-white">EEPROM 数据预览</h3>
            <button
              onClick={() => setHexViewData(null)}
              className="text-text-secondary hover:text-white text-sm"
            >
              关闭
            </button>
          </div>
          {renderHexView(hexViewData)}
        </div>
      )}
      
      <div className="mt-6 p-4 bg-accent-blue/10 border border-accent-blue/30 rounded-lg">
        <p className="text-accent-blue text-sm">
          💡 <strong>提示：</strong>EEPROM 数据在芯片擦除时默认会被清除。
          如果需要保留 EEPROM 数据，请在熔丝位中启用 EESAVE（EEPROM Save）选项。
        </p>
      </div>
    </div>
  );
};

export default EepromPanel;