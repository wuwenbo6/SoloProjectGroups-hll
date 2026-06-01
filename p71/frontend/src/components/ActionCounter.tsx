import React, { useState, useEffect } from 'react'
import { ACTION_NAMES } from '../types/pose'

interface ActionCounterProps {
  action: string
  confidence: number
  counts: {
    squat: number
    pushup: number
  }
  isRecording: boolean
}

export const ActionCounter: React.FC<ActionCounterProps> = ({
  action,
  confidence,
  counts,
  isRecording
}) => {
  const [animateCount, setAnimateCount] = useState({ squat: false, pushup: false })
  const [prevCounts, setPrevCounts] = useState({ squat: 0, pushup: 0 })

  useEffect(() => {
    if (counts.squat > prevCounts.squat) {
      setAnimateCount(prev => ({ ...prev, squat: true }))
      setTimeout(() => setAnimateCount(prev => ({ ...prev, squat: false })), 300)
    }
    if (counts.pushup > prevCounts.pushup) {
      setAnimateCount(prev => ({ ...prev, pushup: true }))
      setTimeout(() => setAnimateCount(prev => ({ ...prev, pushup: false })), 300)
    }
    setPrevCounts(counts)
  }, [counts, prevCounts])

  const getActionColor = (act: string) => {
    switch (act) {
      case 'squat': return 'text-neon-orange'
      case 'pushup': return 'text-neon-pink'
      case 'stand': return 'text-neon-green'
      default: return 'text-gray-400'
    }
  }

  const getActionIcon = (act: string) => {
    switch (act) {
      case 'squat': return '🏋️'
      case 'pushup': return '💪'
      case 'stand': return '🧍'
      default: return '⏸️'
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-6 neon-border">
        <h3 className="text-gray-400 text-sm uppercase tracking-wider mb-4">当前动作</h3>
        
        <div className="flex items-center gap-4 mb-4">
          <div className="text-5xl">{getActionIcon(action)}</div>
          <div>
            <p className={`text-3xl font-bold font-mono ${getActionColor(action)} neon-text`}>
              {ACTION_NAMES[action] || '无动作'}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-gray-400 text-sm">置信度</span>
              <div className="flex-1 h-2 bg-dark-bg rounded-full overflow-hidden w-32">
                <div 
                  className="h-full bg-gradient-to-r from-neon-cyan to-neon-green progress-bar rounded-full"
                  style={{ width: `${confidence * 100}%` }}
                />
              </div>
              <span className="text-neon-cyan font-mono text-sm">
                {(confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={`glass rounded-2xl p-5 transition-all ${isRecording ? 'neon-border' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">深蹲</span>
            <span className="text-2xl">🏋️</span>
          </div>
          <p className={`text-4xl font-bold font-mono text-neon-orange ${animateCount.squat ? 'count-pop' : ''}`}>
            {counts.squat}
          </p>
          <p className="text-gray-500 text-xs mt-1">次</p>
        </div>

        <div className={`glass rounded-2xl p-5 transition-all ${isRecording ? 'neon-border' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">俯卧撑</span>
            <span className="text-2xl">💪</span>
          </div>
          <p className={`text-4xl font-bold font-mono text-neon-pink ${animateCount.pushup ? 'count-pop' : ''}`}>
            {counts.pushup}
          </p>
          <p className="text-gray-500 text-xs mt-1">次</p>
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <h4 className="text-gray-400 text-sm mb-3">消耗估算</h4>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold font-mono text-neon-green">
            {Math.round((counts.squat * 0.5 + counts.pushup * 0.8) * 10) / 10}
          </span>
          <span className="text-gray-400 mb-1">kcal</span>
        </div>
        <div className="mt-3 h-1 bg-dark-bg rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-neon-green to-neon-cyan"
            style={{ width: `${Math.min(100, (counts.squat + counts.pushup) * 2)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
