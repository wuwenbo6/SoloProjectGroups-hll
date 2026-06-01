import React, { useState } from 'react';
import { Download, Copy, X, FileText, Terminal, CheckCircle } from 'lucide-react';
import type { ACE } from '../../shared/types';

interface ACLExportProps {
  aces: ACE[];
  path: string;
  onClose: () => void;
}

type ExportFormat = 'getfacl' | 'setfacl' | 'ace_list';

const FORMAT_LABELS: Record<ExportFormat, { title: string; description: string; icon: React.ReactNode }> = {
  getfacl: {
    title: 'nfs4_getfacl 输出格式',
    description: '与 nfs4_getfacl 命令输出一致的文本格式',
    icon: <FileText className="h-4 w-4" />,
  },
  setfacl: {
    title: 'setfacl 命令格式',
    description: '可直接用于 setfacl -m 命令的参数',
    icon: <Terminal className="h-4 w-4" />,
  },
  ace_list: {
    title: 'ACE 明细列表',
    description: '带表头和注释的详细 ACE 条目列表',
    icon: <FileText className="h-4 w-4" />,
  },
};

function formatGetfacl(aces: ACE[], path: string): string {
  const lines: string[] = [
    `# file: ${path}`,
    `# NFSv4 ACL - ${aces.length} entries`,
    '',
  ];
  for (const ace of aces) {
    const typeLabel = ace.type === 'A' ? 'A' : 'D';
    lines.push(`${typeLabel}:${ace.flags}:${ace.principal}:${ace.permissions.join('')}`);
  }
  return lines.join('\n');
}

function formatSetfacl(aces: ACE[], path: string): string {
  const spec = aces
    .map((ace) => `${ace.type}:${ace.flags}:${ace.principal}:${ace.permissions.join('')}`)
    .join(',');
  return `nfs4_setfacl -m ${spec} ${path}`;
}

function formatACEList(aces: ACE[], path: string): string {
  const lines: string[] = [
    `Path: ${path}`,
    `Total ACE: ${aces.length}`,
    '='.repeat(80),
    '',
  ];
  aces.forEach((ace, i) => {
    const typeLabel = ace.type === 'A' ? 'Allow' : 'Deny';
    const flagsLabel = ace.flags || '(none)';
    const dataPerms = ace.permissions.filter((p) => 'rwxadDtTnNcCoy'.includes(p) && 'rwxadD'.includes(p));
    const attrPerms = ace.permissions.filter((p) => 'tTnNcCoy'.includes(p));

    lines.push(`  [${i + 1}] ${typeLabel}  |  Flags: ${flagsLabel}  |  Principal: ${ace.principal}`);
    lines.push(`      Data perms: ${dataPerms.join('') || '(none)'}  |  Attr perms: ${attrPerms.join('') || '(none)'}`);
    lines.push(`      Raw: ${ace.type}:${ace.flags}:${ace.principal}:${ace.permissions.join('')}`);
    lines.push('');
  });
  return lines.join('\n');
}

const ACLExport: React.FC<ACLExportProps> = ({ aces, path, onClose }) => {
  const [format, setFormat] = useState<ExportFormat>('getfacl');
  const [copied, setCopied] = useState(false);

  const getOutput = () => {
    switch (format) {
      case 'getfacl':
        return formatGetfacl(aces, path);
      case 'setfacl':
        return formatSetfacl(aces, path);
      case 'ace_list':
        return formatACEList(aces, path);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getOutput());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = getOutput();
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const output = getOutput();
    const ext = format === 'setfacl' ? 'sh' : 'txt';
    const mime = format === 'setfacl' ? 'text/x-shellscript' : 'text/plain';
    const blob = new Blob([output], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `acl_${path.replace(/\//g, '_')}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-xl shadow-lg shadow-emerald-600/20">
              <Download className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">导出 ACL</h2>
              <p className="text-xs text-slate-400">
                {aces.length} ACE · {path}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-300 mb-3">导出格式</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['getfacl', 'setfacl', 'ace_list'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFormat(fmt)}
                  className={`flex items-start gap-2 p-3 rounded-lg border text-left transition-all ${
                    format === fmt
                      ? 'bg-emerald-600/15 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="mt-0.5">{FORMAT_LABELS[fmt].icon}</div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium">{FORMAT_LABELS[fmt].title}</div>
                    <div className="text-[10px] mt-0.5 opacity-70">{FORMAT_LABELS[fmt].description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-300 mb-2">输出内容</h4>
            <div className="relative">
              <pre className="bg-slate-950 border border-slate-700 rounded-xl p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre leading-relaxed">
                {getOutput()}
              </pre>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700 bg-slate-900/80">
          <button
            type="button"
            onClick={handleCopy}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
              copied
                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? '已复制' : '复制'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-lg shadow-emerald-600/20 transition-colors flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            下载文件
          </button>
        </div>
      </div>
    </div>
  );
};

export default ACLExport;
