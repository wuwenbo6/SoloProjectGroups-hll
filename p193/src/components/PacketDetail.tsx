import { X, Clock, Layers, MapPin, Hash, Info, Download, LineChart } from 'lucide-react';
import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getPacketTypeColor, formatFileSize, hexToAscii } from '../utils/formatters';
import { PacketTypeName, PacketType } from '../../shared/types';
import type { DeinterleavedChannel, PcmDeinterleaveResult, ParseResultWithOptions } from '../../shared/types';
import { PcmChart } from './PcmChart';
import { downloadCsv, generateFileName } from '../utils/csvExport';

export function PacketDetail() {
  const { selectedPacket, parseResult, setSelectedPacket } = useAppStore();
  const [showChart, setShowChart] = useState(false);

  if (!selectedPacket || !parseResult) {
    return null;
  }

  const detail = parseResult.packetDetails[selectedPacket.index];
  const resultWithOptions = parseResult as ParseResultWithOptions;
  const deinterResult = resultWithOptions.deinterleaveResults?.[selectedPacket.index] as PcmDeinterleaveResult | undefined;

  const isPcmPacket = selectedPacket.type === PacketType.PCM;
  const hasDeinterleavedData = isPcmPacket && deinterResult && deinterResult.channels.length > 0;

  const handleExportCsv = () => {
    if (!deinterResult) return;
    
    const channels: { channelIndex: number; channelName: string; samples: number[] }[] = deinterResult.channels.map(ch => ({
      channelIndex: ch.channelIndex,
      channelName: ch.channelName || `Channel ${ch.channelIndex + 1}`,
      samples: ch.samples
    }));

    const fileName = generateFileName(channels, `packet_${selectedPacket.index}`);
    downloadCsv(channels, fileName, {
      includeTimestamp: true,
      startTimeNs: selectedPacket.timestampNs
    });
  };

  const handleClose = () => {
    setSelectedPacket(null);
    setShowChart(false);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-slate-900 border-l border-slate-700 z-50 flex flex-col animate-slide-in">
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getPacketTypeColor(selectedPacket.type)}`}>
            <Info className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-slate-200 font-semibold">
              Packet #{selectedPacket.index.toString().padStart(4, '0')}
            </h3>
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border mt-1 ${getPacketTypeColor(selectedPacket.type)}`}>
              {selectedPacket.typeName}
            </span>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
            <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
              <Hash className="w-3 h-3" />
              <span>Index</span>
            </div>
            <p className="font-mono text-slate-200">{selectedPacket.index}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
            <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
              <Clock className="w-3 h-3" />
              <span>Timestamp</span>
            </div>
            <p className="font-mono text-slate-200 text-sm">{selectedPacket.timestamp}s</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
            <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
              <Layers className="w-3 h-3" />
              <span>Packet Size</span>
            </div>
            <p className="font-mono text-slate-200">{formatFileSize(selectedPacket.packetLength)}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
            <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
              <MapPin className="w-3 h-3" />
              <span>File Offset</span>
            </div>
            <p className="font-mono text-slate-200">0x{selectedPacket.offset.toString(16).toUpperCase()}</p>
          </div>
        </div>

        {hasDeinterleavedData && (
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-700 bg-slate-800 flex items-center justify-between">
              <h4 className="text-sm font-medium text-slate-300">PCM Channel Data</h4>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowChart(!showChart)}
                  className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors ${
                    showChart
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  <LineChart className="w-3 h-3" />
                  {showChart ? 'Hide Chart' : 'Show Chart'}
                </button>
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-1 px-3 py-1 rounded text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Export CSV
                </button>
              </div>
            </div>
            
            {showChart && (
              <div className="p-4 border-t border-slate-700">
                <PcmChart
                  channels={deinterResult.channels.map(ch => ({
                    channelIndex: ch.channelIndex,
                    channelName: ch.channelName || `Channel ${ch.channelIndex + 1}`,
                    samples: ch.samples
                  }))}
                  maxSamples={256}
                />
              </div>
            )}

            {!showChart && (
              <div className="divide-y divide-slate-700">
                {deinterResult.channels.map((ch: DeinterleavedChannel) => (
                  <div key={ch.channelIndex} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-slate-200">
                        {ch.channelName || `Channel ${ch.channelIndex + 1}`}
                      </span>
                      <span className="text-xs text-slate-500">
                        {ch.sampleCount} samples
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">Min</span>
                        <p className="font-mono text-slate-300">{ch.minSample}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Max</span>
                        <p className="font-mono text-slate-300">{ch.maxSample}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Avg</span>
                        <p className="font-mono text-slate-300">{ch.avgSample.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {deinterResult.errors.length > 0 && (
              <div className="px-4 py-2 bg-amber-900/20 border-t border-amber-700/50">
                <p className="text-xs text-amber-400">
                  Warnings: {deinterResult.errors.join('; ')}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-700 bg-slate-800">
            <h4 className="text-sm font-medium text-slate-300">Packet Fields</h4>
          </div>
          <div className="divide-y divide-slate-700">
            {detail && detail.fields ? (
              Object.entries(detail.fields).map(([key, value]) => (
                <div key={key} className="px-4 py-2 flex justify-between items-start">
                  <span className="text-slate-500 text-sm flex-shrink-0 pr-4">{key}</span>
                  <span className="text-slate-300 text-sm font-mono text-right break-all">
                    {String(value)}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-4 py-3">
                <p className="text-sm text-slate-500 mb-2">Preview:</p>
                <p className="text-slate-300 text-sm font-mono">{selectedPacket.preview}</p>
              </div>
            )}
          </div>
        </div>

        {detail && detail.rawDataHex && (
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-700 bg-slate-800">
              <h4 className="text-sm font-medium text-slate-300">Raw Data (First 256 bytes)</h4>
            </div>
            <div className="p-4">
              <div className="font-mono text-xs leading-relaxed">
                {Array.from({ length: Math.ceil(detail.rawDataHex.length / 32) }).map((_, row) => {
                  const start = row * 32;
                  const end = start + 32;
                  const hexRow = detail.rawDataHex.slice(start, end);
                  const asciiRow = hexToAscii(hexRow, 16);
                  
                  const hexWithSpaces = hexRow.match(/.{2}/g)?.join(' ') || '';
                  
                  return (
                    <div key={row} className="flex gap-4">
                      <span className="text-slate-600 w-16 flex-shrink-0">
                        {row.toString(16).padStart(4, '0')}
                      </span>
                      <span className="text-slate-400 flex-1">{hexWithSpaces.padEnd(48, ' ')}</span>
                      <span className="text-slate-500">{asciiRow}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {detail && detail.header && (
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-700 bg-slate-800">
              <h4 className="text-sm font-medium text-slate-300">Header Information</h4>
            </div>
            <div className="p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Sync Word</span>
                <span className="font-mono text-slate-300">0x{detail.header.sync.toString(16).toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Packet Type</span>
                <span className="font-mono text-slate-300">
                  0x{detail.header.packetType.toString(16).padStart(2, '0').toUpperCase()} ({PacketTypeName[detail.header.packetType] || 'Unknown'})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Data Length</span>
                <span className="font-mono text-slate-300">{detail.header.dataLength} bytes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Secondary Header</span>
                <span className={`font-mono ${detail.header.secondaryHeaderPresent ? 'text-green-400' : 'text-slate-500'}`}>
                  {detail.header.secondaryHeaderPresent ? 'Present' : 'Not Present'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Checksum</span>
                <span className={`font-mono ${detail.header.hasChecksum ? 'text-green-400' : 'text-slate-500'}`}>
                  {detail.header.hasChecksum ? 'Present' : 'Not Present'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
