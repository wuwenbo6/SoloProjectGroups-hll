import { useState } from "react";
import type { CertificateInfo } from "@/types/eapol";
import { Award, Download, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  certificates: CertificateInfo[];
  analysisId: string;
}

function CertCard({ cert, index }: { cert: CertificateInfo; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyPem = () => {
    navigator.clipboard.writeText(cert.pem).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const fingerprintShort = cert.fingerprintSha256
    .match(/.{1,2}/g)
    ?.slice(0, 8)
    .join(":") + "…";

  return (
    <div className="border border-slate-700/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
          expanded ? "bg-purple-400/5" : "bg-[#111d2e] hover:bg-slate-800/50"
        )}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-purple-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-mono">#{index + 1}</span>
            {cert.isCA && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-400/15 text-amber-400 border border-amber-400/20">
                CA
              </span>
            )}
            <span className="text-xs text-slate-300 truncate font-mono">
              {cert.subject}
            </span>
          </div>
          {!expanded && (
            <p className="text-[10px] text-slate-600 mt-0.5 truncate">
              Issuer: {cert.issuer}
            </p>
          )}
        </div>
        <span className="text-[10px] text-slate-600 font-mono shrink-0">
          SHA256:{fingerprintShort}
        </span>
      </button>

      {expanded && (
        <div className="px-4 py-3 space-y-3 bg-[#0d1b2a] border-t border-slate-700/40">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <span className="text-slate-500">Subject</span>
              <p className="text-slate-300 font-mono break-all">{cert.subject}</p>
            </div>
            <div>
              <span className="text-slate-500">Issuer</span>
              <p className="text-slate-300 font-mono break-all">{cert.issuer}</p>
            </div>
            <div>
              <span className="text-slate-500">Serial</span>
              <p className="text-cyan-300 font-mono text-[10px] break-all">{cert.serialNumber}</p>
            </div>
            <div>
              <span className="text-slate-500">Signature</span>
              <p className="text-slate-400 font-mono text-[10px]">{cert.signatureAlgorithm}</p>
            </div>
            <div>
              <span className="text-slate-500">Not Before</span>
              <p className="text-slate-400 font-mono text-[10px]">{cert.notBefore || "—"}</p>
            </div>
            <div>
              <span className="text-slate-500">Not After</span>
              <p className="text-slate-400 font-mono text-[10px]">{cert.notAfter || "—"}</p>
            </div>
          </div>

          {cert.san.length > 0 && (
            <div>
              <span className="text-xs text-slate-500">SAN</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {cert.san.map((s, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-400/10 text-indigo-300 border border-indigo-400/20 font-mono">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <span className="text-xs text-slate-500">SHA-256 Fingerprint</span>
            <p className="text-[10px] font-mono text-purple-300/80 mt-0.5 break-all">
              {cert.fingerprintSha256.match(/.{1,2}/g)?.join(":")}
            </p>
          </div>

          {cert.sourceFrame && (
            <p className="text-[10px] text-slate-600">
              Source: Frame #{cert.sourceFrame}
            </p>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-slate-700/30">
            <button
              onClick={handleCopyPem}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            >
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy PEM"}
            </button>
          </div>

          <details className="group">
            <summary className="text-[10px] text-slate-600 cursor-pointer hover:text-slate-400 transition-colors">
              Show PEM data
            </summary>
            <pre className="mt-1 text-[9px] font-mono text-slate-500 bg-slate-900/40 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
              {cert.pem}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

export default function CertificateChain({ certificates, analysisId }: Props) {
  if (certificates.length === 0) return null;

  const handleExportPem = () => {
    window.open(`/api/analyze/${analysisId}/certificates/export?format=pem`, "_blank");
  };

  const handleExportDer = () => {
    window.open(`/api/analyze/${analysisId}/certificates/export?format=der`, "_blank");
  };

  return (
    <div className="px-5 py-4 bg-[#0d1b2a] border-t border-slate-700/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1">
          <Award className="w-3 h-3" />
          证书链 ({certificates.length})
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPem}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono bg-purple-400/10 hover:bg-purple-400/20 text-purple-300 border border-purple-400/20 transition-colors"
          >
            <Download className="w-3 h-3" />
            导出 PEM
          </button>
          <button
            onClick={handleExportDer}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono bg-slate-700/40 hover:bg-slate-700/60 text-slate-400 border border-slate-600/30 transition-colors"
          >
            <Download className="w-3 h-3" />
            导出 DER
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {certificates.map((cert, idx) => (
          <CertCard key={idx} cert={cert} index={idx} />
        ))}
      </div>
    </div>
  );
}
