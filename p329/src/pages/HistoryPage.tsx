import { useState, useEffect, useCallback } from "react";
import { Clock, Trash2, Search, FileJson, ChevronRight, Download } from "lucide-react";
import { useS7CommStore } from "@/store/s7comm";
import { getHistory, deleteHistory, clearHistory as clearHistoryApi, exportCsv, downloadCsv } from "@/utils/api";
import type { HistoryRecord, ParseResult } from "@/types/s7comm";
import ParseResultView from "@/components/ParseResult";

export default function HistoryPage() {
  const { history, setHistory, removeHistory, clearHistory } = useS7CommStore();
  const [search, setSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHistory()
      .then((data) => setHistory(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [setHistory]);

  const handleDelete = useCallback(
    async (id: number) => {
      await deleteHistory(id);
      removeHistory(id);
      if (selectedRecord?.id === id) setSelectedRecord(null);
    },
    [removeHistory, selectedRecord]
  );

  const handleClearAll = useCallback(async () => {
    await clearHistoryApi();
    clearHistory();
    setSelectedRecord(null);
  }, [clearHistory]);

  const filtered = history.filter(
    (r) =>
      r.hex_data.toLowerCase().includes(search.toLowerCase()) ||
      r.source.toLowerCase().includes(search.toLowerCase()) ||
      (r.parse_result?.s7comm?.function_code_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const exportJson = useCallback((record: HistoryRecord) => {
    const blob = new Blob([JSON.stringify(record.parse_result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `s7comm-parse-${record.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="w-full lg:w-96 shrink-0 flex flex-col border-r border-gray-800">
        <div className="flex items-center gap-2 border-b border-gray-800 bg-[#161b22] px-4 py-2">
          <Clock size={14} style={{ color: "#00d4aa" }} />
          <span className="text-xs font-medium text-gray-300">Parse History</span>
          {history.length > 0 && (
            <button
              onClick={handleClearAll}
              className="ml-auto flex items-center gap-1 text-[10px] text-red-400/70 hover:text-red-400 transition-colors"
            >
              <Trash2 size={10} />
              Clear All
            </button>
          )}
        </div>
        <div className="border-b border-gray-800 px-4 py-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search hex, source, function..."
              className="w-full rounded-md border border-gray-700 bg-[#0d1117] py-1.5 pl-8 pr-3 text-xs text-gray-200 outline-none focus:border-[#00d4aa]/60 placeholder:text-gray-600"
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-xs text-gray-600">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-xs text-gray-600">No records</div>
          ) : (
            filtered.map((record) => {
              const selected = selectedRecord?.id === record.id;
              return (
                <button
                  key={record.id}
                  onClick={() => setSelectedRecord(record)}
                  className={`flex w-full items-start gap-3 border-b border-gray-800/50 px-4 py-3 text-left transition-colors ${
                    selected ? "bg-[#00d4aa08]" : "hover:bg-gray-800/30"
                  }`}
                >
                  <div className="mt-0.5">
                    <ChevronRight
                      size={12}
                      className={`text-gray-600 transition-transform ${selected ? "rotate-90 text-[#00d4aa]" : ""}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-300">
                        {record.parse_result?.s7comm?.function_code_name || "Unknown"}
                      </span>
                      {record.parse_result?.s7comm?.msg_type_name && (
                        <span className="text-[10px] text-gray-500">
                          {record.parse_result.s7comm.msg_type_name}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-gray-500 truncate">
                      {record.hex_data.substring(0, 50)}
                      {record.hex_data.length > 50 ? "..." : ""}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-600">
                      <span>{formatTime(record.timestamp)}</span>
                      <span className="rounded bg-gray-800 px-1 py-0.5">{record.source}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(record.id);
                    }}
                    className="mt-0.5 text-gray-700 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 lg:p-6">
        {selectedRecord ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-200">
                  Record #{selectedRecord.id}
                </span>
                <span className="text-xs text-gray-500">{formatTime(selectedRecord.timestamp)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (!selectedRecord.parse_result) return;
                    try {
                      const csv = await exportCsv({
                        parse_result: selectedRecord.parse_result as unknown as Record<string, unknown>,
                        record_id: selectedRecord.id,
                        include_headers: true,
                      });
                      downloadCsv(csv, `s7comm_record_${selectedRecord.id}.csv`);
                    } catch (e) {
                      console.error("Export failed:", e);
                    }
                  }}
                  disabled={!selectedRecord.parse_result?.data?.items?.length}
                  className="flex items-center gap-1.5 rounded-md border border-gray-700 px-2.5 py-1 text-[10px] text-gray-400 hover:border-cyan-700 hover:text-cyan-400 transition-colors disabled:opacity-50"
                >
                  <Download size={12} />
                  Export CSV
                </button>
                <button
                  onClick={() => exportJson(selectedRecord)}
                  className="flex items-center gap-1.5 rounded-md border border-gray-700 px-2.5 py-1 text-[10px] text-gray-400 hover:border-gray-600 hover:text-gray-200 transition-colors"
                >
                  <FileJson size={12} />
                  Export JSON
                </button>
              </div>
            </div>
            <div className="rounded-lg border border-gray-800 bg-[#161b22] p-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Raw Hex</div>
              <div className="font-mono text-xs text-yellow-400/70 break-all leading-relaxed">
                {selectedRecord.hex_data}
              </div>
            </div>
            <ParseResultView result={selectedRecord.parse_result} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-2">
              <Clock size={24} className="mx-auto text-gray-700" />
              <p className="text-xs text-gray-600">Select a record to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
