import { useState } from 'react';
import { Download, FileOutput, ChevronDown } from 'lucide-react';
import { useTLPStore } from '@/store/tlpStore';
import { exportFile, ExportFormat } from '@/utils/wiresharkExport';

const EXPORT_FORMATS: { id: ExportFormat; label: string; desc: string }[] = [
  { id: 'pcap', label: 'PCAP', desc: 'Wireshark pcap格式 (DLT_USER0)' },
  { id: 'pcapng', label: 'PCAPNG', desc: 'Wireshark pcapng格式 (DLT_USER0)' },
  { id: 'hexdump', label: 'Hex Dump', desc: '十六进制文本 (可导入Wireshark)' },
  { id: 'pdml', label: 'PDML', desc: 'Wireshark XML协议数据标记语言' },
];

export function ExportPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const parseResult = useTLPStore((s) => s.parseResult);
  const modifiedTLPs = useTLPStore((s) => s.modifiedTLPs);

  if (!parseResult) return null;

  const fileName = parseResult.fileName || 'capture';

  const handleExport = (format: ExportFormat) => {
    exportFile(parseResult!.tlps, modifiedTLPs, format, fileName);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/30 transition-colors"
      >
        <Download className="w-4 h-4" />
        导出为Wireshark格式
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-40 w-72 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
            <div className="p-2 border-b border-slate-700">
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400">
                <FileOutput className="w-3.5 h-3.5" />
                选择导出格式
              </div>
            </div>
            <div className="p-1">
              {EXPORT_FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={() => handleExport(fmt.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-700/50 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-200 group-hover:text-cyan-400">
                      {fmt.label}
                    </span>
                    <Download className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400" />
                  </div>
                  <span className="text-xs text-slate-500 group-hover:text-slate-400">
                    {fmt.desc}
                  </span>
                </button>
              ))}
            </div>
            <div className="p-3 bg-slate-800/50 border-t border-slate-700">
              <p className="text-[10px] text-slate-500 leading-relaxed">
                提示：PCAP/PCAPNG使用DLT_USER0(147)封装。
                在Wireshark中：Edit → Preferences → Protocols → DLT_USER → 设置DLT 0为"PCI Express"。
                Hex Dump可通过File → Import导入。
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
