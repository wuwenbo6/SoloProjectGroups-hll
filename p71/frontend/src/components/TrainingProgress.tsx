import React, { useState, useEffect, useCallback } from 'react'

interface TrainingPlan {
  id: string
  name: string
  description: string
  difficulty: string
  exercise: string
  rounds: number
  reps_per_round?: number
  exercises_per_round?: { type: string; reps: number }[]
  rest_seconds: number
  calories_estimate: number
}

interface TrainingProgressProps {
  plan: TrainingPlan
  onComplete: (results: any) => void
  onCancel: () => void
  currentReps: number
  currentAction: string
}

export const TrainingProgress: React.FC<TrainingProgressProps> = ({
  plan,
  onComplete,
  onCancel,
  currentReps,
  currentAction
}) => {
  const [currentRound, setCurrentRound] = useState(1)
  const [isResting, setIsResting] = useState(false)
  const [restTimeLeft, setRestTimeLeft] = useState(0)
  const [roundScores, setRoundScores] = useState<number[]>([])
  const [roundReps, setRoundReps] = useState<number[]>([])
  const [lastRoundReps, setLastRoundReps] = useState(0)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    if (isResting && restTimeLeft > 0) {
      interval = setInterval(() => {
        setRestTimeLeft(prev => {
          if (prev <= 1) {
            setIsResting(false)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isResting, restTimeLeft])

  const completeRound = useCallback(async () => {
    const repsInRound = currentReps - lastRoundReps
    const avgScore = Math.round(70 + Math.random() * 25)
    
    setRoundScores(prev => [...prev, avgScore])
    setRoundReps(prev => [...prev, repsInRound])
    setLastRoundReps(currentReps)
    
    if (currentRound >= plan.rounds) {
      const results = {
        plan,
        totalReps: currentReps,
        avgScore: roundScores.length > 0 
          ? Math.round([...roundScores, avgScore].reduce((a, b) => a + b, 0) / (roundScores.length + 1))
          : avgScore,
        roundScores: [...roundScores, avgScore],
        roundReps: [...roundReps, repsInRound]
      }
      onComplete(results)
    } else {
      setIsResting(true)
      setRestTimeLeft(plan.rest_seconds)
    }
  }, [currentRound, currentReps, lastRoundReps, plan, roundScores, roundReps, onComplete])

  const startNextRound = useCallback(() => {
    setCurrentRound(prev => prev + 1)
    setIsResting(false)
    setRestTimeLeft(0)
  }, [])

  const targetReps = plan.reps_per_round || 
    (plan.exercises_per_round?.reduce((sum, e) => sum + e.reps, 0) || 10)

  const progress = Math.min(100, (currentReps / (targetReps * plan.rounds)) * 100)
  const roundProgress = Math.min(100, ((currentReps - lastRoundReps) / targetReps) * 100)

  if (isResting) {
    return (
      <div className="glass rounded-2xl p-8 neon-border text-center">
        <div className="text-6xl mb-4">😌</div>
        <h3 className="text-2xl font-bold text-white mb-2">休息一下</h3>
        <p className="text-gray-400 mb-6">第 {currentRound} 组完成，准备下一组</p>
        
        <div className="relative w-40 h-40 mx-auto mb-6">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="80"
              cy="80"
              r="70"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-slate-700"
            />
            <circle
              cx="80"
              cy="80"
              r="70"
              stroke="url(#restGradient)"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={440}
              strokeDashoffset={440 - ((plan.rest_seconds - restTimeLeft) / plan.rest_seconds) * 440}
              className="transition-all duration-1000"
            />
            <defs>
              <linearGradient id="restGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#06B6D4" />
                <stop offset="100%" stopColor="#10B981" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold font-mono text-neon-cyan">
              {restTimeLeft}
            </span>
            <span className="text-sm text-gray-400">秒</span>
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={startNextRound}
            className="px-6 py-3 bg-gradient-to-r from-neon-cyan to-neon-green text-white rounded-full font-semibold hover:shadow-lg hover:shadow-neon-cyan/30 transition-all"
          >
            跳过休息 ▶
          </button>
          <button
            onClick={onCancel}
            className="px-6 py-3 bg-slate-700 text-gray-300 rounded-full font-semibold hover:bg-slate-600 transition-all"
          >
            结束训练
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-6 neon-border">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
          <p className="text-gray-400 text-sm">
            第 {currentRound} / {plan.rounds} 组
          </p>
        </div>
        <button
          onClick={onCancel}
          className="p-2 text-gray-400 hover:text-red-400 transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-400">总进度</span>
          <span className="text-neon-cyan font-mono">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-neon-cyan to-neon-green rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-3 bg-slate-800/50 rounded-xl">
          <p className="text-3xl font-bold font-mono text-neon-orange">
            {currentReps - lastRoundReps}
          </p>
          <p className="text-xs text-gray-400">本组 / {targetReps}</p>
        </div>
        <div className="text-center p-3 bg-slate-800/50 rounded-xl">
          <p className="text-3xl font-bold font-mono text-neon-cyan">
            {currentReps}
          </p>
          <p className="text-xs text-gray-400">总计</p>
        </div>
        <div className="text-center p-3 bg-slate-800/50 rounded-xl">
          <p className="text-3xl font-bold font-mono text-neon-green">
            {roundScores.length > 0 ? roundScores[roundScores.length - 1] : '--'}
          </p>
          <p className="text-xs text-gray-400">最佳分</p>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-400">本组进度</span>
          <span className="text-neon-cyan font-mono">
            {currentReps - lastRoundReps} / {targetReps}
          </span>
        </div>
        <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-neon-orange to-neon-pink rounded-full transition-all duration-300"
            style={{ width: `${roundProgress}%` }}
          />
        </div>
      </div>

      {roundProgress >= 100 && (
        <button
          onClick={completeRound}
          className="w-full py-4 bg-gradient-to-r from-neon-cyan to-neon-green text-white rounded-xl font-bold text-lg hover:shadow-lg hover:shadow-neon-cyan/30 transition-all animate-pulse"
        >
          ✅ 完成第 {currentRound} 组
        </button>
      )}

      {roundProgress < 100 && (
        <p className="text-center text-gray-400 text-sm">
          继续完成动作，达到目标次数后可完成本组
        </p>
      )}
    </div>
  )
}
