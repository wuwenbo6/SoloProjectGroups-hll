export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatEnergy(wattHours: number): string {
  if (wattHours >= 1000) {
    return `${(wattHours / 1000).toFixed(2)} kWh`;
  }
  return `${wattHours} Wh`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  }
  if (minutes > 0) {
    return `${minutes}分钟${secs}秒`;
  }
  return `${secs}秒`;
}

export function formatCurrency(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

export function formatPower(watts: number): string {
  if (watts >= 1000) {
    return `${(watts / 1000).toFixed(1)} kW`;
  }
  return `${watts} W`;
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    available: '空闲',
    charging: '充电中',
    offline: '离线',
    faulted: '故障',
    active: '进行中',
    completed: '已完成',
    stopped: '已停止'
  };
  return labels[status] || status;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    available: 'bg-emerald-500',
    charging: 'bg-orange-500',
    offline: 'bg-gray-400',
    faulted: 'bg-red-500',
    active: 'bg-orange-500',
    completed: 'bg-emerald-500',
    stopped: 'bg-gray-400'
  };
  return colors[status] || 'bg-gray-400';
}

export function getStatusTextColor(status: string): string {
  const colors: Record<string, string> = {
    available: 'text-emerald-600',
    charging: 'text-orange-600',
    offline: 'text-gray-500',
    faulted: 'text-red-600',
    active: 'text-orange-600',
    completed: 'text-emerald-600',
    stopped: 'text-gray-500'
  };
  return colors[status] || 'text-gray-500';
}

export function getStatusBgColor(status: string): string {
  const colors: Record<string, string> = {
    available: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    charging: 'bg-orange-50 text-orange-700 ring-orange-600/20',
    offline: 'bg-gray-50 text-gray-700 ring-gray-600/20',
    faulted: 'bg-red-50 text-red-700 ring-red-600/20',
    active: 'bg-orange-50 text-orange-700 ring-orange-600/20',
    completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    stopped: 'bg-gray-50 text-gray-700 ring-gray-600/20'
  };
  return colors[status] || 'bg-gray-50 text-gray-700 ring-gray-600/20';
}
