import React, { useState, useEffect } from 'react';
import { X, Check, Shield, User, Users } from 'lucide-react';
import type { ACE, ACEType } from '../../shared/types';
import PermissionEditor from './PermissionEditor';

interface ACEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (ace: ACE) => void;
  ace?: ACE;
  editIndex?: number;
}

const ACEditor: React.FC<ACEditorProps> = ({
  isOpen,
  onClose,
  onSave,
  ace,
  editIndex,
}) => {
  const [type, setType] = useState<ACEType>('A');
  const [flags, setFlags] = useState('');
  const [principal, setPrincipal] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [principalType, setPrincipalType] = useState<'user' | 'group'>('user');

  useEffect(() => {
    if (ace) {
      setType(ace.type);
      setFlags(ace.flags);
      setPermissions([...ace.permissions]);
      if (ace.principal.startsWith('group:')) {
        setPrincipalType('group');
        setPrincipal(ace.principal.replace('group:', ''));
      } else {
        setPrincipalType('user');
        setPrincipal(ace.principal.replace('user:', ''));
      }
    } else {
      setType('A');
      setFlags('');
      setPrincipal('');
      setPermissions([]);
      setPrincipalType('user');
    }
  }, [ace, isOpen]);

  const handleSave = () => {
    const fullPrincipal = principalType === 'group' 
      ? `group:${principal}` 
      : `user:${principal}`;
    
    const newACE: ACE = {
      type,
      flags,
      principal: fullPrincipal,
      permissions,
    };
    onSave(newACE);
  };

  const isFormValid = principal.trim() !== '' && permissions.length > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 rounded-lg">
              <Shield className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                {editIndex !== undefined ? 'Edit ACE' : 'Add New ACE'}
              </h3>
              <p className="text-sm text-slate-400">
                {editIndex !== undefined
                  ? 'Modify access control entry'
                  : 'Create new access control entry'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  ACE Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setType('A')}
                    className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all ${
                      type === 'A'
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <span className="font-mono font-bold mr-1">A</span>
                    Allow
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('D')}
                    className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all ${
                      type === 'D'
                        ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <span className="font-mono font-bold mr-1">D</span>
                    Deny
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Principal Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPrincipalType('user')}
                    className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                      principalType === 'user'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <User className="h-4 w-4" />
                    User
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrincipalType('group')}
                    className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                      principalType === 'group'
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <Users className="h-4 w-4" />
                    Group
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Principal Name
              </label>
              <div className="flex items-center gap-2">
                <span className="px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 font-mono text-sm">
                  {principalType}:
                </span>
                <input
                  type="text"
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  placeholder="username or groupname"
                  className="flex-1 px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-mono"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Preview:{' '}
                <span className="font-mono text-slate-300">
                  {principalType}:{principal || '...'}
                </span>
              </p>
            </div>

            <PermissionEditor
              permissions={permissions}
              flags={flags}
              onPermissionsChange={setPermissions}
              onFlagsChange={setFlags}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isFormValid}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 disabled:shadow-none"
          >
            <Check className="h-4 w-4" />
            {editIndex !== undefined ? 'Update ACE' : 'Add ACE'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ACEditor;
