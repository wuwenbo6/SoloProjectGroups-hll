import { useState } from 'react';
import { Terminal, Send, CheckCircle2, XCircle, ShieldAlert, Loader2, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/api';
import { useAppStore } from '@/store';
import PacketViewer from '@/components/PacketViewer';

const COMMAND_SUGGESTIONS = [
  'show version',
  'show running-config',
  'show interfaces',
  'show ip route',
  'configure terminal',
  'enable',
  'ping 192.168.1.1',
  'traceroute 8.8.8.8',
];

interface HistoryItem {
  command: string;
  cmdArgs: string[];
  allowed: boolean;
  reason: string;
  returnAttrs?: Record<string, string>;
}

export default function AuthorizePage() {
  const [command, setCommand] = useState('show running-config');
  const [cmdArgs, setCmdArgs] = useState<string[]>([]);
  const [cmdArgsInput, setCmdArgsInput] = useState('');
  const [attrsInput, setAttrsInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const { currentUser, sessionId, isLoading, setIsLoading, authorizeResponse, setAuthorizeResponse } =
    useAppStore();

  const handleAddCmdArg = () => {
    if (cmdArgsInput.trim()) {
      setCmdArgs([...cmdArgs, cmdArgsInput.trim()]);
      setCmdArgsInput('');
    }
  };

  const handleRemoveCmdArg = (index: number) => {
    setCmdArgs(cmdArgs.filter((_, i) => i !== index));
  };

  const parseAttrs = (): Record<string, string> => {
    const attrs: Record<string, string> = {};
    attrsInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.includes('='))
      .forEach((s) => {
        const [k, ...v] = s.split('=');
        attrs[k.trim()] = v.join('=').trim();
      });
    return attrs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || !currentUser || !sessionId) return;

    setIsLoading(true);

    try {
      const attrs = parseAttrs();
      const response = await api.authorize({
        username: currentUser,
        command: command.trim(),
        cmdArgs: cmdArgs.length > 0 ? cmdArgs : undefined,
        attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
        sessionId: sessionId,
      });

      setAuthorizeResponse(response);
      setHistory((prev) => [
        {
          command: command.trim(),
          cmdArgs: [...cmdArgs],
          allowed: response.allowed,
          reason: response.reason,
          returnAttrs: response.returnAttrs,
        },
        ...prev,
      ]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (cmd: string) => {
    setCommand(cmd);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-6">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Terminal className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">命令授权</h1>
              <p className="text-slate-400 text-sm">模拟设备命令执行，验证 TACACS+ 授权策略</p>
            </div>
          </div>

          {!currentUser ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 text-center">
              <ShieldAlert className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <p className="text-amber-400 font-semibold mb-2">请先进行身份认证</p>
              <p className="text-slate-400 text-sm">需要先完成认证流程才能使用命令授权功能</p>
            </div>
          ) : (
            <>
              <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <div className="bg-slate-800 px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {currentUser}@router#
                  </span>
                </div>
                <div className="p-4">
                  <form onSubmit={handleSubmit}>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 font-mono text-sm">
                          #
                        </span>
                        <input
                          type="text"
                          value={command}
                          onChange={(e) => setCommand(e.target.value)}
                          className="w-full pl-8 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all font-mono"
                          placeholder="输入命令..."
                          disabled={isLoading}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isLoading || !command.trim()}
                        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2 shadow-lg shadow-purple-500/20"
                      >
                        {isLoading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="mt-3 flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors"
                    >
                      {showAdvanced ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                      高级选项
                    </button>

                    {showAdvanced && (
                      <div className="mt-4 space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700 animate-in fade-in duration-200">
                        <div>
                          <label className="block text-xs text-slate-400 mb-2">命令参数 (cmd-arg)</label>
                          <div className="flex gap-2 mb-2">
                            <input
                              type="text"
                              value={cmdArgsInput}
                              onChange={(e) => setCmdArgsInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddCmdArg();
                                }
                              }}
                              className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-mono"
                              placeholder="添加命令参数..."
                            />
                            <button
                              type="button"
                              onClick={handleAddCmdArg}
                              className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          {cmdArgs.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {cmdArgs.map((arg, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 text-slate-300 text-xs font-mono rounded"
                                >
                                  {arg}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveCmdArg(idx)}
                                    className="text-slate-400 hover:text-red-400 transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-2">
                            额外属性 (key=value，逗号分隔)
                          </label>
                          <input
                            type="text"
                            value={attrsInput}
                            onChange={(e) => setAttrsInput(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-mono"
                            placeholder="例如: priv-lvl=15, inacl=100"
                          />
                        </div>
                      </div>
                    )}
                  </form>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs text-slate-500 mb-2">快捷命令：</p>
                <div className="flex flex-wrap gap-2">
                  {COMMAND_SUGGESTIONS.map((cmd) => (
                    <button
                      key={cmd}
                      onClick={() => handleSuggestionClick(cmd)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono rounded-lg transition-colors border border-slate-700"
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
              </div>

              {authorizeResponse && (
                <div
                  className={`mt-4 p-4 rounded-xl border ${
                    authorizeResponse.allowed
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-red-500/10 border-red-500/30'
                  } animate-in fade-in duration-300`}
                >
                  <div className="flex items-start gap-3">
                    {authorizeResponse.allowed ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p
                        className={`font-semibold ${
                          authorizeResponse.allowed ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {authorizeResponse.allowed ? '命令已授权' : '命令被拒绝'}
                      </p>
                      <p className="text-sm text-slate-400 mt-1">{authorizeResponse.reason}</p>
                      {authorizeResponse.matchedPolicy && (
                        <p className="text-xs text-slate-500 mt-2 font-mono">
                          匹配策略: {authorizeResponse.matchedPolicy}
                        </p>
                      )}
                      {authorizeResponse.returnAttrs &&
                        Object.keys(authorizeResponse.returnAttrs).length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-700/50">
                            <p className="text-xs text-slate-500 mb-2">返回属性:</p>
                            <div className="space-y-1">
                              {Object.entries(authorizeResponse.returnAttrs).map(([k, v]) => (
                                <div key={k} className="flex gap-2 text-xs font-mono">
                                  <span className="text-cyan-400">{k}:</span>
                                  <span className="text-emerald-400">{v}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              )}

              {history.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider font-semibold">
                    执行历史
                  </p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {history.map((item, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50"
                      >
                        <div className="flex items-center gap-3">
                          {item.allowed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                          )}
                          <code className="text-sm font-mono text-slate-300 flex-1">{item.command}</code>
                        </div>
                        {item.cmdArgs && item.cmdArgs.length > 0 && (
                          <div className="mt-1 ml-7 flex flex-wrap gap-1">
                            {item.cmdArgs.map((arg, argIdx) => (
                              <span
                                key={argIdx}
                                className="text-xs px-1.5 py-0.5 bg-slate-700 text-slate-400 font-mono rounded"
                              >
                                {arg}
                              </span>
                            ))}
                          </div>
                        )}
                        {item.returnAttrs && Object.keys(item.returnAttrs).length > 0 && (
                          <div className="mt-1 ml-7 space-y-0.5">
                            {Object.entries(item.returnAttrs).map(([k, v]) => (
                              <div key={k} className="text-xs font-mono">
                                <span className="text-cyan-400">{k}:</span>{' '}
                                <span className="text-emerald-400">{v}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {authorizeResponse ? (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500 delay-200">
            <PacketViewer
              request={authorizeResponse.request}
              response={authorizeResponse.response}
              title="授权报文详情"
            />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center p-8 border-2 border-dashed border-slate-700 rounded-2xl">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-800 rounded-full flex items-center justify-center">
                <Terminal className="w-8 h-8 text-slate-600" />
              </div>
              <p className="text-slate-500">发送授权请求后</p>
              <p className="text-slate-600 text-sm">此处将显示 TACACS+ 报文详情</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
