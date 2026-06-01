import { useState } from "react";
import { useSCTPStore } from "@/store";
import { motion, AnimatePresence } from "framer-motion";
import type { QueuedMessage } from "@/types";

const statusConfig = {
  pending: { label: "等待", color: "bg-gray-400", textColor: "text-gray-600" },
  sent: { label: "已发送", color: "bg-blue-500", textColor: "text-blue-600" },
  acked: { label: "已确认", color: "bg-green-500", textColor: "text-green-600" },
  lost: { label: "丢失", color: "bg-red-500", textColor: "text-red-600" },
};

export function SendQueueVisualizer() {
  const [activeStream, setActiveStream] = useState<number>(0);
  const { getSendQueue, getStreamStats, streams } = useSCTPStore();

  const sendQueue0 = getSendQueue(0);
  const sendQueue1 = getSendQueue(1);
  const activeQueue = activeStream === 0 ? sendQueue0 : sendQueue1;
  const stats0 = getStreamStats(0);
  const stats1 = getStreamStats(1);
  const activeStats = activeStream === 0 ? stats0 : stats1;
  const streamState = streams.get(activeStream);

  const recentMessages = activeQueue.slice(-20).reverse();

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white">
      <h2 className="text-lg font-semibold mb-4">发送队列 (Next TSN)</h2>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveStream(0)}
          className={`px-4 py-2 rounded-md transition-colors flex-1 ${
            activeStream === 0
              ? "bg-purple-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          控制流 (Stream 0)
          <span className="ml-2 text-xs opacity-75">
            TSN: {streamState?.sendState.nextTSN ?? 0}
          </span>
        </button>
        <button
          onClick={() => setActiveStream(1)}
          className={`px-4 py-2 rounded-md transition-colors flex-1 ${
            activeStream === 1
              ? "bg-orange-500 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          数据流 (Stream 1)
          <span className="ml-2 text-xs opacity-75">
            TSN: {streamState?.sendState.nextTSN ?? 0}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="p-2 bg-blue-50 rounded text-center">
          <div className="text-lg font-bold text-blue-600">{activeStats.inFlight}</div>
          <div className="text-xs text-gray-500">传输中</div>
        </div>
        <div className="p-2 bg-green-50 rounded text-center">
          <div className="text-lg font-bold text-green-600">{activeStats.acked}</div>
          <div className="text-xs text-gray-500">已确认</div>
        </div>
        <div className="p-2 bg-yellow-50 rounded text-center">
          <div className="text-lg font-bold text-yellow-600">
            {activeStats.sent - activeStats.acked - activeStats.inFlight}
          </div>
          <div className="text-xs text-gray-500">等待中</div>
        </div>
        <div className="p-2 bg-purple-50 rounded text-center">
          <div className="text-lg font-bold text-purple-600">#{activeStats.lastAcked}</div>
          <div className="text-xs text-gray-500">最后确认</div>
        </div>
      </div>

      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 mb-2">TSN 窗口</h3>
        <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="absolute h-full bg-green-400 transition-all duration-300"
            style={{
              left: 0,
              width: `${((activeStats.lastAcked + 1) / Math.max(activeStats.sent, 1)) * 100}%`,
            }}
          />
          <div
            className="absolute h-full bg-blue-400 transition-all duration-300"
            style={{
              left: `${((activeStats.lastAcked + 1) / Math.max(activeStats.sent, 1)) * 100}%`,
              width: `${(activeStats.inFlight / Math.max(activeStats.sent, 1)) * 100}%`,
            }}
          />
          <div
            className="absolute h-full bg-gray-300 transition-all duration-300"
            style={{
              left: `${((activeStats.lastAcked + 1 + activeStats.inFlight) / Math.max(activeStats.sent, 1)) * 100}%`,
              width: `${((activeStats.sent - activeStats.lastAcked - 1 - activeStats.inFlight) / Math.max(activeStats.sent, 1)) * 100}%`,
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>已确认 #{activeStats.lastAcked}</span>
          <span>下一个 TSN #{activeStats.nextSequence}</span>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          最近消息 (最近 {recentMessages.length} 条)
        </h3>
        <div className="max-h-48 overflow-y-auto border rounded-md bg-gray-50">
          <AnimatePresence>
            {recentMessages.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-gray-400 text-sm">
                暂无发送消息
              </div>
            ) : (
              recentMessages.map((queued: QueuedMessage, index: number) => (
                <motion.div
                  key={`${queued.message.streamId}-${queued.message.sequence}-${index}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="p-2 border-b last:border-b-0 flex items-center gap-3 hover:bg-gray-100 transition-colors"
                >
                  <div
                    className={`w-3 h-3 rounded-full ${statusConfig[queued.status].color}`}
                    title={statusConfig[queued.status].label}
                  />
                  <span className="font-mono text-sm font-bold min-w-16">
                    #{queued.message.sequence}
                  </span>
                  <span className="flex-1 text-sm text-gray-600 truncate">
                    {queued.message.content}
                  </span>
                  {queued.retransmitCount > 0 && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
                      重传 x{queued.retransmitCount}
                    </span>
                  )}
                  <span className={`text-xs ${statusConfig[queued.status].textColor}`}>
                    {statusConfig[queued.status].label}
                  </span>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-4 flex gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-gray-400" />
          <span>等待</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span>已发送</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>已确认</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span>丢失</span>
        </div>
      </div>
    </div>
  );
}
