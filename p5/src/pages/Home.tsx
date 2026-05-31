import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Bot, BookOpen, Play, Settings, Target } from 'lucide-react';
import { useGameStore, Difficulty } from '../store/gameStore';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { gameMode, setGameMode, difficulty, setDifficulty, boardSize, setBoardSize } = useGameStore();

  const startGame = () => {
    navigate('/game');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 30px,
            #8B4513 30px,
            #8B4513 31px
          ),
          repeating-linear-gradient(
            90deg,
            transparent,
            transparent 30px,
            #8B4513 30px,
            #8B4513 31px
          )`
        }} />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-12">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold text-amber-900 mb-4" style={{ fontFamily: 'Noto Serif SC, serif' }}>
            弈智围棋
          </h1>
          <p className="text-xl text-amber-700">智能对弈 · 实时分析 · 语音解说</p>
        </div>

        <div className="max-w-4xl mx-auto mb-12">
          <h2 className="text-2xl font-semibold text-amber-800 mb-6 text-center">选择对战模式</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div
              className={`relative p-8 rounded-2xl cursor-pointer transition-all duration-300 transform hover:scale-105 ${
                gameMode === 'ai'
                  ? 'bg-gradient-to-br from-amber-600 to-orange-600 text-white shadow-2xl ring-4 ring-amber-300'
                  : 'bg-white/80 backdrop-blur-sm hover:shadow-xl border-2 border-amber-200'
              }`}
              onClick={() => setGameMode('ai')}
            >
              <div className="flex items-center justify-center mb-4">
                <Bot className={`w-16 h-16 ${gameMode === 'ai' ? 'text-amber-100' : 'text-amber-600'}`} />
              </div>
              <h3 className={`text-2xl font-bold text-center mb-2 ${gameMode === 'ai' ? 'text-white' : 'text-amber-900'}`}>
                人机对战
              </h3>
              <p className={`text-center ${gameMode === 'ai' ? 'text-amber-100' : 'text-amber-600'}`}>
                与AI对弈，获得实时分析和推荐
              </p>
              {gameMode === 'ai' && (
                <div className="absolute -top-3 -right-3 bg-yellow-400 text-amber-900 px-3 py-1 rounded-full text-sm font-bold shadow-lg">
                  推荐
                </div>
              )}
            </div>

            <div
              className={`relative p-8 rounded-2xl cursor-pointer transition-all duration-300 transform hover:scale-105 ${
                gameMode === 'pvp'
                  ? 'bg-gradient-to-br from-amber-600 to-orange-600 text-white shadow-2xl ring-4 ring-amber-300'
                  : 'bg-white/80 backdrop-blur-sm hover:shadow-xl border-2 border-amber-200'
              }`}
              onClick={() => setGameMode('pvp')}
            >
              <div className="flex items-center justify-center mb-4">
                <Users className={`w-16 h-16 ${gameMode === 'pvp' ? 'text-amber-100' : 'text-amber-600'}`} />
              </div>
              <h3 className={`text-2xl font-bold text-center mb-2 ${gameMode === 'pvp' ? 'text-white' : 'text-amber-900'}`}>
                双人对战
              </h3>
              <p className={`text-center ${gameMode === 'pvp' ? 'text-amber-100' : 'text-amber-600'}`}>
                本地双人轮流落子对弈
              </p>
            </div>
          </div>
        </div>

        {gameMode === 'ai' && (
          <div className="max-w-2xl mx-auto mb-8">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border-2 border-amber-200">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-semibold text-amber-900">AI 难度设置</h3>
              </div>
              <div className="flex gap-4">
                {(['easy', 'medium', 'hard'] as Difficulty[]).map((level) => (
                  <button
                    key={level}
                    className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                      difficulty === level
                        ? 'bg-amber-600 text-white shadow-lg'
                        : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    }`}
                    onClick={() => setDifficulty(level)}
                  >
                    {level === 'easy' ? '初级' : level === 'medium' ? '中级' : '高级'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="max-w-2xl mx-auto mb-12">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border-2 border-amber-200">
            <h3 className="text-lg font-semibold text-amber-900 mb-4">棋盘大小</h3>
            <div className="flex gap-4">
              {[9, 13, 19].map((size) => (
                <button
                  key={size}
                  className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                    boardSize === size
                      ? 'bg-amber-600 text-white shadow-lg'
                      : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  }`}
                  onClick={() => setBoardSize(size)}
                >
                  {size}×{size}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="text-center mb-12">
          <button
            onClick={startGame}
            className="inline-flex items-center gap-3 px-12 py-5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xl font-bold rounded-full shadow-xl transform hover:scale-105 transition-all duration-300"
          >
            <Play className="w-7 h-7" />
            开始对局
          </button>
        </div>

        <div className="max-w-2xl mx-auto grid md:grid-cols-2 gap-4">
          <button
            onClick={() => navigate('/tsumego')}
            className="flex items-center justify-center gap-3 py-4 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white rounded-xl font-medium transition-all hover:shadow-lg"
          >
            <Target className="w-5 h-5" />
            死活题练习
          </button>
          <button
            onClick={() => navigate('/records')}
            className="flex items-center justify-center gap-3 py-4 bg-white/80 backdrop-blur-sm hover:bg-white border-2 border-amber-200 rounded-xl text-amber-800 font-medium transition-all hover:shadow-lg"
          >
            <BookOpen className="w-5 h-5" />
            棋谱记录 & 复盘
          </button>
        </div>

        <div className="mt-16 grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="bg-white/60 backdrop-blur-sm rounded-xl p-6 text-center">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Bot className="w-6 h-6 text-amber-600" />
            </div>
            <h4 className="font-semibold text-amber-900 mb-2">智能AI</h4>
            <p className="text-sm text-amber-700">基于简化KataGo引擎，多档难度可选</p>
          </div>
          <div className="bg-white/60 backdrop-blur-sm rounded-xl p-6 text-center">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            </div>
            <h4 className="font-semibold text-amber-900 mb-2">语音解说</h4>
            <p className="text-sm text-amber-700">实时播报胜率变化和推荐落子</p>
          </div>
          <div className="bg-white/60 backdrop-blur-sm rounded-xl p-6 text-center">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h4 className="font-semibold text-amber-900 mb-2">热点分析</h4>
            <p className="text-sm text-amber-700">可视化落子热点，提升棋力</p>
          </div>
        </div>
      </div>
    </div>
  );
};
