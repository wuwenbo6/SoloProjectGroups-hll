import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Trophy, Layers, BarChart3, Download, Eye, AlertTriangle, ThumbsUp, TrendingDown, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface GameRecord {
  id: string;
  date: string;
  blackPlayer: string;
  whitePlayer: string;
  winner: string;
  boardSize: number;
  moves: number;
}

interface ReviewData {
  recordId: string;
  boardSize: number;
  blackPlayer: string;
  whitePlayer: string;
  winner: string;
  reviews: Array<{
    move_number: number;
    x: number;
    y: number;
    color: string;
    quality: string;
    comment: string;
    winRate: number;
    winRateDiff: number;
    suggestion?: { x: number; y: number; winRate: number };
  }>;
  summary: {
    total_moves: number;
    bad_moves: number;
    doubtful_moves: number;
    excellent_moves: number;
    black_avg_win_rate: number;
    white_avg_win_rate: number;
  };
  bad_moves: Array<any>;
  doubtful_moves: Array<any>;
  win_rate_history: Array<{ move: number; winRate: number }>;
}

const LETTERS = 'ABCDEFGHJKLMNOPQRST';

export const Records: React.FC = () => {
  const navigate = useNavigate();
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null);
  const [heatmap, setHeatmap] = useState<number[][] | null>(null);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingReview, setLoadingReview] = useState(false);
  const [activeTab, setActiveTab] = useState<'heatmap' | 'review'>('heatmap');

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/records');
      const data = await response.json();
      setRecords(data.records || []);
    } catch (e) {
      console.error('Failed to fetch records:', e);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchHeatmap = async (recordId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/records/${recordId}/heatmap`);
      const data = await response.json();
      setHeatmap(data.heatmap);
      setSelectedRecord(recordId);
      setReview(null);
    } catch (e) {
      console.error('Failed to fetch heatmap:', e);
    }
  };

  const fetchReview = async (recordId: string) => {
    setLoadingReview(true);
    try {
      const response = await fetch(`http://localhost:8000/api/records/${recordId}/review`);
      const data = await response.json();
      setReview(data);
      setSelectedRecord(recordId);
      setHeatmap(null);
    } catch (e) {
      console.error('Failed to fetch review:', e);
    } finally {
      setLoadingReview(false);
    }
  };

  const downloadSGF = async (recordId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(`http://localhost:8000/api/records/${recordId}/sgf`);
      const data = await response.json();
      const blob = new Blob([data.sgf], { type: 'application/x-go-sgf;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `game_${recordId.slice(0, 8)}.sgf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to download SGF:', e);
    }
  };

  const renderHeatmap = () => {
    if (!heatmap) return null;
    const boardSize = heatmap.length;
    const cellSize = 20;
    const padding = 10;
    const canvasSize = cellSize * (boardSize - 1) + padding * 2;

    return (
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          落子热点图
        </h4>
        <div className="bg-amber-100 rounded-lg p-4 inline-block">
          <svg width={canvasSize} height={canvasSize}>
            {Array.from({ length: boardSize }).map((_, i) => (
              <React.Fragment key={i}>
                <line
                  x1={padding}
                  y1={padding + i * cellSize}
                  x2={padding + (boardSize - 1) * cellSize}
                  y2={padding + i * cellSize}
                  stroke="#8B4513"
                  strokeWidth={0.5}
                />
                <line
                  x1={padding + i * cellSize}
                  y1={padding}
                  x2={padding + i * cellSize}
                  y2={padding + (boardSize - 1) * cellSize}
                  stroke="#8B4513"
                  strokeWidth={0.5}
                />
              </React.Fragment>
            ))}
            {heatmap.map((row, y) =>
              row.map((value, x) => {
                if (value <= 0) return null;
                const intensity = Math.min(value, 1);
                return (
                  <circle
                    key={`${x}-${y}`}
                    cx={padding + x * cellSize}
                    cy={padding + y * cellSize}
                    r={cellSize * 0.35}
                    fill={`rgba(255, 87, 34, ${intensity * 0.7})`}
                  />
                );
              })
            )}
          </svg>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
          <span>低</span>
          <div className="flex-1 h-2 rounded-full bg-gradient-to-r from-orange-200 to-orange-500" />
          <span>高</span>
        </div>
      </div>
    );
  };

  const renderReview = () => {
    if (!review) return null;

    return (
      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-green-50 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-600">{review.summary.excellent_moves}</div>
            <div className="text-xs text-green-700">妙手</div>
          </div>
          <div className="p-3 bg-red-50 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-600">{review.summary.bad_moves}</div>
            <div className="text-xs text-red-700">恶手</div>
          </div>
          <div className="p-3 bg-yellow-50 rounded-lg text-center">
            <div className="text-2xl font-bold text-yellow-600">{review.summary.doubtful_moves}</div>
            <div className="text-xs text-yellow-700">疑问手</div>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-600">{review.summary.total_moves}</div>
            <div className="text-xs text-blue-700">总手数</div>
          </div>
        </div>

        {review.win_rate_history.length > 2 && (
          <div>
            <h4 className="text-sm font-medium text-gray-600 mb-2">胜率变化</h4>
            <div className="h-40 bg-white rounded-lg p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={review.win_rate_history}>
                  <XAxis dataKey="move" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    formatter={(value: number) => [`${value.toFixed(1)}%`, '黑棋胜率']}
                    labelFormatter={(label) => `第 ${label} 手`}
                  />
                  <Line
                    type="monotone"
                    dataKey="winRate"
                    stroke="#D97706"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {review.bad_moves.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              恶手分析
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {review.bad_moves.slice(0, 5).map((move, idx) => {
                const col = LETTERS[move.suggestion?.x || 0] || '';
                const row = review.boardSize - (move.suggestion?.y || 0);
                return (
                  <div key={idx} className="p-3 bg-red-50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-red-800">
                        第 {move.move_number} 手 ({move.color === 'black' ? '黑' : '白'})
                      </span>
                      <span className="text-xs text-red-600">
                        胜率 {move.winRate.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-sm text-red-700">{move.comment}</p>
                    {move.suggestion && (
                      <p className="text-xs text-green-600 mt-1">
                        💡 建议: {col}{row} (胜率 {move.suggestion.winRate.toFixed(1)}%)
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex items-center justify-center">
        <div className="text-amber-700">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-amber-200 sticky top-0 z-20">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-amber-700 hover:text-amber-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            返回大厅
          </button>
          <h1 className="text-xl font-bold text-amber-900" style={{ fontFamily: 'Noto Serif SC, serif' }}>
            棋谱记录
          </h1>
          <div className="w-20" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {records.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Layers className="w-12 h-12 text-amber-600" />
            </div>
            <h2 className="text-xl font-semibold text-amber-900 mb-2">暂无棋谱记录</h2>
            <p className="text-amber-700 mb-6">完成一局对弈后，棋谱将自动保存到这里</p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium transition-colors"
            >
              开始对局
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-amber-900 mb-4">历史对局</h2>
              {records.map((record) => (
                <div
                  key={record.id}
                  className={`bg-white/80 backdrop-blur-sm rounded-xl p-5 border-2 cursor-pointer transition-all ${
                    selectedRecord === record.id
                      ? 'border-amber-400 shadow-lg'
                      : 'border-amber-200 hover:border-amber-300'
                  }`}
                  onClick={() => fetchHeatmap(record.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Calendar className="w-4 h-4" />
                      {new Date(record.date).toLocaleString('zh-CN')}
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 bg-amber-100 rounded text-xs text-amber-700">
                      <Trophy className="w-3 h-3" />
                      {record.winner === 'black' ? '黑胜' : '白胜'}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-gray-700 to-black" />
                        <span className="font-medium text-gray-800">{record.blackPlayer}</span>
                      </div>
                      <span className="text-gray-400">VS</span>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-white to-gray-200 border border-gray-300" />
                        <span className="font-medium text-gray-600">{record.whitePlayer}</span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {record.moves} 手 · {record.boardSize}路
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); fetchHeatmap(record.id); setActiveTab('heatmap'); }}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        selectedRecord === record.id && activeTab === 'heatmap'
                          ? 'bg-amber-500 text-white'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      热点图
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); fetchReview(record.id); setActiveTab('review'); }}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        selectedRecord === record.id && activeTab === 'review'
                          ? 'bg-amber-500 text-white'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      }`}
                      disabled={loadingReview}
                    >
                      {loadingReview && selectedRecord === record.id ? (
                        <span className="animate-spin">⏳</span>
                      ) : (
                        <TrendingUp className="w-3.5 h-3.5" />
                      )}
                      AI复盘
                    </button>
                    <button
                      onClick={(e) => downloadSGF(record.id, e)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg text-xs font-medium transition-colors ml-auto"
                    >
                      <Download className="w-3.5 h-3.5" />
                      SGF
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-amber-900 mb-4">棋谱分析</h2>
              {selectedRecord ? (
                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-5 border border-amber-200">
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setActiveTab('heatmap')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === 'heatmap'
                          ? 'bg-amber-500 text-white'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      }`}
                    >
                      热点图
                    </button>
                    <button
                      onClick={() => setActiveTab('review')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === 'review'
                          ? 'bg-amber-500 text-white'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      }`}
                    >
                      AI复盘
                    </button>
                  </div>
                  {activeTab === 'heatmap' && renderHeatmap()}
                  {activeTab === 'review' && renderReview()}
                </div>
              ) : (
                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-8 border border-amber-200 text-center">
                  <BarChart3 className="w-16 h-16 text-amber-300 mx-auto mb-3" />
                  <p className="text-amber-600">点击左侧棋谱进行分析</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
