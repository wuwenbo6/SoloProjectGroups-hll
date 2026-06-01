import { useState } from "react";
import { useSCTPStore } from "@/store";
import { useWebSocket } from "@/hooks/useWebSocket";

const statusConfig = {
  disconnected: { label: "已断开", color: "text-gray-600", bgColor: "bg-gray-100" },
  connecting: { label: "连接中", color: "text-yellow-600", bgColor: "bg-yellow-100" },
  connected: { label: "已连接", color: "text-green-600", bgColor: "bg-green-100" },
  error: { label: "错误", color: "text-red-600", bgColor: "bg-red-100" },
};

export function ConnectionPanel() {
  const [url, setUrl] = useState("ws://localhost:3001");
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
    <div className="p-4 border rounded-lg shadow-sm bg-white">
      <h2 className="text-lg font-semibold mb-4">连接控制</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            WebSocket 服务器地址
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={connectionStatus !== "disconnected"}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${config.bgColor} ${config.color}`}>
            <span className="inline-block w-2 h-2 rounded-full mr-2 animate-pulse" style={{ backgroundColor: connectionStatus === "connected" ? "#22c55e" : connectionStatus === "connecting" ? "#eab308" : connectionStatus === "error" ? "#ef4444" : "#9ca3af" }}></span>
            {config.label}
          </div>
          
          {connectionStatus === "disconnected" ? (
            <button
              onClick={handleConnect}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              连接
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              断开
            </button>
          )}
        </div>

        {clientId && (
          <div className="text-sm text-gray-600">
            客户端 ID: <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{clientId}</span>
          </div>
        )}
      </div>
    </div>
  );
}
