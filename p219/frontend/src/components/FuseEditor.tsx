import React, { useState, useEffect, useCallback } from 'react';
import { FuseBytes, FuseConfig, FuseByteConfig, FlashStatus } from '../types';

interface FuseEditorProps {
  fuseConfig: FuseConfig | null;
  fuseValues: FuseBytes | null;
  onReadFuses: () => void;
  onWriteFuses: (fuses: FuseBytes) => void;
  status: FlashStatus;
}

const FuseEditor: React.FC<FuseEditorProps> = ({
  fuseConfig,
  fuseValues,
  onReadFuses,
  onWriteFuses,
  status
}) => {
  const [editableFuses, setEditableFuses] = useState<FuseBytes>({
    low: '0x62',
    high: '0xD9',
    extended: '0xFF'
  });
  const [writeConfirm, setWriteConfirm] = useState(false);

  useEffect(() => {
    if (fuseValues) {
      setEditableFuses(fuseValues);
    }
  }, [fuseValues]);

  const hexToBinary = (hex: string): string => {
    const num = parseInt(hex, 16);
    return num.toString(2).padStart(8, '0');
  };

  const binaryToHex = (binary: string): string => {
    const num = parseInt(binary, 2);
    return '0x' + num.toString(16).padStart(2, '0').toLowerCase();
  };

  const toggleBit = (byteType: 'low' | 'high' | 'extended', bitIndex: number) => {
    const currentHex = editableFuses[byteType] || '0x00';
    const binary = hexToBinary(currentHex);
    const bits = binary.split('');
    const reverseIndex = 7 - bitIndex;
    bits[reverseIndex] = bits[reverseIndex] === '1' ? '0' : '1';
    const newHex = binaryToHex(bits.join(''));
    
    setEditableFuses(prev => ({
      ...prev,
      [byteType]: newHex
    }));
  };

  const getBitValue = (byteType: 'low' | 'high' | 'extended', bitIndex: number): boolean => {
    const hex = editableFuses[byteType] || '0x00';
    const binary = hexToBinary(hex);
    const reverseIndex = 7 - bitIndex;
    return binary[reverseIndex] === '1';
  };

  const handleHexInput = (byteType: 'low' | 'high' | 'extended', value: string) => {
    let hex = value.replace(/[^0-9a-fA-F]/g, '');
    if (hex.length > 2) {
      hex = hex.slice(0, 2);
    }
    if (hex.length === 0) {
      hex = '00';
    }
    setEditableFuses(prev => ({
      ...prev,
      [byteType]: '0x' + hex.toLowerCase()
    }));
  };

  const renderByteEditor = (byteType: 'low' | 'high' | 'extended', config: FuseByteConfig) => {
    const hexValue = editableFuses[byteType] || '0x00';
    const binaryValue = hexToBinary(hexValue);

    return (
      <div key={byteType} className="bg-dark-card rounded-lg p-4 border border-dark-border mb-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">{config.name}</h3>
          <div className="flex items-center gap-2">
            <span className="text-text-secondary">0x</span>
            <input
              type="text"
              value={hexValue.slice(2)}
              onChange={(e) => handleHexInput(byteType, e.target.value)}
              className="w-16 bg-dark-bg text-accent-green font-mono text-center rounded px-2 py-1 border border-dark-border focus:outline-none focus:border-accent-blue"
              maxLength={2}
            />
            <span className="text-text-secondary font-mono text-sm ml-2">
              {binaryValue}
            </span>
          </div>
        </div>
        
        <div className="space-y-2">
          {config.bits.map((bit) => (
            <div 
              key={bit.name} 
              className={`flex items-center justify-between p-2 rounded transition-colors ${
                bit.name === 'Reserved' ? 'opacity-50' : 'hover:bg-dark-bg'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-accent-blue font-mono text-sm w-20">
                  Bit {bit.bit}
                </span>
                <span className="text-white font-medium w-24">
                  {bit.name}
                </span>
                <span className="text-text-secondary text-sm">
                  {bit.description}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-mono ${
                  getBitValue(byteType, bit.bit) ? 'text-accent-green' : 'text-text-secondary'
                }`}>
                  {getBitValue(byteType, bit.bit) ? '1' : '0'}
                </span>
                <button
                  onClick={() => toggleBit(byteType, bit.bit)}
                  disabled={bit.name === 'Reserved'}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    getBitValue(byteType, bit.bit) 
                      ? 'bg-accent-green' 
                      : 'bg-dark-border'
                  } ${bit.name === 'Reserved' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      getBitValue(byteType, bit.bit) ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className={`text-sm w-16 text-right ${
                  getBitValue(byteType, bit.bit) ? 'text-accent-red' : 'text-accent-green'
                }`}>
                  {getBitValue(byteType, bit.bit) ? '❌ 禁用' : '✅ 启用'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-dark-border">
          <div className="flex gap-2">
            {[7, 6, 5, 4, 3, 2, 1, 0].map((bit) => (
              <div key={bit} className="flex-1 text-center">
                <div className="text-xs text-text-secondary mb-1">{bit}</div>
                <div className={`h-8 rounded flex items-center justify-center font-mono text-sm ${
                  binaryValue[7 - bit] === '1' 
                    ? 'bg-accent-green text-white' 
                    : 'bg-dark-bg text-text-secondary'
                }`}>
                  {binaryValue[7 - bit]}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const handleWrite = useCallback(() => {
    if (writeConfirm) {
      onWriteFuses(editableFuses);
      setWriteConfirm(false);
    } else {
      setWriteConfirm(true);
      setTimeout(() => setWriteConfirm(false), 5000);
    }
  }, [editableFuses, onWriteFuses, writeConfirm]);

  const isBusy = status !== 'idle' && status !== 'complete' && status !== 'error';

  return (
    <div className="bg-dark-bg rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white">🔐 熔丝位编辑器</h2>
        <div className="flex gap-3">
          <button
            onClick={onReadFuses}
            disabled={isBusy}
            className="px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            读取熔丝位
          </button>
          <button
            onClick={handleWrite}
            disabled={isBusy}
            className={`px-4 py-2 font-medium rounded-lg transition-colors ${
              writeConfirm
                ? 'bg-accent-red hover:bg-accent-red/80 text-white animate-pulse'
                : 'bg-dark-card hover:bg-dark-card/80 text-accent-red border border-accent-red/50'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {writeConfirm ? '⚠️ 确认写入?' : '写入熔丝位'}
          </button>
        </div>
      </div>

      {!fuseConfig ? (
        <div className="text-center py-12 text-text-secondary">
          请先选择支持熔丝位编辑的芯片型号
        </div>
      ) : (
        <div>
          {fuseConfig.low && renderByteEditor('low', fuseConfig.low)}
          {fuseConfig.high && renderByteEditor('high', fuseConfig.high)}
          {fuseConfig.extended && editableFuses.extended && renderByteEditor('extended', fuseConfig.extended)}
        </div>
      )}

      <div className="mt-6 p-4 bg-accent-yellow/10 border border-accent-yellow/30 rounded-lg">
        <p className="text-accent-yellow text-sm">
          ⚠️ <strong>警告：</strong>错误的熔丝位配置可能导致芯片无法启动（变砖）。
          写入前请务必确认配置正确。特别是 SPIEN 位，如果禁用将无法通过 ISP 再次编程！
        </p>
      </div>
    </div>
  );
};

export default FuseEditor;