import { useState, useEffect } from 'react';
import { Settings, Users, Shield, Key, Plus, Trash2, Edit2, Save, X, Eye, EyeOff } from 'lucide-react';
import { api } from '@/api';
import { useAppStore } from '@/store';
import type { User, AuthPolicy } from '@/types';

export default function ConfigPage() {
  const { sharedSecret, setSharedSecret, users, setUsers, policies, setPolicies } = useAppStore();
  const [activeTab, setActiveTab] = useState<'secret' | 'users' | 'policies'>('secret');
  const [showSecret, setShowSecret] = useState(false);
  const [secretValue, setSecretValue] = useState(sharedSecret);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<AuthPolicy | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const config = await api.getConfig();
      setSharedSecret(config.sharedSecret);
      setSecretValue(config.sharedSecret);
      setUsers(config.users);
      setPolicies(config.policies);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSecret = async () => {
    setSaving(true);
    try {
      await api.updateConfig({ sharedSecret: secretValue });
      setSharedSecret(secretValue);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      if (editingUser.id) {
        await api.updateUser(editingUser.username, editingUser);
      } else {
        await api.createUser(editingUser);
      }
      await loadConfig();
      setEditingUser(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (username: string) => {
    try {
      await api.deleteUser(username);
      await loadConfig();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSavePolicy = async () => {
    if (!editingPolicy) return;
    setSaving(true);
    try {
      if (editingPolicy.id) {
        await api.updatePolicy(editingPolicy.id, editingPolicy);
      } else {
        await api.createPolicy(editingPolicy);
      }
      await loadConfig();
      setEditingPolicy(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePolicy = async (id: string) => {
    try {
      await api.deletePolicy(id);
      await loadConfig();
    } catch (err) {
      console.error(err);
    }
  };

  const tabs = [
    { id: 'secret', label: '共享密钥', icon: Key },
    { id: 'users', label: '用户管理', icon: Users },
    { id: 'policies', label: '授权策略', icon: Shield },
  ] as const;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-gradient-to-br from-emerald-600 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Settings className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">系统配置</h1>
          <p className="text-slate-400 text-sm">管理 TACACS+ 模拟器的配置项</p>
        </div>
      </div>

      <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
        <div className="flex border-b border-slate-800">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {activeTab === 'secret' && (
            <div className="max-w-xl">
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  TACACS+ 共享密钥
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={secretValue}
                      onChange={(e) => setSecretValue(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all font-mono pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      {showSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <button
                    onClick={handleSaveSecret}
                    disabled={saving || secretValue === sharedSecret}
                    className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    保存
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  此密钥用于 TACACS+ 报文的加密和解密，客户端和服务端必须使用相同的密钥
                </p>
              </div>

              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
                <h4 className="text-sm font-medium text-slate-300 mb-2">密钥说明</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  TACACS+ 使用 MD5 算法结合共享密钥生成伪随机流，对报文主体进行 XOR
                  加密。相同的密钥可以确保客户端和服务端能够正确地加密和解密报文内容。
                </p>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-slate-400">管理系统用户账号和权限级别</p>
                <button
                  onClick={() =>
                    setEditingUser({
                      id: '',
                      username: '',
                      password: '',
                      privilegeLevel: 1,
                      createdAt: '',
                    })
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  添加用户
                </button>
              </div>

              {editingUser && (
                <div className="mb-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">用户名</label>
                      <input
                        type="text"
                        value={editingUser.username}
                        onChange={(e) =>
                          setEditingUser({ ...editingUser, username: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">密码</label>
                      <input
                        type="text"
                        value={editingUser.password}
                        onChange={(e) =>
                          setEditingUser({ ...editingUser, password: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">权限级别 (0-15)</label>
                      <input
                        type="number"
                        min="0"
                        max="15"
                        value={editingUser.privilegeLevel}
                        onChange={(e) =>
                          setEditingUser({
                            ...editingUser,
                            privilegeLevel: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveUser}
                      disabled={saving || !editingUser.username || !editingUser.password}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      保存
                    </button>
                    <button
                      onClick={() => setEditingUser(null)}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                      取消
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 uppercase tracking-wider border-b border-slate-700">
                      <th className="pb-3 pr-4">用户名</th>
                      <th className="pb-3 pr-4">密码</th>
                      <th className="pb-3 pr-4">权限级别</th>
                      <th className="pb-3 pr-4">创建时间</th>
                      <th className="pb-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-slate-800/50">
                        <td className="py-3 pr-4 font-mono text-sm text-cyan-400">{user.username}</td>
                        <td className="py-3 pr-4 font-mono text-sm text-slate-400">
                          {'•'.repeat(user.password.length)}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`text-xs px-2 py-1 rounded ${
                              user.privilegeLevel >= 15
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-blue-500/20 text-blue-400'
                            }`}
                          >
                            Level {user.privilegeLevel}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-xs text-slate-500">
                          {new Date(user.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => setEditingUser(user)}
                            className="p-1.5 text-slate-400 hover:text-emerald-400 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.username)}
                            className="p-1.5 text-slate-400 hover:text-red-400 transition-colors ml-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'policies' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-slate-400">管理命令授权策略，支持正则表达式匹配</p>
                <button
                  onClick={() =>
                    setEditingPolicy({
                      id: '',
                      username: 'user',
                      commandPattern: '',
                      argPatterns: [],
                      allowed: true,
                      priority: 10,
                      returnAttrs: {},
                      createdAt: '',
                    })
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  添加策略
                </button>
              </div>

              {editingPolicy && (
                <div className="mb-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">用户名</label>
                      <input
                        type="text"
                        value={editingPolicy.username}
                        onChange={(e) =>
                          setEditingPolicy({ ...editingPolicy, username: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                        placeholder="* 表示所有用户"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">优先级</label>
                      <input
                        type="number"
                        value={editingPolicy.priority}
                        onChange={(e) =>
                          setEditingPolicy({
                            ...editingPolicy,
                            priority: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">命令匹配模式 (正则)</label>
                      <input
                        type="text"
                        value={editingPolicy.commandPattern}
                        onChange={(e) =>
                          setEditingPolicy({ ...editingPolicy, commandPattern: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                        placeholder="例如: ^show.*, ^configure.*, .*"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">命令参数匹配模式 (正则，逗号分隔，可选)</label>
                      <input
                        type="text"
                        value={(editingPolicy.argPatterns || []).join(', ')}
                        onChange={(e) =>
                          setEditingPolicy({
                            ...editingPolicy,
                            argPatterns: e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter((s) => s),
                          })
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                        placeholder="例如: GigabitEthernet, 192\\.168\\.1\\..*"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">返回属性 (key=value，逗号分隔，可选)</label>
                      <input
                        type="text"
                        value={Object.entries(editingPolicy.returnAttrs || {})
                          .map(([k, v]) => `${k}=${v}`)
                          .join(', ')}
                        onChange={(e) => {
                          const attrs: Record<string, string> = {};
                          e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter((s) => s.includes('='))
                            .forEach((s) => {
                              const [k, ...v] = s.split('=');
                              attrs[k.trim()] = v.join('=').trim();
                            });
                          setEditingPolicy({ ...editingPolicy, returnAttrs: attrs });
                        }}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                        placeholder="例如: priv-lvl=15, inacl=100, outacl=101"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">策略动作</label>
                      <select
                        value={editingPolicy.allowed ? 'allow' : 'deny'}
                        onChange={(e) =>
                          setEditingPolicy({
                            ...editingPolicy,
                            allowed: e.target.value === 'allow',
                          })
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                      >
                        <option value="allow">允许</option>
                        <option value="deny">拒绝</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSavePolicy}
                      disabled={saving || !editingPolicy.commandPattern}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      保存
                    </button>
                    <button
                      onClick={() => setEditingPolicy(null)}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                      取消
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 uppercase tracking-wider border-b border-slate-700">
                      <th className="pb-3 pr-4">用户名</th>
                      <th className="pb-3 pr-4">命令模式</th>
                      <th className="pb-3 pr-4">参数模式</th>
                      <th className="pb-3 pr-4">返回属性</th>
                      <th className="pb-3 pr-4">动作</th>
                      <th className="pb-3 pr-4">优先级</th>
                      <th className="pb-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policies
                      .sort((a, b) => b.priority - a.priority)
                      .map((policy) => (
                        <tr key={policy.id} className="border-b border-slate-800/50">
                          <td className="py-3 pr-4 font-mono text-sm text-cyan-400">
                            {policy.username}
                          </td>
                          <td className="py-3 pr-4 font-mono text-sm text-slate-300">
                            {policy.commandPattern}
                          </td>
                          <td className="py-3 pr-4 font-mono text-sm text-slate-400">
                            {policy.argPatterns && policy.argPatterns.length > 0
                              ? policy.argPatterns.join(', ')
                              : '-'}
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs text-slate-400">
                            {policy.returnAttrs && Object.keys(policy.returnAttrs).length > 0
                              ? Object.entries(policy.returnAttrs)
                                  .map(([k, v]) => `${k}=${v}`)
                                  .join(', ')
                              : '-'}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`text-xs px-2 py-1 rounded ${
                                policy.allowed
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}
                            >
                              {policy.allowed ? '允许' : '拒绝'}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-sm text-slate-400">{policy.priority}</td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => setEditingPolicy(policy)}
                              className="p-1.5 text-slate-400 hover:text-emerald-400 transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeletePolicy(policy.id)}
                              className="p-1.5 text-slate-400 hover:text-red-400 transition-colors ml-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
