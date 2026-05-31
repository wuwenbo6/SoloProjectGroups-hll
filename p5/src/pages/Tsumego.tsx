import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lightbulb, RefreshCw, CheckCircle, XCircle, ChevronLeft, ChevronRight, Target } from 'lucide-react';
import { tsumegoList, Tsumego as TsumegoType } from '../data/tsumego';
import { StoneColor } from '../store/gameStore';

export const Tsumego: React.FC = () => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [board, setBoard] = useState<StoneColor[][]>([]);
  const [userMoves, setUserMoves] = useState<Array<{ x: number; y: number; color: 'black' | 'white' }>>([]);
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');

  const currentTsumego = tsumegoList[currentIndex] as TsumegoType;
  const boardSize = currentTsumego?.boardSize || 9;
  const canvasSize = 400;
  const padding = 30;
  const cellSize = (canvasSize - padding * 2) / (boardSize - 1);
  const stoneRadius = cellSize * 0.4;

  const filteredList = tsumegoList.filter(
    (t) => filter === 'all' || t.difficulty === filter
  );

  useEffect(() => {
    if (currentTsumego) {
      resetBoard();
    }
  }, [currentIndex]);

  const resetBoard = () => {
    const newBoard: StoneColor[][] = Array(boardSize)
      .fill(null)
      .map(() => Array(boardSize).fill(null));
    
    for (const stone of currentTsumego.initialBoard) {
      newBoard[stone.y][stone.x] = stone.color;
    }
    
    setBoard(newBoard);
    setUserMoves([]);
    setShowHint(false);
    setShowSolution(false);
    setIsCorrect(null);
  };

  const handleMove = (x: number, y: number) => {
    if (board[y][x] !== null || isCorrect !== null) return;

    const currentMoveIndex = userMoves.length;
    const correctMove = currentTsumego.correctMoves[currentMoveIndex];
    
    if (!correctMove) return;

    const newBoard = board.map((row) => [...row]);
    const moveColor: 'black' | 'white' = currentMoveIndex % 2 === 0 ? 'black' : 'white';
    newBoard[y][x] = moveColor;
    setBoard(newBoard);

    const newMoves = [...userMoves, { x, y, color: moveColor }];
    setUserMoves(newMoves);

    if (x === correctMove.x && y === correctMove.y) {
      if (newMoves.length >= currentTsumego.correctMoves.length) {
        setIsCorrect(true);
      } else {
        setTimeout(() => {
          const nextCorrect = currentTsumego.correctMoves[newMoves.length];
          if (nextCorrect) {
            const responseBoard = newBoard.map((row) => [...row]);
            responseBoard[nextCorrect.y][nextCorrect.x] = nextCorrect.color;
            setBoard(responseBoard);
            setUserMoves([...newMoves, { x: nextCorrect.x, y: nextCorrect.y, color: nextCorrect.color }]);
          }
        }, 500);
      }
    } else {
      setIsCorrect(false);
    }
  };

  const goToProblem = (index: number) => {
    const filteredIndex = tsumegoList.findIndex((t) => t.id === filteredList[index]?.id);
    if (filteredIndex !== -1) {
      setCurrentIndex(filteredIndex);
    }
  };

  const drawBoard = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, canvasSize, canvasSize);

    const gradient = ctx.createLinearGradient(0, 0, canvasSize, canvasSize);
    gradient.addColorStop(0, '#D4A76A');
    gradient.addColorStop(0.5, '#E8C48E');
    gradient.addColorStop(1, '#D4A76A');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    ctx.strokeStyle = '#5D4037';
    ctx.lineWidth = 0.8;

    for (let i = 0; i < boardSize; i++) {
      ctx.beginPath();
      ctx.moveTo(padding, padding + i * cellSize);
      ctx.lineTo(padding + (boardSize - 1) * cellSize, padding + i * cellSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(padding + i * cellSize, padding);
      ctx.lineTo(padding + i * cellSize, padding + (boardSize - 1) * cellSize);
      ctx.stroke();
    }

    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const stone = board[y]?.[x];
        if (!stone) continue;

        const posX = padding + x * cellSize;
        const posY = padding + y * cellSize;

        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        const stoneGradient = ctx.createRadialGradient(
          posX - stoneRadius * 0.3,
          posY - stoneRadius * 0.3,
          0,
          posX,
          posY,
          stoneRadius
        );

        if (stone === 'black') {
          stoneGradient.addColorStop(0, '#4a4a4a');
          stoneGradient.addColorStop(0.5, '#1a1a1a');
          stoneGradient.addColorStop(1, '#000000');
        } else {
          stoneGradient.addColorStop(0, '#ffffff');
          stoneGradient.addColorStop(0.5, '#f0f0f0');
          stoneGradient.addColorStop(1, '#d0d0d0');
        }

        ctx.fillStyle = stoneGradient;
        ctx.beginPath();
        ctx.arc(posX, posY, stoneRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    }

    if (showSolution && currentTsumego) {
      ctx.strokeStyle = '#22C55E';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      for (const move of currentTsumego.correctMoves) {
        const posX = padding + move.x * cellSize;
        const posY = padding + move.y * cellSize;
        ctx.beginPath();
        ctx.arc(posX, posY, stoneRadius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  };

  useEffect(() => {
    const canvas = document.getElementById('tsumego-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawBoard(ctx);
  }, [board, showSolution]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const x = Math.round((mouseX - padding) / cellSize);
    const y = Math.round((mouseY - padding) / cellSize);

    if (x >= 0 && x < boardSize && y >= 0 && y < boardSize) {
      handleMove(x, y);
    }
  };

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'easy':
        return 'bg-green-100 text-green-700';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700';
      case 'hard':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getDifficultyText = (diff: string) => {
    switch (diff) {
      case 'easy':
        return '初级';
      case 'medium':
        return '中级';
      case 'hard':
        return '高级';
      default:
        return diff;
    }
  };

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
            死活题练习
          </h1>
          <div className="w-20" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8 max-w-5xl mx-auto">
          <div className="flex-1">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-amber-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-amber-900">
                    {currentTsumego?.name}
                  </h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDifficultyColor(currentTsumego?.difficulty || 'easy')}`}>
                      {getDifficultyText(currentTsumego?.difficulty || 'easy')}
                    </span>
                    <span className="text-sm text-gray-500">
                      {currentTsumego?.description}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => goToProblem(Math.max(0, filteredList.findIndex((t) => t.id === currentTsumego?.id) - 1))}
                    disabled={filteredList.findIndex((t) => t.id === currentTsumego?.id) === 0}
                    className="p-2 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-gray-600 min-w-16 text-center">
                    {filteredList.findIndex((t) => t.id === currentTsumego?.id) + 1} / {filteredList.length}
                  </span>
                  <button
                    onClick={() => goToProblem(Math.min(filteredList.length - 1, filteredList.findIndex((t) => t.id === currentTsumego?.id) + 1))}
                    disabled={filteredList.findIndex((t) => t.id === currentTsumego?.id) === filteredList.length - 1}
                    className="p-2 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50 transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex justify-center mb-6">
                <canvas
                  id="tsumego-canvas"
                  width={canvasSize}
                  height={canvasSize}
                  className="rounded-lg shadow-xl cursor-pointer"
                  style={{ maxWidth: '100%', height: 'auto' }}
                  onClick={handleCanvasClick}
                />
              </div>

              {isCorrect === true && (
                <div className="flex items-center gap-3 p-4 bg-green-100 rounded-xl mb-4">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <span className="text-green-800 font-medium">正确！太棒了！🎉</span>
                </div>
              )}

              {isCorrect === false && (
                <div className="flex items-center gap-3 p-4 bg-red-100 rounded-xl mb-4">
                  <XCircle className="w-6 h-6 text-red-600" />
                  <span className="text-red-800 font-medium">不对哦，再想想看？</span>
                </div>
              )}

              {showHint && (
                <div className="p-4 bg-blue-50 rounded-xl mb-4">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Lightbulb className="w-5 h-5" />
                    <span className="font-medium">提示：</span>
                    <span>{currentTsumego?.hint}</span>
                  </div>
                </div>
              )}

              {showSolution && (
                <div className="p-4 bg-green-50 rounded-xl mb-4">
                  <div className="flex items-center gap-2 text-green-700">
                    <Target className="w-5 h-5" />
                    <span className="font-medium">正解：</span>
                    <span>{currentTsumego?.solution}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowHint(!showHint)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-xl font-medium transition-colors"
                >
                  <Lightbulb className="w-5 h-5" />
                  {showHint ? '隐藏提示' : '显示提示'}
                </button>
                <button
                  onClick={() => setShowSolution(!showSolution)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-100 text-green-700 hover:bg-green-200 rounded-xl font-medium transition-colors"
                >
                  <Target className="w-5 h-5" />
                  {showSolution ? '隐藏答案' : '查看答案'}
                </button>
                <button
                  onClick={resetBoard}
                  className="flex items-center gap-2 px-5 py-2.5 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-xl font-medium transition-colors"
                >
                  <RefreshCw className="w-5 h-5" />
                  重新开始
                </button>
              </div>
            </div>
          </div>

          <div className="lg:w-64">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-amber-200">
              <h3 className="text-lg font-semibold text-amber-900 mb-4">题目列表</h3>
              
              <div className="flex gap-2 mb-4">
                {(['all', 'easy', 'medium', 'hard'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      setFilter(f);
                      const firstOfFilter = tsumegoList.findIndex((t) => f === 'all' || t.difficulty === f);
                      if (firstOfFilter !== -1) setCurrentIndex(firstOfFilter);
                    }}
                    className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                      filter === f
                        ? 'bg-amber-500 text-white'
                        : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    }`}
                  >
                    {f === 'all' ? '全部' : getDifficultyText(f)}
                  </button>
                ))}
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredList.map((tsumego, idx) => (
                  <button
                    key={tsumego.id}
                    onClick={() => goToProblem(idx)}
                    className={`w-full text-left p-3 rounded-xl transition-all ${
                      tsumego.id === currentTsumego?.id
                        ? 'bg-amber-100 ring-2 ring-amber-400'
                        : 'bg-gray-50 hover:bg-amber-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-amber-900 text-sm">
                        {idx + 1}. {tsumego.name}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${getDifficultyColor(tsumego.difficulty)}`}>
                        {getDifficultyText(tsumego.difficulty)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
