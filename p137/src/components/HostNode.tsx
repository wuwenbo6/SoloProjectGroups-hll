import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Monitor } from 'lucide-react';

interface HostNodeData {
  label: string;
  nodeType: 'switch' | 'host';
  ip?: string;
}

const HostNode: React.FC<NodeProps<HostNodeData>> = ({ data, selected }) => {
  return (
    <div
      className={`relative px-3 py-2 rounded-lg shadow-lg transition-all duration-200 ${
        selected
          ? 'ring-2 ring-emerald-500 ring-offset-2 bg-gradient-to-br from-emerald-500 to-teal-600'
          : 'bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-slate-300 border-2 border-slate-600"
      />
      <Handle
        type="source"
        position={Position.Top}
        className="w-3 h-3 bg-slate-300 border-2 border-slate-600"
      />
      <Handle
        type="target"
        position={Position.Right}
        className="w-3 h-3 bg-slate-300 border-2 border-slate-600"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-slate-300 border-2 border-slate-600"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        className="w-3 h-3 bg-slate-300 border-2 border-slate-600"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-slate-300 border-2 border-slate-600"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-slate-300 border-2 border-slate-600"
      />
      <Handle
        type="source"
        position={Position.Left}
        className="w-3 h-3 bg-slate-300 border-2 border-slate-600"
      />

      <div className="flex flex-col items-center gap-1 min-w-[60px]">
        <Monitor className="w-6 h-6 text-white" />
        <span className="text-white text-xs font-semibold">{data.label}</span>
        {data.ip && (
          <span className="text-emerald-100 text-[10px] font-mono bg-black/20 px-1.5 py-0.5 rounded">
            {data.ip}
          </span>
        )}
      </div>
    </div>
  );
};

export default HostNode;
