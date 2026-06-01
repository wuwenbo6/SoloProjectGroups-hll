import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import type { MappingRule } from '../../shared/types';
import { 
  Upload, 
  Download, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  X,
  FileSpreadsheet,
  AlertCircle,
  Check,
  Search,
  RefreshCw
} from 'lucide-react';
import { mappingApi } from '../lib/api';

const REGISTER_TYPES = ['Coil', 'DiscreteInput', 'InputRegister', 'HoldingRegister'];
const DATA_TYPES = ['Boolean', 'Int16', 'UInt16', 'Int32', 'UInt32', 'Float', 'Double'];

const MappingConfig: React.FC = () => {
  const { 
    mappingRules, 
    fetchMappingRules, 
    createMappingRule, 
    updateMappingRule, 
    deleteMappingRule,
    uploadExcel,
    importRules,
    loading 
  } = useAppStore();

  const [isDragging, setIsDragging] = useState(false);
  const [parsedData, setParsedData] = useState<MappingRule[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<MappingRule>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<Partial<MappingRule>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchMappingRules();
  }, []);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processFile(files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  };

  const processFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      showMessage('请上传Excel文件 (.xlsx, .xls, .csv)', 'error');
      return;
    }

    const result = await uploadExcel(file);
    if (result.errors && result.errors.length > 0) {
      setParseErrors(result.errors);
    } else {
      setParseErrors([]);
    }
    if (result.data) {
      setParsedData(result.data);
      showMessage(`解析成功，共 ${result.data.length} 条数据`, 'success');
    } else {
      showMessage(result.errors?.[0] || '解析失败', 'error');
    }
  };

  const handleImport = async (replace: boolean) => {
    if (parsedData.length === 0) {
      showMessage('没有可导入的数据', 'error');
      return;
    }

    const result = await importRules(parsedData, replace);
    if (result.success) {
      showMessage(`成功导入 ${result.importedCount} 条规则`, 'success');
      setParsedData([]);
      setParseErrors([]);
    } else {
      showMessage('导入失败', 'error');
    }
  };

  const handleAdd = async () => {
    if (!addForm.deviceName || !addForm.registerType || !addForm.dataType) {
      showMessage('请填写必要字段', 'error');
      return;
    }

    const result = await createMappingRule(addForm as Omit<MappingRule, 'id' | 'createdAt' | 'updatedAt'>);
    if (result.success) {
      showMessage('添加成功', 'success');
      setShowAddForm(false);
      setAddForm({});
    } else {
      showMessage('添加失败', 'error');
    }
  };

  const handleEdit = (rule: MappingRule) => {
    setEditingId(rule.id!);
    setEditForm({ ...rule });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    
    const success = await updateMappingRule(editingId, editForm);
    if (success) {
      showMessage('更新成功', 'success');
      setEditingId(null);
      setEditForm({});
    } else {
      showMessage('更新失败', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('确定要删除这条规则吗？')) {
      const success = await deleteMappingRule(id);
      showMessage(success ? '删除成功' : '删除失败', success ? 'success' : 'error');
    }
  };

  const downloadTemplate = () => {
    window.location.href = mappingApi.downloadTemplate();
  };

  const filteredRules = mappingRules.filter(rule =>
    rule.deviceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    rule.opcuaBrowseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(rule.registerAddress).includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">映射配置</h1>
          <p className="text-slate-400 mt-1">管理MODBUS寄存器到OPC UA节点的映射规则</p>
        </div>
        {message && (
          <div className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
            message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {message.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {message.text}
          </div>
        )}
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Excel 文件上传</h2>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-3 py-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            下载模板
          </button>
        </div>
        <div className="p-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-cyan-500 bg-cyan-500/10'
                : 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className={`w-12 h-12 mx-auto mb-3 ${isDragging ? 'text-cyan-400' : 'text-slate-400'}`} />
            <p className="text-white font-medium">拖拽文件到此处或点击上传</p>
            <p className="text-slate-400 text-sm mt-1">支持 .xlsx, .xls, .csv 格式，最大 10MB</p>
          </div>

          {parseErrors.length > 0 && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
                <AlertCircle className="w-4 h-4" />
                解析警告 ({parseErrors.length} 条)
              </div>
              <ul className="text-sm text-red-300 space-y-1 max-h-32 overflow-auto">
                {parseErrors.map((error, i) => (
                  <li key={i}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {parsedData.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-300">
                  <FileSpreadsheet className="w-4 h-4 inline mr-2" />
                  预览 {parsedData.length} 条数据
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setParsedData([])}
                    className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => handleImport(false)}
                    className="px-3 py-1.5 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
                  >
                    追加导入
                  </button>
                  <button
                    onClick={() => handleImport(true)}
                    className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
                  >
                    覆盖导入
                  </button>
                </div>
              </div>
              <div className="bg-slate-900 rounded-lg overflow-auto max-h-48">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800 sticky top-0">
                    <tr className="text-slate-400">
                      <th className="text-left p-2">设备名称</th>
                      <th className="text-left p-2">寄存器类型</th>
                      <th className="text-left p-2">地址</th>
                      <th className="text-left p-2">数据类型</th>
                      <th className="text-left p-2">OPC UA节点</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 10).map((rule, i) => (
                      <tr key={i} className="border-t border-slate-700 hover:bg-slate-800">
                        <td className="p-2 text-white">{rule.deviceName}</td>
                        <td className="p-2 text-slate-300">{rule.registerType}</td>
                        <td className="p-2 text-slate-300">{rule.registerAddress}</td>
                        <td className="p-2 text-slate-300">{rule.dataType}</td>
                        <td className="p-2 text-cyan-400 font-mono text-xs">{rule.opcuaBrowseName}</td>
                      </tr>
                    ))}
                    {parsedData.length > 10 && (
                      <tr className="border-t border-slate-700">
                        <td colSpan={5} className="p-2 text-center text-slate-400">
                          还有 {parsedData.length - 10} 条数据...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">映射规则列表</h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="搜索规则..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <button
              onClick={fetchMappingRules}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading.mappingRules ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              新增规则
            </button>
          </div>
        </div>

        {showAddForm && (
          <div className="px-6 py-4 border-b border-slate-700 bg-slate-700/50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <input
                type="text"
                placeholder="设备名称 *"
                value={addForm.deviceName || ''}
                onChange={(e) => setAddForm({ ...addForm, deviceName: e.target.value })}
                className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
              />
              <select
                value={addForm.registerType || ''}
                onChange={(e) => setAddForm({ ...addForm, registerType: e.target.value })}
                className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
              >
                <option value="">寄存器类型 *</option>
                {REGISTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                type="number"
                placeholder="寄存器地址 *"
                value={addForm.registerAddress ?? ''}
                onChange={(e) => setAddForm({ ...addForm, registerAddress: parseInt(e.target.value) || 0 })}
                className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
              />
              <select
                value={addForm.dataType || ''}
                onChange={(e) => setAddForm({ ...addForm, dataType: e.target.value })}
                className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
              >
                <option value="">数据类型 *</option>
                {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                type="text"
                placeholder="OPC UA节点ID (可选)"
                value={addForm.opcuaNodeId || ''}
                onChange={(e) => setAddForm({ ...addForm, opcuaNodeId: e.target.value })}
                className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
              />
              <input
                type="text"
                placeholder="OPC UA浏览名称 (可选)"
                value={addForm.opcuaBrowseName || ''}
                onChange={(e) => setAddForm({ ...addForm, opcuaBrowseName: e.target.value })}
                className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
              />
              <input
                type="text"
                placeholder="描述 (可选)"
                value={addForm.description || ''}
                onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500 col-span-2"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowAddForm(false); setAddForm({}); }}
                className="px-3 py-2 text-sm bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAdd}
                disabled={loading.createRule}
                className="px-3 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                保存
              </button>
            </div>
          </div>
        )}

        <div className="overflow-auto max-h-[500px]">
          {filteredRules.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{searchTerm ? '没有匹配的规则' : '暂无映射规则，请上传Excel文件或手动添加'}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-900 sticky top-0">
                <tr className="text-slate-400">
                  <th className="text-left p-3">设备名称</th>
                  <th className="text-left p-3">寄存器类型</th>
                  <th className="text-left p-3">地址</th>
                  <th className="text-left p-3">数据类型</th>
                  <th className="text-left p-3">OPC UA节点</th>
                  <th className="text-left p-3">描述</th>
                  <th className="text-right p-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((rule) => (
                  <React.Fragment key={rule.id}>
                    {editingId === rule.id ? (
                      <tr className="border-t border-slate-700 bg-cyan-500/10">
                        <td className="p-2">
                          <input
                            value={editForm.deviceName || ''}
                            onChange={(e) => setEditForm({ ...editForm, deviceName: e.target.value })}
                            className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={editForm.registerType || ''}
                            onChange={(e) => setEditForm({ ...editForm, registerType: e.target.value })}
                            className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                          >
                            {REGISTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={editForm.registerAddress ?? ''}
                            onChange={(e) => setEditForm({ ...editForm, registerAddress: parseInt(e.target.value) || 0 })}
                            className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={editForm.dataType || ''}
                            onChange={(e) => setEditForm({ ...editForm, dataType: e.target.value })}
                            className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                          >
                            {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            value={editForm.opcuaBrowseName || ''}
                            onChange={(e) => setEditForm({ ...editForm, opcuaBrowseName: e.target.value })}
                            className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm font-mono"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            value={editForm.description || ''}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={handleSaveEdit}
                              className="p-1.5 text-green-400 hover:bg-green-500/20 rounded"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { setEditingId(null); setEditForm({}); }}
                              className="p-1.5 text-slate-400 hover:bg-slate-600 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr className="border-t border-slate-700 hover:bg-slate-700/50">
                        <td className="p-3 text-white font-medium">{rule.deviceName}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs">
                            {rule.registerType}
                          </span>
                        </td>
                        <td className="p-3 text-slate-300 font-mono">{rule.registerAddress}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                            {rule.dataType}
                          </span>
                        </td>
                        <td className="p-3 text-cyan-400 font-mono text-xs">{rule.opcuaBrowseName}</td>
                        <td className="p-3 text-slate-400">{rule.description || '-'}</td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => handleEdit(rule)}
                              className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/20 rounded transition-colors"
                              title="编辑"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(rule.id!)}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default MappingConfig;
