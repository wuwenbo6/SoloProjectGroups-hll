import { useState, useCallback, useEffect, useRef } from 'react';

interface ExecutionResult {
  success: boolean;
  output: string;
  stats: Record<string, number>;
  errors: string[];
  extractedData: Array<Record<string, string>>;
  sessionId?: string;
}

interface ScriptTemplate {
  id: string;
  name: string;
  description: string;
  code: string;
  category: string;
  createdAt: number;
  updatedAt: number;
  isBuiltin?: boolean;
}

interface WsMessage {
  type: string;
  data?: any;
  id?: string;
}

const DEFAULT_SCRIPT = `-- OpenResty 日志处理示例
-- 定义 process_log 函数处理每一行日志

function process_log(line)
    -- 使用正则匹配提取请求方法和URL
    local method, url = line:match('"(%u+)%s+([^%s]+)%s+HTTP')
    
    if method and url then
        -- 统计 URL 访问次数
        stats.increment('url:' .. url)
        
        -- 统计 HTTP 方法分布
        stats.increment('method:' .. method)
        
        -- 提取状态码并统计
        local status = line:match('"%s+(%d+)%s+')
        if status then
            stats.increment('status:' .. status)
        end
        
        -- 提取并记录数据
        extractor.add({
            url = url,
            method = method,
            status = status or '-'
        })
        
        print('Processed: ' .. method .. ' ' .. url)
    end
end

print('Starting log processing...')
`;

const DEFAULT_LOGS = `127.0.0.1 - - [30/May/2026:10:00:01 +0800] "GET /api/users HTTP/1.1" 200 1234 "-" "Mozilla/5.0"
127.0.0.1 - - [30/May/2026:10:00:02 +0800] "POST /api/login HTTP/1.1" 200 567 "-" "Mozilla/5.0"
127.0.0.1 - - [30/May/2026:10:00:03 +0800] "GET /api/users HTTP/1.1" 200 1234 "-" "Chrome/120.0"
127.0.0.1 - - [30/May/2026:10:00:04 +0800] "GET /api/products HTTP/1.1" 200 2345 "-" "Mozilla/5.0"
127.0.0.1 - - [30/May/2026:10:00:05 +0800] "GET /api/users HTTP/1.1" 404 123 "-" "Safari/17.0"
127.0.0.1 - - [30/May/2026:10:00:06 +0800] "PUT /api/users/1 HTTP/1.1" 200 456 "-" "Mozilla/5.0"
127.0.0.1 - - [30/May/2026:10:00:07 +0800] "GET /api/products HTTP/1.1" 200 2345 "-" "Chrome/120.0"
127.0.0.1 - - [30/May/2026:10:00:08 +0800] "DELETE /api/users/2 HTTP/1.1" 204 0 "-" "Mozilla/5.0"
127.0.0.1 - - [30/May/2026:10:00:09 +0800] "GET /api/orders HTTP/1.1" 200 3456 "-" "Chrome/120.0"
127.0.0.1 - - [30/May/2026:10:00:10 +0800] "GET /api/users HTTP/1.1" 200 1234 "-" "Mozilla/5.0"`;

