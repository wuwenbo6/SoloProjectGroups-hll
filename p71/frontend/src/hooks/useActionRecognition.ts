import { useState, useCallback, useRef } from 'react'
import { PoseLandmark, PoseFrame } from '../types/pose'

interface ActionState {
  action: string
  confidence: number
  count: number
}

interface FilteredLandmark {
  x: number
  y: number
  z: number
  visibility: number
}

const ALPHA = 0.4
const MIN_VISIBILITY = 0.5
const SMOOTHING_WINDOW = 8
const STATE_HYSTERESIS_FRAMES = 3

export function useActionRecognition() {
  const [currentAction, setCurrentAction] = useState<ActionState>({
    action: 'none',
    confidence: 0,
    count: 0
  })
  
  const frameBuffer = useRef<PoseFrame[]>([])
  const filteredLandmarks = useRef<FilteredLandmark[]>([])
  const angleHistory = useRef<{ knee: number[]; elbow: number[] }>({ knee: [], elbow: [] })
  const actionHistory = useRef<string[]>([])
  const confidenceHistory = useRef<number[]>([])
  
  const squatState = useRef({
    isDown: false,
    consecutiveDown: 0,
    consecutiveUp: 0,
    minAngle: 180,
    maxAngle: 0
  })
  
  const pushupState = useRef({
    isDown: false,
    consecutiveDown: 0,
    consecutiveUp: 0,
    minAngle: 180,
    maxAngle: 0
  })
  
  const squatCount = useRef(0)
  const pushupCount = useRef(0)

  const lowPassFilter = (newValue: number, oldValue: number, alpha: number = ALPHA): number => {
    return alpha * newValue + (1 - alpha) * oldValue
  }

  const filterLandmarks = (landmarks: PoseLandmark[]): FilteredLandmark[] => {
    const filtered: FilteredLandmark[] = []
    
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i]
      const prev = filteredLandmarks.current[i]
      
      if (prev && lm.visibility > MIN_VISIBILITY) {
        filtered.push({
          x: lowPassFilter(lm.x, prev.x),
          y: lowPassFilter(lm.y, prev.y),
          z: lowPassFilter(lm.z, prev.z),
          visibility: lm.visibility
        })
      } else {
        filtered.push({
          x: lm.x,
          y: lm.y,
          z: lm.z,
          visibility: lm.visibility
        })
      }
    }
    
    filteredLandmarks.current = filtered
    return filtered
  }

  const smoothAngle = (angle: number, type: 'knee' | 'elbow'): number => {
    const history = angleHistory.current[type]
    history.push(angle)
    if (history.length > SMOOTHING_WINDOW) {
      history.shift()
    }
    return history.reduce((a, b) => a + b, 0) / history.length
  }

  const smoothConfidence = (conf: number): number => {
    confidenceHistory.current.push(conf)
    if (confidenceHistory.current.length > 5) {
      confidenceHistory.current.shift()
    }
    return confidenceHistory.current.reduce((a, b) => a + b, 0) / confidenceHistory.current.length
  }

  const calculateDistance = (p1: FilteredLandmark, p2: FilteredLandmark): number => {
    return Math.sqrt(
      Math.pow(p1.x - p2.x, 2) + 
      Math.pow(p1.y - p2.y, 2) + 
      Math.pow(p1.z - p2.z, 2)
    )
  }

  const calculateAngle = (
    p1: FilteredLandmark, 
    p2: FilteredLandmark, 
    p3: FilteredLandmark
  ): number => {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z }
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y, z: p3.z - p2.z }
    
    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z)
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z)
    
    if (mag1 === 0 || mag2 === 0) return 0
    
    const cos = dot / (mag1 * mag2)
    return Math.acos(Math.max(-1, Math.min(1, cos))) * (180 / Math.PI)
  }

  const detectSquat = (landmarks: FilteredLandmark[]): { isSquat: boolean; confidence: number; angle: number } => {
    const leftHip = landmarks[23]
    const leftKnee = landmarks[25]
    const leftAnkle = landmarks[27]
    const rightHip = landmarks[24]
    const rightKnee = landmarks[26]
    const rightAnkle = landmarks[28]

    const criticalPoints = [leftHip, leftKnee, leftAnkle, rightHip, rightKnee, rightAnkle]
    const lowVisibility = criticalPoints.some(p => !p || p.visibility < MIN_VISIBILITY)
    
    if (lowVisibility) {
      return { isSquat: squatState.current.isDown, confidence: 0.3, angle: 180 }
    }

    const leftKneeAngle = calculateAngle(leftHip!, leftKnee!, leftAnkle!)
    const rightKneeAngle = calculateAngle(rightHip!, rightKnee!, rightAnkle!)
    const rawAvgAngle = (leftKneeAngle + rightKneeAngle) / 2
    const avgKneeAngle = smoothAngle(rawAvgAngle, 'knee')

    const hipY = (leftHip!.y + rightHip!.y) / 2
    const kneeY = (leftKnee!.y + rightKnee!.y) / 2
    const hipKneeDiff = kneeY - hipY

    const symmetry = 1 - Math.abs(leftKneeAngle - rightKneeAngle) / 180
    const depthConfidence = Math.min(1, Math.max(0, (180 - avgKneeAngle) / 70))
    const positionConfidence = hipKneeDiff > 0.08 ? 1 : Math.max(0, hipKneeDiff / 0.08)
    
    const isDown = avgKneeAngle < 125 && hipKneeDiff > 0.08
    const isUp = avgKneeAngle > 155

    const confidence = isDown 
      ? depthConfidence * positionConfidence * symmetry
      : isUp 
        ? 0.85 * symmetry
        : 0.4 + symmetry * 0.2

    return { isSquat: isDown, confidence, angle: avgKneeAngle }
  }

  const detectPushup = (landmarks: FilteredLandmark[]): { isPushup: boolean; confidence: number; angle: number } => {
    const leftShoulder = landmarks[11]
    const leftElbow = landmarks[13]
    const leftWrist = landmarks[15]
    const rightShoulder = landmarks[12]
    const rightElbow = landmarks[14]
    const rightWrist = landmarks[16]
    const leftHip = landmarks[23]
    const rightHip = landmarks[24]

    const criticalPoints = [leftShoulder, leftElbow, leftWrist, rightShoulder, rightElbow, rightWrist]
    const lowVisibility = criticalPoints.some(p => !p || p.visibility < MIN_VISIBILITY)
    
    if (lowVisibility) {
      return { isPushup: pushupState.current.isDown, confidence: 0.3, angle: 180 }
    }

    const leftElbowAngle = calculateAngle(leftShoulder!, leftElbow!, leftWrist!)
    const rightElbowAngle = calculateAngle(rightShoulder!, rightElbow!, rightWrist!)
    const rawAvgAngle = (leftElbowAngle + rightElbowAngle) / 2
    const avgElbowAngle = smoothAngle(rawAvgAngle, 'elbow')

    const shoulderY = (leftShoulder!.y + rightShoulder!.y) / 2
    const hipY = leftHip && rightHip ? (leftHip.y + rightHip.y) / 2 : shoulderY
    const bodyHorizontal = Math.abs(shoulderY - hipY) < 0.18
    const symmetry = 1 - Math.abs(leftElbowAngle - rightElbowAngle) / 180
    const depthConfidence = Math.min(1, Math.max(0, (180 - avgElbowAngle) / 70))
    
    const isDown = avgElbowAngle < 130 && bodyHorizontal
    const isUp = avgElbowAngle > 155 && bodyHorizontal

    const confidence = isDown 
      ? depthConfidence * (bodyHorizontal ? 1 : 0.5) * symmetry
      : isUp 
        ? 0.8 * symmetry
        : 0.3 + symmetry * 0.2

    return { isPushup: isDown, confidence, angle: avgElbowAngle }
  }

  const detectAction = useCallback((landmarks: PoseLandmark[]): ActionState => {
    const filtered = filterLandmarks(landmarks)
    const squatResult = detectSquat(filtered)
    const pushupResult = detectPushup(filtered)

    if (squatResult.isSquat) {
      squatState.current.consecutiveDown++
      squatState.current.consecutiveUp = 0
      squatState.current.minAngle = Math.min(squatState.current.minAngle, squatResult.angle)
    } else {
      squatState.current.consecutiveUp++
      squatState.current.consecutiveDown = 0
      squatState.current.maxAngle = Math.max(squatState.current.maxAngle, squatResult.angle)
    }

    if (pushupResult.isPushup) {
      pushupState.current.consecutiveDown++
      pushupState.current.consecutiveUp = 0
      pushupState.current.minAngle = Math.min(pushupState.current.minAngle, pushupResult.angle)
    } else {
      pushupState.current.consecutiveUp++
      pushupState.current.consecutiveDown = 0
      pushupState.current.maxAngle = Math.max(pushupState.current.maxAngle, pushupResult.angle)
    }

    if (!squatState.current.isDown && 
        squatState.current.consecutiveDown >= STATE_HYSTERESIS_FRAMES &&
        squatResult.confidence > 0.6) {
      squatState.current.isDown = true
    }
    
    if (squatState.current.isDown && 
        squatState.current.consecutiveUp >= STATE_HYSTERESIS_FRAMES &&
        squatResult.angle > 150) {
      squatState.current.isDown = false
      const validRep = squatState.current.minAngle < 130
      if (validRep) {
        squatCount.current++
      }
      squatState.current.minAngle = 180
      squatState.current.maxAngle = 0
    }

    if (!pushupState.current.isDown && 
        pushupState.current.consecutiveDown >= STATE_HYSTERESIS_FRAMES &&
        pushupResult.confidence > 0.6) {
      pushupState.current.isDown = true
    }
    
    if (pushupState.current.isDown && 
        pushupState.current.consecutiveUp >= STATE_HYSTERESIS_FRAMES &&
        pushupResult.angle > 150) {
      pushupState.current.isDown = false
      const validRep = pushupState.current.minAngle < 135
      if (validRep) {
        pushupCount.current++
      }
      pushupState.current.minAngle = 180
      pushupState.current.maxAngle = 0
    }

    let action = 'none'
    let confidence = 0

    if (squatResult.confidence > pushupResult.confidence && squatResult.confidence > 0.45) {
      action = 'squat'
      confidence = squatResult.confidence
    } else if (pushupResult.confidence > squatResult.confidence && pushupResult.confidence > 0.45) {
      action = 'pushup'
      confidence = pushupResult.confidence
    } else if (squatResult.confidence < 0.35 && pushupResult.confidence < 0.35) {
      action = 'stand'
      confidence = 0.8
    }

    actionHistory.current.push(action)
    if (actionHistory.current.length > SMOOTHING_WINDOW) {
      actionHistory.current.shift()
    }

    const actionCounts: Record<string, number> = {}
    for (const a of actionHistory.current) {
      actionCounts[a] = (actionCounts[a] || 0) + 1
    }
    
    let smoothAction = action
    let maxCount = 0
    for (const [a, count] of Object.entries(actionCounts)) {
      if (count > maxCount) {
        maxCount = count
        smoothAction = a
      }
    }

    const smoothedConfidence = smoothConfidence(confidence)
    const finalConfidence = maxCount >= SMOOTHING_WINDOW * 0.6 
      ? smoothedConfidence 
      : smoothedConfidence * 0.7

    const totalCount = squatCount.current + pushupCount.current

    return {
      action: smoothAction,
      confidence: finalConfidence,
      count: totalCount
    }
  }, [])

  const addFrame = useCallback((landmarks: PoseLandmark[]) => {
    const frame: PoseFrame = {
      timestamp: Date.now(),
      landmarks
    }
    
    frameBuffer.current.push(frame)
    if (frameBuffer.current.length > 32) {
      frameBuffer.current.shift()
    }

    const result = detectAction(landmarks)
    setCurrentAction(result)
    
    return result
  }, [detectAction])

  const resetCounts = useCallback(() => {
    squatCount.current = 0
    pushupCount.current = 0
    
    squatState.current = {
      isDown: false,
      consecutiveDown: 0,
      consecutiveUp: 0,
      minAngle: 180,
      maxAngle: 0
    }
    
    pushupState.current = {
      isDown: false,
      consecutiveDown: 0,
      consecutiveUp: 0,
      minAngle: 180,
      maxAngle: 0
    }
    
    filteredLandmarks.current = []
    angleHistory.current = { knee: [], elbow: [] }
    actionHistory.current = []
    confidenceHistory.current = []
    
    setCurrentAction({ action: 'none', confidence: 0, count: 0 })
  }, [])

  const getCounts = useCallback(() => ({
    squat: squatCount.current,
    pushup: pushupCount.current
  }), [])

  return {
    currentAction,
    addFrame,
    resetCounts,
    getCounts,
    frameBuffer: frameBuffer.current
  }
}
