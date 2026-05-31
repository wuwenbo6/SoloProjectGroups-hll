export interface ControlCommand {
  type: 'move' | 'stop' | 'custom';
  joystickId: 'left' | 'right';
  x: number;
  y: number;
  speed: number;
  timestamp: number;
  sequence: number;
  priority: 'low' | 'normal' | 'high';
}

export interface SensorData {
  type: 'distance' | 'force' | 'status';
  distance?: number;
  angle?: number;
  battery?: number;
  timestamp: number;
  sequence: number;
}

export interface ForceFeedback {
  resistance: number;
  direction: { x: number; y: number };
  warning: 'none' | 'caution' | 'danger';
}

export interface LogEntry {
  id: number;
  userId: number;
  action: string;
  commandJson?: string;
  ipAddress?: string;
  timestamp: string;
}

export interface LogQuery {
  page?: number;
  limit?: number;
  userId?: number;
  startDate?: string;
  endDate?: string;
}

export interface LogResponse {
  data: LogEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface SystemConfig {
  id: number;
  configKey: string;
  configValue: string;
  updatedAt: string;
}

export interface WebRTCState {
  isConnected: boolean;
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
  latency: number;
  dataChannelReady: boolean;
}

export interface JoystickState {
  left: { x: number; y: number };
  right: { x: number; y: number };
}

export interface RobotStatus {
  battery: number;
  distance: number;
  temperature: number;
  signalStrength: number;
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'candidate' | 'join' | 'leave';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  roomId?: string;
  userId?: string;
}

export interface TimedSensorData {
  value: number;
  timestamp: number;
}

export interface Robot {
  id: string;
  name: string;
  type: 'ground' | 'drone' | 'arm' | 'custom';
  ip: string;
  port: number;
  status: 'online' | 'offline' | 'busy';
  description?: string;
  createdAt: string;
  lastConnected?: string;
}

export interface MacroStep {
  command: Omit<ControlCommand, 'sequence' | 'timestamp'>;
  delay: number;
  duration: number;
}

export interface Macro {
  id: string;
  name: string;
  description?: string;
  steps: MacroStep[];
  totalDuration: number;
  createdAt: string;
  updatedAt: string;
  robotId?: string;
}

export interface MacroRecordingState {
  isRecording: boolean;
  startTime: number;
  steps: MacroStep[];
  lastCommandTime: number;
}

export interface MacroPlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentStep: number;
  macroId: string | null;
  startTime: number;
}

export interface RecordingState {
  isRecording: boolean;
  startTime: number;
  duration: number;
}

export interface AppState {
  currentRobot: Robot | null;
  robots: Robot[];
  macros: Macro[];
  macroRecording: MacroRecordingState;
  macroPlayback: MacroPlaybackState;
  videoRecording: RecordingState;
}
