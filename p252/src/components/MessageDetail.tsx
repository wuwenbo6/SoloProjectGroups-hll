import type { EapMessage } from "@/types/eapol";
import { X, ChevronRight, Puzzle, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  message: EapMessage;
  onClose: () => void;
}

function formatHex(hex: string): string {
  if (!hex) return "";
  return hex.match(/.{1,2}/g)?.join(" ") || "";
}

function truncateHex(hex: string, maxBytes: number = 32): string {
  if (!hex) return "";
  const bytes = hex.match(/.{1,2}/g) || [];
  if (bytes.length <= maxBytes) return bytes.join(" ");
  return bytes.slice(0, maxBytes).join(" ") + ` … (+${bytes.length - maxBytes} bytes)`;
}

function FieldRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-700/40 last:border-0">
      <span className="text-xs text-slate-500 min-w-[100px] shrink-0 pt-0.5">{label}</span>
      <span
        className={cn(
          "text-xs break-all",
          mono ? "font-mono text-cyan-300" : "text-slate-300"
        )}
      >
        {value || "—"}
      </span>
    </div>
  );
}

export default function MessageDetail({ message, onClose }: Props) {
  const eth = message.ethernetHeader;
  const eapol = message.eapolHeader;
  const eap = message.eapHeader;
  const decoded = message.decodedFields;
  const frag = message.fragmentInfo;
  const md5 = message.md5Info;

  return (
    <div className="h-full flex flex-col bg-[#0d1b2a] border-l border-slate-700/50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-[#111d2e]">
        <div className="flex items-center gap-2">
          <ChevronRight className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-200 font-mono">
            Frame #{message.frameNumber}
          </span>
          {frag && (frag.moreFragments || frag.isFragment) && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-orange-400/15 text-orange-400 border border-orange-400/20">
              <Puzzle className="w-3 h-3" />
              Frag
            </span>
          )}
          {md5 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-400/15 text-rose-400 border border-rose-400/20">
              <KeyRound className="w-3 h-3" />
              MD5
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
        <section>
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-cyan-500 mb-2">
            EAP 概要
          </h3>
          <FieldRow label="Code" value={message.eapCode} />
          <FieldRow label="Type" value={message.eapType} />
          <FieldRow label="Direction" value={message.direction} />
          <FieldRow label="Timestamp" value={`${message.timestamp.toFixed(3)}s`} mono />
          {message.identity && <FieldRow label="Identity" value={message.identity} />}
          {message.tlsPhase && <FieldRow label="TLS Phase" value={message.tlsPhase} />}
        </section>

        {frag && (frag.isFragment || frag.moreFragments || frag.reassembledData) && (
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-orange-400 mb-2 flex items-center gap-1">
              <Puzzle className="w-3 h-3" />
              EAP 分片信息
            </h3>
            <FieldRow label="是否为分片" value={frag.isFragment ? "是" : "否（首片）"} />
            <FieldRow label="分片序号" value={`${frag.fragmentSequence}`} mono />
            {frag.totalLength != null && (
              <FieldRow label="总长度" value={`${frag.totalLength} bytes`} mono />
            )}
            {frag.moreFragments && (
              <FieldRow label="More Fragments" value="Yes →" />
            )}
            {frag.totalFragments > 0 && (
              <FieldRow label="总分片数" value={`${frag.totalFragments}`} mono />
            )}
            {frag.reassembledData && (
              <>
                <FieldRow label="重组完成" value="✓ 全部分片已重组" />
                <div className="mt-2">
                  <span className="text-[10px] text-slate-500">重组后数据 (Hex)</span>
                  <pre className="text-[10px] font-mono text-emerald-300/80 bg-emerald-900/20 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-32 mt-1">
                    {truncateHex(frag.reassembledData)}
                  </pre>
                </div>
              </>
            )}
          </section>
        )}

        {md5 && (
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-rose-400 mb-2 flex items-center gap-1">
              <KeyRound className="w-3 h-3" />
              MD5 挑战-响应
            </h3>
            <FieldRow label="角色" value={md5.role === "Challenge" ? "挑战 (Request)" : "响应 (Response)"} />
            <FieldRow label="Value Size" value={`${md5.valueSize} bytes`} mono />
            {md5.challenge && (
              <div className="mt-1">
                <span className="text-[10px] text-slate-500">Challenge (Hex)</span>
                <pre className="text-[10px] font-mono text-rose-300/80 bg-rose-900/20 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all mt-1">
                  {formatHex(md5.challenge)}
                </pre>
              </div>
            )}
            {md5.response && (
              <div className="mt-1">
                <span className="text-[10px] text-slate-500">MD5 Response (Hex)</span>
                <pre className="text-[10px] font-mono text-rose-300/80 bg-rose-900/20 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all mt-1">
                  {formatHex(md5.response)}
                </pre>
              </div>
            )}
            {md5.name && (
              <FieldRow label="Name" value={md5.name} />
            )}
          </section>
        )}

        {eth && (
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-2">
              Ethernet 头部
            </h3>
            <FieldRow label="Src MAC" value={eth.srcMac} mono />
            <FieldRow label="Dst MAC" value={eth.dstMac} mono />
            <FieldRow label="EtherType" value={eth.etherType} mono />
          </section>
        )}

        {eapol && (
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-2">
              EAPOL 头部
            </h3>
            <FieldRow label="Version" value={String(eapol.version)} mono />
            <FieldRow label="Type" value={eapol.type} />
            <FieldRow label="Length" value={String(eapol.length)} mono />
          </section>
        )}

        {eap && (
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-2">
              EAP 头部
            </h3>
            <FieldRow label="Code" value={`${eap.code}`} mono />
            <FieldRow label="Identifier" value={`${eap.identifier}`} mono />
            <FieldRow label="Length" value={`${eap.length}`} mono />
          </section>
        )}

        {decoded && Object.keys(decoded).length > 0 && (
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-purple-400 mb-2">
              解码字段
            </h3>
            {Object.entries(decoded).map(([key, val]) => (
              <FieldRow key={key} label={key} value={val} mono={key !== "event"} />
            ))}
          </section>
        )}

        {message.eapTypeData && (
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-rose-400 mb-2">
              Type Data (Hex)
            </h3>
            <pre className="text-[10px] font-mono text-rose-300/80 bg-slate-900/60 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
              {formatHex(message.eapTypeData)}
            </pre>
          </section>
        )}

        {message.rawData && (
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Raw Data (Hex)
            </h3>
            <pre className="text-[10px] font-mono text-slate-400/60 bg-slate-900/40 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
              {formatHex(message.rawData)}
            </pre>
          </section>
        )}
      </div>
    </div>
  );
}
