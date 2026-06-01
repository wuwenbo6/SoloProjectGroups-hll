import { Camera, Circle, Radio } from 'lucide-react';
import { cn } from '../lib/utils.js';
import type { Camera as CameraType } from '../../shared/types.js';

interface CameraCardProps {
  camera: CameraType;
  isSelected: boolean;
  isRecording?: boolean;
  onClick: () => void;
}

export function CameraCard({ camera, isSelected, isRecording, onClick }: CameraCardProps) {
  const statusConfig = {
    online: { color: 'text-green-400', bg: 'bg-green-400', label: '在线' },
    offline: { color: 'text-slate-500', bg: 'bg-slate-500', label: '离线' },
    recording: { color: 'text-red-400', bg: 'bg-red-400', label: '录制中' },
  };

  const status = statusConfig[camera.status];

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative bg-slate-800/50 rounded-xl overflow-hidden cursor-pointer transition-all duration-300 border-2',
        isSelected
          ? 'border-cyan-500 shadow-lg shadow-cyan-500/20'
          : 'border-transparent hover:border-slate-700'
      )}
    >
      <div className="aspect-video bg-slate-900 relative">
        <img
          src={`https://picsum.photos/seed/${camera.id}/400/225`}
          alt={camera.name}
          className="w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
        
        {isRecording && (
          <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-red-500 rounded-full">
            <Circle className="w-2 h-2 fill-white animate-pulse" />
            <span className="text-xs font-medium text-white">REC</span>
          </div>
        )}
        
        <div className="absolute top-3 right-3">
          <div className={cn('w-2 h-2 rounded-full', status.bg)} />
        </div>

        <div className="absolute bottom-3 left-3 right-3">
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-cyan-400" />
            <span className="text-white font-medium text-sm truncate">{camera.name}</span>
          </div>
        </div>
      </div>
      
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {camera.type === 'onvif' ? (
            <Radio size={14} className="text-slate-500" />
          ) : (
            <Camera size={14} className="text-slate-500" />
          )}
          <span className="text-xs text-slate-500">
            {camera.type === 'onvif' ? 'ONVIF' : '模拟'}
          </span>
        </div>
        <span className={cn('text-xs font-medium', status.color)}>{status.label}</span>
      </div>
    </div>
  );
}
