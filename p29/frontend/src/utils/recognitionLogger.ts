import { RecognitionResult, FaceOrientation } from '../types';

export interface RecognitionLogEntry {
  id: string;
  timestamp: number;
  consonant: string;
  confidence: number;
  orientation?: {
    yaw: number;
    pitch: number;
    roll: number;
    isFrontal: boolean;
  };
  imageQuality?: {
    brightness: number;
    noiseLevel: number;
  };
  frameCount?: number;
  source?: string;
}

export interface RecognitionSession {
  id: string;
  startTime: number;
  endTime: number;
  entries: RecognitionLogEntry[];
  totalRecognitions: number;
  averageConfidence: number;
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'txt';
  includeImageData?: boolean;
  includeQualityMetrics?: boolean;
}

export class RecognitionLogger {
  private currentSession: RecognitionSession | null = null;
  private maxEntries: number = 10000;
  private sessionHistory: RecognitionSession[] = [];

  constructor() {
    this.loadSessionHistory();
  }

  startSession(): void {
    if (this.currentSession) {
      this.endSession();
    }

    this.currentSession = {
      id: `session_${Date.now()}`,
      startTime: Date.now(),
      endTime: 0,
      entries: [],
      totalRecognitions: 0,
      averageConfidence: 0
    };
  }

  logRecognition(
    result: RecognitionResult,
    orientation?: FaceOrientation,
    imageQuality?: { brightness: number; noiseLevel: number },
    frameCount?: number,
    source?: string
  ): void {
    if (!this.currentSession) return;

    const entry: RecognitionLogEntry = {
      id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: result.timestamp || Date.now(),
      consonant: result.consonant,
      confidence: result.confidence,
      orientation: orientation ? {
        yaw: orientation.yaw,
        pitch: orientation.pitch,
        roll: orientation.roll,
        isFrontal: orientation.isFrontal
      } : undefined,
      imageQuality,
      frameCount,
      source
    };

    this.currentSession.entries.push(entry);
    this.currentSession.totalRecognitions++;

    const totalConfidence = this.currentSession.entries.reduce(
      (sum, e) => sum + e.confidence, 0
    );
    this.currentSession.averageConfidence = totalConfidence / this.currentSession.entries.length;

    if (this.currentSession.entries.length > this.maxEntries) {
      this.currentSession.entries = this.currentSession.entries.slice(-this.maxEntries);
    }
  }

  endSession(): RecognitionSession | null {
    if (!this.currentSession) return null;

    this.currentSession.endTime = Date.now();
    const completedSession = { ...this.currentSession };
    
    this.sessionHistory.push(completedSession);
    this.saveSessionHistory();
    
    this.currentSession = null;
    return completedSession;
  }

  getCurrentSession(): RecognitionSession | null {
    return this.currentSession;
  }

  getSessionHistory(): RecognitionSession[] {
    return this.sessionHistory;
  }

  getSessionById(id: string): RecognitionSession | undefined {
    return this.sessionHistory.find(s => s.id === id);
  }

  exportSession(sessionId: string, options: ExportOptions): string | null {
    const session = this.getSessionById(sessionId);
    if (!session) return null;

    switch (options.format) {
      case 'json':
        return this.exportToJSON(session, options);
      case 'csv':
        return this.exportToCSV(session, options);
      case 'txt':
        return this.exportToTXT(session, options);
      default:
        return null;
    }
  }

  private exportToJSON(session: RecognitionSession, options: ExportOptions): string {
    const data: any = {
      sessionId: session.id,
      startTime: new Date(session.startTime).toISOString(),
      endTime: new Date(session.endTime).toISOString(),
      duration: (session.endTime - session.startTime) / 1000,
      totalRecognitions: session.totalRecognitions,
      averageConfidence: session.averageConfidence,
      entries: session.entries.map(e => ({
        timestamp: new Date(e.timestamp).toISOString(),
        consonant: e.consonant,
        confidence: e.confidence,
        ...(options.includeQualityMetrics && e.orientation ? { orientation: e.orientation } : {}),
        ...(options.includeQualityMetrics && e.imageQuality ? { imageQuality: e.imageQuality } : {}),
        ...(e.frameCount ? { frameCount: e.frameCount } : {}),
        ...(e.source ? { source: e.source } : {})
      }))
    };

    return JSON.stringify(data, null, 2);
  }

