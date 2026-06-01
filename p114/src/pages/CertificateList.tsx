import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Key, Copy, Check, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { api } from '../lib/api';

export function CertificateList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCert, setExpandedCert] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: vtpms = [] } = useQuery({
    queryKey: ['vtpms'],
    queryFn: api.getVTPMs,
  });

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const allCertificates = vtpms.flatMap((vtpm) => [
    vtpm.ekCert && {
      id: `ek-${vtpm.id}`,
      vtpmId: vtpm.id,
      vtpmName: vtpm.name,
      type: 'EK' as const,
      pem: vtpm.ekCert,
    },
    vtpm.akCert && {
      id: `ak-${vtpm.id}`,
      vtpmId: vtpm.id,
      vtpmName: vtpm.name,
      type: 'AK' as const,
      pem: vtpm.akCert,
    },
  ]).filter(Boolean);

  const filteredCerts = allCertificates.filter(
    (cert) =>
      cert?.vtpmName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert?.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">证书管理</h1>
        <p className="text-dark-400 mt-1">查看和管理所有vTPM证书</p>
      </div>

      <div className="bg-dark-800 rounded-xl border border-dark-700">
        <div className="p-4 border-b border-dark-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
            <input
              type="text"
              placeholder="搜索证书..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:border-primary-500"
            />
          </div>
        </div>

        <div className="divide-y divide-dark-700">
          {filteredCerts.map((cert, index) => cert && (
            <div
              key={cert.id}
              className="hover:bg-dark-700/30 transition-colors"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <button
                onClick={() => setExpandedCert(expandedCert === cert.id ? null : cert.id)}
                className="w-full flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary-600/20 rounded-lg flex items-center justify-center">
                    <Key className="w-5 h-5 text-primary-400" />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{cert.type} 证书</span>
                      <span className="px-2 py-0.5 bg-dark-600 rounded text-xs text-dark-300">
                        {cert.vtpmName}
                      </span>
                    </div>
                    <p className="text-dark-400 text-sm">{cert.vtpmId.slice(0, 16)}...</p>
                  </div>
                </div>
                {expandedCert === cert.id ? (
                  <ChevronUp className="w-5 h-5 text-dark-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-dark-400" />
                )}
              </button>
              {expandedCert === cert.id && (
                <div className="px-4 pb-4">
                  <div className="bg-dark-900 rounded-lg p-4 relative">
                    <button
                      onClick={() => copyToClipboard(cert.pem, cert.id)}
                      className="absolute top-2 right-2 p-2 text-dark-400 hover:text-white bg-dark-800 rounded"
                    >
                      {copiedId === cert.id ? (
                        <Check className="w-4 h-4 text-success-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <pre className="text-xs font-mono text-dark-300 overflow-x-auto max-h-64 overflow-y-auto">
                      {cert.pem}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ))}
          {filteredCerts.length === 0 && (
            <div className="text-center py-12 text-dark-500">
              暂无证书，请先创建vTPM
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
