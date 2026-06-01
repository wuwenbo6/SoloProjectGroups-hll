export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

export function formatDate(date: Date): string {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function getPacketTypeColor(type: number): string {
  switch (type) {
    case 1:
      return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
    case 2:
      return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    case 7:
      return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
  }
}

export function getPacketTypeBgColor(type: number): string {
  switch (type) {
    case 1:
      return 'bg-purple-500';
    case 2:
      return 'bg-blue-500';
    case 7:
      return 'bg-orange-500';
    default:
      return 'bg-gray-500';
  }
}

export function hexToAscii(hex: string, maxLength: number = 64): string {
  let ascii = '';
  for (let i = 0; i < Math.min(hex.length, maxLength * 2); i += 2) {
    const code = parseInt(hex.substr(i, 2), 16);
    if (code >= 32 && code <= 126) {
      ascii += String.fromCharCode(code);
    } else {
      ascii += '.';
    }
  }
  return ascii;
}
