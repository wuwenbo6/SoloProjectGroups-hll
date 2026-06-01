import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Network } from 'lucide-react';

interface SwitchNodeData {
  label: string;
  nodeType: 'switch' | 'host';
  ip?: string;
}

const SwitchNode: React.FC<NodeProps<SwitchNodeData>> = ({ data, selected }) => {
  return (
    <div
      className={`relative px-4 py-3 rounded-xl shadow-lg transition-all duration-200 ${
        selected
          ? 'ring-2 ring-blue-500 ring-offset-2 bg-gradient-to-br from-blue-600 to-blue-700'
          : 'bg-gradient-to-br from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600'
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

      <div className="flex flex-col items-center gap-1 min-w-[80px]">
        <Network className="w-8 h-8 text-white" />
        <span className="text-white text-sm font-semibold">{data.label}</span>
      </div>
    </div>
  );
};

export default SwitchNode;
