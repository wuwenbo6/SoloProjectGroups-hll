export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  if (minutes > 0) {
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }
  return `${seconds}s`;
}

export function formatTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatFrequency(hz: number): string {
  if (Math.abs(hz) < 1000) return `${hz.toFixed(1)} Hz`;
  if (Math.abs(hz) < 1000000) return `${(hz / 1000).toFixed(2)} kHz`;
  return `${(hz / 1000000).toFixed(2)} MHz`;
}

export function formatId(id?: number): string {
  if (id === undefined) return '-';
  return id.toString();
}

export function getQualityColor(score: number): string {
  if (score >= 80) return '#00ff88';
  if (score >= 60) return '#ffd700';
  if (score >= 40) return '#ff6b35';
  return '#ff3366';
}
