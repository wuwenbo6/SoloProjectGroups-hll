import React, { useState } from 'react';
import { Bot, Wifi, WifiOff, Settings, ChevronDown, Plus, Trash2, Drone, Camera, Cog } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Robot } from '../types';

const RobotIcon: React.FC<{ type: Robot['type'] }> = ({ type }) => {
  switch (type) {
    case 'drone':
      return <Drone size={18} />;
    case 'arm':
      return <Cog size={18} />;
    case 'ground':
    default:
      return <Bot size={18} />;
  }
};

export const RobotSelector: React.FC = () => {
  const { currentRobot, robots, setCurrentRobot, addRobot, removeRobot } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRobot, setNewRobot] = useState({
    name: '',
    type: 'ground' as Robot['type'],
    ip: '',
    port: 5000,
    description: '',
    status: 'offline' as Robot['status'],
  });

  const handleSelectRobot = (robot: Robot) => {
    if (robot.status === 'offline') {
      return;
    }
    setCurrentRobot(robot);
    setIsOpen(false);
  };

  const handleAddRobot = () => {
    if (newRobot.name && newRobot.ip) {
      addRobot(newRobot);
      setShowAddModal(false);
      setNewRobot({
        name: '',
        type: 'ground',
        ip: '',
        port: 5000,
        description: '',
        status: 'offline',
      });
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 bg-[#0a1628]/80 rounded-lg border border-cyan-500/20 hover:border-cyan-500/40 transition-all"
      >
        {currentRobot && (
          <>
            <div className={`p-1.5 rounded ${currentRobot.status === 'online' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
              <RobotIcon type={currentRobot.type} />
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-white">{currentRobot.name}</div>
              <div className="text-xs text-white/50 font-mono">{currentRobot.ip}:{currentRobot.port}</div>
            </div>
          </>
        )}
        <ChevronDown size={16} className={`text-cyan-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 w-72 bg-[#0a1628] rounded-lg border border-cyan-500/20 shadow-xl z-50 overflow-hidden">
          <div className="p-2 max-h-64 overflow-y-auto">
            {robots.map((robot) => (
              <div
                key={robot.id}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                  currentRobot?.id === robot.id
                    ? 'bg-cyan-500/20 border border-cyan-500/40'
                    : robot.status === 'offline'
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-white/5'
                }`}
                onClick={() => handleSelectRobot(robot)}
              >
                <div className={`p-1.5 rounded ${robot.status === 'online' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                  <RobotIcon type={robot.type} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">{robot.name}</div>
                  <div className="text-xs text-white/50">{robot.description}</div>
                </div>
                <div className="flex items-center gap-2">
                  {robot.status === 'online' ? (
                    <Wifi size={14} className="text-green-400" />
                  ) : (
                    <WifiOff size={14} className="text-gray-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <div className="border-t border-cyan-500/10 p-2">
            <button
              onClick={() => { setShowAddModal(true); setIsOpen(false); }}
              className="w-full flex items-center justify-center gap-2 p-2 text-sm text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-all"
            >
              <Plus size={16} />
              添加机器人
            </button>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="bg-[#0a1628] rounded-lg border border-cyan-500/20 p-6 w-96" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-cyan-400 mb-4">添加新机器人</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/60 mb-1">机器人名称</label>
                <input
                  type="text"
                  value={newRobot.name}
                  onChange={(e) => setNewRobot({ ...newRobot, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#1a3a5c]/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-cyan-500/50"
                  placeholder="例如：探索者二号"
                />
              </div>
              
              <div>
                <label className="block text-xs text-white/60 mb-1">类型</label>
                <select
                  value={newRobot.type}
                  onChange={(e) => setNewRobot({ ...newRobot, type: e.target.value as Robot['type'] })}
                  className="w-full px-3 py-2 bg-[#1a3a5c]/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="ground">地面机器人</option>
                  <option value="drone">无人机</option>
                  <option value="arm">机械臂</option>
                  <option value="custom">自定义</option>
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/60 mb-1">IP地址</label>
                  <input
                    type="text"
                    value={newRobot.ip}
                    onChange={(e) => setNewRobot({ ...newRobot, ip: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1a3a5c]/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-cyan-500/50"
                    placeholder="192.168.1.100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">端口</label>
                  <input
                    type="number"
                    value={newRobot.port}
                    onChange={(e) => setNewRobot({ ...newRobot, port: parseInt(e.target.value) || 5000 })}
                    className="w-full px-3 py-2 bg-[#1a3a5c]/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs text-white/60 mb-1">描述</label>
                <input
                  type="text"
                  value={newRobot.description}
                  onChange={(e) => setNewRobot({ ...newRobot, description: e.target.value })}
                  className="w-full px-3 py-2 bg-[#1a3a5c]/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-cyan-500/50"
                  placeholder="可选描述"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10 transition-all text-sm"
              >
                取消
              </button>
              <button
                onClick={handleAddRobot}
                className="flex-1 px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg border border-cyan-500/30 hover:bg-cyan-500/30 transition-all text-sm"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
