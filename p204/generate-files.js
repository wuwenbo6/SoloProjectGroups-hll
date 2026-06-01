import fs from 'fs';
import path from 'path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const files = [
  {
    path: 'src/hooks/useWebSocket.ts',
    content: `import { useRef, useCallback } from "react";
import { useSCTPStore } from "@/store";
import type { ClientToServerMessage, ServerToClientMessage } from "@/types";

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const {
    setConnectionStatus,
    setClientId,
    initStreams,
    resetStore,
    receiveMessage,
    sendMessage,
  } = useSCTPStore();

  const connect = useCallback((url: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setConnectionStatus("connecting");

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connected");
      initStreams();
    };

    ws.onclose = () => {
      setConnectionStatus("disconnected");
      resetStore();
      wsRef.current = null;
    };

    ws.onerror = () => {
      setConnectionStatus("error");
    };

    ws.onmessage = (event) => {
      try {
        const message: ServerToClientMessage = JSON.parse(event.data);

        if (message.type === "connected" && message.clientId) {
          setClientId(message.clientId);
        } else if (message.type === "message") {
          receiveMessage(message);
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };
  }, [setConnectionStatus, setClientId, initStreams, resetStore, receiveMessage]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const send = useCallback((streamId: number, content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }

    const message = sendMessage(streamId, content);
    const clientMessage: ClientToServerMessage = {
      type: "send",
      streamId,
      content: message.content,
    };

    wsRef.current.send(JSON.stringify(clientMessage));
    return message;
  }, [sendMessage]);

  const batchSend = useCallback((streamId: number, count: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }

    const clientMessage: ClientToServerMessage = {
      type: "batchSend",
      streamId,
      count,
    };

    wsRef.current.send(JSON.stringify(clientMessage));
  }, []);

  return {
    connect,
    disconnect,
    send,
    batchSend,
  };
}
`
  },
  {
    path: 'src/components/ConnectionPanel.tsx',
    content: `import { useState } from "react";
import { useSCTPStore } from "@/store";
import { useWebSocket } from "@/hooks/useWebSocket";

const statusConfig = {
  disconnected: { label: "已断开", color: "text-gray-500", bgColor: "bg-gray-100" },
  connecting: { label: "连接中", color: "text-yellow-600", bgColor: "bg-yellow-100" },
  connected: { label: "已连接", color: "text-green-600", bgColor: "bg-green-100" },
  error: { label: "错误", color: "text-red-600", bgColor: "bg-red-100" },
};

export default function ConnectionPanel() {
  const [url, setUrl] = useState("ws://localhost:8080");
  const { connectionStatus, clientId } = useSCTPStore((state) => ({
    connectionStatus: state.connectionStatus,
    clientId: state.clientId,
  }));
  const { connect, disconnect } = useWebSocket();

  const config = statusConfig[connectionStatus];

  const handleConnect = () => {
    connect(url);
  };

  const handleDisconnect = () => {
    disconnect();
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm">
      <h2 className="text-lg font-semibold mb-4">连接控制</h2>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">服务器地址</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={connectionStatus !== "disconnected"}
              className="w-full px-3 py-2 border rounded-md disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={\`px-3 py-1 rounded-full text-sm font-medium \${config.bgColor} \${config.color}\`}>
            {config.label}
          </div>
          {connectionStatus === "disconnected" ? (
            <button
              onClick={handleConnect}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              连接
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              断开
            </button>
          )}
        </div>

        {clientId && (
          <div className="text-sm text-gray-600">
            客户端 ID: <span className="font-mono">{clientId}</span>
          </div>
        )}
      </div>
    </div>
  );
}
`
  },
  {
    path: 'src/components/StreamStatus.tsx',
    content: `import { useSCTPStore } from "@/store";

export default function StreamStatus() {
  const { streams, getStreamStats } = useSCTPStore((state) => ({
    streams: state.streams,
    getStreamStats: state.getStreamStats,
  }));

  return (
    <div className="p-4 border rounded-lg shadow-sm">
      <h2 className="text-lg font-semibold mb-4">流状态</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from(streams.values()).map((stream) => {
          const stats = getStreamStats(stream.streamId);
          return (
            <div
              key={stream.streamId}
              className="p-4 border rounded-md bg-gray-50"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">{stream.name}</h3>
                <span className="text-sm text-gray-500">
                  流 ID: {stream.streamId}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">已发送:</span>
                  <span className="font-medium">{stats.sent}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">已接收:</span>
                  <span className="font-medium">{stats.received}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">缓冲区:</span>
                  <span className="font-medium">{stats.buffered}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">下一个序号:</span>
                  <span className="font-mono">{stats.nextSequence}</span>
                </div>
                <div className="flex justify-between col-span-2">
                  <span className="text-gray-600">期望序号:</span>
                  <span className="font-mono">{stats.expectedSequence}</span>
                </div>
              </div>
            </div>
          );
        })}

        {streams.size === 0 && (
          <div className="col-span-2 text-center text-gray-500 py-8">
            暂无流数据，请先连接服务器
          </div>
        )}
      </div>
    </div>
  );
}
`
  },
  {
    path: 'src/components/MessageSender.tsx',
    content: `import { useState } from "react";
import { useSCTPStore } from "@/store";
import { useWebSocket } from "@/hooks/useWebSocket";

export default function MessageSender() {
  const [content, setContent] = useState("");
  const [streamId, setStreamId] = useState(0);
  const [batchCount, setBatchCount] = useState(10);
  const { connectionStatus } = useSCTPStore((state) => ({
    connectionStatus: state.connectionStatus,
  }));
  const { send, batchSend } = useWebSocket();

  const isConnected = connectionStatus === "connected";

  const handleSend = () => {
    if (!content.trim()) return;
    send(streamId, content.trim());
    setContent("");
  };

  const handleBatchSend = () => {
    batchSend(streamId, batchCount);
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm">
      <h2 className="text-lg font-semibold mb-4">消息发送</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">选择流</label>
          <select
            value={streamId}
            onChange={(e) => setStreamId(Number(e.target.value))}
            disabled={!isConnected}
            className="w-full px-3 py-2 border rounded-md disabled:bg-gray-50 disabled:text-gray-500"
          >
            <option value={0}>控制流 (ID: 0)</option>
            <option value={1}>数据流 (ID: 1)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">消息内容</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={!isConnected}
            placeholder="输入要发送的消息..."
            className="w-full px-3 py-2 border rounded-md disabled:bg-gray-50 disabled:text-gray-500 resize-none"
            rows={3}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSend}
            disabled={!isConnected || !content.trim()}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            发送消息
          </button>
        </div>

        <div className="border-t pt-4">
          <label className="block text-sm font-medium mb-2">批量发送</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={batchCount}
              onChange={(e) => setBatchCount(Math.max(1, Number(e.target.value)))}
              disabled={!isConnected}
              min={1}
              max={1000}
              className="w-24 px-3 py-2 border rounded-md disabled:bg-gray-50 disabled:text-gray-500"
            />
            <span className="text-sm text-gray-600">条消息</span>
            <button
              onClick={handleBatchSend}
              disabled={!isConnected}
              className="ml-auto px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              批量发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
`
  }
];

files.forEach(file => {
  const filePath = path.join(__dirname, file.path);
  fs.writeFileSync(filePath, file.content, 'utf-8');
  console.log(`Created: ${file.path}`);
});

console.log('All files created successfully!');
