import { Package, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { PDUData } from '../types';
import { formatTimestamp, getStatusColor, formatHex } from '../utils/formatters';

interface PduDetailsProps {
  pdus: PDUData[];
}

export function PduDetails({ pdus }: PduDetailsProps) {
  const [selectedPdu, setSelectedPdu] = useState<PDUData | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    ethernet: true,
    fields: true,
    payload: true,
    raw: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const latestPdus = pdus.slice(-20).reverse();

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-200">PDU 详情</h2>
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-400">{pdus.length} 个</span>
        </div>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        <div className="w-52 flex flex-col gap-2 bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-700/50 text-xs text-slate-400 font-medium">
            PDU 列表
          </div>
          <div className="flex-1 overflow-y-auto">
            {latestPdus.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 p-4">
                <Package className="w-6 h-6 mb-2 opacity-50" />
                <span className="text-xs">暂无PDU</span>
              </div>
            ) : (
              latestPdus.map((pdu) => (
                <button
                  key={pdu.id}
                  onClick={() => setSelectedPdu(pdu)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors border-b border-slate-700/30 hover:bg-slate-800/50 ${
                    selectedPdu?.id === pdu.id ? 'bg-slate-800' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-mono ${getStatusColor(pdu.type)}`}>
                      {pdu.type.slice(0, 3).toUpperCase()}
                    </span>
                    <span className={`text-[10px] ${
                      pdu.direction === 'sent' ? 'text-cyan-400' : 'text-purple-400'
                    }`}>
                      {pdu.direction === 'sent' ? '发送' : '接收'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                    {formatTimestamp(pdu.timestamp)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden flex flex-col">
          {selectedPdu ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-700/50">
                <div>
                  <span className={`text-lg font-bold ${getStatusColor(selectedPdu.type)}`}>
                    {selectedPdu.type.toUpperCase()} PDU
                  </span>
                  <div className="text-xs text-slate-500 mt-1">
                    {formatTimestamp(selectedPdu.timestamp)}
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  selectedPdu.direction === 'sent'
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'bg-purple-500/20 text-purple-400'
                }`}>
                  {selectedPdu.direction === 'sent' ? '发送' : '接收'}
                </span>
              </div>

              <div>
                <button
                  onClick={() => toggleSection('ethernet')}
                  className="flex items-center gap-2 w-full text-left py-1 text-sm font-medium text-slate-300 hover:text-slate-200"
                >
                  {expandedSections.ethernet ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  以太网头部
                </button>
                {expandedSections.ethernet && (
                  <div className="ml-6 mt-2 space-y-2 text-xs">
                    <div className="flex justify-between bg-slate-800/50 rounded px-3 py-2">
                      <span className="text-slate-400">目的MAC</span>
                      <span className="font-mono text-slate-200">{selectedPdu.dest_mac}</span>
                    </div>
                    <div className="flex justify-between bg-slate-800/50 rounded px-3 py-2">
                      <span className="text-slate-400">源MAC</span>
                      <span className="font-mono text-slate-200">{selectedPdu.source_mac}</span>
                    </div>
                    <div className="flex justify-between bg-slate-800/50 rounded px-3 py-2">
                      <span className="text-slate-400">类型/长度</span>
                      <span className="font-mono text-slate-200">0x8809 (Slow Protocols)</span>
                    </div>
                    <div className="flex justify-between bg-slate-800/50 rounded px-3 py-2">
                      <span className="text-slate-400">子类型</span>
                      <span className="font-mono text-slate-200">0x03 (OAM)</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <button
                  onClick={() => toggleSection('fields')}
                  className="flex items-center gap-2 w-full text-left py-1 text-sm font-medium text-slate-300 hover:text-slate-200"
                >
                  {expandedSections.fields ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  OAM 字段
                </button>
                {expandedSections.fields && (
                  <div className="ml-6 mt-2 space-y-2 text-xs">
                    <div className="flex justify-between bg-slate-800/50 rounded px-3 py-2">
                      <span className="text-slate-400">Code</span>
                      <span className="font-mono text-slate-200">0x{selectedPdu.fields.code.toString(16).padStart(2, '0')}</span>
                    </div>
                    <div className="flex justify-between bg-slate-800/50 rounded px-3 py-2">
                      <span className="text-slate-400">Flags</span>
                      <span className="font-mono text-slate-200">0x{selectedPdu.fields.flags.toString(16).padStart(4, '0')}</span>
                    </div>
                    <div className="flex justify-between bg-slate-800/50 rounded px-3 py-2">
                      <span className="text-slate-400">Type</span>
                      <span className="font-mono text-slate-200">0x{selectedPdu.fields.type.toString(16).padStart(2, '0')}</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <button
                  onClick={() => toggleSection('payload')}
                  className="flex items-center gap-2 w-full text-left py-1 text-sm font-medium text-slate-300 hover:text-slate-200"
                >
                  {expandedSections.payload ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  Payload
                </button>
                {expandedSections.payload && (
                  <div className="ml-6 mt-2">
                    <pre className="text-xs font-mono text-slate-300 bg-slate-800/50 rounded p-3 overflow-x-auto">
                      {JSON.stringify(selectedPdu.fields.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              <div>
                <button
                  onClick={() => toggleSection('raw')}
                  className="flex items-center gap-2 w-full text-left py-1 text-sm font-medium text-slate-300 hover:text-slate-200"
                >
                  {expandedSections.raw ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  原始数据 (Hex)
                </button>
                {expandedSections.raw && (
                  <div className="ml-6 mt-2">
                    <pre className="text-xs font-mono text-cyan-400 bg-slate-800/50 rounded p-3 overflow-x-auto">
                      {formatHex(selectedPdu.raw_hex)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
              <Package className="w-12 h-12 mb-3 opacity-30" />
              <span className="text-sm">选择一个PDU查看详情</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
