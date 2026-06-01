import { useState } from "react";
import {
  Download,
  FileVideo,
  FileAudio,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useValidationStore } from "@/store/validationStore";

export default function HlsPanel() {
  const { hlsResult, hlsLoading, result } = useValidationStore();
  const [expandedPlaylist, setExpandedPlaylist] = useState<string | null>(null);

  if (!result) return null;

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "application/vnd.apple.mpegurl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    if (!hlsResult) return;
    Object.entries(hlsResult.playlists).forEach(([name, content]) => {
      setTimeout(() => handleDownload(content, name), Object.keys(hlsResult.playlists).indexOf(name) * 200);
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center rounded-lg bg-[#1ed760]/10 p-1.5">
            <FileVideo className="h-4 w-4 text-[#1ed760]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">HLS Conversion</h3>
            <p className="text-xs text-muted-foreground">Convert MPD to HLS M3U8</p>
          </div>
        </div>
        {hlsResult && (
          <button
            onClick={handleDownloadAll}
            className="flex items-center gap-1.5 rounded-lg bg-[#1ed760]/10 px-3 py-1.5 text-xs font-semibold text-[#1ed760] transition-all hover:bg-[#1ed760]/20"
          >
            <Download className="h-3.5 w-3.5" />
            Download All
          </button>
        )}
      </div>

      <div className="p-5">
        {!hlsResult && !hlsLoading && (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-xs text-muted-foreground text-center">
              Convert your validated MPD to HLS format for Apple-compatible streaming
            </p>
          </div>
        )}

        {hlsLoading && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 text-[#1ed760] animate-spin" />
            <p className="text-xs text-muted-foreground">Converting to HLS...</p>
          </div>
        )}

        {hlsResult && !hlsLoading && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {hlsResult.video_variants.length > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs">
                  <FileVideo className="h-3.5 w-3.5 text-accent" />
                  <span className="text-foreground font-medium">
                    {hlsResult.video_variants.length} video
                  </span>
                </div>
              )}
              {Object.keys(hlsResult.audio_groups).length > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg bg-[#1ed760]/10 px-2.5 py-1.5 text-xs">
                  <FileAudio className="h-3.5 w-3.5 text-[#1ed760]" />
                  <span className="text-foreground font-medium">
                    {Object.values(hlsResult.audio_groups).flat().length} audio
                  </span>
                </div>
              )}
            </div>

            {hlsResult.video_variants.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_1fr_1fr_60px] gap-2 px-3 py-2 bg-border/30 text-xs font-semibold text-muted-foreground">
                  <span>Resolution</span>
                  <span>Bandwidth</span>
                  <span>Codecs</span>
                  <span></span>
                </div>
                {hlsResult.video_variants.map((v) => (
                  <div
                    key={v.playlist}
                    className="grid grid-cols-[1fr_1fr_1fr_60px] gap-2 px-3 py-2 border-t border-border text-xs text-foreground"
                  >
                    <span className="font-mono">{v.resolution || "-"}</span>
                    <span className="font-mono">{(v.bandwidth / 1000).toFixed(0)} kbps</span>
                    <span className="font-mono truncate">{v.codecs}</span>
                    <button
                      onClick={() => handleDownload(hlsResult.playlists[v.playlist], v.playlist)}
                      className="flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:text-accent hover:bg-accent/10"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-1">
              {Object.entries(hlsResult.playlists).map(([name, content]) => (
                <div key={name} className="rounded-lg border border-border overflow-hidden">
                  <button
                    onClick={() => setExpandedPlaylist(expandedPlaylist === name ? null : name)}
                    className="flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-border/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-foreground">{name}</span>
                      <span className="text-muted-foreground">({(content.length / 1024).toFixed(1)} KB)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(content, name);
                        }}
                        className="rounded p-1 text-muted-foreground transition-colors hover:text-accent hover:bg-accent/10"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      {expandedPlaylist === name ? (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                  {expandedPlaylist === name && (
                    <div className="border-t border-border bg-background/50 px-3 py-2 max-h-60 overflow-auto">
                      <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                        {content}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
