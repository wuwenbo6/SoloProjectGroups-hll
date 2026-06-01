import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Eye, Link as LinkIcon, Unlink, Search } from 'lucide-react';
import { api } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import type { VTPM, VirtualMachine } from '../../shared/types';

export function VTPMList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedVTPM, setSelectedVTPM] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [selectedVM, setSelectedVM] = useState('');

  const queryClient = useQueryClient();

  const { data: vtpms = [] } = useQuery({
    queryKey: ['vtpms'],
    queryFn: api.getVTPMs,
  });

  const { data: vms = [] } = useQuery({
    queryKey: ['vms'],
    queryFn: api.getVMs,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createVTPM(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vtpms'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setShowCreateModal(false);
      setNewName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteVTPM,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vtpms'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, vmId }: { id: string; vmId: string }) => api.assignVTPM(id, vmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vtpms'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setShowAssignModal(false);
      setSelectedVTPM(null);
      setSelectedVM('');
    },
  });

  const unassignMutation = useMutation({
    mutationFn: api.unassignVTPM,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vtpms'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  const filteredVTPMs = vtpms.filter((vtpm) =>
    vtpm.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const availableVMs = vms.filter((vm) => !vm.vtpmId);

  const handleCreate = () => {
    if (newName.trim()) {
      createMutation.mutate(newName.trim());
    }
  };

  const handleAssign = () => {
    if (selectedVTPM && selectedVM) {
      assignMutation.mutate({ id: selectedVTPM, vmId: selectedVM });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">vTPM管理</h1>
          <p className="text-dark-400 mt-1">管理所有虚拟TPM设备</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          创建vTPM
        </button>
      </div>

      <div className="bg-dark-800 rounded-xl border border-dark-700">
        <div className="p-4 border-b border-dark-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
            <input
              type="text"
              placeholder="搜索vTPM..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:border-primary-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="px-6 py-4 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">
                  名称
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">
                  关联虚拟机
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">
                  创建时间
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-dark-400 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {filteredVTPMs.map((vtpm, index) => (
                <tr
                  key={vtpm.id}
                  className="hover:bg-dark-700/30 transition-colors"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary-600/20 rounded-lg flex items-center justify-center">
                        <span className="text-primary-400 text-sm font-mono">
                          {vtpm.name.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="text-white font-medium">{vtpm.name}</div>
                        <div className="text-xs text-dark-500 font-mono">{vtpm.id.slice(0, 8)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={vtpm.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {vtpm.vmId ? (
                      <span className="text-dark-300">
                        {vms.find((vm) => vm.id === vtpm.vmId)?.name || vtpm.vmId}
                      </span>
                    ) : (
                      <span className="text-dark-500">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-dark-300">
                    {new Date(vtpm.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/vtpm/${vtpm.id}`}
                        className="p-2 text-dark-400 hover:text-primary-400 hover:bg-primary-600/20 rounded-lg transition-colors"
                        title="查看详情"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      {vtpm.status === 'available' && (
                        <button
                          onClick={() => {
                            setSelectedVTPM(vtpm.id);
                            setShowAssignModal(true);
                          }}
                          className="p-2 text-dark-400 hover:text-success-400 hover:bg-success-600/20 rounded-lg transition-colors"
                          title="分配"
                        >
                          <LinkIcon className="w-4 h-4" />
                        </button>
                      )}
                      {vtpm.status === 'assigned' && (
                        <button
                          onClick={() => unassignMutation.mutate(vtpm.id)}
                          className="p-2 text-dark-400 hover:text-amber-400 hover:bg-amber-600/20 rounded-lg transition-colors"
                          title="撤销分配"
                        >
                          <Unlink className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteMutation.mutate(vtpm.id)}
                        className="p-2 text-dark-400 hover:text-red-400 hover:bg-red-600/20 rounded-lg transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredVTPMs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-dark-500">
                    暂无vTPM设备
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-xl p-6 w-full max-w-md border border-dark-700">
            <h2 className="text-xl font-bold text-white mb-4">创建vTPM</h2>
            <input
              type="text"
              placeholder="输入vTPM名称"
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

      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dark-800 rounded-xl p-6 w-full max-w-md border border-dark-700">
            <h2 className="text-xl font-bold text-white mb-4">分配vTPM</h2>
            <select
              value={selectedVM}
              onChange={(e) => setSelectedVM(e.target.value)}
              className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-primary-500 mb-4"
            >
              <option value="">选择虚拟机</option>
              {availableVMs.map((vm) => (
                <option key={vm.id} value={vm.id}>
                  {vm.name}
                </option>
              ))}
            </select>
            {availableVMs.length === 0 && (
              <p className="text-amber-400 text-sm mb-4">
                没有可用的虚拟机，请先创建虚拟机。
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedVTPM(null);
                  setSelectedVM('');
                }}
                className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAssign}
                disabled={!selectedVM || assignMutation.isPending}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                分配
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
