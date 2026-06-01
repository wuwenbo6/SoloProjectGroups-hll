import { useState } from "react";
import { useSCTPStore } from "@/store";
import { motion, AnimatePresence } from "framer-motion";

export function MessageReceiver() {
  const [activeStream, setActiveStream] = useState<number>(0);
  const { receivedMessages, streams, bufferedMessages, getStreamStats } = useSCTPStore();

  const stream0Messages = receivedMessages.filter((m) => m.streamId === 0);
  const stream1Messages = receivedMessages.filter((m) => m.streamId === 1);
  const activeMessages = activeStream === 0 ? stream0Messages : stream1Messages;

  const stats0 = getStreamStats(0);
  const stats1 = getStreamStats(1);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions);
  };

  const stream0Buffer = streams.get(0)?.buffer;
  const stream1Buffer = streams.get(1)?.buffer;
  const activeBuffer = activeStream === 0 ? stream0Buffer : stream1Buffer;

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white">
      <h2 className="text-lg font-semibold mb-4">消息接收</h2>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveStream(0)}
          className={`px-4 py-2 rounded-md transition-colors ${
            activeStream === 0
              ? "bg-purple-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          控制流 (Stream 0)
          <span className="ml-2 text-xs opacity-75">
            {stats0.received} 已接收 / {stats0.buffered} 缓冲
          </span>
        </button>
        <button
          onClick={() => setActiveStream(1)}
          className={`px-4 py-2 rounded-md transition-colors ${
            activeStream === 1
              ? "bg-orange-500 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          数据流 (Stream 1)
          <span className="ml-2 text-xs opacity-75">
            {stats1.received} 已接收 / {stats1.buffered} 缓冲
          </span>
        </button>
      </div>

      {activeBuffer && activeBuffer.size > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <h3 className="text-sm font-medium text-yellow-800 mb-2">
            ⚠️ 缓冲区中的乱序消息 (等待前面的消息到达)
          </h3>
          <div className="flex flex-wrap gap-2">
            {Array.from(activeBuffer.values()).map((msg) => (
              <span
                key={msg.sequence}
                className="px-2 py-1 bg-yellow-100 text-yellow-800 text-sm rounded font-mono"
              >
                #{msg.sequence}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="h-64 overflow-y-auto border rounded-md bg-gray-50">
        <AnimatePresence>
          {activeMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              暂无消息
            </div>
          ) : (
            activeMessages.map((msg) => (
              <motion.div
                key={`${msg.streamId}-${msg.sequence}-${msg.timestamp}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="p-3 border-b last:border-b-0 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                      msg.streamId === 0
                        ? "bg-purple-100 text-purple-700"
                        : "bg-orange-100 text-orange-700"
                    }`}
                  >
                    #{msg.sequence}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 font-mono text-sm break-all">
                      {msg.content}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
