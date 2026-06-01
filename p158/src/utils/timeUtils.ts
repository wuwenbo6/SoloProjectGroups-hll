export function dayOfYearToDate(fullYear: number, dayOfYear: number): { month: number; day: number } {
  const date = new Date(fullYear, 0, dayOfYear);
  return {
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

export function formatTime(hour: number, minute: number, second: number, milliseconds: number = 0): string {
  const h = hour.toString().padStart(2, '0');
  const m = minute.toString().padStart(2, '0');
  const s = second.toString().padStart(2, '0');
  const ms = milliseconds.toString().padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

export function formatDate(fullYear: number, dayOfYear: number): string {
  const { month, day } = dayOfYearToDate(fullYear, dayOfYear);
  return `${fullYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

export function formatFullDateTime(fullYear: number, dayOfYear: number, hour: number, minute: number, second: number): string {
  const { month, day } = dayOfYearToDate(fullYear, dayOfYear);
  return `${fullYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
}

export function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

export function getCurrentSystemTime(): { timestamp: number; dateStr: string; timeStr: string } {
  const now = new Date();
  const timestamp = now.getTime();
  const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return { timestamp, dateStr, timeStr };
}

export function calculateDeviationStats(deviations: number[]): {
  avg: number;
  max: number;
  min: number;
  std: number;
} {
  if (deviations.length === 0) {
    return { avg: 0, max: 0, min: 0, std: 0 };
  }

  const sum = deviations.reduce((a, b) => a + b, 0);
  const avg = sum / deviations.length;
  const max = Math.max(...deviations);
  const min = Math.min(...deviations);

  const squaredDiffs = deviations.map((d) => Math.pow(d - avg, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / deviations.length;
  const std = Math.sqrt(avgSquaredDiff);

  return { avg, max, min, std };
}
