import { useState } from "react";
import { X, Download, FileJson, Key, Eye, EyeOff } from "lucide-react";
import { useZRTPStore } from "@/store/zrtpStore";

export default function ExportModal() {
  const { showExportModal, result, setShowExportModal, exportLog } =
    useZRTPStore();

  const [includeKeys, setIncludeKeys] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  if (!showExportModal || !result) return null;

  const handleExport = () => {
    exportLog(includeKeys);
    setShowExportModal(false);
  };

  const previewData = {
    session_id: result.session_id,
    algorithm: result.algorithm,
    sas: result.sas,
    sas_match: result.sas_match,
    media_connection_established: result.media_connection_established,
    is_encrypted: result.is_encrypted,
    simulate_mitm: result.simulate_mitm,
    created_at: result.created_at,
    message_count: result.messages.length,
    alice: {
      name: result.alice.name,
      zid: result.alice.zid,
      sas: result.alice.sas,
      sas_verified: result.alice.sas_verified,
      is_encrypted: result.alice.is_encrypted,
      ...(includeKeys
        ? {
            s0: result.alice.s0 ? result.alice.s0.slice(0, 16) + "..." : "",
            srtp_master_key: result.alice.srtp_master_key
              ? result.alice.srtp_master_key.slice(0, 16) + "..."
              : "",
          }
        : {}),
    },
    bob: {
      name: result.bob.name,
      zid: result.bob.zid,
      sas: result.bob.sas,
      sas_verified: result.bob.sas_verified,
      is_encrypted: result.bob.is_encrypted,
      ...(includeKeys
        ? {
            s0: result.bob.s0 ? result.bob.s0.slice(0, 16) + "..." : "",
            srtp_master_key: result.bob.srtp_master_key
              ? result.bob.srtp_master_key.slice(0, 16) + "..."
              : "",
          }
        : {}),
    },
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="cyber-card p-6 max-w-lg w-full mx-4 animate-slide-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-cyber-accent" />
            <h3 className="font-display text-lg font-semibold text-white">
              导出协商日志
            </h3>
          </div>
          <button
            onClick={() => setShowExportModal(false)}
            className="p-1 text-cyber-muted hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-3 bg-cyber-surface border border-cyber-border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <FileJson className="w-4 h-4 text-cyber-muted" />
              <span className="text-sm text-cyber-muted font-mono">
                文件: zrtp-session-{result.session_id.slice(0, 8)}.json
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-cyber-muted">算法：</span>
                <span className="text-white">{result.algorithm}</span>
              </div>
              <div>
                <span className="text-cyber-muted">SAS：</span>
                <span className="text-cyber-accent">{result.sas}</span>
              </div>
              <div>
                <span className="text-cyber-muted">消息数：</span>
                <span className="text-white">{result.messages.length}</span>
              </div>
              <div>
                <span className="text-cyber-muted">加密状态：</span>
                <span className={result.is_encrypted ? "text-cyber-accent" : "text-yellow-500"}>
                  {result.is_encrypted ? "🔒 加密中" : "🔓 明文"}
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={includeKeys}
                onChange={(e) => setIncludeKeys(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-cyber-border bg-cyber-bg text-cyber-accent
                           focus:ring-cyber-accent/30 focus:ring-1 cursor-pointer"
              />
              <div>
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm text-white font-medium">
                    包含敏感密钥材料
                  </span>
                </div>
                <p className="text-xs text-cyber-muted mt-0.5 leading-relaxed">
                  导出 DH 共享密钥、s0、SRTP 主密钥等敏感数据。
                  注意：这些数据可用于解密通话，仅限调试用途，请勿分享！
                </p>
              </div>
            </label>
          </div>

          <div>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-2 text-xs text-cyber-muted hover:text-white transition-colors"
            >
              {showPreview ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
              {showPreview ? "隐藏预览" : "预览导出内容"}
            </button>

            {showPreview && (
              <pre className="mt-2 p-3 bg-cyber-bg border border-cyber-border rounded-lg text-[10px] font-mono text-cyber-muted max-h-48 overflow-auto">
                {JSON.stringify(previewData, null, 2)}
              </pre>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-4 mt-4 border-t border-cyber-border/50">
          <button
            onClick={() => setShowExportModal(false)}
            className="flex-1 px-4 py-2.5 border border-cyber-border text-cyber-muted rounded-lg hover:border-cyber-muted hover:text-white transition-all font-display text-sm"
          >
            取消
          </button>
          <button
            onClick={handleExport}
            className="flex-1 px-4 py-2.5 bg-cyber-accent/10 border border-cyber-accent/40 text-cyber-accent rounded-lg hover:bg-cyber-accent/20 hover:border-cyber-accent/60 transition-all font-display text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            导出 JSON
          </button>
        </div>
      </div>
    </div>
  );
}
