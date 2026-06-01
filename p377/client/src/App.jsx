import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';

const API_BASE = '/api';

const DEFAULT_CODE = `#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>

SEC("xdp")
int xdp_drop_all(struct xdp_md *ctx) {
    return XDP_DROP;
}

char _license[] SEC("license") = "GPL";`;

export default function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [activeTab, setActiveTab] = useState('logs');
  const [logs, setLogs] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [programId, setProgramId] = useState(null);
  const [interfaceName, setInterfaceName] = useState('veth0');
  const [packetCount, setPacketCount] = useState(100);
  const [examples, setExamples] = useState([]);
  const [selectedExample, setSelectedExample] = useState('');
  const [simulationResults, setSimulationResults] = useState(null);
  const [interfaces, setInterfaces] = useState([]);
  const logPanelRef = useRef(null);

  useEffect(() => {
    fetchExamples();
    fetchInterfaces();
  }, []);

  const fetchExamples = async () => {
    try {
      const res = await fetch(`${API_BASE}/examples`);
      const data = await res.json();
      setExamples(data.examples);
    } catch (err) {
      console.error('Failed to fetch examples:', err);
    }
  };

  const fetchInterfaces = async () => {
    try {
      const res = await fetch(`${API_BASE}/interfaces`);
      const data = await res.json();
      setInterfaces(data.interfaces);
    } catch (err) {
      console.error('Failed to fetch interfaces:', err);
    }
  };

  const loadExample = async (exampleId) => {
    if (!exampleId) return;
    try {
      const res = await fetch(`${API_BASE}/examples/${exampleId}`);
      const data = await res.json();
      setCode(data.code);
      setSelectedExample(exampleId);
    } catch (err) {
      console.error('Failed to load example:', err);
    }
  };

  const compileAndVerify = async () => {
    setIsCompiling(true);
    setLogs('Compiling...');
    
    try {
      const res = await fetch(`${API_BASE}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      
      setLogs(data.logs);
      
      if (data.success) {
        setProgramId(data.programId);
        await attachProgram(data.programId);
      }
    } catch (err) {
      setLogs(`Error: ${err.message}`);
    } finally {
      setIsCompiling(false);
    }
  };

  const attachProgram = async (pid) => {
    try {
      const res = await fetch(`${API_BASE}/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId: pid,
          interfaceName,
          code
        })
      });
      const data = await res.json();
      
      setLogs(prev => prev + '\n\n' + data.message);
      await fetchInterfaces();
    } catch (err) {
      setLogs(prev => prev + `\n\nAttach Error: ${err.message}`);
    }
  };

  const runSimulation = async () => {
    setIsSimulating(true);
    
    try {
      const res = await fetch(`${API_BASE}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interfaceName,
          packetCount: parseInt(packetCount)
        })
      });
      const data = await res.json();
      
      setSimulationResults(data);
      setActiveTab('stats');
      await fetchInterfaces();
    } catch (err) {
      setLogs(`Simulation Error: ${err.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const resetStats = async () => {
    try {
      await fetch(`${API_BASE}/interfaces/${interfaceName}/reset`, {
        method: 'POST'
      });
      setSimulationResults(null);
      await fetchInterfaces();
    } catch (err) {
      console.error('Failed to reset stats:', err);
    }
  };

  const exportLogs = async (format = 'text') => {
    if (!logs) return;
    
    try {
      const res = await fetch(`${API_BASE}/logs/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs,
          type: activeTab === 'logs' ? 'verifier' : 'simulation',
          format
        })
      });
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition');
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      a.download = filenameMatch ? filenameMatch[1] : `ebpf-logs-${Date.now()}.log`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export logs:', err);
    }
  };

  const exportLogsQuick = (format) => {
    exportLogs(format);
  };

  const getActionClass = (action) => {
    switch (action) {
      case 'XDP_DROP': return 'action-drop';
      case 'XDP_PASS': return 'action-pass';
      case 'XDP_TX': return 'action-tx';
      case 'XDP_REDIRECT': return 'action-redirect';
      default: return '';
    }
  };

  const formatLogs = (logText) => {
    return logText.split('\n').map((line, i) => {
      let className = '';
      if (line.includes('[ERROR]') || line.includes('Error:')) className = 'error';
      else if (line.includes('[WARNING]')) className = 'warning';
      else if (line.includes('PASSED') || line.includes('successful') || line.includes('success')) className = 'success';
      else if (line.startsWith('[')) className = 'info';
      
      return <div key={i} className={className}>{line || ' '}</div>;
    });
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>eBPF XDP Web Editor</h1>
          <span className="subtitle">模拟编译与测试环境</span>
        </div>
        <div className="header-right">
          <button onClick={compileAndVerify} disabled={isCompiling} className="primary">
            {isCompiling ? <span className="spinner"></span> : null}
            {isCompiling ? '编译中...' : '编译 & 验证'}
          </button>
        </div>
      </header>

      <div className="main-container">
        <section className="editor-section">
          <div className="editor-toolbar">
            <div className="toolbar-group">
              <span style={{ fontSize: '12px', color: '#8b949e' }}>示例:</span>
              <select 
                value={selectedExample}
                onChange={(e) => loadExample(e.target.value)}
              >
                <option value="">选择示例程序</option>
                {examples.map(ex => (
                  <option key={ex.id} value={ex.id}>{ex.name}</option>
                ))}
              </select>
            </div>
            <div className="toolbar-divider"></div>
            <div className="toolbar-group">
              <span style={{ fontSize: '12px', color: '#8b949e' }}>网卡:</span>
              <input
                type="text"
                value={interfaceName}
                onChange={(e) => setInterfaceName(e.target.value)}
                placeholder="虚拟网卡名"
                style={{ width: '100px' }}
              />
            </div>
          </div>
          
          <div className="editor-wrapper">
            <Editor
              height="100%"
              defaultLanguage="c"
              value={code}
              onChange={(value) => setCode(value || '')}
              theme="vs-dark"
              options={{
                fontSize: 13,
                fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                renderLineHighlight: 'all',
                automaticLayout: true
              }}
            />
          </div>
        </section>

        <section className="panels-section">
          <div className="panel-tabs">
            <div 
              className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
              onClick={() => setActiveTab('logs')}
            >
              编译日志
            </div>
            <div 
              className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
              onClick={() => setActiveTab('stats')}
            >
              丢包统计
            </div>
            <div 
              className={`tab ${activeTab === 'interfaces' ? 'active' : ''}`}
              onClick={() => setActiveTab('interfaces')}
            >
              虚拟网卡
            </div>
          </div>

          <div className="panel-content">
            {activeTab === 'logs' && (
              <>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '8px 16px',
                  background: '#161b22',
                  borderBottom: '1px solid #30363d'
                }}>
                  <span style={{ fontSize: '12px', color: '#8b949e' }}>
                    编译日志 & Verifier 输出
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      onClick={() => exportLogsQuick('text')} 
                      disabled={!logs}
                      style={{ padding: '4px 12px', fontSize: '12px' }}
                    >
                      导出 TXT
                    </button>
                    <button 
                      onClick={() => exportLogsQuick('json')} 
                      disabled={!logs}
                      style={{ padding: '4px 12px', fontSize: '12px' }}
                    >
                      导出 JSON
                    </button>
                  </div>
                </div>
                <div className="log-panel" ref={logPanelRef}>
                  {logs ? formatLogs(logs) : (
                    <div className="empty-state">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                      <p>点击"编译 & 验证"按钮开始</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'stats' && (
              <div className="stats-panel">
                <div className="simulation-controls">
                  <span style={{ fontSize: '12px', color: '#8b949e' }}>数据包数:</span>
                  <input
                    type="number"
                    value={packetCount}
                    onChange={(e) => setPacketCount(e.target.value)}
                    min="1"
                    max="10000"
                    style={{ width: '80px' }}
                  />
                  <button onClick={runSimulation} disabled={isSimulating || !programId} className="primary">
                    {isSimulating ? <span className="spinner"></span> : null}
                    运行模拟
                  </button>
                  <button onClick={resetStats} disabled={!simulationResults}>
                    重置统计
                  </button>
                </div>

                {simulationResults ? (
                  <>
                    <div className="stats-grid">
                      <div className="stat-card">
                        <div className="label">总数据包</div>
                        <div className="value info">{simulationResults.summary.totalPackets}</div>
                      </div>
                      <div className="stat-card">
                        <div className="label">丢弃数据包</div>
                        <div className="value danger">{simulationResults.summary.dropped}</div>
                      </div>
                      <div className="stat-card">
                        <div className="label">通过数据包</div>
                        <div className="value success">{simulationResults.summary.passed}</div>
                      </div>
                      <div className="stat-card">
                        <div className="label">丢包率</div>
                        <div className="value warning">{simulationResults.summary.dropRate}</div>
                      </div>
                    </div>

                    <div className="chart-container">
                      <div className="section-title">动作分布</div>
                      <div className="chart-bars">
                        <div className="chart-bar">
                          <div 
                            className="chart-bar-fill" 
                            style={{ 
                              height: `${(simulationResults.results.passed / simulationResults.results.totalPackets) * 100}%`,
                              background: '#3fb950'
                            }}
                          ></div>
                          <div className="chart-bar-label">PASS</div>
                        </div>
                        <div className="chart-bar">
                          <div 
                            className="chart-bar-fill" 
                            style={{ 
                              height: `${(simulationResults.results.dropped / simulationResults.results.totalPackets) * 100}%`,
                              background: '#f85149'
                            }}
                          ></div>
                          <div className="chart-bar-label">DROP</div>
                        </div>
                        <div className="chart-bar">
                          <div 
                            className="chart-bar-fill" 
                            style={{ 
                              height: `${(simulationResults.results.tx / simulationResults.results.totalPackets) * 100}%`,
                              background: '#58a6ff'
                            }}
                          ></div>
                          <div className="chart-bar-label">TX</div>
                        </div>
                        <div className="chart-bar">
                          <div 
                            className="chart-bar-fill" 
                            style={{ 
                              height: `${(simulationResults.results.redirect / simulationResults.results.totalPackets) * 100}%`,
                              background: '#d29922'
                            }}
                          ></div>
                          <div className="chart-bar-label">REDIRECT</div>
                        </div>
                      </div>
                      <div className="chart-legend">
                        <div className="legend-item">
                          <div className="legend-color" style={{ background: '#3fb950' }}></div>
                          <span>PASS ({simulationResults.results.passed})</span>
                        </div>
                        <div className="legend-item">
                          <div className="legend-color" style={{ background: '#f85149' }}></div>
                          <span>DROP ({simulationResults.results.dropped})</span>
                        </div>
                        <div className="legend-item">
                          <div className="legend-color" style={{ background: '#58a6ff' }}></div>
                          <span>TX ({simulationResults.results.tx})</span>
                        </div>
                        <div className="legend-item">
                          <div className="legend-color" style={{ background: '#d29922' }}></div>
                          <span>REDIRECT ({simulationResults.results.redirect})</span>
                        </div>
                      </div>
                    </div>

                    <div className="section-title">数据包详情（前20条）</div>
                    <table className="packet-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>源IP</th>
                          <th>目的IP</th>
                          <th>协议</th>
                          <th>目的端口</th>
                          <th>大小</th>
                          <th>动作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {simulationResults.results.details.slice(0, 20).map((pkt) => (
                          <tr key={pkt.packetId}>
                            <td>{pkt.packetId}</td>
                            <td>{pkt.srcIp}</td>
                            <td>{pkt.dstIp}</td>
                            <td>{pkt.protocol}</td>
                            <td>{pkt.dstPort}</td>
                            <td>{pkt.size}B</td>
                            <td>
                              <span className={`action-badge ${getActionClass(pkt.action)}`}>
                                {pkt.action}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <div className="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    <p>先编译程序，然后运行流量模拟</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'interfaces' && (
              <div className="interfaces-panel">
                {interfaces.length > 0 ? (
                  interfaces.map((iface) => (
                    <div key={iface.name} className="interface-card">
                      <div className="interface-header">
                        <span className="interface-name">{iface.name}</span>
                        <span className="interface-status">
                          {iface.hasProgram ? '已加载程序' : '空闲'}
                        </span>
                      </div>
                      <div className="interface-stats">
                        <div className="interface-stat">
                          <div className="stat-label">接收包</div>
                          <div className="stat-value">{iface.stats.rxPackets}</div>
                        </div>
                        <div className="interface-stat">
                          <div className="stat-label">发送包</div>
                          <div className="stat-value">{iface.stats.txPackets}</div>
                        </div>
                        <div className="interface-stat">
                          <div className="stat-label">丢弃</div>
                          <div className="stat-value">{iface.stats.droppedPackets}</div>
                        </div>
                        <div className="interface-stat">
                          <div className="stat-label">通过</div>
                          <div className="stat-value">{iface.stats.passedPackets}</div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                      <line x1="6" y1="6" x2="6.01" y2="6" />
                      <line x1="6" y1="18" x2="6.01" y2="18" />
                    </svg>
                    <p>编译并加载程序后会显示虚拟网卡</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