function App() {
  const [luaCode, setLuaCode] = useState(DEFAULT_SCRIPT);
  const [accessLogs, setAccessLogs] = useState(DEFAULT_LOGS);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [templates, setTemplates] = useState<ScriptTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState('自定义');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const sessionIdRef = useRef<string>('');

  useEffect(() => {
    const wsUrl = `ws://${window.location.hostname}:3001/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setWsConnected(true);
      console.log('[WS] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        
        if (msg.type === 'connected') {
          console.log('[WS] Connected:', msg.data);
        } else if (msg.type === 'execution:result') {
          if (msg.data?.sessionId === sessionIdRef.current) {
            setResult(msg.data.result);
            setIsExecuting(false);
          }
        } else if (msg.type === 'stats:update') {
          if (msg.data?.sessionId === sessionIdRef.current) {
            setResult(prev => prev ? { ...prev, stats: msg.data.stats } : null);
          }
        } else if (msg.type === 'execution:error') {
          if (msg.data?.sessionId === sessionIdRef.current) {
            setResult(prev => prev ? { ...prev, errors: [msg.data.error] } : null);
            setIsExecuting(false);
          }
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      console.log('[WS] Disconnected');
    };

    ws.onerror = (error) => {
      console.error('[WS] Error:', error);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (e) {
      console.error('Failed to load templates:', e);
    }
  };

  const executeScript = useCallback(async () => {
    setIsExecuting(true);
    setResult(null);

    const sessionId = `session_${Date.now()}`;
    sessionIdRef.current = sessionId;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        data: { sessionId }
      }));
    }

    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          luaCode,
          accessLogs: accessLogs.split('\n'),
          sessionId,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        output: '',
        stats: {},
        errors: ['Failed to connect to server: ' + (error as Error).message],
        extractedData: [],
      });
    } finally {
      setIsExecuting(false);
    }
  }, [luaCode, accessLogs]);

  const loadSampleData = async () => {
    try {
      const [logsRes, scriptRes] = await Promise.all([
        fetch('/api/sample-logs'),
        fetch('/api/sample-script'),
      ]);

      const logsData = await logsRes.json();
      const scriptData = await scriptRes.json();

      setAccessLogs(logsData.logs.join('\n'));
      setLuaCode(scriptData.script);
    } catch (error) {
      console.error('Failed to load sample data:', error);
    }
  };

  const clearAll = () => {
    setLuaCode('');
    setAccessLogs('');
    setResult(null);
  };

  const saveCurrentScript = async () => {
    setShowSaveModal(true);
    setNewTemplateName('');
    setNewTemplateDesc('');
  };

  const doSaveTemplate = async () => {
    if (!newTemplateName.trim() || !luaCode.trim()) return;

    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName,
          description: newTemplateDesc,
          code: luaCode,
          category: newTemplateCategory,
        }),
      });

      if (res.ok) {
        await fetchTemplates();
        setShowSaveModal(false);
      }
    } catch (e) {
      console.error('Failed to save template:', e);
    }
  };

  const loadTemplate = (template: ScriptTemplate) => {
    setLuaCode(template.code);
    setShowTemplateModal(false);
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('确定要删除这个模板吗？')) return;
    try {
      await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      await fetchTemplates();
    } catch (e) {
      console.error('Failed to delete template:', e);
    }
  };

  const groupStats = (stats: Record<string, number>) => {
    const groups: Record<string, Record<string, number>> = {};
    
    Object.entries(stats).forEach(([key, value]) => {
      const parts = key.split(':');
      const group = parts.length > 1 ? parts[0] : 'other';
      const displayKey = parts.length > 1 ? parts.slice(1).join(':') : key;
      
      if (!groups[group]) {
        groups[group] = {};
      }
      groups[group][displayKey] = value;
    });

    return groups;
  };

  const getMaxValue = (obj: Record<string, number>) => {
    return Math.max(...Object.values(obj), 1);
  };

  const categories = [...new Set(templates.map(t => t.category))].sort();
  const filteredTemplates = selectedCategory
    ? templates.filter(t => t.category === selectedCategory)
    : templates;

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>OpenResty 日志处理模拟器</h1>
          <div className="subtitle">
            Lua 脚本沙箱执行 · 实时日志分析 · URL 访问统计
            <span className={`ws-indicator ${wsConnected ? 'connected' : ''}`}>
              {wsConnected ? '● WebSocket 已连接' : '○ WebSocket 断开'}
            </span>
          </div>
        </div>
        <div className="panel-actions">
          <button className="btn btn-secondary" onClick={() => setShowTemplateModal(true)}>
            📂 模板库
          </button>
          <button className="btn btn-secondary" onClick={saveCurrentScript}>
            💾 保存模板
          </button>
          <button className="btn btn-secondary" onClick={loadSampleData}>
            加载示例
          </button>
          <button className="btn btn-secondary" onClick={clearAll}>
            清空
          </button>
          <button
            className="btn btn-primary"
            onClick={executeScript}
            disabled={isExecuting || !luaCode.trim()}
          >
            {isExecuting ? '执行中...' : '运行脚本'}
          </button>
        </div>
      </header>

      <main className="main-content">
        <div className="top-section">
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Lua 脚本编辑器</span>
              <span style={{ fontSize: '12px', color: '#858585' }}>
                定义 process_log(line) 函数处理每一行日志
              </span>
            </div>
            <textarea
              className="code-editor"
              value={luaCode}
              onChange={(e) => setLuaCode(e.target.value)}
              placeholder="-- 在这里编写 Lua 脚本"
              spellCheck={false}
            />
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Access 日志输入</span>
              <span style={{ fontSize: '12px', color: '#858585' }}>
                每行一条 Nginx access log
              </span>
            </div>
            <textarea
              className="log-input"
              value={accessLogs}
              onChange={(e) => setAccessLogs(e.target.value)}
              placeholder='127.0.0.1 - - [30/May/2026:10:00:01 +0800] "GET /api/users HTTP/1.1" 200 1234'
              spellCheck={false}
            />
          </div>
        </div>

        <div className="bottom-section">
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">执行输出</span>
            </div>
            <div className="output-panel">
              {isExecuting ? (
                <div className="loading">
                  <div className="spinner" />
                  <span>正在执行 Lua 脚本...</span>
                </div>
              ) : result ? (
                <>
                  {result.output && (
                    <pre className="output-line print">{result.output}</pre>
                  )}
                  {result.errors.length > 0 && (
                    <pre className="output-line error">
                      {result.errors.join('\n')}
                    </pre>
                  )}
                  {!result.output && result.errors.length === 0 && (
                    <span style={{ color: '#666' }}>无输出</span>
                  )}
                </>
              ) : (
                <span style={{ color: '#666' }}>点击"运行脚本"开始执行</span>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">统计结果</span>
              <span style={{ fontSize: '12px', color: '#858585' }}>
                使用 stats.increment(key) 统计计数
              </span>
            </div>
            <div className="stats-panel">
              {isExecuting ? (
                <div className="loading">
                  <span>统计中...</span>
                </div>
              ) : result && Object.keys(result.stats).length > 0 ? (
                Object.entries(groupStats(result.stats)).map(
                  ([category, items]) => (
                    <div key={category} className="stats-category">
                      <div className="stats-category-title">
                        {category.toUpperCase()}
                      </div>
                      {Object.entries(items)
                        .sort((a, b) => b[1] - a[1])
                        .map(([key, value]) => (
                          <div key={key} className="stats-item">
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                }}
                              >
                                <span className="stats-key">{key}</span>
                                <span className="stats-value">{value}</span>
                              </div>
                              <div
                                className="stats-bar"
                                style={{
                                  width: `${(value / getMaxValue(items)) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                    </div>
                  )
                )
              ) : (
                <span style={{ color: '#666' }}>暂无统计数据</span>
              )}
            </div>
          </div>
        </div>

        {result && result.extractedData.length > 0 && (
          <div className="panel" style={{ minHeight: '200px' }}>
            <div className="panel-header">
              <span className="panel-title">提取的数据</span>
              <span style={{ fontSize: '12px', color: '#858585' }}>
                使用 extractor.add(data) 提取数据
              </span>
            </div>
            <div className="stats-panel">
              <table className="extracted-table">
                <thead>
                  <tr>
                    {Object.keys(result.extractedData[0]).map((key) => (
                      <th key={key}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.extractedData.map((row, index) => (
                    <tr key={index}>
                      {Object.values(row).map((value, i) => (
                        <td key={i}>{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <div
        className={`status-bar ${result ? (result.success ? 'status-success' : 'status-error') : ''}`}
      >
        <span>
          {isExecuting
            ? '执行中...'
            : result
            ? result.success
              ? `执行成功 · ${Object.keys(result.stats).length} 个统计项 · ${result.extractedData.length} 条提取数据`
              : '执行失败'
            : '就绪'}
        </span>
        <span>
          日志行数: {accessLogs.split('\n').filter((l) => l.trim()).length}
        </span>
      </div>

      {showTemplateModal && (
        <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📂 脚本模板库</h3>
              <button className="modal-close" onClick={() => setShowTemplateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="template-filters">
                <button
                  className={`filter-btn ${!selectedCategory ? 'active' : ''}`}
                  onClick={() => setSelectedCategory('')}
                >
                  全部
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="template-list">
                {filteredTemplates.map(template => (
                  <div key={template.id} className="template-item">
                    <div className="template-info">
                      <div className="template-name">
                        {template.isBuiltin && <span className="builtin-badge">内置</span>}
                        {template.name}
                      </div>
                      <div className="template-desc">{template.description}</div>
                      <div className="template-category">{template.category}</div>
                    </div>
                    <div className="template-actions">
                      <button className="btn btn-primary btn-sm" onClick={() => loadTemplate(template)}>
                        加载
                      </button>
                      {!template.isBuiltin && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => deleteTemplate(template.id)}
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💾 保存为模板</h3>
              <button className="modal-close" onClick={() => setShowSaveModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>模板名称</label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="输入模板名称"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>描述</label>
                <textarea
                  value={newTemplateDesc}
                  onChange={(e) => setNewTemplateDesc(e.target.value)}
                  placeholder="模板描述"
                  className="form-textarea"
                />
              </div>
              <div className="form-group">
                <label>分类</label>
                <select
                  value={newTemplateCategory}
                  onChange={(e) => setNewTemplateCategory(e.target.value)}
                  className="form-select"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="自定义">自定义</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSaveModal(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={doSaveTemplate}
                disabled={!newTemplateName.trim()}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
