import React, { useState, useCallback } from 'react';
import {
  Shield,
  Plus,
  Save,
  RotateCcw,
  Trash2,
  Terminal,
  AlertTriangle,
  LayoutTemplate,
  Download,
} from 'lucide-react';
import type { ACE } from '../../shared/types';
import { INHERITANCE_FLAGS } from '../../shared/types';
import {
  getACL,
  setACL,
  clearACL,
  checkToolsAvailable,
} from '../services/api';
import PathInput from '../components/PathInput';
import ACLTable from '../components/ACLTable';
import ACEditor from '../components/ACEditor';
import Notification from '../components/Notification';
import ACLTemplatePanel from '../components/ACLTemplatePanel';
import ACLExport from '../components/ACLExport';

const Home: React.FC = () => {
  const [path, setPath] = useState('');
  const [aces, setAces] = useState<ACE[]>([]);
  const [originalAces, setOriginalAces] = useState<ACE[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingACE, setEditingACE] = useState<ACE | undefined>();
  const [editingIndex, setEditingIndex] = useState<number | undefined>();

  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    visible: boolean;
  }>({
    type: 'info',
    message: '',
    visible: false,
  });

  const [toolsAvailable, setToolsAvailable] = useState<boolean | null>(null);

  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [exportPanelOpen, setExportPanelOpen] = useState(false);

  const sortACEs = useCallback((list: ACE[]): ACE[] => {
    const isInherited = (ace: ACE) =>
      INHERITANCE_FLAGS.some((f) => ace.flags.includes(f));
    return [...list].sort((a, b) => {
      const aInh = isInherited(a);
      const bInh = isInherited(b);
      if (aInh && !bInh) return -1;
      if (!aInh && bInh) return 1;
      if (a.type === 'D' && b.type === 'A') return -1;
      if (a.type === 'A' && b.type === 'D') return 1;
      return 0;
    });
  }, []);

  const showNotification = useCallback(
    (type: 'success' | 'error' | 'info', message: string) => {
      setNotification({ type, message, visible: true });
    },
    []
  );

  const hideNotification = useCallback(() => {
    setNotification((prev) => ({ ...prev, visible: false }));
  }, []);

  const checkTools = useCallback(async () => {
    const available = await checkToolsAvailable();
    setToolsAvailable(available);
    if (!available) {
      showNotification(
        'error',
        'nfs4_getfacl/setfacl commands not found. ACL editing may not work.'
      );
    }
  }, [showNotification]);

  React.useEffect(() => {
    checkTools();
  }, [checkTools]);

  const handleLoadACL = useCallback(async () => {
    if (!path.trim()) return;

    setIsLoading(true);
    try {
      const response = await getACL(path);
      if (response.success && response.data) {
        const loadedACEs = sortACEs(response.data.aces);
        setAces(loadedACEs);
        setOriginalAces(JSON.parse(JSON.stringify(loadedACEs)));
        setHasChanges(false);

        setPathHistory((prev) => {
          const newHistory = [path, ...prev.filter((p) => p !== path)].slice(
            0,
            10
          );
          return newHistory;
        });

        showNotification(
          'success',
          `Loaded ${loadedACEs.length} ACE entries for ${path}`
        );
      } else {
        showNotification('error', response.error || 'Failed to load ACL');
      }
    } catch (error: unknown) {
      showNotification(
        'error',
        error instanceof Error ? error.message : 'Failed to load ACL'
      );
    } finally {
      setIsLoading(false);
    }
  }, [path, showNotification]);

  const handleSaveACL = useCallback(async () => {
    if (!path.trim()) return;
    if (aces.length === 0) {
      showNotification('error', 'Cannot save empty ACL');
      return;
    }

    setIsSaving(true);
    try {
      const sortedACEs = sortACEs(aces);
      const response = await setACL(path, sortedACEs);
      if (response.success) {
        setAces(sortedACEs);
        setOriginalAces(JSON.parse(JSON.stringify(sortedACEs)));
        setHasChanges(false);
        showNotification('success', response.message || 'ACL saved successfully');
      } else {
        showNotification('error', response.error || 'Failed to save ACL');
      }
    } catch (error: unknown) {
      showNotification(
        'error',
        error instanceof Error ? error.message : 'Failed to save ACL'
      );
    } finally {
      setIsSaving(false);
    }
  }, [path, aces, showNotification]);

  const handleReset = useCallback(() => {
    setAces(JSON.parse(JSON.stringify(originalAces)));
    setHasChanges(false);
    showNotification('info', 'Changes reset to original ACL');
  }, [originalAces, showNotification]);

  const handleClearACL = useCallback(async () => {
    if (!path.trim()) return;
    if (!window.confirm('Are you sure you want to clear all ACL entries?')) {
      return;
    }

    setIsSaving(true);
    try {
      const response = await clearACL(path);
      if (response.success) {
        setAces([]);
        setOriginalAces([]);
        setHasChanges(false);
        showNotification('success', response.message || 'ACL cleared successfully');
      } else {
        showNotification('error', response.error || 'Failed to clear ACL');
      }
    } catch (error: unknown) {
      showNotification(
        'error',
        error instanceof Error ? error.message : 'Failed to clear ACL'
      );
    } finally {
      setIsSaving(false);
    }
  }, [path, showNotification]);

  const handleAddACE = useCallback(() => {
    setEditingACE(undefined);
    setEditingIndex(undefined);
    setEditorOpen(true);
  }, []);

  const handleEditACE = useCallback(
    (index: number) => {
      setEditingACE(aces[index]);
      setEditingIndex(index);
      setEditorOpen(true);
    },
    [aces]
  );

  const handleDeleteACE = useCallback(
    (index: number) => {
      if (!window.confirm('Are you sure you want to delete this ACE?')) {
        return;
      }
      const newAces = aces.filter((_, i) => i !== index);
      setAces(newAces);
      setHasChanges(true);
      showNotification('info', 'ACE marked for deletion. Click Save to apply.');
    },
    [aces, showNotification]
  );

  const handleSaveEditor = useCallback(
    (ace: ACE) => {
      if (editingIndex !== undefined) {
        const newAces = [...aces];
        newAces[editingIndex] = ace;
        setAces(sortACEs(newAces));
        showNotification('info', 'ACE updated. Click Save to apply changes.');
      } else {
        setAces(sortACEs([...aces, ace]));
        showNotification('info', 'ACE added. Click Save to apply changes.');
      }
      setHasChanges(true);
      setEditorOpen(false);
    },
    [aces, editingIndex, showNotification, sortACEs]
  );

  const handleCloseEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingACE(undefined);
    setEditingIndex(undefined);
  }, []);

  const handleApplyTemplate = useCallback(
    (templateACEs: ACE[]) => {
      const sorted = sortACEs(templateACEs);
      setAces(sorted);
      setHasChanges(true);
      setTemplatePanelOpen(false);
      showNotification('info', '模板已应用。点击 Save 保存变更。');
    },
    [sortACEs, showNotification]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <Notification
        type={notification.type}
        message={notification.message}
        isVisible={notification.visible}
        onClose={hideNotification}
      />

      <ACEditor
        isOpen={editorOpen}
        onClose={handleCloseEditor}
        onSave={handleSaveEditor}
        ace={editingACE}
        editIndex={editingIndex}
      />

      {templatePanelOpen && (
        <ACLTemplatePanel
          onApply={handleApplyTemplate}
          onClose={() => setTemplatePanelOpen(false)}
        />
      )}

      {exportPanelOpen && aces.length > 0 && (
        <ACLExport
          aces={aces}
          path={path}
          onClose={() => setExportPanelOpen(false)}
        />
      )}

      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-lg shadow-blue-600/20">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">NFSv4 ACL Manager</h1>
                <p className="text-xs text-slate-400">
                  Visual Access Control List Editor
                </p>
              </div>
            </div>

            {toolsAvailable !== null && (
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                  toolsAvailable
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}
              >
                <Terminal className="h-3.5 w-3.5" />
                {toolsAvailable ? 'Tools Available' : 'Tools Not Found'}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {toolsAvailable === false && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-amber-300 font-medium text-sm">
                NFSv4 Tools Not Detected
              </h4>
              <p className="text-amber-200/70 text-xs mt-1">
                The system requires <code className="font-mono bg-amber-500/20 px-1 rounded">nfs4_getfacl</code> and{' '}
                <code className="font-mono bg-amber-500/20 px-1 rounded">setfacl</code> commands.
                You can still use the interface to build ACL specifications, but applying them will fail.
              </p>
            </div>
          </div>
        )}

        <div className="mb-6">
          <PathInput
            value={path}
            onChange={setPath}
            onSubmit={handleLoadACL}
            isLoading={isLoading}
            history={pathHistory}
          />
        </div>

        {path && (
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-slate-500 text-sm">Path: </span>
                  <code className="font-mono text-sm text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                    {path}
                  </code>
                </div>
                {hasChanges && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                    Unsaved Changes
                  </span>
                )}
                {aces.length > 0 && (
                  <span className="text-slate-500 text-sm">
                    {aces.length} ACE{aces.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTemplatePanelOpen(true)}
                  className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 font-medium rounded-lg transition-all flex items-center gap-2 border border-indigo-500/30"
                >
                  <LayoutTemplate className="h-4 w-4" />
                  模板
                </button>
                <button
                  type="button"
                  onClick={handleAddACE}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30"
                >
                  <Plus className="h-4 w-4" />
                  Add ACE
                </button>
                <button
                  type="button"
                  onClick={() => setExportPanelOpen(true)}
                  disabled={aces.length === 0}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/50 disabled:text-slate-600 disabled:cursor-not-allowed text-slate-300 font-medium rounded-lg transition-all flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  导出
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={!hasChanges || isSaving}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/50 disabled:text-slate-600 disabled:cursor-not-allowed text-slate-300 font-medium rounded-lg transition-all flex items-center gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleClearACL}
                  disabled={aces.length === 0 || isSaving}
                  className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 disabled:bg-slate-800/50 disabled:text-slate-600 disabled:cursor-not-allowed text-red-400 font-medium rounded-lg transition-all flex items-center gap-2 border border-red-500/30"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear All
                </button>
                <button
                  type="button"
                  onClick={handleSaveACL}
                  disabled={!hasChanges || isSaving || aces.length === 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/30"
                >
                  <Save className={`h-4 w-4 ${isSaving ? 'animate-spin' : ''}`} />
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        <ACLTable
          aces={aces}
          onEdit={handleEditACE}
          onDelete={handleDeleteACE}
          isLoading={isLoading}
        />

        {path && aces.length > 0 && (
          <div className="mt-6 p-4 bg-slate-800/30 rounded-xl border border-slate-700">
            <h4 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Command Preview
            </h4>
            <code className="block text-xs font-mono text-slate-400 bg-slate-900/50 p-3 rounded-lg overflow-x-auto">
              setfacl -m{' '}
              {aces
                .map(
                  (ace) =>
                    `${ace.type}:${ace.flags}:${ace.principal}:${ace.permissions.join(
                      ''
                    )}`
                )
                .join(',')}{' '}
              {path}
            </code>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-800 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-xs text-slate-500">
            NFSv4 ACL Manager — Edit Access Control Lists with ease
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Home;
