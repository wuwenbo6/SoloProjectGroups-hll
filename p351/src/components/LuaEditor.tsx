import { useState, useEffect, useCallback } from 'react';
import { Code2, Save, RotateCcw, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useSimStore } from '@/store/useSimStore';

export default function LuaEditor() {
  const { luaScript, fetchLuaScript, updateLuaScript, resetLuaScript, validateLuaScript, state } = useSimStore();
  const [script, setScript] = useState('');
  const [validation, setValidation] = useState<{ valid: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetchLuaScript();
  }, [fetchLuaScript]);

  useEffect(() => {
    if (luaScript?.script && !dirty) {
      setScript(luaScript.script);
    }
  }, [luaScript?.script, dirty]);

  const handleValidate = useCallback(async () => {
    const result = await validateLuaScript(script);
    setValidation(result);
  }, [script, validateLuaScript]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const result = await updateLuaScript(script);
    if (result.success) {
      setDirty(false);
      setValidation({ valid: true });
    } else {
      setValidation({ valid: false, error: result.error });
    }
    setSaving(false);
  }, [script, updateLuaScript]);

  const handleReset = useCallback(async () => {
    await resetLuaScript();
    setDirty(false);
    setValidation(null);
  }, [resetLuaScript]);

  if (!state?.lua_enabled) {
    return (
      <div className="card h-full flex flex-col">
        <div className="card-header">
          <h2 className="card-title">
            <Code2 className="w-5 h-5 text-purple-400" />
            Lua 冲突解决脚本
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <XCircle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Lua引擎未启用</p>
            <p className="text-slate-500 text-xs mt-1">请安装 lupa: pip install lupa</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card h-full flex flex-col">
      <div className="card-header">
        <h2 className="card-title">
          <Code2 className="w-5 h-5 text-purple-400" />
          Lua 冲突解决脚本
        </h2>
        <div className="flex items-center gap-2">
          {validation?.valid && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle className="w-3 h-3" /> 有效
            </span>
          )}
          {validation && !validation.valid && (
            <span className="flex items-center gap-1 text-xs text-rose-400">
              <XCircle className="w-3 h-3" /> 无效
            </span>
          )}
          {dirty && (
            <span className="text-xs text-amber-400">未保存</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col p-3 gap-2">
        <div className="flex-1 overflow-auto">
          <textarea
            className="w-full h-full bg-slate-950 border border-slate-700 rounded-lg p-3 font-mono text-xs text-emerald-300 
                       focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 resize-none
                       leading-relaxed"
            value={script}
            onChange={(e) => {
              setScript(e.target.value);
              setDirty(true);
              setValidation(null);
            }}
            spellCheck={false}
          />
        </div>

        {validation && !validation.valid && validation.error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 text-xs text-rose-400">
            {validation.error}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={handleValidate}
            className="btn btn-secondary text-xs flex-1"
            disabled={!dirty}
          >
            <CheckCircle className="w-3 h-3" /> 验证
          </button>
          <button
            onClick={handleSave}
            className="btn btn-primary text-xs flex-1"
            disabled={saving || !dirty}
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            保存
          </button>
          <button
            onClick={handleReset}
            className="btn btn-secondary text-xs"
          >
            <RotateCcw className="w-3 h-3" /> 重置
          </button>
        </div>

        <div className="text-[10px] text-slate-600 border-t border-slate-700/50 pt-2">
          <p>函数签名：<span className="text-purple-400">resolve(incoming, existing)</span> → <span className="text-purple-400">"incoming" | "existing"</span></p>
          <p className="mt-1">参数为Lua表：{'{ id, data, timestamp }'}</p>
        </div>
      </div>
    </div>
  );
}
