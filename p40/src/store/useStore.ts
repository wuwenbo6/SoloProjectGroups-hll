import { create } from 'zustand';
import { 
  WebRTCState, 
  JoystickState, 
  RobotStatus, 
  ForceFeedback, 
  ControlCommand,
  Robot,
  Macro,
  MacroStep,
  MacroRecordingState,
  MacroPlaybackState,
  RecordingState,
} from '../types';

const defaultRobots: Robot[] = [
  {
    id: 'robot-001',
    name: '探索者一号',
    type: 'ground',
    ip: '192.168.1.101',
    port: 5000,
    status: 'online',
    description: '地面巡逻机器人',
    createdAt: '2024-01-01T00:00:00Z',
    lastConnected: '2024-01-15T10:30:00Z',
  },
  {
    id: 'robot-002',
    name: '鹰眼无人机',
    type: 'drone',
    ip: '192.168.1.102',
    port: 5001,
    status: 'online',
    description: '航拍侦察无人机',
    createdAt: '2024-01-05T00:00:00Z',
  },
  {
    id: 'robot-003',
    name: '机械臂Alpha',
    type: 'arm',
    ip: '192.168.1.103',
    port: 5002,
    status: 'offline',
    description: '6自由度机械臂',
    createdAt: '2024-02-01T00:00:00Z',
  },
];

const defaultMacros: Macro[] = [
  {
    id: 'macro-001',
    name: '前进转弯',
    description: '前进2秒后左转',
    steps: [
      { command: { type: 'move', joystickId: 'left', x: 0, y: -0.8, speed: 0.8, priority: 'normal' }, delay: 0, duration: 2000 },
      { command: { type: 'move', joystickId: 'left', x: -0.6, y: 0, speed: 0.6, priority: 'normal' }, delay: 500, duration: 1000 },
      { command: { type: 'stop', joystickId: 'left', x: 0, y: 0, speed: 0, priority: 'normal' }, delay: 0, duration: 0 },
    ],
    totalDuration: 3500,
    createdAt: '2024-01-10T00:00:00Z',
    updatedAt: '2024-01-10T00:00:00Z',
  },
  {
    id: 'macro-002',
    name: '原地旋转',
    description: '360度旋转扫描',
    steps: [
      { command: { type: 'move', joystickId: 'left', x: 1, y: 0, speed: 1, priority: 'high' }, delay: 0, duration: 3000 },
      { command: { type: 'stop', joystickId: 'left', x: 0, y: 0, speed: 0, priority: 'normal' }, delay: 0, duration: 0 },
    ],
    totalDuration: 3000,
    createdAt: '2024-01-12T00:00:00Z',
    updatedAt: '2024-01-12T00:00:00Z',
  },
];

interface AppState {
  webRTC: WebRTCState;
  joystick: JoystickState;
  robotStatus: RobotStatus;
  forceFeedback: ForceFeedback;
  user: { id: number | null; username: string; role: string } | null;
  isDarkMode: boolean;
  currentRobot: Robot | null;
  robots: Robot[];
  macros: Macro[];
  macroRecording: MacroRecordingState;
  macroPlayback: MacroPlaybackState;
  videoRecording: RecordingState;
  
  setWebRTCState: (state: Partial<WebRTCState>) => void;
  setJoystickState: (side: 'left' | 'right', x: number, y: number) => void;
  setRobotStatus: (status: Partial<RobotStatus>) => void;
  setForceFeedback: (feedback: ForceFeedback) => void;
  setUser: (user: { id: number; username: string; role: string } | null) => void;
  toggleDarkMode: () => void;
  sendCommand: (command: ControlCommand) => void;
  dataChannel: RTCDataChannel | null;
  setDataChannel: (channel: RTCDataChannel | null) => void;
  
  setCurrentRobot: (robot: Robot | null) => void;
  addRobot: (robot: Omit<Robot, 'id' | 'createdAt'>) => void;
  removeRobot: (id: string) => void;
  
  startMacroRecording: () => void;
  stopMacroRecording: () => Macro | null;
  recordMacroStep: (command: ControlCommand, duration: number) => void;
  saveMacro: (name: string, description?: string) => Macro | null;
  deleteMacro: (id: string) => void;
  
  startMacroPlayback: (macroId: string) => void;
  stopMacroPlayback: () => void;
  pauseMacroPlayback: () => void;
  resumeMacroPlayback: () => void;
  
  startVideoRecording: () => void;
  stopVideoRecording: () => void;
  setVideoRecordingDuration: (duration: number) => void;
}

