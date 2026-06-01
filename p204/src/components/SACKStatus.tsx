import { useState } from "react";
import { useSCTPStore } from "@/store";
import { motion, AnimatePresence } from "framer-motion";

export function SACKStatus() {
  const [activeStream, setActiveStream] = useState<number>(0);
  const { streams, getStreamStats } = useSCTPStore();

  const stream0 = streams.get(0);
  const stream1 = streams.get(1);
  const activeStreamState = activeStream === 0 ? stream0 : stream1;
  const lastSACK = activeStreamState?.lastSACK;

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

  const renderGapVisualization = () => {
    if (!lastSACK) return null;

    const maxTSN = Math.max(
      lastSACK.cumulativeTSN,
      ...lastSACK.gapAckBlocks.map((b) => b.end)
    );
    if (maxTSN < 0) return null;

    const startTSN = Math.max(0, lastSACK.cumulativeTSN - 10);
    const range = maxTSN - startTSN + 1;

    const blocks = [];
    for (let i = startTSN; i <= maxTSN; i++) {
      const isCumulative = i <= lastSACK.cumulativeTSN;
      const inGap = lastSACK.gapAckBlocks.some(
        (block) => i >= block.start && i <= block.end
      );

      let color = "bg-gray-300";
      if (isCumulative) color = "bg-green-500";
      else if (inGap) color = "bg-green-300";

      blocks.push(
        <motion.div
          key={i}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`w-6 h-6 ${color} rounded text-white text-xs flex items-center justify-center font-mono`}
          title={`TSN #${i}: ${isCumulative ? "Cumulative ACK" : inGap ? "Gap ACK" : "Not received"}`}
        >
          {i}
        </motion.div>
      );
    }

    return blocks;
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white">
      <h2 className="text-lg font-semibold mb-4">SACK 状态 (Gap Ack)</h2>

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
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 bg-green-50 rounded-lg text-center">
          <div className="text-xl font-bold text-green-600 font-mono">
            #{lastSACK?.cumulativeTSN ?? -1}
          </div>
          <div className="text-xs text-gray-500">Cumulative TSN</div>
        </div>
        <div className="p-3 bg-yellow-50 rounded-lg text-center">
          <div className="text-xl font-bold text-yellow-600">
            {lastSACK?.gapAckBlocks.length ?? 0}
          </div>
          <div className="text-xs text-gray-500">Gap Ack 块数</div>
        </div>
        <div className="p-3 bg-blue-50 rounded-lg text-center">
          <div className="text-xl font-bold text-blue-600">
            {activeStream === 0 ? stats0.buffered : stats1.buffered}
          </div>
          <div className="text-xs text-gray-500">缓冲消息</div>
        </div>
      </div>

      {lastSACK && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            TSN 确认可视化
          </h3>
          <div className="flex flex-wrap gap-1 min-h-8">
            <AnimatePresence>{renderGapVisualization()}</AnimatePresence>
          </div>
          <div className="flex gap-4 mt-3 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-green-500 rounded" />
              <span>Cumulative ACK</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-green-300 rounded" />
              <span>Gap ACK (已收到)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-gray-300 rounded" />
              <span>未收到</span>
            </div>
          </div>
        </div>
      )}

      {lastSACK && lastSACK.gapAckBlocks.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Gap Ack 块详情
          </h3>
          <div className="max-h-32 overflow-y-auto border rounded-md bg-gray-50">
            {lastSACK.gapAckBlocks.map((block, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-2 border-b last:border-b-0 flex items-center justify-between"
              >
                <span className="text-sm text-gray-600">Gap #{index + 1}</span>
                <span className="font-mono text-sm font-bold">
                  #{block.start} - #{block.end}
                </span>
                <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">
                  已收到 {block.end - block.start + 1} 条
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {lastSACK && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-sm font-medium text-blue-800 mb-2">
            💡 SACK (Selective Acknowledgement) 说明
          </h3>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>
              • <strong>Cumulative TSN</strong>: 该序列号之前（含）的所有消息都已确认收到
            </li>
            <li>
              • <strong>Gap Ack 块</strong>: 在 Cumulative TSN 之后收到的不连续消息块
            </li>
            <li>
              • 灰色区块表示消息丢失或延迟，触发重传机制
            </li>
          </ul>
          <div className="mt-2 text-xs text-blue-500">
            最后更新: {formatTime(lastSACK.timestamp)}
          </div>
        </div>
      )}

      {!lastSACK && (
        <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-400 text-sm">
          暂无 SACK 数据
          <br />
          <span className="text-xs">连接服务器并发送消息后开始接收 SACK</span>
        </div>
      )}
    </div>
  );
}
