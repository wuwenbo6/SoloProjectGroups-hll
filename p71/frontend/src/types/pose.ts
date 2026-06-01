export interface PoseLandmark {
  x: number
  y: number
  z: number
  visibility: number
}

export interface PoseFrame {
  timestamp: number
  landmarks: PoseLandmark[]
}

export interface ActionRecognitionResult {
  action: string
  confidence: number
  count: number
}

export interface ActionCount {
  squat: number
  pushup: number
  stand: number
}

export interface TrainingSession {
  id: number
  startTime: string
  endTime: string
  duration: number
  totalCalories: number
  actions: ActionRecord[]
}

export interface ActionRecord {
  id?: number
  actionName: string
  count: number
  avgConfidence: number
}

export const POSE_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10], [11, 12], [11, 13], [13, 15],
  [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20],
  [16, 22], [18, 20], [11, 23], [12, 24],
  [23, 24], [23, 25], [24, 26], [25, 27],
  [26, 28], [27, 29], [28, 30], [29, 31],
  [30, 32], [27, 31], [28, 32]
]

export const ACTION_NAMES: Record<string, string> = {
  squat: '深蹲',
  pushup: '俯卧撑',
  stand: '站立',
  none: '无动作'
}
