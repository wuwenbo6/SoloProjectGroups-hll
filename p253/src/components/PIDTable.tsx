import { useState, useMemo, useCallback } from "react";
import { ArrowUpDown, ChevronRight, Download, LineChart, Loader2 } from "lucide-react";
import type { PIDInfo, PMTInfo } from "../../shared/types";
import { COLORS, formatBytes } from "./BandwidthChart";
import { extractPIDPayload } from "@/api/pid";
import { useAppStore } from "@/store/useAppStore";

interface PIDTableProps {
  pids: PIDInfo[];
  pmts: PMTInfo[];
  fileId: string;
  fileName: string;
}

type SortKey = "pid" | "type" | "byteCount" | "bandwidthPercent";
type SortDir = "asc" | "desc";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  PAT: { label: "PAT", color: COLORS["PAT"] },
  PMT: { label: "PMT", color: COLORS["PMT"] },
  "PES-Video": { label: "Video", color: COLORS["PES-Video"] },
  "PES-Audio": { label: "Audio", color: COLORS["PES-Audio"] },
  "PES-Data": { label: "Data", color: COLORS["PES-Data"] },
  Null: { label: "Null", color: COLORS["Null"] },
  Other: { label: "Other", color: COLORS["Other"] },
};

export default function PIDTable({ pids, pmts, fileId, fileName }: PIDTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("bandwidthPercent");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedPmt, setExpandedPmt] = useState<number | null>(null);
  const [extractingPid, setExtractingPid] = useState<number | null>(null);

  const { selectedPid, setSelectedPid, setBitrateLoading } = useAppStore();

  const sortedPids = useMemo(() => {
    return [...pids].sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortKey === "type") return mul * a.type.localeCompare(b.type);
      return mul * (a[sortKey] - b[sortKey]);
    });
  }, [pids, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const pmtPids = new Set(pmts.map((p) => p.pmtPID));
  const pesByPmt = useMemo(() => {
    const map = new Map<number, PIDInfo[]>();
    for (const pmt of pmts) {
      const entries: PIDInfo[] = [];
      for (const e of pmt.entries) {
        const info = pids.find((p) => p.pid === e.elementaryPID);
        if (info) entries.push(info);
      }
      map.set(pmt.pmtPID, entries);
    }
    return map;
  }, [pids, pmts]);

  const handleExtractPayload = useCallback(
    async (pid: number, e: React.MouseEvent) => {
      e.stopPropagation();
      setExtractingPid(pid);
      try {
        await extractPIDPayload(fileId, pid, fileName);
      } catch (err) {
        console.error("提取失败:", err);
      } finally {
        setExtractingPid(null);
      }
    },
    [fileId, fileName]
  );

  const handleShowBitrate = useCallback(
    (pid: number, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedPid(selectedPid === pid ? null : pid);
      setBitrateLoading(selectedPid !== pid);
    },
    [selectedPid, setSelectedPid, setBitrateLoading]
  );

  const SortIcon = ({ col }: { col: SortKey }) => (
    <ArrowUpDown
      className={`w-3 h-3 inline ml-1 transition-opacity ${sortKey === col ? "opacity-100 text-[#00d4aa]" : "opacity-30"}`}
    />
  );

  return (
    <div className="bg-[#2a2f42] rounded-2xl border border-[#3a3f55] overflow-hidden">
      <div className="p-4 border-b border-[#3a3f55]">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#00d4aa]" />
          PID 详细列表
          <span className="text-[#8b8fa3] text-xs font-normal ml-auto">{pids.length} 个 PID</span>
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[#8b8fa3] border-b border-[#3a3f55]/60">
              <th className="text-left py-3 px-4 font-medium">
                <button onClick={() => handleSort("pid")} className="hover:text-white transition-colors">
                  PID <SortIcon col="pid" />
                </button>
              </th>
              <th className="text-left py-3 px-4 font-medium">类型</th>
              <th className="text-left py-3 px-4 font-medium">描述</th>
              <th className="text-right py-3 px-4 font-medium">
                <button onClick={() => handleSort("byteCount")} className="hover:text-white transition-colors">
                  字节数 <SortIcon col="byteCount" />
                </button>
              </th>
              <th className="text-right py-3 px-4 font-medium">包数</th>
              <th className="text-right py-3 px-4 font-medium min-w-[140px]">
                <button onClick={() => handleSort("bandwidthPercent")} className="hover:text-white transition-colors">
                  带宽占比 <SortIcon col="bandwidthPercent" />
                </button>
              </th>
              <th className="text-center py-3 px-4 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedPids.map((pid) => {
              const typeInfo = TYPE_LABELS[pid.type] || TYPE_LABELS["Other"];
              const isPmt = pmtPids.has(pid.pid);
              const isExtracting = extractingPid === pid.pid;
              const isSelected = selectedPid === pid.pid;

              return (
                <>
                  <tr
                    key={pid.pid}
                    className={`border-b border-[#3a3f55]/30 hover:bg-[#3a3f55]/20 transition-colors ${isSelected ? "bg-[#00d4aa]/5" : ""}`}
                  >
                    <td className="py-2.5 px-4 font-mono text-[#00d4aa]">0x{pid.pid.toString(16).padStart(4, "0")}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className="inline-block px-2 py-0.5 rounded text-[10px] font-medium"
                        style={{
                          backgroundColor: `${typeInfo.color}20`,
                          color: typeInfo.color,
                        }}
                      >
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-[#c8cad0] max-w-[250px]">
                      <div className="flex items-center gap-1">
                        {isPmt && (
                          <button
                            onClick={() => setExpandedPmt(expandedPmt === pid.pid ? null : pid.pid)}
                            className="p-0.5 hover:bg-[#3a3f55] rounded transition-colors"
                          >
                            <ChevronRight
                              className={`w-3 h-3 text-[#8b8fa3] transition-transform ${expandedPmt === pid.pid ? "rotate-90" : ""}`}
                            />
                          </button>
                        )}
                        <span className="truncate">{pid.description}</span>
                        {pid.type === "PES-Audio" && pid.programNumber !== undefined && (
                          <span className="text-[10px] bg-[#a78bfa]/10 text-[#a78bfa] px-1.5 py-0.5 rounded shrink-0">
                            #{pid.programNumber}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#c8cad0]">{formatBytes(pid.byteCount)}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#8b8fa3]">{pid.packetCount.toLocaleString()}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-[#1a1f2e] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(pid.bandwidthPercent, 100)}%`,
                              backgroundColor: typeInfo.color,
                            }}
                          />
                        </div>
                        <span className="font-mono text-[#c8cad0] w-12 text-right">{pid.bandwidthPercent.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={(e) => handleExtractPayload(pid.pid, e)}
                          disabled={isExtracting}
                          className="p-1.5 rounded-lg hover:bg-[#00d4aa]/10 text-[#00d4aa] hover:text-[#00d4aa] transition-colors disabled:opacity-50"
                          title="提取负载"
                        >
                          {isExtracting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={(e) => handleShowBitrate(pid.pid, e)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isSelected
                              ? "bg-[#00d4aa]/20 text-[#00d4aa]"
                              : "hover:bg-[#4ecdc4]/10 text-[#4ecdc4] hover:text-[#4ecdc4]"
                          }`}
                          title="查看码率曲线"
                        >
                          <LineChart className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isPmt && expandedPmt === pid.pid && pesByPmt.get(pid.pid)?.map((pes) => {
                    const pesType = TYPE_LABELS[pes.type] || TYPE_LABELS["Other"];
                    const isPesSelected = selectedPid === pes.pid;
                    return (
                      <tr
                        key={`sub-${pes.pid}`}
                        className={`bg-[#1a1f2e]/40 border-b border-[#3a3f55]/20 ${isPesSelected ? "bg-[#00d4aa]/5" : ""}`}
                      >
                        <td className="py-2 px-4 pl-10 font-mono text-[#00d4aa]/70">0x{pes.pid.toString(16).padStart(4, "0")}</td>
                        <td className="py-2 px-4">
                          <span
                            className="inline-block px-2 py-0.5 rounded text-[10px] font-medium"
                            style={{
                              backgroundColor: `${pesType.color}15`,
                              color: pesType.color,
                            }}
                          >
                            {pesType.label}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-[#8b8fa3] flex items-center gap-1">
                          <span>{pes.streamTypeDesc || pes.description}</span>
                          {pes.type === "PES-Audio" && pes.programNumber !== undefined && (
                            <span className="text-[10px] bg-[#a78bfa]/10 text-[#a78bfa] px-1.5 py-0.5 rounded">
                              #{pes.programNumber}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-right font-mono text-[#8b8fa3]">{formatBytes(pes.byteCount)}</td>
                        <td className="py-2 px-4 text-right font-mono text-[#8b8fa3]">{pes.packetCount.toLocaleString()}</td>
                        <td className="py-2 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1 bg-[#1a1f2e] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(pes.bandwidthPercent, 100)}%`,
                                  backgroundColor: pesType.color,
                                }}
                              />
                            </div>
                            <span className="font-mono text-[#8b8fa3] w-12 text-right">{pes.bandwidthPercent.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="py-2 px-4">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={(e) => handleExtractPayload(pes.pid, e)}
                              disabled={extractingPid === pes.pid}
                              className="p-1.5 rounded-lg hover:bg-[#00d4aa]/10 text-[#00d4aa] transition-colors disabled:opacity-50"
                              title="提取负载"
                            >
                              {extractingPid === pes.pid ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={(e) => handleShowBitrate(pes.pid, e)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isPesSelected
                                  ? "bg-[#00d4aa]/20 text-[#00d4aa]"
                                  : "hover:bg-[#4ecdc4]/10 text-[#4ecdc4] hover:text-[#4ecdc4]"
                              }`}
                              title="查看码率曲线"
                            >
                              <LineChart className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
