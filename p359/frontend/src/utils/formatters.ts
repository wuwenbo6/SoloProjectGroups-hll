export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    month: '2-digit',
    day: '2-digit',
  });
}

export function getStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    up: 'text-green-400',
    down: 'text-gray-400',
    fault: 'text-red-400',
    active: 'text-blue-400',
    passive: 'text-amber-400',
    completed: 'text-green-400',
    in_progress: 'text-blue-400',
    idle: 'text-gray-400',
    failed: 'text-red-400',
    info: 'text-blue-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
    discovery: 'text-purple-400',
    pdu: 'text-cyan-400',
    state_change: 'text-emerald-400',
  };
  return colorMap[status] || 'text-gray-400';
}

export function getStatusBgColor(status: string): string {
  const colorMap: Record<string, string> = {
    up: 'bg-green-500/20',
    down: 'bg-gray-500/20',
    fault: 'bg-red-500/20',
    active: 'bg-blue-500/20',
    passive: 'bg-amber-500/20',
    completed: 'bg-green-500/20',
    in_progress: 'bg-blue-500/20',
    idle: 'bg-gray-500/20',
    failed: 'bg-red-500/20',
    info: 'bg-blue-500/20',
    warning: 'bg-amber-500/20',
    error: 'bg-red-500/20',
  };
  return colorMap[status] || 'bg-gray-500/20';
}

export function getStatusBorderColor(status: string): string {
  const colorMap: Record<string, string> = {
    up: 'border-green-500/50',
    down: 'border-gray-500/50',
    fault: 'border-red-500/50',
    active: 'border-blue-500/50',
    passive: 'border-amber-500/50',
    completed: 'border-green-500/50',
    in_progress: 'border-blue-500/50',
    idle: 'border-gray-500/50',
    failed: 'border-red-500/50',
  };
  return colorMap[status] || 'border-gray-500/50';
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export function formatHex(hex: string, bytesPerLine: number = 16): string {
  const bytes = hex.split(' ');
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += bytesPerLine) {
    const offset = (i / bytesPerLine * bytesPerLine).toString(16).padStart(4, '0');
    const hexPart = bytes.slice(i, i + bytesPerLine).join(' ').padEnd(bytesPerLine * 3 - 1, ' ');
    const asciiPart = bytes.slice(i, i + bytesPerLine)
      .map(b => {
        const code = parseInt(b, 16);
        return code >= 32 && code <= 126 ? String.fromCharCode(code) : '.';
      })
      .join('');
    lines.push(`${offset}  ${hexPart}  ${asciiPart}`);
  }
  return lines.join('\n');
}
