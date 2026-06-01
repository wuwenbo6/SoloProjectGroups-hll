import React, { useState, useEffect } from 'react'

interface TrainingPlan {
  id: string
  name: string
  description: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  exercise: string
  rounds: number
  reps_per_round?: number
  exercises_per_round?: { type: string; reps: number }[]
  rest_seconds: number
  calories_estimate: number
}

interface TrainingPlanSelectorProps {
  onSelectPlan: (plan: TrainingPlan) => void
  selectedPlanId?: string
}

export const TrainingPlanSelector: React.FC<TrainingPlanSelectorProps> = ({ 
  onSelectPlan,
  selectedPlanId 
}) => {
  const [plans, setPlans] = useState<TrainingPlan[]>([])
  const [filter, setFilter] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPlans()
  }, [])

  const fetchPlans = async () => {
    try {
      const response = await fetch('/api/advanced/plans')
      const data = await response.json()
      setPlans(data)
    } catch (error) {
      console.error('Failed to fetch plans:', error)
      setPlans(getMockPlans())
    } finally {
      setLoading(false)
    }
  }

  const getMockPlans = (): TrainingPlan[] => [
    {
      id: 'beginner_squat',
      name: '入门深蹲训练',
      description: '适合初学者的深蹲基础训练，建立正确动作模式',
      difficulty: 'beginner',
      exercise: 'squat',
      rounds: 3,
      reps_per_round: 10,
      rest_seconds: 60,
      calories_estimate: 45
    },
    {
      id: 'beginner_pushup',
      name: '入门俯卧撑训练',
      description: '适合初学者的俯卧撑基础训练',
      difficulty: 'beginner',
      exercise: 'pushup',
      rounds: 3,
      reps_per_round: 8,
      rest_seconds: 60,
      calories_estimate: 50
    },
    {
      id: 'intermediate_squat',
      name: '进阶深蹲训练',
      description: '提升腿部力量的进阶训练计划',
      difficulty: 'intermediate',
      exercise: 'squat',
      rounds: 4,
      reps_per_round: 15,
      rest_seconds: 45,
      calories_estimate: 90
    },
    {
      id: 'intermediate_pushup',
      name: '进阶俯卧撑训练',
      description: '增强上肢力量的进阶训练',
      difficulty: 'intermediate',
      exercise: 'pushup',
      rounds: 4,
      reps_per_round: 12,
      rest_seconds: 45,
      calories_estimate: 100
    },
    {
      id: 'advanced_squat',
      name: '高强度深蹲训练',
      description: '挑战极限的高强度深蹲训练',
      difficulty: 'advanced',
      exercise: 'squat',
      rounds: 5,
      reps_per_round: 20,
      rest_seconds: 30,
      calories_estimate: 150
    },
    {
      id: 'advanced_pushup',
      name: '高强度俯卧撑训练',
      description: '专业级俯卧撑训练，打造完美胸肌',
      difficulty: 'advanced',
      exercise: 'pushup',
      rounds: 5,
      reps_per_round: 18,
      rest_seconds: 30,
      calories_estimate: 170
    }
  ]

  const filteredPlans = filter === 'all' 
    ? plans 
    : plans.filter(p => p.difficulty === filter)

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'bg-green-500/20 text-green-400 border-green-500/50'
      case 'intermediate': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
      case 'advanced': return 'bg-red-500/20 text-red-400 border-red-500/50'
      default: return 'bg-gray-500/20 text-gray-400'
    }
  }

  const getDifficultyLabel = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return '入门'
      case 'intermediate': return '进阶'
      case 'advanced': return '高强度'
      default: return difficulty
    }
  }

  const getExerciseIcon = (exercise: string) => {
    if (exercise === 'squat') return '🏋️'
    if (exercise === 'pushup') return '💪'
    return '🔥'
  }

  if (loading) {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin w-8 h-8 border-4 border-neon-cyan border-t-transparent rounded-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-400 text-sm uppercase tracking-wider">训练计划</h3>
        <div className="flex gap-2">
          {(['all', 'beginner', 'intermediate', 'advanced'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs transition-all ${
                filter === f
                  ? 'bg-neon-cyan text-white'
                  : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
              }`}
            >
              {f === 'all' ? '全部' : getDifficultyLabel(f)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 max-h-96 overflow-y-auto pr-2">
        {filteredPlans.map((plan) => (
          <button
            key={plan.id}
            onClick={() => onSelectPlan(plan)}
            className={`p-4 rounded-xl text-left transition-all ${
              selectedPlanId === plan.id
                ? 'bg-neon-cyan/20 border-2 border-neon-cyan'
                : 'bg-slate-800/50 border-2 border-transparent hover:bg-slate-700/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl">{getExerciseIcon(plan.exercise)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-white truncate">{plan.name}</h4>
                  <span className={`px-2 py-0.5 rounded-full text-xs border ${getDifficultyColor(plan.difficulty)}`}>
                    {getDifficultyLabel(plan.difficulty)}
                  </span>
                </div>
                <p className="text-gray-400 text-sm mb-2 line-clamp-1">{plan.description}</p>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>🔄 {plan.rounds} 组</span>
                  <span>✖️ {plan.reps_per_round || plan.exercises_per_round?.length || 0} 次/组</span>
                  <span>⏱️ {plan.rest_seconds}s 休息</span>
                  <span>🔥 {plan.calories_estimate} kcal</span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
