import React from 'react';
import { Network, Monitor, Layers } from 'lucide-react';

const NodePalette: React.FC = () => {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-56 bg-slate-900 border-r border-slate-700 flex flex-col h-full">
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-5 h-5 text-blue-400" />
          <h2 className="text-white font-semibold">组件库</h2>
        </div>
        <p className="text-slate-400 text-xs">拖拽节点到画布</p>
      </div>

      <div className="p-4 space-y-4 flex-1">
        <div className="space-y-2">
          <h3 className="text-slate-400 text-xs font-medium uppercase tracking-wider">
            网络设备
          </h3>

          <div
            className="flex items-center gap-3 p-3 bg-gradient-to-r from-indigo-600/20 to-indigo-700/20 rounded-lg cursor-grab hover:from-indigo-600/30 hover:to-indigo-700/30 transition-all border border-indigo-500/30 active:cursor-grabbing"
            draggable
            onDragStart={(e) => onDragStart(e, 'switchNode')}
          >
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <Network className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-white text-sm font-medium">交换机</div>
              <div className="text-slate-400 text-xs">OpenFlow Switch</div>
            </div>
          </div>

          <div
            className="flex items-center gap-3 p-3 bg-gradient-to-r from-emerald-600/20 to-teal-600/20 rounded-lg cursor-grab hover:from-emerald-600/30 hover:to-teal-600/30 transition-all border border-emerald-500/30 active:cursor-grabbing"
            draggable
            onDragStart={(e) => onDragStart(e, 'hostNode')}
          >
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
              <Monitor className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-white text-sm font-medium">主机</div>
              <div className="text-slate-400 text-xs">终端设备</div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-700">
          <h3 className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
            使用提示
          </h3>
          <ul className="text-slate-500 text-xs space-y-1">
            <li>• 拖拽节点到画布</li>
            <li>• 点击节点选择后按 Delete 删除</li>
            <li>• 拖拽节点连接点创建连线</li>
            <li>• 双击节点编辑名称</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default NodePalette;
