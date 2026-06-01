interface EnergyRingProps {
  energyLevel: number
  status: string
  size?: number
}

export function EnergyRing({ energyLevel, status, size = 80 }: EnergyRingProps) {
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (energyLevel / 100) * circumference

  const getColor = () => {
    if (energyLevel >= 70) return '#00FF88'
    if (energyLevel >= 40) return '#FFB800'
    return '#FF3B5C'
  }

  const getAnimationClass = () => {
    if (status === 'sending') return 'animate-pulse'
    if (status === 'waking') return 'animate-spin'
    return ''
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className={getAnimationClass()}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center font-bold"
        style={{
          color: getColor(),
          fontSize: size * 0.22,
          fontFamily: 'JetBrains Mono, monospace'
        }}
      >
        {Math.round(energyLevel)}%
      </div>
    </div>
  )
}
