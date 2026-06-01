import { create } from 'zustand'
import { PoseFrame, ActionCount, TrainingSession, ActionRecord } from '../types/pose'

interface TrainingState {
  isRecording: boolean
  currentAction: string
  confidence: number
  actionCounts: ActionCount
  poseFrames: PoseFrame[]
  sessionId: number | null
  startTime: number | null
  
  startRecording: () => void
  stopRecording: () => void
  setCurrentAction: (action: string, confidence: number) => void
  incrementActionCount: (action: string) => void
  addPoseFrame: (frame: PoseFrame) => void
  resetCounts: () => void
  clearFrames: () => void
}

export const useTrainingStore = create<TrainingState>((set, get) => ({
  isRecording: false,
  currentAction: 'none',
  confidence: 0,
  actionCounts: { squat: 0, pushup: 0, stand: 0 },
  poseFrames: [],
  sessionId: null,
  startTime: null,

  startRecording: () => {
    set({ 
      isRecording: true, 
      startTime: Date.now(),
      actionCounts: { squat: 0, pushup: 0, stand: 0 }
    })
  },

  stopRecording: () => {
    set({ isRecording: false, startTime: null })
  },

  setCurrentAction: (action: string, confidence: number) => {
    set({ currentAction: action, confidence })
  },

  incrementActionCount: (action: string) => {
    set((state) => ({
      actionCounts: {
        ...state.actionCounts,
        [action]: state.actionCounts[action as keyof ActionCount] + 1
      }
    }))
  },

  addPoseFrame: (frame: PoseFrame) => {
    set((state) => {
      const frames = [...state.poseFrames, frame].slice(-32)
      return { poseFrames: frames }
    })
  },

  resetCounts: () => {
    set({ actionCounts: { squat: 0, pushup: 0, stand: 0 } })
  },

  clearFrames: () => {
    set({ poseFrames: [] })
  }
}))

interface HistoryState {
  sessions: TrainingSession[]
  isLoading: boolean
  fetchSessions: () => Promise<void>
  saveSession: (session: Omit<TrainingSession, 'id'>) => Promise<number | null>
  deleteSession: (id: number) => Promise<void>
}

export const useHistoryStore = create<HistoryState>((set) => ({
  sessions: [],
  isLoading: false,

  fetchSessions: async () => {
    set({ isLoading: true })
    try {
      const response = await fetch('/api/training')
      if (response.ok) {
        const data = await response.json()
        set({ sessions: data })
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  saveSession: async (session) => {
    try {
      const response = await fetch('/api/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session)
      })
      if (response.ok) {
        const data = await response.json()
        return data.id
      }
    } catch (error) {
      console.error('Failed to save session:', error)
    }
    return null
  },

  deleteSession: async (id) => {
    try {
      await fetch(`/api/training/${id}`, { method: 'DELETE' })
      set((state) => ({
        sessions: state.sessions.filter(s => s.id !== id)
      }))
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }
}))
