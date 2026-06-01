import { useState } from "react";
import { X, AlertTriangle, ShieldAlert, ShieldCheck, Unlock, Lock } from "lucide-react";
import { useZRTPStore } from "@/store/zrtpStore";

const goClearReasons = [
  "User requested",
  "Key refresh needed",
  "Network quality issue",
  "Debugging purpose",
  "Call transfer",
  "Other reason",
];

export default function GoClearModal() {
  const {
    showGoClearModal,
    pendingGoClear,
    result,
    confirmGoClear,
    cancelGoClear,
    setShowGoClearModal,
    requestGoClear,
  } = useZRTPStore();

  const [showReasonSelect, setShowReasonSelect] = useState(false);
  const [selectedSender, setSelectedSender] = useState<"alice" | "bob">("alice");
  const [selectedReason, setSelectedReason] = useState("User requested");

  if (!showGoClearModal && !showReasonSelect) return null;

  const isPending = !!pendingGoClear;
  const showInitiateForm = showGoClearModal && !isPending && !showReasonSelect;

  const handleInitiate = () => {
    setShowReasonSelect(false);
    requestGoClear(selectedSender, selectedReason);
  };

  const handleConfirm = () => {
    if (pendingGoClear) {
      confirmGoClear(pendingGoClear.sender, pendingGoClear.reason);
    }
  };

  if (showInitiateForm || showReasonSelect) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
        <div className="cyber-card p-6 max-w-md w-full mx-4 animate-slide-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Unlock className="w-5 h-5 text-yellow-500" />
              <h3 className="font-display text-lg font-semibold text-white">
                发起 GoClear 请求
              </h3>
            </div>
            <button
              onClick={() => {
                setShowReasonSelect(false);
                setShowGoClearModal(false);
              }}
              className="p-1 text-cyber-muted hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-sm text-cyber-muted mb-4">
            GoClear 请求将使会话从加密模式回退到明文模式。通话内容将不再加密。
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-cyber-muted font-mono uppercase tracking-wider mb-1.5 block">
                发起方
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedSender("alice")}
                  className={`flex-1 px-3 py-2 rounded-lg border font-mono text-sm transition-all ${
                    selectedSender === "alice"
                      ? "bg-cyber-blue/10 border-cyber-blue text-cyber-blue"
                      : "border-cyber-border text-cyber-muted hover:border-cyber-muted"
                  }`}
                >
                  Alice
                </button>
                <button
                  onClick={() => setSelectedSender("bob")}
                  className={`flex-1 px-3 py-2 rounded-lg border font-mono text-sm transition-all ${
                    selectedSender === "bob"
                      ? "bg-cyber-orange/10 border-cyber-orange text-cyber-orange"
                      : "border-cyber-border text-cyber-muted hover:border-cyber-muted"
                  }`}
                >
                  Bob
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-cyber-muted font-mono uppercase tracking-wider mb-1.5 block">
                原因
              </label>
              <select
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value)}
                className="cyber-input w-full"
              >
                {goClearReasons.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setShowReasonSelect(false);
                  setShowGoClearModal(false);
                }}
                className="flex-1 px-4 py-2.5 border border-cyber-border text-cyber-muted rounded-lg hover:border-cyber-muted hover:text-white transition-all font-display text-sm"
              >
                取消
              </button>
              <button
                onClick={handleInitiate}
                className="flex-1 px-4 py-2.5 bg-yellow-500/10 border border-yellow-500/40 text-yellow-500 rounded-lg hover:bg-yellow-500/20 hover:border-yellow-500/60 transition-all font-display text-sm font-semibold"
              >
                发送请求
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="cyber-card p-6 max-w-lg w-full mx-4 animate-slide-in border-yellow-500/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-yellow-500/10 rounded-lg">
            <AlertTriangle className="w-6 h-6 text-yellow-500 animate-pulse" />
          </div>
          <div>
            <h3 className="font-display text-xl font-bold text-yellow-500">
              ⚠️ GoClear 安全警告
            </h3>
            <p className="text-xs text-cyber-muted font-mono mt-0.5">
              RFC 6189 Section 5.12 — Clear Mode Request
            </p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div className="p-4 bg-red-500/5 border border-red-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-400 font-semibold mb-1">
                  即将从加密模式回退到明文模式！
                </p>
                <p className="text-xs text-cyber-muted leading-relaxed">
                  这意味着后续的媒体流（语音/视频）将不再使用 SRTP 加密传输，
                  任何中间网络节点都可以直接读取通话内容。
                </p>
              </div>
            </div>
          </div>

          {isPending && pendingGoClear && (
            <div className="p-3 bg-cyber-surface border border-cyber-border rounded-lg">
              <p className="text-xs text-cyber-muted font-mono mb-2">请求详情</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-cyber-muted">发起方：</span>
                  <span className={pendingGoClear.sender === "alice" ? "text-cyber-blue" : "text-cyber-orange"}>
                    {pendingGoClear.sender === "alice" ? "Alice" : "Bob"}
                  </span>
                </div>
                <div>
                  <span className="text-cyber-muted">原因：</span>
                  <span className="text-white">{pendingGoClear.reason}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-cyber-muted">当前状态：</span>
                  <span className="text-cyber-accent">
                    {result?.is_encrypted ? "🔒 加密中" : "🔓 已切换到明文"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="p-3 bg-cyber-accent/5 border border-cyber-accent/30 rounded-lg">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-cyber-accent shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-cyber-accent font-semibold mb-1">
                  GoClear 消息已通过 HMAC-SHA256 认证
                </p>
                <p className="text-xs text-cyber-muted leading-relaxed">
                  消息完整性已验证，确认请求来自合法通信方而非攻击者伪造。
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-cyber-border/50">
          <div className="flex items-center gap-2 text-xs text-cyber-muted">
            {result?.is_encrypted ? (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>当前：加密模式 (SRTP)</span>
              </>
            ) : (
              <>
                <Unlock className="w-3.5 h-3.5" />
                <span>当前：明文模式</span>
              </>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={cancelGoClear}
              className="px-4 py-2 border border-cyber-border text-cyber-muted rounded-lg hover:border-cyber-muted hover:text-white transition-all font-display text-sm"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 bg-red-500/10 border border-red-500/40 text-red-400 rounded-lg hover:bg-red-500/20 hover:border-red-500/60 transition-all font-display text-sm font-semibold flex items-center gap-2"
            >
              <Unlock className="w-4 h-4" />
              确认回退到明文
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { goClearReasons };
