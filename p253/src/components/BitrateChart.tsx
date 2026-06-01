import { useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import { Download, X, FileJson, FileSpreadsheet, Loader2, Activity } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { getBitrateHistory, exportBitrateHistory } from "@/api/pid";
import type { PIDInfo, BitratePoint } from "../../shared/types";

const CHART_COLOR = "#00d4aa";

function formatBitrate(bps: number): string {
  if (bps >= 1000000) return `${(bps / 1000000).toFixed(2)} Mbps`;
  if (bps >= 1000) return `${(bps / 1000).toFixed(2)} Kbps`;
  return `${bps.toFixed(0)} bps`;
}

function formatTime(ms: number): string {
  if (ms >= 60000) {
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(1);
    return `${mins}m ${secs}s`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

interface BitrateChartProps {
  fileId: string;
  fileName: string;
  pids: PIDInfo[];
}

export default function BitrateChart({ fileId, fileName, pids }: BitrateChartProps) {
  const { selectedPid, bitrateHistory, bitrateLoading, setBitrateHistory, setBitrateLoading, setSelectedPid } =
    useAppStore();

  const selectedPidInfo = pids.find((p) => p.pid === selectedPid);

  const fetchBitrateHistory = useCallback(async () => {
    if (selectedPid === null || !fileId) return;

    setBitrateLoading(true);
    try {
      const history = await getBitrateHistory(fileId, selectedPid);
      setBitrateHistory(history);
    } catch (err) {
      console.error("获取码率历史失败:", err);
      setBitrateHistory(null);
    }
  }, [selectedPid, fileId, setBitrateHistory, setBitrateLoading]);

  useEffect(() => {
    if (selectedPid !== null && bitrateLoading) {
      fetchBitrateHistory();
    }
  }, [selectedPid, bitrateLoading, fetchBitrateHistory]);

  const handleExportCSV = useCallback(() => {
    if (selectedPid === null) return;
    exportBitrateHistory(fileId, selectedPid, fileName, "csv");
  }, [fileId, selectedPid, fileName]);

  const handleExportJSON = useCallback(() => {
    if (selectedPid === null) return;
    exportBitrateHistory(fileId, selectedPid, fileName, "json");
  }, [fileId, selectedPid, fileName]);

  const handleClose = useCallback(() => {
    setSelectedPid(null);
    setBitrateHistory(null);
  }, [setSelectedPid, setBitrateHistory]);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: BitratePoint }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#2a2f42] border border-[#3a3f55] rounded-lg p-3 shadow-xl">
          <p className="text-[#c8cad0] text-xs mb-1">时间: {formatTime(data.time)}</p>
          <p className="text-[#00d4aa] text-xs font-mono">码率: {formatBitrate(data.bitrate)}</p>
          <p className="text-[#8b8fa3] text-xs">包数: {data.packetCount}</p>
          <p className="text-[#8b8fa3] text-xs">字节: {data.byteCount.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  if (selectedPid === null) {
    return (
      <div className="bg-[#2a2f42] rounded-2xl border border-[#3a3f55] h-[300px] flex items-center justify-center">
        <div className="text-center text-[#8b8fa3]">
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">点击 PID 列表中的图标查看码率曲线</p>
        </div>
      </div>
    );
  }

  const chartData = bitrateHistory?.points.map((p) => ({
    ...p,
    timeLabel: formatTime(p.time),
  }));

  return (
    <div className="bg-[#2a2f42] rounded-2xl border border-[#3a3f55] overflow-hidden">
      <div className="p-4 border-b border-[#3a3f55] flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#4ecdc4]" />
            PID 码率历史曲线
            {selectedPidInfo && (
              <span className="text-[#00d4aa] font-mono">
                0x{selectedPid.toString(16).padStart(4, "0")} - {selectedPidInfo.description}
              </span>
            )}
          </h3>
          {bitrateHistory && (
            <div className="flex items-center gap-4 mt-2 text-xs">
              <div>
                <span className="text-[#8b8fa3]">平均码率: </span>
                <span className="text-white font-mono">{formatBitrate(bitrateHistory.averageBitrate)}</span>
              </div>
              <div>
                <span className="text-[#8b8fa3]">最大码率: </span>
                <span className="text-[#00d4aa] font-mono">{formatBitrate(bitrateHistory.maxBitrate)}</span>
              </div>
              <div>
                <span className="text-[#8b8fa3]">最小码率: </span>
                <span className="text-[#f59e0b] font-mono">{formatBitrate(bitrateHistory.minBitrate)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {bitrateHistory && (
            <>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3a3f55] hover:bg-[#4a4f65] text-xs text-[#c8cad0] transition-colors"
                title="导出 CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                CSV
              </button>
              <button
                onClick={handleExportJSON}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3a3f55] hover:bg-[#4a4f65] text-xs text-[#c8cad0] transition-colors"
                title="导出 JSON"
              >
                <FileJson className="w-3.5 h-3.5" />
                JSON
              </button>
            </>
          )}
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-[#3a3f55] text-[#8b8fa3] hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 h-[300px]">
        {bitrateLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#00d4aa]" />
          </div>
        ) : bitrateHistory && chartData && chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorBitrate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLOR} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#3a3f55" />
              <XAxis
                dataKey="timeLabel"
                stroke="#8b8fa3"
                tick={{ fontSize: 10, fill: "#8b8fa3" }}
                axisLine={{ stroke: "#3a3f55" }}
                tickLine={{ stroke: "#3a3f55" }}
                tickFormatter={(val: string) => val}
              />
              <YAxis
                stroke="#8b8fa3"
                tick={{ fontSize: 10, fill: "#8b8fa3" }}
                axisLine={{ stroke: "#3a3f55" }}
                tickLine={{ stroke: "#3a3f55" }}
                tickFormatter={(val: number) => {
                  if (val >= 1000000) return `${(val / 1000000).toFixed(0)}M`;
                  if (val >= 1000) return `${(val / 1000).toFixed(0)}K`;
                  return val.toString();
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="bitrate"
                stroke={CHART_COLOR}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorBitrate)"
                name="码率"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-[#8b8fa3] text-sm">
            {bitrateHistory?.points.length === 0 ? "该 PID 没有足够的码率数据点" : "暂无数据"}
          </div>
        )}
      </div>
    </div>
  );
}
