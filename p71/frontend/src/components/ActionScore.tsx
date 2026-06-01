import React, { useEffect, useState } from 'react'

interface ActionScoreProps {
  actionType: string
  scores: {
    score: number
    form_score: number
    range_score: number
    symmetry_score: number
    speed_score: number
    feedback: string[]
  } | null
}

export const ActionScore: React.FC<ActionScoreProps> = ({ actionType, scores }) => {
  const [animatedScore, setAnimatedScore] = useState(0)

  useEffect(() => {
    if (scores) {
      setAnimatedScore(0)
      const timer = setTimeout(() => {
        setAnimatedScore(scores.score)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [scores?.score])

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-neon-green'
    if (score >= 70) return 'text-neon-cyan'
    if (score >= 50) return 'text-neon-orange'
    return 'text-red-400'
  }

  const getProgressColor = (score: number) => {
    if (score >= 90) return 'from-green-500 to-emerald-400'
    if (score >= 70) return 'from-cyan-500 to-blue-400'
    if (score >= 50) return 'from-orange-500 to-yellow-400'
    return 'from-red-500 to-pink-400'
  }

  const getGrade = (score: number) => {
    if (score >= 95) return 'S+'
    if (score >= 90) return 'S'
    if (score >= 85) return 'A+'
    if (score >= 80) return 'A'
    if (score >= 70) return 'B'
    if (score >= 60) return 'C'
    return 'D'
  }

  if (!scores) {
    return (
      <div className="glass rounded-2xl p-6 neon-border">
        <h3 className="text-gray-400 text-sm uppercase tracking-wider mb-4">动作质量评分</h3>
        <div className="text-center py-8">
          <div className="text-6xl mb-4">📊</div>
          <p className="text-gray-500">完成动作后显示评分</p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-6 neon-border animate-slide-up">
      <h3 className="text-gray-400 text-sm uppercase tracking-wider mb-4">动作质量评分</h3>
      
      <div className="flex items-center gap-6 mb-6">
        <div className="relative">
          <svg className="w-24 h-24 transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-slate-700"
            />
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="url(#scoreGradient)"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={251.2}
              strokeDashoffset={251.2 - (animatedScore / 100) * 251.2}
              className="transition-all duration-1000 ease-out"
            />
            <defs>
              <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={animatedScore >= 70 ? '#06B6D4' : '#F59E0B'} />
                <stop offset="100%" stopColor={animatedScore >= 70 ? '#10B981' : '#EC4899'} />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${getScoreColor(animatedScore)}`}>
              {animatedScore}
            </span>
            <span className="text-xs text-gray-400">{getGrade(animatedScore)}</span>
          </div>
        </div>

        <div className="flex-1 space-y-3">
          {[
            { label: '动作形态', value: scores.form_score, icon: '🧘' },
            { label: '动作幅度', value: scores.range_score, icon: '📏' },
            { label: '左右对称', value: scores.symmetry_score, icon: '⚖️' },
            { label: '节奏速度', value: scores.speed_score, icon: '⏱️' }
          ].map((item) => (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-400 flex items-center gap-1">
                  <span>{item.icon}</span> {item.label}
                </span>
                <span className={`text-sm font-mono ${getScoreColor(item.value)}`}>
                  {item.value}
                </span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full bg-gradient-to-r ${getProgressColor(item.value)} rounded-full transition-all duration-700`}
                  style={{ width: `${item.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {scores.feedback.length > 0 && (
        <div className="pt-4 border-t border-slate-700">
          <h4 className="text-gray-400 text-sm mb-2">💬 反馈建议</h4>
          <ul className="space-y-1">
            {scores.feedback.map((fb, idx) => (
              <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                <span className="text-neon-cyan">•</span>
                {fb}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
