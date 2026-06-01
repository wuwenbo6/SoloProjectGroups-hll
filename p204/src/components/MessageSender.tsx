import { useState } from "react";
import { useSCTPStore } from "@/store";
import { useWebSocket } from "@/hooks/useWebSocket";

const lifetimePresets = [
  { label: "无限制", value: undefined },
  { label: "500ms", value: 500 },
  { label: "1秒", value: 1000 },
  { label: "2秒", value: 2000 },
  { label: "5秒", value: 5000 },
];

export function MessageSender() {
  const [streamId, setStreamId] = useState<number>(1);
  const [content, setContent] = useState("");
  const [batchCount, setBatchCount] = useState<number>(10);
  const [lifetime, setLifetime] = useState<number | undefined>(undefined);
  const [isUnreliable, setIsUnreliable] = useState<boolean>(false);
  const { connectionStatus } = useSCTPStore((state) => ({
    connectionStatus: state.connectionStatus,
  }));
  const { send, batchSend } = useWebSocket();

  const handleSend = () => {
    if (!content.trim()) return;
    try {
      send(streamId, content, lifetime, isUnreliable);
      setContent("");
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleBatchSend = () => {
    try {
      batchSend(streamId, batchCount, lifetime, isUnreliable);
    } catch (error) {
      console.error("Failed to send batch messages:", error);
    }
  };

  const isDisabled = connectionStatus !== "connected";

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white">
      <h2 className="text-lg font-semibold mb-4">消息发送</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            选择流
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setStreamId(0)}
              disabled={isDisabled}
              className={`flex-1 py-2 px-4 rounded-md transition-colors ${
                streamId === 0
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Stream 0 (控制流)
            </button>
            <button
              onClick={() => setStreamId(1)}
              disabled={isDisabled}
              className={`flex-1 py-2 px-4 rounded-md transition-colors ${
                streamId === 1
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Stream 1 (数据流)
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            PR-SCTP 生存期 (Lifetime)
          </label>
          <div className="flex flex-wrap gap-2">
            {lifetimePresets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => setLifetime(preset.value)}
                disabled={isDisabled}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  lifetime === preset.value
                    ? "bg-cyan-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            设置消息最大生存期，超时后将被丢弃不再重传
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isUnreliable"
            checked={isUnreliable}
            onChange={(e) => setIsUnreliable(e.target.checked)}
            disabled={isDisabled}
            className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500"
          />
          <label htmlFor="isUnreliable" className="text-sm text-gray-700">
            不可靠传输 (跳过丢包检测，不重传)
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            单条消息发送
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSend()}
              disabled={isDisabled}
              placeholder="输入消息内容..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
            <button
              onClick={handleSend}
              disabled={isDisabled || !content.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              发送
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            批量消息发送
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="range"
              min="5"
              max="50"
              value={batchCount}
              onChange={(e) => setBatchCount(Number(e.target.value))}
              disabled={isDisabled}
              className="flex-1"
            />
            <span className="w-12 text-center font-mono font-bold">
              {batchCount}
            </span>
            <button
              onClick={handleBatchSend}
              disabled={isDisabled}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              批量发送
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            批量发送 {batchCount} 条测试消息（后端会打乱顺序转发）
          </p>
        </div>

        <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-md">
          <h3 className="text-sm font-medium text-cyan-800 mb-1">
            📡 PR-SCTP 部分可靠传输
          </h3>
          <ul className="text-xs text-cyan-700 space-y-1">
            <li>• <strong>生存期 (Lifetime)</strong>: 消息在指定时间内未确认则过期</li>
            <li>• <strong>不可靠传输</strong>: 消息只发送一次，不进行重传</li>
            <li>• 适用于实时性要求高、可容忍丢包的场景</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
