import React from 'react';
import { Detection } from '../types';
import { Car, Person, Target, Trash2 } from 'lucide-react';

interface DetectionListProps {
  detections: Detection[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

const DetectionList: React.FC<DetectionListProps> = ({ detections, selectedId, onSelect }) => {
  const getClassIcon = (className: string) => {
    if (className === 'Car') {
      return <Car className="w-4 h-4 text-green-400" />;
    }
    return <Person className="w-4 h-4 text-amber-400" />;
  };

  const getClassColor = (className: string) => {
    if (className === 'Car') {
      return 'bg-green-500/20 border-green-500/50';
    }
    return 'bg-amber-500/20 border-amber-500/50';
  };

  if (detections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <Target className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-sm">暂无检测结果</p>
        <p className="text-xs mt-1">上传点云文件后运行检测</p>
      </div>
    );
  }

  const carCount = detections.filter(d => d.class_name === 'Car').length;
  const pedestrianCount = detections.filter(d => d.class_name === 'Pedestrian').length;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-border">
          <Car className="w-3.5 h-3.5 text-green-400" />
          <span>车辆: {carCount}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-border">
          <Person className="w-3.5 h-3.5 text-amber-400" />
          <span>行人: {pedestrianCount}</span>
        </div>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {detections.map((det, index) => (
          <div
            key={det.id}
            onClick={() => onSelect(selectedId === det.id ? null : det.id)}
            className={`p-3 rounded-lg cursor-pointer transition-all border ${
              selectedId === det.id
                ? 'bg-accent-blue/20 border-accent-blue/50'
                : `${getClassColor(det.class_name)} border hover:border-opacity-80`
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {getClassIcon(det.class_name)}
                <span className="font-medium text-sm">{det.class_name}</span>
                <span className="text-xs text-gray-400">#{index + 1}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className={`px-2 py-0.5 rounded text-xs font-mono ${
                  det.confidence > 0.8 ? 'bg-green-500/20 text-green-400' :
                  det.confidence > 0.5 ? 'bg-amber-500/20 text-amber-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {(det.confidence * 100).toFixed(1)}%
                </div>
              </div>
            </div>
            
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400 font-mono">
              <div>位置: ({det.x.toFixed(2)}, {det.y.toFixed(2)}, {det.z.toFixed(2)})</div>
              <div>尺寸: {det.w.toFixed(2)} × {det.h.toFixed(2)} × {det.l.toFixed(2)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DetectionList;
