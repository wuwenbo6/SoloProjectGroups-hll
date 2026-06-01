import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSCTPStore } from "@/store";
import type { SCTPMessage } from "@/types";

interface FlyingPacket {
  id: string;
  message: SCTPMessage;
  delay: number;
}

export function TransmissionVisualizer() {
  const { connectionStatus, receivedMessages, streams } = useSCTPStore();
  const [flyingPackets, setFlyingPackets] = useState<FlyingPacket[]>([]);
  const [lastProcessedCount, setLastProcessedCount] = useState(0);

  useEffect(() => {
    const totalReceived = receivedMessages.length;
    const stream0 = streams.get(0);
    const stream1 = streams.get(1);
    const totalBuffered = (stream0?.buffer.size || 0) + (stream1?.buffer.size || 0);
    const totalExpected = totalReceived + totalBuffered;

    if (totalExpected > lastProcessedCount && connectionStatus === "connected") {
      const newMessages = receivedMessages.slice(lastProcessedCount);
      
      newMessages.forEach((msg, index) => {
        const packetId = `packet-${Date.now()}-${index}`;
        const delay = Math.random() * 500 + 200;

        setTimeout(() => {
          setFlyingPackets((prev) => [
            ...prev,
            {
              id: packetId,
              message: msg,
              delay,
            },
          ]);
        }, index * 100);

        setTimeout(() => {
          setFlyingPackets((prev) => prev.filter((p) => p.id !== packetId));
        }, delay + 1000);
      });

      setLastProcessedCount(totalReceived);
    }
  }, [receivedMessages, streams, connectionStatus, lastProcessedCount]);

  const getPacketColor = (streamId: number) => {
    return streamId === 0 ? "bg-purple-500" : "bg-orange-500";
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white">
      <h2 className="text-lg font-semibold mb-4">传输可视化</h2>

      <div className="relative h-48 bg-gradient-to-r from-blue-50 via-gray-100 to-green-50 rounded-lg overflow-hidden">
        <div className="absolute left-4 top-1/2 -translate-y-1/2">
          <div className="w-16 h-16 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg">
            <div className="text-white text-center">
              <div className="text-xs font-bold">发送端</div>
              <div className="text-2xl">📤</div>
            </div>
          </div>
        </div>

        <div className="absolute left-24 right-24 top-1/2 -translate-y-1/2 h-2 bg-gray-300 rounded-full">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-400 via-purple-400 to-green-400 opacity-50 rounded-full animate-pulse" />
        </div>

        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <div className="w-16 h-16 bg-green-600 rounded-lg flex items-center justify-center shadow-lg">
            <div className="text-white text-center">
              <div className="text-xs font-bold">接收端</div>
              <div className="text-2xl">📥</div>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {flyingPackets.map((packet) => (
            <motion.div
              key={packet.id}
              initial={{ left: "80px", top: "50%", y: "-50%" }}
              animate={{
                left: "calc(100% - 100px)",
                top: `${30 + Math.random() * 40}%`,
              }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{
                duration: packet.delay / 1000,
                ease: "easeInOut",
              }}
              className={`absolute w-12 h-12 ${getPacketColor(
                packet.message.streamId
              )} rounded-lg shadow-lg flex items-center justify-center z-10`}
            >
              <div className="text-white text-center">
                <div className="text-xs font-bold">#{packet.message.streamId}</div>
                <div className="text-[10px] font-mono">#{packet.message.sequence}</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-purple-500 rounded" />
            <span className="text-gray-600">Stream 0 (控制流)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-orange-500 rounded" />
            <span className="text-gray-600">Stream 1 (数据流)</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
        <div className="p-3 bg-blue-50 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{receivedMessages.length}</div>
          <div className="text-gray-600">已交付消息</div>
        </div>
        <div className="p-3 bg-yellow-50 rounded-lg">
          <div className="text-2xl font-bold text-yellow-600">
            {(streams.get(0)?.buffer.size || 0) + (streams.get(1)?.buffer.size || 0)}
          </div>
          <div className="text-gray-600">缓冲区消息</div>
        </div>
        <div className="p-3 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{flyingPackets.length}</div>
          <div className="text-gray-600">传输中消息</div>
        </div>
      </div>

      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 mb-2">📚 SCTP 多流特性说明</h3>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• <strong>多流独立</strong>: Stream 0 和 Stream 1 的消息序列号独立维护</li>
          <li>• <strong>乱序传输</strong>: 网络延迟导致消息可能不按发送顺序到达</li>
          <li>• <strong>按序交付</strong>: 每个流独立维护缓冲区，确保消息按序列号顺序交付</li>
          <li>• <strong>流隔离</strong>: 一个流的消息丢失不会阻塞其他流的消息交付</li>
        </ul>
      </div>
    </div>
  );
}