  private exportToCSV(session: RecognitionSession, options: ExportOptions): string {
    const headers = ['Timestamp', 'Consonant', 'Confidence'];
    
    if (options.includeQualityMetrics) {
      headers.push('Yaw', 'Pitch', 'Roll', 'IsFrontal', 'Brightness', 'NoiseLevel');
    }

    const rows = session.entries.map(e => {
      const row = [
        new Date(e.timestamp).toISOString(),
        e.consonant,
        e.confidence.toFixed(4)
      ];

      if (options.includeQualityMetrics) {
        row.push(
          e.orientation?.yaw.toFixed(2) || '',
          e.orientation?.pitch.toFixed(2) || '',
          e.orientation?.roll.toFixed(2) || '',
          e.orientation?.isFrontal ? 'Yes' : 'No' || '',
          e.imageQuality?.brightness.toFixed(1) || '',
          e.imageQuality?.noiseLevel.toFixed(2) || ''
        );
      }

      return row.join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  private exportToTXT(session: RecognitionSession, options: ExportOptions): string {
    let txt = `=== 识别日志 ===\n`;
    txt += `会话ID: ${session.id}\n`;
    txt += `开始时间: ${new Date(session.startTime).toLocaleString()}\n`;
    txt += `结束时间: ${new Date(session.endTime).toLocaleString()}\n`;
    txt += `持续时间: ${((session.endTime - session.startTime) / 1000).toFixed(1)}秒\n`;
    txt += `总识别次数: ${session.totalRecognitions}\n`;
    txt += `平均置信度: ${(session.averageConfidence * 100).toFixed(1)}%\n`;
    txt += `\n--- 识别结果 ---\n\n`;

    for (const entry of session.entries) {
      txt += `[${new Date(entry.timestamp).toLocaleTimeString()}] `;
      txt += `${entry.consonant.toUpperCase()} (${(entry.confidence * 100).toFixed(0)}%)`;
      
      if (options.includeQualityMetrics && entry.orientation) {
        txt += ` | 朝向: ${entry.orientation.isFrontal ? '正面' : '侧面'}`;
      }
      
      txt += '\n';
    }

    return txt;
  }

  downloadExport(sessionId: string, options: ExportOptions, filename?: string): void {
    const content = this.exportSession(sessionId, options);
    if (!content) return;

    const extensions: Record<string, string> = {
      json: 'json',
      csv: 'csv',
      txt: 'txt'
    };

    const actualFilename = filename || `lip_reading_log_${sessionId}.${extensions[options.format]}`;
    const mimeTypes: Record<string, string> = {
      json: 'application/json',
      csv: 'text/csv',
      txt: 'text/plain'
    };

    const blob = new Blob([content], { type: mimeTypes[options.format] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = actualFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  getConsonantStats(sessionId: string): Map<string, { count: number; avgConfidence: number }> {
    const session = this.getSessionById(sessionId);
    if (!session) return new Map();

    const stats = new Map<string, { count: number; totalConfidence: number }>();

    for (const entry of session.entries) {
      const existing = stats.get(entry.consonant) || { count: 0, totalConfidence: 0 };
      existing.count++;
      existing.totalConfidence += entry.confidence;
      stats.set(entry.consonant, existing);
    }

    const result = new Map<string, { count: number; avgConfidence: number }>();
    for (const [consonant, data] of stats) {
      result.set(consonant, {
        count: data.count,
        avgConfidence: data.totalConfidence / data.count
      });
    }

    return result;
  }

  private saveSessionHistory(): void {
    try {
      const history = this.sessionHistory.slice(-10);
      const data = history.map(s => ({
        ...s,
        entries: s.entries.slice(-100)
      }));
      localStorage.setItem('recognition_history', JSON.stringify(data));
    } catch (e) {
      console.error('Error saving session history:', e);
    }
  }

  private loadSessionHistory(): void {
    try {
      const saved = localStorage.getItem('recognition_history');
      if (saved) {
        this.sessionHistory = JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading session history:', e);
    }
  }

  clearHistory(): void {
    this.sessionHistory = [];
    localStorage.removeItem('recognition_history');
  }
}

export const recognitionLogger = new RecognitionLogger();
