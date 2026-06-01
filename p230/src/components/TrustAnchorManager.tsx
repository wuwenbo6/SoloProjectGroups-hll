import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Plus, Trash2, Edit3, X, Check, Anchor } from 'lucide-react';
import { dnssecAPI } from '../utils/api';
import { getAlgorithmName, getDigestTypeName } from '../utils/format';
import type { TrustAnchor } from '../../shared/types';

export default function TrustAnchorManager() {
  const [anchors, setAnchors] = useState<TrustAnchor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    domain: '.',
    keyTag: '',
    algorithm: '8',
    digestType: '2',
    digest: '',
    description: '',
  });

  const loadAnchors = async () => {
    setIsLoading(true);
    try {
      const data = await dnssecAPI.getTrustAnchors();
      setAnchors(data);
    } catch (e) {
      console.error('Failed to load trust anchors:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnchors();
  }, []);

  const handleSubmit = async () => {
    try {
      const anchorData = {
        domain: form.domain,
        keyTag: parseInt(form.keyTag, 10),
        algorithm: parseInt(form.algorithm, 10),
        digestType: parseInt(form.digestType, 10),
        digest: form.digest,
        description: form.description || undefined,
      };

      if (editingId) {
        await dnssecAPI.updateTrustAnchor(editingId, anchorData);
      } else {
        await dnssecAPI.addTrustAnchor(anchorData);
      }

      setShowForm(false);
      setEditingId(null);
      resetForm();
      loadAnchors();
    } catch (e) {
      console.error('Failed to save trust anchor:', e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await dnssecAPI.removeTrustAnchor(id);
      loadAnchors();
    } catch (e) {
      console.error('Failed to delete trust anchor:', e);
    }
  };

  const handleEdit = (anchor: TrustAnchor) => {
    setForm({
      domain: anchor.domain,
      keyTag: String(anchor.keyTag),
      algorithm: String(anchor.algorithm),
      digestType: String(anchor.digestType),
      digest: anchor.digest,
      description: anchor.description || '',
    });
    setEditingId(anchor.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({
      domain: '.',
      keyTag: '',
      algorithm: '8',
      digestType: '2',
      digest: '',
      description: '',
    });
    setEditingId(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="w-full max-w-4xl mx-auto"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <Anchor className="w-5 h-5 text-amber-400" />
          信任锚管理
        </h3>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg text-white text-sm font-medium hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? '取消' : '添加信任锚'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden mb-6"
          >
            <div className="p-5 bg-slate-800/50 backdrop-blur-xl rounded-xl border border-slate-700/50">
              <h4 className="text-sm font-semibold text-white mb-4">
                {editingId ? '编辑信任锚' : '添加新信任锚'}
              </h4>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">域名</label>
                  <input
                    type="text"
                    value={form.domain}
                    onChange={e => setForm({ ...form, domain: e.target.value })}
                    placeholder="., example.com"
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Key Tag</label>
                  <input
                    type="number"
                    value={form.keyTag}
                    onChange={e => setForm({ ...form, keyTag: e.target.value })}
                    placeholder="20326"
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">算法</label>
                  <select
                    value={form.algorithm}
                    onChange={e => setForm({ ...form, algorithm: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25"
                  >
                    <option value="5">5 - RSASHA1</option>
                    <option value="7">7 - RSASHA1-NSEC3-SHA1</option>
                    <option value="8">8 - RSASHA256</option>
                    <option value="10">10 - RSASHA512</option>
                    <option value="13">13 - ECDSAP256SHA256</option>
                    <option value="14">14 - ECDSAP384SHA384</option>
                    <option value="15">15 - ED25519</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">摘要类型</label>
                  <select
                    value={form.digestType}
                    onChange={e => setForm({ ...form, digestType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25"
                  >
                    <option value="1">1 - SHA-1</option>
                    <option value="2">2 - SHA-256</option>
                    <option value="4">4 - SHA-384</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">摘要 (Hex)</label>
                  <input
                    type="text"
                    value={form.digest}
                    onChange={e => setForm({ ...form, digest: e.target.value })}
                    placeholder="E06D44B80B8F1D39A95C0B0D7C65D08458E880409BBC683458104237C7F8EC9D"
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">描述 (可选)</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="根区域 KSK-2024"
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => { setShowForm(false); resetForm(); }}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!form.domain || !form.keyTag || !form.digest}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg text-white text-sm font-medium hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25"
                >
                  <Check className="w-4 h-4" />
                  {editingId ? '更新' : '添加'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-8 text-slate-400">加载中...</div>
        ) : anchors.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            暂无信任锚，点击上方按钮添加
          </div>
        ) : (
          anchors.map((anchor, index) => (
            <motion.div
              key={anchor.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="p-4 bg-slate-800/30 backdrop-blur-xl rounded-xl border border-slate-700/50 group"
            >
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 shrink-0">
                  <Shield className="w-5 h-5 text-amber-400" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-white text-sm">{anchor.description || anchor.domain}</span>
                    <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded text-xs">
                      {anchor.domain}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs">
                    <div>
                      <span className="text-slate-500">Key Tag</span>
                      <p className="text-slate-300 font-mono">{anchor.keyTag}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">算法</span>
                      <p className="text-slate-300">{getAlgorithmName(anchor.algorithm)}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">摘要类型</span>
                      <p className="text-slate-300">{getDigestTypeName(anchor.digestType)}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">摘要</span>
                      <p className="text-slate-300 font-mono truncate" title={anchor.digest}>
                        {anchor.digest.substring(0, 16)}...
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => handleEdit(anchor)}
                    className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-blue-400 transition-colors"
                    title="编辑"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(anchor.id)}
                    className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-red-400 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  );
}
