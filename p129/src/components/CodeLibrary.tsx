import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, FileCode, Clock, ChevronLeft, ChevronRight, Save, FolderOpen } from 'lucide-react';
import { useLLVMStore } from '@/store/useLLVMStore';
import { getSnippets, createSnippet, updateSnippet, deleteSnippet } from '@/services/api';
import type { CodeSnippet } from '@shared/types';

const CodeLibrary: React.FC = () => {
  const {
    snippets,
    setSnippets,
    searchQuery,
    setSearchQuery,
    sidebarCollapsed,
    toggleSidebar,
    loadSnippet,
    code,
    snippetName,
    setSnippetName,
    currentSnippetId,
    setCurrentSnippetId,
    setIsLoadingSnippets,
    isLoadingSnippets,
    setError,
  } = useLLVMStore();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newSnippetName, setNewSnippetName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  useEffect(() => {
    loadSnippets();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      loadSnippets(searchQuery.trim());
    } else {
      loadSnippets();
    }
  }, [searchQuery]);

  const loadSnippets = async (query?: string) => {
    setIsLoadingSnippets(true);
    try {
      const result = await getSnippets(query);
      if (result.success) {
        setSnippets(result.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load snippets');
    } finally {
      setIsLoadingSnippets(false);
    }
  };

  const handleSave = async () => {
    if (!newSnippetName.trim()) return;

    try {
      if (currentSnippetId) {
        const result = await updateSnippet(currentSnippetId, newSnippetName.trim(), code);
        if (result.success) {
          setSnippetName(result.data.name);
          loadSnippets();
        }
      } else {
        const result = await createSnippet(newSnippetName.trim(), code);
        if (result.success) {
          setCurrentSnippetId(result.data.id);
          setSnippetName(result.data.name);
          loadSnippets();
        }
      }
      setShowSaveDialog(false);
      setNewSnippetName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save snippet');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSnippet(id);
      if (currentSnippetId === id) {
        setCurrentSnippetId(null);
        setSnippetName('');
      }
      setDeleteConfirmId(null);
      loadSnippets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete snippet');
    }
  };

  const handleLoad = (snippet: CodeSnippet) => {
    loadSnippet(snippet);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCodePreview = (code: string) => {
    return code.replace(/\s+/g, ' ').slice(0, 60) + (code.length > 60 ? '...' : '');
  };

  if (sidebarCollapsed) {
    return (
      <div className="h-full flex flex-col bg-slate-800/50 border-r border-slate-700 w-12">
        <button
          onClick={toggleSidebar}
          className="p-3 hover:bg-slate-700 transition-colors border-b border-slate-700"
          title="展开代码库"
        >
          <ChevronRight className="w-5 h-5 text-slate-400" />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowSaveDialog(true)}
          className="p-3 hover:bg-slate-700 transition-colors border-t border-slate-700"
          title="保存代码"
        >
          <Save className="w-5 h-5 text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-800/50 border-r border-slate-700 w-72">
      <div className="p-3 border-b border-slate-700 flex items-center gap-2">
        <FolderOpen className="w-5 h-5 text-blue-400" />
        <h2 className="font-semibold text-slate-200 text-sm flex-1">代码库</h2>
        <button
          onClick={toggleSidebar}
          className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
          title="折叠"
        >
          <ChevronLeft className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <div className="p-3 border-b border-slate-700">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索代码片段..."
            className="w-full pl-9 pr-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoadingSnippets ? (
          <div className="p-4 text-center">
            <div className="animate-pulse flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-700/50 rounded-lg" />
              ))}
            </div>
          </div>
        ) : snippets.length === 0 ? (
          <div className="p-8 text-center">
            <FileCode className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500">暂无代码片段</p>
            <p className="text-xs text-slate-600 mt-1">点击下方按钮保存第一个</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {snippets.map((snippet) => (
              <div
                key={snippet.id}
                className={`group relative p-3 rounded-lg border transition-all duration-200 ${
                  currentSnippetId === snippet.id
                    ? 'bg-blue-500/10 border-blue-500/40'
                    : 'bg-slate-800/50 border-slate-700 hover:bg-slate-700/50 hover:border-slate-600'
                }`}
              >
                <div
                  className="cursor-pointer"
                  onClick={() => handleLoad(snippet)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileCode className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-slate-200 truncate">
                      {snippet.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate mb-1.5">
                    {getCodePreview(snippet.code)}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <Clock className="w-3 h-3" />
                    {formatDate(snippet.updatedAt)}
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmId(deleteConfirmId === snippet.id ? null : snippet.id);
                  }}
                  className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {deleteConfirmId === snippet.id && (
                  <div className="mt-2 pt-2 border-t border-slate-700 flex items-center gap-2">
                    <span className="text-xs text-slate-400">确认删除?</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(snippet.id);
                      }}
                      className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                    >
                      删除
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(null);
                      }}
                      className="px-2 py-1 text-xs bg-slate-600 text-slate-300 rounded hover:bg-slate-500 transition-colors"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-700">
        <button
          onClick={() => {
            setNewSnippetName(snippetName || '');
            setShowSaveDialog(true);
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {currentSnippetId ? '更新当前代码' : '保存当前代码'}
        </button>
      </div>

      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-600 rounded-xl p-5 w-96 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-semibold text-slate-200 mb-4">
              {currentSnippetId ? '更新代码片段' : '保存代码片段'}
            </h3>
            <input
              type="text"
              value={newSnippetName}
              onChange={(e) => setNewSnippetName(e.target.value)}
              placeholder="输入代码片段名称..."
              className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowSaveDialog(false);
                  setNewSnippetName('');
                }}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!newSnippetName.trim()}
                className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeLibrary;
