import { useState, useEffect, useCallback } from "react";
import HexInput from "@/components/HexInput";
import ParseResultView from "@/components/ParseResult";
import { useS7CommStore } from "@/store/s7comm";
import { parsePacket, getSamplePackets } from "@/utils/api";
import type { SamplePacket } from "@/types/s7comm";

export default function ParserPage() {
  const [hexInput, setHexInput] = useState("");
  const [includeTpkt, setIncludeTpkt] = useState(true);
  const [samples, setSamples] = useState<SamplePacket[]>([]);
  const { parseResult, parseLoading, setParseResult, setParseLoading, setParseError } = useS7CommStore();

  useEffect(() => {
    getSamplePackets().then((data) => setSamples(data.samples)).catch(() => {});
  }, []);

  const handleParse = useCallback(async () => {
    if (!hexInput.trim()) return;
    setParseLoading(true);
    setParseError(null);
    try {
      const result = await parsePacket(hexInput, includeTpkt);
      setParseResult(result);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Parse failed");
      setParseResult(null);
    } finally {
      setParseLoading(false);
    }
  }, [hexInput, includeTpkt, setParseResult, setParseLoading, setParseError]);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="flex-1 overflow-auto border-r border-gray-800 p-4 lg:p-6">
        <HexInput
          value={hexInput}
          onChange={setHexInput}
          onParse={handleParse}
          loading={parseLoading}
          includeTpkt={includeTpkt}
          onIncludeTpktChange={setIncludeTpkt}
          samples={samples}
        />
      </div>
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-px flex-1 bg-gray-800" />
          <span className="text-xs text-gray-500 uppercase tracking-wider">Parse Result</span>
          <div className="h-px flex-1 bg-gray-800" />
        </div>
        <ParseResultView result={parseResult} />
      </div>
    </div>
  );
}
