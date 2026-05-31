import { FilterConfig } from '@/types';

export function parseCommandArgs(command: string, inputFileName: string): string[] {
  const args: string[] = [];
  const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  
  let skipNext = false;
  for (let i = 0; i < parts.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    
    let part = parts[i].replace(/^"|"$/g, '');
    
    if (part === '-i') {
      args.push('-i');
      args.push(inputFileName);
      skipNext = true;
    } else if (part.startsWith('input.')) {
      args.push(inputFileName);
    } else if (part.startsWith('output.')) {
      args.push(part);
    } else {
      args.push(part);
    }
  }
  
  return args;
}

export function getOutputFileName(command: string, defaultExt: string = '.mp4'): string {
  const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i].replace(/^"|"$/g, '');
    if (part.startsWith('output.') || (part.includes('.') && !part.startsWith('-') && !part.startsWith('input.'))) {
      if (part.startsWith('output.')) {
        return part;
      }
      const ext = part.split('.').pop();
      if (ext && ext.length <= 4 && /^[a-zA-Z0-9]+$/.test(ext)) {
        return `output.${ext}`;
      }
    }
  }
  
  return `output${defaultExt}`;
}

export function buildFilterString(config: FilterConfig): string {
  const filters: string[] = [];
  
  if (config.scale.enabled) {
    const { width, height, keepAspect } = config.scale;
    if (keepAspect) {
      filters.push(`scale=${width}:-2`);
    } else {
      filters.push(`scale=${width}:${height}`);
    }
  }
  
  if (config.crop.enabled) {
    const { width, height, x, y } = config.crop;
    filters.push(`crop=${width}:${height}:${x}:${y}`);
  }
  
  return filters.join(',');
}

export function injectFilterToCommand(command: string, filterString: string): string {
  if (!filterString) return command;
  
  if (command.includes('-vf')) {
    return command.replace(/-vf\s+"([^"]*)"/, `-vf "${filterString},$1"`);
  }
  
  const outputMatch = command.match(/\s+output\.\w+$/);
  if (outputMatch) {
    return command.replace(/(\s+output\.\w+)$/, ` -vf "${filterString}"$1`);
  }
  
  return `${command} -vf "${filterString}"`;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
