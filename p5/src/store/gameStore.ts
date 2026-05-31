import { create } from 'zustand';

export type StoneColor = 'black' | 'white' | null;
export type GameMode = 'pvp' | 'ai';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Move {
  x: number;
  y: number;
  color: 'black' | 'white';
  captured?: Array<{ x: number; y: number }>;
  pass?: boolean;
  winRate?: number;
}

export interface TopMove {
  x: number;
  y: number;
  winRate: number;
  visits: number;
}

export interface Analysis {
  winRate: number;
  scoreLead: number;
  topMoves: TopMove[];
}

export interface GameState {
  board: StoneColor[][];
  currentPlayer: 'black' | 'white';
  moveHistory: Move[];
  captures: { black: number; white: number };
  gameOver: boolean;
  boardSize: number;
}

interface GameStore {
  gameMode: GameMode;
  difficulty: Difficulty;
  boardSize: number;
  gameState: GameState | null;
  analysis: Analysis | null;
  winRateHistory: { move: number; winRate: number }[];
  isConnected: boolean;
  isThinking: boolean;
  voiceEnabled: boolean;
  showHeatmap: boolean;
  heatmapData: number[][] | null;
  setGameMode: (mode: GameMode) => void;
  setDifficulty: (diff: Difficulty) => void;
  setBoardSize: (size: number) => void;
  setGameState: (state: GameState) => void;
  setAnalysis: (analysis: Analysis | null) => void;
  setIsConnected: (connected: boolean) => void;
  setIsThinking: (thinking: boolean) => void;
  toggleVoice: () => void;
  setShowHeatmap: (show: boolean) => void;
  setHeatmapData: (data: number[][] | null) => void;
  resetAnalysis: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameMode: 'ai',
  difficulty: 'medium',
  boardSize: 19,
  gameState: null,
  analysis: null,
  winRateHistory: [],
  isConnected: false,
  isThinking: false,
  voiceEnabled: true,
  showHeatmap: false,
  heatmapData: null,
  setGameMode: (mode) => set({ gameMode: mode }),
  setDifficulty: (diff) => set({ difficulty: diff }),
  setBoardSize: (size) => set({ boardSize: size }),
  setGameState: (state) => set({ gameState: state }),
  setAnalysis: (analysis) =>
    set((s) => ({
      analysis,
      winRateHistory: analysis
        ? [...s.winRateHistory, { move: s.winRateHistory.length + 1, winRate: analysis.winRate }]
        : s.winRateHistory,
    })),
  setIsConnected: (connected) => set({ isConnected: connected }),
  setIsThinking: (thinking) => set({ isThinking: thinking }),
  toggleVoice: () => set((s) => ({ voiceEnabled: !s.voiceEnabled })),
  setShowHeatmap: (show) => set({ showHeatmap: show }),
  setHeatmapData: (data) => set({ heatmapData: data }),
  resetAnalysis: () => set({ analysis: null, winRateHistory: [] }),
}));
