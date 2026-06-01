import { useState } from "react";
import { Copy, Check, ChevronDown, ChevronUp, Shield, ShieldAlert } from "lucide-react";
import type { PartyResult } from "@/types/zrtp";

interface Props {
  party: PartyResult;
  colorClass: string;
  borderColor: string;
}

function HexRow({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!value) {
    return (
      <div className="py-1.5">
        <span className="text-[10px] font-mono text-cyber-muted uppercase tracking-wider">
          {label}
        </span>
        <p className="hex-data mt-0.5 text-cyber-muted/40">—</p>
      </div>
    );
  }

  const short = value.length > 32 ? value.slice(0, 32) + "…" : value;

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-cyber-muted uppercase tracking-wider">
          {label}
        </span>
        <div className="flex items-center gap-1">
          {value.length > 32 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-0.5 text-cyber-muted hover:text-white transition-colors"
            >
              {expanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="p-0.5 text-cyber-muted hover:text-white transition-colors"
          >
            {copied ? (
              <Check className="w-3 h-3 text-cyber-accent" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>
      <p className={`hex-data mt-0.5 ${colorClass}`}>
        {expanded ? value.match(/.{1,2}/g)?.join(" ") : short}
      </p>
    </div>
  );
}

export default function PartyPanel({ party, colorClass, borderColor }: Props) {
  const hasData = !!party.zid;

  return (
    <div className={`cyber-card p-5 border-l-2 ${borderColor}`}>
      <div className="flex items-center gap-2 mb-4">
        <span
          className={`w-2.5 h-2.5 rounded-full ${colorClass.replace("text-", "bg-")}`}
        />
        <h3 className="font-display text-sm font-semibold text-white">
          {party.name}
        </h3>

        {hasData && (
          <div className="ml-auto flex items-center gap-2">
            {party.sas_verified ? (
              <div className="flex items-center gap-1 text-cyber-accent">
                <Shield className="w-3.5 h-3.5" />
                <span className="text-[10px] font-mono">已验证</span>
              </div>
            ) : hasData && !party.sas_verified ? (
              <div className="flex items-center gap-1 text-red-400">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span className="text-[10px] font-mono">验证失败</span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {hasData && (
        <div
          className={`text-[10px] font-mono mb-3 px-2 py-1 rounded flex items-center gap-1.5 ${
            party.media_connection_established
              ? "bg-cyber-accent/10 text-cyber-accent"
              : "bg-red-500/10 text-red-400"
          }`}
        >
          {party.media_connection_established ? (
            <>
              <Shield className="w-3 h-3" />
              媒体连接：已建立 (SRTP 加密)
            </>
          ) : (
            <>
              <ShieldAlert className="w-3 h-3" />
              媒体连接：已拒绝
            </>
          )}
        </div>
      )}

      <div className="space-y-0 divide-y divide-cyber-border/50">
        <HexRow label="ZID" value={party.zid} colorClass={colorClass} />
        <HexRow
          label="DH 公钥"
          value={party.dh_public_key}
          colorClass={colorClass}
        />
        <HexRow
          label="DH 共享密钥"
          value={party.dh_shared_secret}
          colorClass={colorClass}
        />
        <HexRow label="s0 (KDF 输出)" value={party.s0} colorClass={colorClass} />
        <HexRow
          label="SRTP 主密钥"
          value={party.srtp_master_key}
          colorClass={colorClass}
        />
        <HexRow
          label="SRTP 主盐"
          value={party.srtp_master_salt}
          colorClass={colorClass}
        />
        {hasData && (
          <div className="py-1.5">
            <span className="text-[10px] font-mono text-cyber-muted uppercase tracking-wider">
              SAS 值
            </span>
            <p
              className={`text-sm font-mono font-bold mt-0.5 ${colorClass} tracking-widest`}
            >
              {party.sas || "—"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
