import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowLeft, Volume2, VolumeX, RefreshCw, SkipForward, Flag, Loader2 } from 'lucide-react';
import { GoBoard } from '../components/GoBoard';
import { useGameStore } from '../store/gameStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { useSpeech } from '../hooks/useSpeech';

export const Game: React.FC = () => {
  const navigate = useNavigate();
  const {
    gameState,
    analysis,
    winRateHistory,
    isConnected,
    isThinking,
    voiceEnabled,
    toggleVoice,
    boardSize,
    gameMode,
  } = useGameStore();

  const { connect, sendMove, sendPass, restartGame } = useWebSocket();
  const { speakWinRate, speakRecommendedMove, speakCapture, speakMoveNumber, reset } = useSpeech();
  const [showGameOver, setShowGameOver] = useState(false);
  const lastAnalysisMoveRef = useRef<number>(-1);

  useEffect(() => {
    connect();
    return () => {
      reset();
    };
  }, [connect, reset]);

  useEffect(() => {
    if (!voiceEnabled || !analysis || !gameState) return;
    
    const moveCount = gameState.moveHistory?.length || 0;
    if (moveCount === lastAnalysisMoveRef.current) return;
    lastAnalysisMoveRef.current = moveCount;
    
    const captured = (analysis as any).captured?.length || 0;
    
    if (captured > 0) {
      speakCapture(captured);
    } else if (gameState.currentPlayer === 'black' && gameMode === 'ai') {
      if (analysis.topMoves?.length > 0) {
        speakRecommendedMove(analysis.topMoves[0], boardSize);
      }
      speakWinRate(analysis.winRate, 'black');
    }
    
    speakMoveNumber(moveCount);
  }, [analysis, voiceEnabled, gameState, boardSize, gameMode, speakWinRate, speakRecommendedMove, speakCapture, speakMoveNumber]);

  useEffect(() => {
    if (gameState?.gameOver) {
      setShowGameOver(true);
    }
  }, [gameState?.gameOver]);

  const handleMove = (x: number, y: number) => {
    if (!gameState || gameState.gameOver || isThinking) return;
    if (gameMode === 'ai' && gameState.currentPlayer === 'white') return;
    sendMove(x, y);
  };

  const handlePass = () => {
    if (!gameState || gameState.gameOver) return;
    sendPass();
  };

  const handleResign = () => {
    if (!gameState || gameState.gameOver) return;
    setShowGameOver(true);
  };

  const handleRestart = () => {
    setShowGameOver(false);
    restartGame();
  };

  const saveRecord = async () => {
    if (!gameState) return;
    try {
      await fetch('http://localhost:8000/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          black_player: gameMode === 'ai' ? '玩家' : '黑方',
          white_player: gameMode === 'ai' ? 'AI' : '白方',
          board_size: boardSize,
          moves: gameState.moveHistory,
          winner: gameState.currentPlayer === 'black' ? 'white' : 'black',
        }),
      });
    } catch (e) {
      console.error('Failed to save record:', e);
    }
  };

  const lastMove = gameState?.moveHistory?.length
    ? gameState.moveHistory[gameState.moveHistory.length - 1]
    : null;

  const board = gameState?.board || Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));

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
            弈智围棋
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleVoice}
              className={`p-2 rounded-lg transition-colors ${
                voiceEnabled ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
              }`}
              title={voiceEnabled ? '关闭语音' : '开启语音'}
            >
              {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
              isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              {isConnected ? '已连接' : '断开'}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 flex flex-col items-center">
            <div className="mb-6 flex items-center gap-8">
              <div className={`flex items-center gap-3 px-4 py-2 rounded-xl ${
                gameState?.currentPlayer === 'black'
                  ? 'bg-amber-100 ring-2 ring-amber-400'
                  : 'bg-gray-50'
              }`}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-black shadow-lg" />
                <div>
                  <div className="font-semibold text-amber-900">
                    {gameMode === 'ai' ? '玩家' : '黑方'}
                  </div>
                  <div className="text-sm text-amber-600">
                    提子: {gameState?.captures?.black || 0}
                  </div>
                </div>
              </div>
              <div className="text-2xl font-bold text-amber-800">VS</div>
              <div className={`flex items-center gap-3 px-4 py-2 rounded-xl ${
                gameState?.currentPlayer === 'white'
                  ? 'bg-amber-100 ring-2 ring-amber-400'
                  : 'bg-gray-50'
              }`}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-white to-gray-200 shadow-lg border border-gray-300" />
                <div>
                  <div className="font-semibold text-amber-900">
                    {gameMode === 'ai' ? 'AI' : '白方'}
                  </div>
                  <div className="text-sm text-amber-600">
                    提子: {gameState?.captures?.white || 0}
                  </div>
                </div>
                {isThinking && gameMode === 'ai' && (
                  <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
                )}
              </div>
            </div>

            <GoBoard
              board={board}
              boardSize={boardSize}
              onMove={handleMove}
              topMoves={analysis?.topMoves || []}
              lastMove={lastMove && !lastMove.pass ? { x: lastMove.x, y: lastMove.y } : undefined}
              disabled={isThinking || (gameMode === 'ai' && gameState?.currentPlayer === 'white') || !!gameState?.gameOver}
            />

            <div className="mt-6 flex gap-4">
              <button
                onClick={handlePass}
                disabled={gameState?.gameOver}
                className="flex items-center gap-2 px-6 py-3 bg-amber-100 hover:bg-amber-200 disabled:opacity-50 text-amber-800 rounded-xl font-medium transition-colors"
              >
                <SkipForward className="w-5 h-5" />
                虚着 (Pass)
              </button>
              <button
                onClick={handleResign}
                disabled={gameState?.gameOver}
                className="flex items-center gap-2 px-6 py-3 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 rounded-xl font-medium transition-colors"
              >
                <Flag className="w-5 h-5" />
                认输
              </button>
              <button
                onClick={handleRestart}
                className="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
                重新开始
              </button>
            </div>
          </div>

          <div className="lg:w-80 space-y-6">
            {analysis && (
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-amber-200">
                <h3 className="text-lg font-semibold text-amber-900 mb-4">局势分析</h3>
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">黑棋胜率</span>
                    <span className="font-bold text-amber-700">{analysis.winRate.toFixed(1)}%</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-gray-800 to-gray-600 transition-all duration-500"
                      style={{ width: `${analysis.winRate}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>黑</span>
                    <span>白</span>
                  </div>
                </div>

                {winRateHistory.length > 2 && (
                  <div className="h-32 mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={winRateHistory}>
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
                )}

                {analysis.topMoves?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-600 mb-2">AI 推荐点</h4>
                    <div className="space-y-2">
                      {analysis.topMoves.slice(0, 3).map((move, index) => {
                        const letters = 'ABCDEFGHJKLMNOPQRST';
                        const col = letters[move.x];
                        const row = boardSize - move.y;
                        const colors = ['bg-yellow-500', 'bg-gray-400', 'bg-amber-700'];
                        return (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 bg-amber-50 rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 ${colors[index]} rounded-full flex items-center justify-center text-white text-xs font-bold`}>
                                {index + 1}
                              </div>
                              <span className="font-medium text-amber-900">{col}{row}</span>
                            </div>
                            <span className="text-sm text-amber-600">
                              胜率 {move.winRate.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-amber-200">
              <h3 className="text-lg font-semibold text-amber-900 mb-4">
                落子记录 ({gameState?.moveHistory?.length || 0} 手)
              </h3>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {gameState?.moveHistory?.slice().reverse().map((move, index) => {
                  const realIndex = gameState.moveHistory.length - index;
                  const letters = 'ABCDEFGHJKLMNOPQRST';
                  if (move.pass) {
                    return (
                      <div key={index} className="flex items-center gap-2 text-sm py-1 px-2 hover:bg-amber-50 rounded">
                        <span className="w-8 text-gray-500">{realIndex}.</span>
                        <span className={move.color === 'black' ? 'text-gray-800' : 'text-gray-500'}>
                          {move.color === 'black' ? '●' : '○'} 虚着
                        </span>
                      </div>
                    );
                  }
                  const col = letters[move.x];
                  const row = boardSize - move.y;
                  return (
                    <div key={index} className="flex items-center gap-2 text-sm py-1 px-2 hover:bg-amber-50 rounded">
                      <span className="w-8 text-gray-500">{realIndex}.</span>
                      <span className={move.color === 'black' ? 'text-gray-800' : 'text-gray-500'}>
                        {move.color === 'black' ? '●' : '○'} {col}{row}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>

      {showGameOver && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md mx-4 text-center shadow-2xl">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-2xl font-bold text-amber-900 mb-2">对局结束</h2>
            <p className="text-amber-700 mb-6">
              {gameState?.currentPlayer === 'black' ? '白方' : '黑方'} 获胜！
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => {
                  saveRecord();
                  navigate('/records');
                }}
                className="px-6 py-3 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-xl font-medium transition-colors"
              >
                查看棋谱
              </button>
              <button
                onClick={handleRestart}
                className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium transition-colors"
              >
                再来一局
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