export const useStore = create<AppState>((set, get) => ({
  webRTC: {
    isConnected: false,
    connectionStatus: 'idle',
    latency: 0,
    dataChannelReady: false,
  },
  joystick: {
    left: { x: 0, y: 0 },
    right: { x: 0, y: 0 },
  },
  robotStatus: {
    battery: 100,
    distance: 100,
    temperature: 25,
    signalStrength: 100,
  },
  forceFeedback: {
    resistance: 0,
    direction: { x: 0, y: 0 },
    warning: 'none',
  },
  user: null,
  isDarkMode: true,
  dataChannel: null,
  
  currentRobot: defaultRobots[0],
  robots: defaultRobots,
  macros: defaultMacros,
  macroRecording: {
    isRecording: false,
    startTime: 0,
    steps: [],
    lastCommandTime: 0,
  },
  macroPlayback: {
    isPlaying: false,
    isPaused: false,
    currentStep: 0,
    macroId: null,
    startTime: 0,
  },
  videoRecording: {
    isRecording: false,
    startTime: 0,
    duration: 0,
  },

  setWebRTCState: (state) => set((prev) => ({ webRTC: { ...prev.webRTC, ...state } })),
  setJoystickState: (side, x, y) => set((prev) => ({
    joystick: { ...prev.joystick, [side]: { x, y } }
  })),
  setRobotStatus: (status) => set((prev) => ({
    robotStatus: { ...prev.robotStatus, ...status }
  })),
  setForceFeedback: (feedback) => set({ forceFeedback: feedback }),
  setUser: (user) => set({ user }),
  toggleDarkMode: () => set((prev) => ({ isDarkMode: !prev.isDarkMode })),
  setDataChannel: (channel) => set({ dataChannel: channel }),

  sendCommand: (command: ControlCommand) => {
    const { dataChannel, macroRecording, recordMacroStep } = get();
    if (dataChannel && dataChannel.readyState === 'open') {
      dataChannel.send(JSON.stringify({ type: 'command', command }));
    }
    if (macroRecording.isRecording) {
      const now = Date.now();
      const duration = macroRecording.lastCommandTime > 0 
        ? now - macroRecording.lastCommandTime 
        : 100;
      recordMacroStep(command, duration);
    }
  },

  setCurrentRobot: (robot) => set({ currentRobot: robot }),
  addRobot: (robotData) => set((prev) => ({
    robots: [...prev.robots, {
      ...robotData,
      id: `robot-${Date.now()}`,
      createdAt: new Date().toISOString(),
    }]
  })),
  removeRobot: (id) => set((prev) => ({
    robots: prev.robots.filter(r => r.id !== id),
    currentRobot: prev.currentRobot?.id === id ? null : prev.currentRobot,
  })),

  startMacroRecording: () => set({
    macroRecording: {
      isRecording: true,
      startTime: Date.now(),
      steps: [],
      lastCommandTime: Date.now(),
    }
  }),
  
  stopMacroRecording: () => {
    const { macroRecording } = get();
    const steps = macroRecording.steps;
    set({
      macroRecording: {
        isRecording: false,
        startTime: 0,
        steps: [],
        lastCommandTime: 0,
      }
    });
    if (steps.length > 0) {
      const totalDuration = steps.reduce((sum, step) => sum + step.delay + step.duration, 0);
      return {
        id: `macro-temp-${Date.now()}`,
        name: '未命名宏',
        steps,
        totalDuration,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return null;
  },
  
  recordMacroStep: (command, duration) => set((prev) => {
    const now = Date.now();
    const lastTime = prev.macroRecording.lastCommandTime;
    const delay = lastTime > 0 ? now - lastTime - duration : 0;
    
    const step: MacroStep = {
      command: {
        type: command.type,
        joystickId: command.joystickId,
        x: command.x,
        y: command.y,
        speed: command.speed,
        priority: command.priority,
      },
      delay: Math.max(0, delay),
      duration,
    };
    
    return {
      macroRecording: {
        ...prev.macroRecording,
        steps: [...prev.macroRecording.steps, step],
        lastCommandTime: now,
      }
    };
  }),
  
  saveMacro: (name, description) => {
    const { macroRecording } = get();
    if (macroRecording.steps.length === 0) return null;
    
    const totalDuration = macroRecording.steps.reduce((sum, step) => sum + step.delay + step.duration, 0);
    const newMacro: Macro = {
      id: `macro-${Date.now()}`,
      name,
      description,
      steps: [...macroRecording.steps],
      totalDuration,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    set((prev) => ({
      macros: [...prev.macros, newMacro],
      macroRecording: {
        isRecording: false,
        startTime: 0,
        steps: [],
        lastCommandTime: 0,
      }
    }));
    
    return newMacro;
  },
  
  deleteMacro: (id) => set((prev) => ({
    macros: prev.macros.filter(m => m.id !== id),
  })),

  startMacroPlayback: (macroId) => set({
    macroPlayback: {
      isPlaying: true,
      isPaused: false,
      currentStep: 0,
      macroId,
      startTime: Date.now(),
    }
  }),
  
  stopMacroPlayback: () => set({
    macroPlayback: {
      isPlaying: false,
      isPaused: false,
      currentStep: 0,
      macroId: null,
      startTime: 0,
    }
  }),
  
  pauseMacroPlayback: () => set((prev) => ({
    macroPlayback: { ...prev.macroPlayback, isPaused: true }
  })),
  
  resumeMacroPlayback: () => set((prev) => ({
    macroPlayback: { ...prev.macroPlayback, isPaused: false }
  })),

  startVideoRecording: () => set({
    videoRecording: {
      isRecording: true,
      startTime: Date.now(),
      duration: 0,
    }
  }),
  
  stopVideoRecording: () => set({
    videoRecording: {
      isRecording: false,
      startTime: 0,
      duration: 0,
    }
  }),
  
  setVideoRecordingDuration: (duration) => set((prev) => ({
    videoRecording: { ...prev.videoRecording, duration }
  })),
}));
