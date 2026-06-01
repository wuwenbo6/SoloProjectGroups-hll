import { ConnectionPanel } from "@/components/ConnectionPanel";
import { StreamStatus } from "@/components/StreamStatus";
import { MessageSender } from "@/components/MessageSender";
import { MessageReceiver } from "@/components/MessageReceiver";
import { TransmissionVisualizer } from "@/components/TransmissionVisualizer";
import { SendQueueVisualizer } from "@/components/SendQueueVisualizer";
import { SACKStatus } from "@/components/SACKStatus";
import { NetworkConfig } from "@/components/NetworkConfig";
import { useSCTPStore } from "@/store";

export default function Home() {
  const { connectionStatus } = useSCTPStore((state) => ({
    connectionStatus: state.connectionStatus,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">
                SCTP 多流特性模拟器
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Multi-Streaming + SACK + PR-SCTP + Network Simulation Demo
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                connectionStatus === "connected"
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : connectionStatus === "connecting"
                  ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                  : connectionStatus === "error"
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "bg-slate-600/20 text-slate-400 border border-slate-500/30"
              }`}>
                <span className="inline-block w-2 h-2 rounded-full mr-2 animate-pulse" style={{
                  backgroundColor: connectionStatus === "connected"
                    ? "#4ade80"
                    : connectionStatus === "connecting"
                    ? "#facc15"
                    : connectionStatus === "error"
                    ? "#f87171"
                    : "#64748b"
                }}></span>
                {connectionStatus === "connected"
                  ? "已连接"
                  : connectionStatus === "connecting"
                  ? "连接中"
                  : connectionStatus === "error"
                  ? "连接错误"
                  : "未连接"}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="space-y-6">
            <ConnectionPanel />
            <StreamStatus />
            <SendQueueVisualizer />
          </div>

          <div className="space-y-6">
            <NetworkConfig />
            <MessageSender />
            <SACKStatus />
          </div>

          <div className="lg:col-span-2 space-y-6">
            <TransmissionVisualizer />
            <MessageReceiver />
          </div>
        </div>

        <div className="mt-8 p-6 bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700">
          <h2 className="text-lg font-semibold text-white mb-4">
            📖 SCTP 高级特性说明
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-sm text-slate-300">
            <div>
              <h3 className="font-medium text-cyan-400 mb-2">多流 (Multi-Streaming)</h3>
              <p className="leading-relaxed">
                一个连接中同时传输多个独立数据流。每个流有独立的 TSN 空间，
                流之间互不阻塞。
              </p>
            </div>
            <div>
              <h3 className="font-medium text-green-400 mb-2">SACK 选择性确认</h3>
              <p className="leading-relaxed">
                Cumulative TSN + Gap Ack 块。精确标记已收到和丢失的消息，
                只重传真正丢失的数据包。
              </p>
            </div>
            <div>
              <h3 className="font-medium text-orange-400 mb-2">PR-SCTP 部分可靠</h3>
              <p className="leading-relaxed">
                消息设置生存期 (Lifetime)，超时后不再重传。
                适用于实时性要求高的场景。
              </p>
            </div>
            <div>
              <h3 className="font-medium text-red-400 mb-2">网络模拟</h3>
              <p className="leading-relaxed">
                支持丢包率、延迟范围、乱序概率配置。
                可快速切换理想/良好/普通/较差/恶劣网络环境。
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-300">
            <div className="p-4 bg-slate-700/30 rounded-lg">
              <h3 className="font-medium text-purple-400 mb-2">Stream 0 - 控制流</h3>
              <p className="leading-relaxed">
                用于传输控制信令，与业务数据分离。
                即使数据流拥塞，控制消息也能及时交付。
              </p>
            </div>
            <div className="p-4 bg-slate-700/30 rounded-lg">
              <h3 className="font-medium text-orange-400 mb-2">Stream 1 - 数据流</h3>
              <p className="leading-relaxed">
                用于传输业务数据。支持 PR-SCTP 生存期配置，
                可根据场景选择可靠或部分可靠传输。
              </p>
            </div>
          </div>

          <div className="mt-6 p-4 bg-cyan-900/30 rounded-lg border border-cyan-700/50">
            <h3 className="font-medium text-cyan-400 mb-2">💡 使用建议</h3>
            <ul className="text-xs text-cyan-200 space-y-1">
              <li>1. 点击"连接"建立 WebSocket 连接</li>
              <li>2. 在"网络配置"中选择预设或自定义参数</li>
              <li>3. 在"消息发送"中选择流、生存期、是否不可靠传输</li>
              <li>4. 发送单条或批量消息，观察乱序到达和按序交付</li>
              <li>5. 查看 SACK 状态面板，理解 Gap Ack 机制</li>
              <li>6. 调高丢包率+设置短生存期，观察 PR-SCTP 过期效果</li>
            </ul>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-700 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-slate-500 text-sm">
          SCTP Simulator | Multi-Streaming + SACK + PR-SCTP + Network Emulation
        </div>
      </footer>
    </div>
  );
}
