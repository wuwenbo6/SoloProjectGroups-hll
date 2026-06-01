import { useState, useRef, useEffect, useCallback } from "react";
import {
  Wifi,
  WifiOff,
  Send,
  Download,
  Upload,
  Activity,
  Server,
  ChevronRight,
  Circle,
  Zap,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from "lucide-react";
import { useS7CommStore } from "@/store/s7comm";
import { simulateConnect, simulateRead, simulateWrite, exportSessionCsv, downloadCsv } from "@/utils/api";
import type { ParseResult, TimelineEvent } from "@/types/s7comm";
import ParseResultView from "@/components/ParseResult";

const AREA_OPTIONS = [
  { value: "DB", label: "DB (Data Block)" },
  { value: "PE", label: "PE (Input)" },
  { value: "PA", label: "PA (Output)" },
  { value: "MK", label: "MK (Marker)" },
  { value: "CT", label: "CT (Counter)" },
  { value: "TM", label: "TM (Timer)" },
];

const TYPE_OPTIONS = [
  { value: "BIT", label: "BIT" },
  { value: "BYTE", label: "BYTE" },
  { value: "WORD", label: "WORD" },
  { value: "INT", label: "INT" },
  { value: "DWORD", label: "DWORD" },
  { value: "DINT", label: "DINT" },
  { value: "REAL", label: "REAL" },
];

function TimelineEventView({ event }: { event: TimelineEvent }) {
  const getIcon = () => {
    switch (event.event) {
      case "status":
        return <Loader2 size={14} className="animate-spin text-amber-400" />;
      case "request_built":
        return <Send size={14} className="text-cyan-400" />;
      case "response_received":
        return <Download size={14} className="text-purple-400" />;
      case "complete":
        return event.success !== false ? (
          <CheckCircle2 size={14} className="text-green-400" />
        ) : (
          <XCircle size={14} className="text-red-400" />
        );
      default:
        return <Circle size={14} className="text-gray-500" />;
    }
  };

  const [expanded, setExpanded] = useState(false);
  const hasParsed = event.parsed !== undefined;

  return (
    <div className="relative pl-8 pb-2">
      <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-800" />
      <div className="absolute left-1 top-1.5">
        {getIcon()}
      </div>
      <div className="rounded-lg border border-gray-800 bg-[#161b22] overflow-hidden">
        <button
          onClick={() => hasParsed && setExpanded(!expanded)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-800/50 transition-colors"
        >
          {hasParsed && (
            <ChevronRight
              size={12}
              className={`text-gray-500 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          )}
          <span className="text-xs font-medium text-gray-300">
            {event.event === "status" && event.message}
            {event.event === "request_built" && "Request Packet Built"}
            {event.event === "response_received" && "Response Packet Received"}
            {event.event === "complete" && (event.success !== false ? "Operation Complete" : "Operation Failed")}
          </span>
          {event.data && (
            <span className="ml-auto text-[10px] font-mono text-[#00d4aa]">
              [{event.data.length} bytes]
            </span>
          )}
        </button>
        {expanded && event.parsed && (
          <div className="border-t border-gray-800 p-2 max-h-80 overflow-auto">
            <ParseResultView result={event.parsed} />
          </div>
        )}
        {event.event === "complete" && event.data && (
          <div className="border-t border-gray-800 px-3 py-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Data</span>
            <div className="mt-1 font-mono text-xs text-yellow-400/80 break-all">
              {event.data.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ")}
            </div>
            <div className="mt-1 text-[10px] text-gray-500">
              [{event.data.join(", ")}]
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SimulatorPage() {
  const {
    sessionId,
    sessionConnected,
    timelineEvents,
    setSessionId,
    setSessionConnected,
    addTimelineEvent,
    clearTimeline,
  } = useS7CommStore();

  const [ip, setIp] = useState("192.168.0.1");
  const [rack, setRack] = useState(0);
  const [slot, setSlot] = useState(1);
  const [connecting, setConnecting] = useState(false);

  const [operation, setOperation] = useState<"read" | "write">("read");
  const [area, setArea] = useState("DB");
  const [dbNumber, setDbNumber] = useState(1);
  const [readOffset, setReadOffset] = useState(0);
  const [dataType, setDataType] = useState("BYTE");
  const [count, setCount] = useState(10);
  const [writeData, setWriteData] = useState("00 01 02 03");
  const [operating, setOperating] = useState(false);
  const [activeParsedResult, setActiveParsedResult] = useState<ParseResult | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [timelineEvents]);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    clearTimeline();
    setActiveParsedResult(null);
    try {
      const result = await simulateConnect(ip, rack, slot);
      if (result.success) {
        setSessionId(result.session_id);
        setSessionConnected(true);
        addTimelineEvent({
          event: "status",
          message: `Connected to ${ip} (Rack:${rack} Slot:${slot})`,
          timestamp: Date.now(),
        });
        if (result.connection_request) {
          addTimelineEvent({
            event: "request_built",
            raw: result.connection_request.raw,
            parsed: result.connection_request.parsed,
            timestamp: Date.now(),
          });
        }
        if (result.setup_communication) {
          addTimelineEvent({
            event: "response_received",
            raw: result.setup_communication.raw,
            parsed: result.setup_communication.parsed,
            timestamp: Date.now(),
          });
        }
        addTimelineEvent({
          event: "complete",
          success: true,
          timestamp: Date.now(),
        });
      }
    } catch {
      addTimelineEvent({
        event: "complete",
        success: false,
        timestamp: Date.now(),
      });
    } finally {
      setConnecting(false);
    }
  }, [ip, rack, slot, setSessionId, setSessionConnected, addTimelineEvent, clearTimeline]);

  const handleOperate = useCallback(async () => {
    if (!sessionId) return;
    setOperating(true);
    try {
      if (operation === "read") {
        addTimelineEvent({
          event: "status",
          message: `Building Read ${area}[${dbNumber}].${dataType} @ offset ${readOffset}, count ${count}`,
          timestamp: Date.now(),
        });

        const result = await simulateRead(sessionId, area, dbNumber, readOffset, dataType, count);
        if (result.success) {
          addTimelineEvent({
            event: "request_built",
            raw: result.request.raw,
            parsed: result.request.parsed,
            timestamp: Date.now(),
          });
          addTimelineEvent({
            event: "response_received",
            raw: result.response.raw,
            parsed: result.response.parsed,
            timestamp: Date.now(),
          });
          addTimelineEvent({
            event: "complete",
            data: result.data,
            success: true,
            timestamp: Date.now(),
          });
          setActiveParsedResult(result.response.parsed);
        }
      } else {
        const dataBytes = writeData
          .trim()
          .split(/[\s,]+/)
          .map((s) => parseInt(s, 16))
          .filter((n) => !isNaN(n));

        addTimelineEvent({
          event: "status",
          message: `Building Write ${area}[${dbNumber}].${dataType} @ offset ${readOffset}, ${dataBytes.length} bytes`,
          timestamp: Date.now(),
        });

        const result = await simulateWrite(sessionId, area, dbNumber, readOffset, dataType, dataBytes);
        if (result.success) {
          addTimelineEvent({
            event: "request_built",
            raw: result.request.raw,
            parsed: result.request.parsed,
            timestamp: Date.now(),
          });
          addTimelineEvent({
            event: "response_received",
            raw: result.response.raw,
            parsed: result.response.parsed,
            timestamp: Date.now(),
          });
          addTimelineEvent({
            event: "complete",
            success: true,
            timestamp: Date.now(),
          });
          setActiveParsedResult(result.response.parsed);
        }
      }
    } catch {
      addTimelineEvent({
        event: "complete",
        success: false,
        timestamp: Date.now(),
      });
    } finally {
      setOperating(false);
    }
  }, [sessionId, operation, area, dbNumber, readOffset, dataType, count, writeData, addTimelineEvent]);

  const handleDisconnect = useCallback(() => {
    setSessionConnected(false);
    setSessionId(null);
    clearTimeline();
    setActiveParsedResult(null);
  }, [setSessionConnected, setSessionId, clearTimeline]);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="w-full lg:w-80 shrink-0 overflow-auto border-r border-gray-800 bg-[#0d1117] p-4 space-y-4">
        <div className="rounded-lg border border-gray-800 bg-[#161b22] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Server size={16} style={{ color: "#00d4aa" }} />
            <span className="text-sm font-semibold text-gray-200">Connection</span>
            {sessionConnected && (
              <span className="ml-auto flex items-center gap-1 text-[10px] text-green-400">
                <Circle size={6} fill="currentColor" />
                Connected
              </span>
            )}
          </div>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">IP Address</label>
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                disabled={sessionConnected}
                className="mt-0.5 w-full rounded-md border border-gray-700 bg-[#0d1117] px-3 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-[#00d4aa]/60 disabled:opacity-50"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Rack</label>
                <input
                  type="number"
                  value={rack}
                  onChange={(e) => setRack(Number(e.target.value))}
                  disabled={sessionConnected}
                  className="mt-0.5 w-full rounded-md border border-gray-700 bg-[#0d1117] px-3 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-[#00d4aa]/60 disabled:opacity-50"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Slot</label>
                <input
                  type="number"
                  value={slot}
                  onChange={(e) => setSlot(Number(e.target.value))}
                  disabled={sessionConnected}
                  className="mt-0.5 w-full rounded-md border border-gray-700 bg-[#0d1117] px-3 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-[#00d4aa]/60 disabled:opacity-50"
                />
              </div>
            </div>
          </div>
          {!sessionConnected ? (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#00d4aa", color: "#0d1117" }}
            >
              {connecting ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
              {connecting ? "Connecting..." : "Connect"}
            </button>
          ) : (
            <div className="space-y-2">
              <button
                onClick={handleDisconnect}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-950/60"
              >
                <WifiOff size={14} />
                Disconnect
              </button>
              <button
                onClick={async () => {
                  if (!sessionId) return;
                  try {
                    const csv = await exportSessionCsv(sessionId);
                    downloadCsv(csv, `plc_session_${sessionId.slice(0, 8)}.csv`);
                  } catch (e) {
                    console.error("Export failed:", e);
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-cyan-800/50 bg-cyan-900/30 px-3 py-2 text-xs font-medium text-cyan-400 transition-colors hover:bg-cyan-800/40"
              >
                <Download size={14} />
                Export Session CSV
              </button>
            </div>
          )}
        </div>

        {sessionConnected && (
          <div className="rounded-lg border border-gray-800 bg-[#161b22] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Zap size={16} style={{ color: "#00d4aa" }} />
              <span className="text-sm font-semibold text-gray-200">Operation</span>
            </div>

            <div className="flex rounded-md border border-gray-700 overflow-hidden">
              <button
                onClick={() => setOperation("read")}
                className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  operation === "read"
                    ? "bg-[#00d4aa20] text-[#00d4aa]"
                    : "bg-[#0d1117] text-gray-400 hover:text-gray-200"
                }`}
              >
                <Download size={12} />
                Read
              </button>
              <button
                onClick={() => setOperation("write")}
                className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  operation === "write"
                    ? "bg-[#00d4aa20] text-[#00d4aa]"
                    : "bg-[#0d1117] text-gray-400 hover:text-gray-200"
                }`}
              >
                <Upload size={12} />
                Write
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Area</label>
                <select
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="mt-0.5 w-full rounded-md border border-gray-700 bg-[#0d1117] px-3 py-1.5 text-xs text-gray-200 outline-none focus:border-[#00d4aa]/60"
                >
                  {AREA_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {area === "DB" && (
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">DB Number</label>
                  <input
                    type="number"
                    value={dbNumber}
                    onChange={(e) => setDbNumber(Number(e.target.value))}
                    className="mt-0.5 w-full rounded-md border border-gray-700 bg-[#0d1117] px-3 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-[#00d4aa]/60"
                  />
                </div>
              )}
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Offset</label>
                <input
                  type="number"
                  value={readOffset}
                  onChange={(e) => setReadOffset(Number(e.target.value))}
                  className="mt-0.5 w-full rounded-md border border-gray-700 bg-[#0d1117] px-3 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-[#00d4aa]/60"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Data Type</label>
                <select
                  value={dataType}
                  onChange={(e) => setDataType(e.target.value)}
                  className="mt-0.5 w-full rounded-md border border-gray-700 bg-[#0d1117] px-3 py-1.5 text-xs text-gray-200 outline-none focus:border-[#00d4aa]/60"
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {operation === "read" ? (
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Count</label>
                  <input
                    type="number"
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="mt-0.5 w-full rounded-md border border-gray-700 bg-[#0d1117] px-3 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-[#00d4aa]/60"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Data (hex, space-separated)</label>
                  <input
                    type="text"
                    value={writeData}
                    onChange={(e) => setWriteData(e.target.value)}
                    placeholder="00 01 02 03"
                    className="mt-0.5 w-full rounded-md border border-gray-700 bg-[#0d1117] px-3 py-1.5 text-xs font-mono text-gray-200 outline-none focus:border-[#00d4aa]/60"
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleOperate}
              disabled={operating}
              className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#00d4aa", color: "#0d1117" }}
            >
              {operating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : operation === "read" ? (
                <Download size={14} />
              ) : (
                <Upload size={14} />
              )}
              {operating
                ? `${operation === "read" ? "Reading" : "Writing"}...`
                : `${operation === "read" ? "Read" : "Write"} Data`}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 bg-[#161b22]">
          <Activity size={14} style={{ color: "#00d4aa" }} />
          <span className="text-xs font-medium text-gray-300">Communication Timeline</span>
          {timelineEvents.length > 0 && (
            <button
              onClick={clearTimeline}
              className="ml-auto text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <div ref={timelineRef} className="flex-1 overflow-auto p-4">
          {timelineEvents.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center space-y-2">
                <ArrowRight size={24} className="mx-auto text-gray-700" />
                <p className="text-xs text-gray-600">Connect to a PLC and perform read/write operations</p>
                <p className="text-[10px] text-gray-700">Communication events will appear here</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {timelineEvents.map((event, i) => (
                <TimelineEventView key={i} event={event} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
