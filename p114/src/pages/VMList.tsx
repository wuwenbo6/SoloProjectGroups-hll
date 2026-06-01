import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Server, Shield } from 'lucide-react';
import { api } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';

export function VMList() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');

  const queryClient = useQueryClient();

  const { data: vms = [] } = useQuery({
    queryKey: ['vms'],
    queryFn: api.getVMs,
  });

  const { data: vtpms = [] } = useQuery({
    queryKey: ['vtpms'],
    queryFn: api.getVTPMs,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createVM(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setShowCreateModal(false);
      setNewName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteVM,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  const handleCreate = () => {
    if (newName.trim()) {
      createMutation.mutate(newName.trim());
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">虚拟机管理</h1>
          <p className="text-dark-400 mt-1">管理所有虚拟机</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          创建虚拟机
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {vms.map((vm, index) => (
          <div
            key={vm.id}
            className="bg-dark-800 rounded-xl p-6 border border-dark-700 hover:border-dark-600 transition-all duration-300"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-dark-700 rounded-lg flex items-center justify-center">
                  <Server className="w-6 h-6 text-primary-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">{vm.name}</h3>
                  <StatusBadge status={vm.state} />
                </div>
              </div>
              <button
                onClick={() => deleteMutation.mutate(vm.id)}
                className="p-2 text-dark-400 hover:text-red-400 hover:bg-red-600/20 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-dark-400">UUID</span>
                <span className="text-dark-300 font-mono text-xs">{vm.libvirtUuid?.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">vTPM</span>
                {vm.vtpmId ? (
                  <span className="text-success-400 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    {vtpms.find((v) => v.id === vm.vtpmId)?.name || '已绑定'}
                  </span>
                ) : (
                  <span className="text-dark-500">未绑定</span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">创建时间</span>
                <span className="text-dark-300">
                  {new Date(vm.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        ))}
        {vms.length === 0 && (
          <div className="col-span-full text-center py-12 text-dark-500">
            暂无虚拟机
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-xl p-6 w-full max-w-md border border-dark-700">
            <h2 className="text-xl font-bold text-white mb-4">创建虚拟机</h2>
            <input
              type="text"
              placeholder="输入虚拟机名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:border-primary-500 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || createMutation.isPending}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
