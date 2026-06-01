export function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
}

export function formatPower(mw: number): string {
  if (mw >= 1000) {
    return `${(mw / 1000).toFixed(2)} W`;
  }
  return `${mw.toFixed(1)} mW`;
}

export function formatEnergy(energyMs: number): string {
  const wh = energyMs / 3600000000;
  if (wh >= 1) {
    return `${wh.toFixed(2)} Wh`;
  }
  const mwh = energyMs / 3600000;
  if (mwh >= 1) {
    return `${mwh.toFixed(2)} mWh`;
  }
  const uwh = energyMs / 3600;
  return `${uwh.toFixed(2)} µWh`;
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatMAC(mac: string): string {
  return mac;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'awake':
      return 'text-emerald-400';
    case 'sleeping':
      return 'text-slate-400';
    case 'transition':
      return 'text-amber-400';
    case 'negotiating':
      return 'text-cyan-400';
    case 'disconnected':
      return 'text-red-400';
    default:
      return 'text-slate-400';
  }
}

export function getStatusBgColor(status: string): string {
  switch (status) {
    case 'awake':
      return 'bg-emerald-500';
    case 'sleeping':
      return 'bg-slate-500';
    case 'transition':
      return 'bg-amber-500';
    case 'negotiating':
      return 'bg-cyan-500';
    case 'disconnected':
      return 'bg-red-500';
    default:
      return 'bg-slate-500';
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'awake':
      return '唤醒';
    case 'sleeping':
      return '睡眠';
    case 'transition':
      return '切换';
    case 'negotiating':
      return '协商中';
    case 'disconnected':
      return '未连接';
    default:
      return status;
  }
}

export function getSlotColor(type: string, alpha = 1): string {
  switch (type) {
    case 'wake':
      return `rgba(16, 185, 129, ${alpha})`;
    case 'sleep':
      return `rgba(71, 85, 105, ${alpha})`;
    case 'transition':
      return `rgba(245, 158, 11, ${alpha})`;
    default:
      return `rgba(71, 85, 105, ${alpha})`;
  }
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function getLogTypeColor(type: string): string {
  switch (type) {
    case 'request':
      return 'text-cyan-400';
    case 'response':
      return 'text-emerald-400';
    case 'complete':
      return 'text-emerald-500';
    case 'reject':
      return 'text-red-400';
    case 'failed':
      return 'text-red-500';
    case 'adjust':
      return 'text-amber-400';
    default:
      return 'text-slate-400';
  }
}

export function getLogTypeBgColor(type: string): string {
  switch (type) {
    case 'request':
      return 'bg-cyan-500/20';
    case 'response':
      return 'bg-emerald-500/20';
    case 'complete':
      return 'bg-emerald-500/30';
    case 'reject':
      return 'bg-red-500/20';
    case 'failed':
      return 'bg-red-500/30';
    case 'adjust':
      return 'bg-amber-500/20';
    default:
      return 'bg-slate-500/20';
  }
}

export function getLogTypeLabel(type: string): string {
  switch (type) {
    case 'request':
      return '请求';
    case 'response':
      return '响应';
    case 'complete':
      return '完成';
    case 'reject':
      return '拒绝';
    case 'failed':
      return '失败';
    case 'adjust':
      return '调整';
    default:
      return type;
  }
}
