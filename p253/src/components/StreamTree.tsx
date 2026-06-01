import type { PATInfo, PMTInfo } from "../../shared/types";
import { ChevronRight } from "lucide-react";

interface StreamTreeProps {
  pat: PATInfo;
  pmts: PMTInfo[];
}

export default function StreamTree({ pat, pmts }: StreamTreeProps) {
  return (
    <div className="bg-[#2a2f42] rounded-2xl border border-[#3a3f55] p-6">
      <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#ff6b6b]" />
        码流结构树
      </h3>

      <div className="font-mono text-xs space-y-1">
        <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-[#ff6b6b]/10 border border-[#ff6b6b]/20">
          <ChevronRight className="w-3 h-3 text-[#ff6b6b]" />
          <span className="text-[#ff6b6b]">PAT</span>
          <span className="text-[#8b8fa3] ml-1">TS ID: {pat.transportStreamId}</span>
        </div>

        {pat.pmtEntries.map((pmtEntry) => {
          const pmt = pmts.find((p) => p.pmtPID === pmtEntry.pmtPID);
          return (
            <div key={pmtEntry.pmtPID} className="ml-6">
              <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-[#ffe66d]/10 border border-[#ffe66d]/20">
                <ChevronRight className="w-3 h-3 text-[#ffe66d]" />
                <span className="text-[#ffe66d]">PMT</span>
                <span className="text-[#8b8fa3] ml-1">
                  Program {pmtEntry.programNumber} (PID 0x{pmtEntry.pmtPID.toString(16).padStart(4, "0")})
                </span>
              </div>

              {pmt?.entries.map((entry) => {
                const isVideo = [0x01, 0x02, 0x10, 0x1b, 0x20, 0x21, 0x24, 0x25, 0x80].includes(entry.streamType);
                const isAudio = [0x03, 0x04, 0x0f, 0x11, 0x1c, 0x1d, 0x81, 0x87].includes(entry.streamType);
                const color = isVideo ? "#4ecdc4" : isAudio ? "#a78bfa" : "#f59e0b";
                const tag = isVideo ? "Video" : isAudio ? "Audio" : "Data";

                return (
                  <div key={entry.elementaryPID} className="ml-6">
                    <div className="flex items-center gap-2 py-1 px-3 rounded-lg hover:bg-[#3a3f55]/30 transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                      <span style={{ color }}>{tag}</span>
                      <span className="text-[#c8cad0]">{entry.streamTypeDesc}</span>
                      {isAudio && (
                        <span className="text-[#8b8fa3] text-[10px] bg-[#a78bfa]/10 px-1.5 py-0.5 rounded">
                          Prog #{entry.programNumber}
                        </span>
                      )}
                      <span className="text-[#8b8fa3] ml-auto">
                        PID 0x{entry.elementaryPID.toString(16).padStart(4, "0")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
