import { useSCTPStore } from "@/store";

export function StreamStatus() {
  const { getStreamStats, streams } = useSCTPStore();

  const stats0 = getStreamStats(0);
  const stats1 = getStreamStats(1);
  const stream0 = streams.get(0);
  const stream1 = streams.get(1);

  const getProgressPercent = (stats: { nextSequence: number; expectedSequence: number }) => {
    if (stats.nextSequence === 0) return 100;
    return (stats.expectedSequence / stats.nextSequence) * 100;
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white">
      <h2 className="text-lg font-semibold mb-4">流状态</h2>

      <div className="space-y-4">
        <div className="p-3 border-2 border-purple-200 rounded-lg bg-purple-50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              <span className="font-medium text-purple-800">Stream 0 - 控制流</span>
            </div>
            <span className="text-xs px-2 py-1 bg-purple-200 text-purple-800 rounded">
              {stream0 ? "活跃" : "未初始化"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-600">发送数:</div>
            <div className="font-mono font-bold text-purple-700">{stats0.sent}</div>
            <div className="text-gray-600">接收数:</div>
            <div className="font-mono font-bold text-purple-700">{stats0.received}</div>
            <div className="text-gray-600">已确认:</div>
            <div className="font-mono font-bold text-green-600">{stats0.acked}</div>
            <div className="text-gray-600">传输中:</div>
            <div className="font-mono font-bold text-blue-600">{stats0.inFlight}</div>
            <div className="text-gray-600">缓冲数:</div>
            <div className="font-mono font-bold text-purple-700">{stats0.buffered}</div>
            <div className="text-gray-600">已过期:</div>
            <div className="font-mono font-bold text-red-600">{stats0.expired}</div>
          </div>

          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>交付进度</span>
              <span>{Math.round(getProgressPercent(stats0))}%</span>
            </div>
            <div className="h-2 bg-purple-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${getProgressPercent(stats0)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="p-3 border-2 border-orange-200 rounded-lg bg-orange-50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
              <span className="font-medium text-orange-800">Stream 1 - 数据流</span>
            </div>
            <span className="text-xs px-2 py-1 bg-orange-200 text-orange-800 rounded">
              {stream1 ? "活跃" : "未初始化"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-600">发送数:</div>
            <div className="font-mono font-bold text-orange-700">{stats1.sent}</div>
            <div className="text-gray-600">接收数:</div>
            <div className="font-mono font-bold text-orange-700">{stats1.received}</div>
            <div className="text-gray-600">已确认:</div>
            <div className="font-mono font-bold text-green-600">{stats1.acked}</div>
            <div className="text-gray-600">传输中:</div>
            <div className="font-mono font-bold text-blue-600">{stats1.inFlight}</div>
            <div className="text-gray-600">缓冲数:</div>
            <div className="font-mono font-bold text-orange-700">{stats1.buffered}</div>
            <div className="text-gray-600">已过期:</div>
            <div className="font-mono font-bold text-red-600">{stats1.expired}</div>
          </div>

          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>交付进度</span>
              <span>{Math.round(getProgressPercent(stats1))}%</span>
            </div>
            <div className="h-2 bg-orange-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-all duration-300"
                style={{ width: `${getProgressPercent(stats1)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-2">📊 统计摘要</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xl font-bold text-blue-600">
                {stats0.sent + stats1.sent}
              </div>
              <div className="text-xs text-gray-500">总发送</div>
            </div>
            <div>
              <div className="text-xl font-bold text-green-600">
                {stats0.received + stats1.received}
              </div>
              <div className="text-xs text-gray-500">总接收</div>
            </div>
            <div>
              <div className="text-xl font-bold text-red-600">
                {stats0.expired + stats1.expired}
              </div>
              <div className="text-xs text-gray-500">总过期</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
