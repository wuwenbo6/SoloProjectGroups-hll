import type { UWBDataPoint } from '../types';

export function parseCSV(content: string): UWBDataPoint[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV 文件内容不足');
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const timestampIdx = headers.indexOf('timestamp');
  const distanceIdx = headers.indexOf('distance');

  if (timestampIdx === -1 || distanceIdx === -1) {
    throw new Error('CSV 必须包含 timestamp 和 distance 列');
  }

  const data: UWBDataPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
    if (values.length >= 2) {
      data.push({
        timestamp: parseInt(values[timestampIdx], 10),
        distance: parseFloat(values[distanceIdx]),
      });
    }
  }

  return data;
}

export function parseJSON(content: string): UWBDataPoint[] {
  const data = JSON.parse(content);
  if (!Array.isArray(data)) {
    throw new Error('JSON 数据格式错误，应为数组');
  }
  return data.map((item) => ({
    timestamp: Number(item.timestamp),
    distance: Number(item.distance),
  }));
}

export function exportToCSV(data: UWBDataPoint[], filename: string): void {
  const headers = 'timestamp,distance\n';
  const rows = data.map((p) => `${p.timestamp},${p.distance}`).join('\n');
  const csvContent = headers + rows;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
