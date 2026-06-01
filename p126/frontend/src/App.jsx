import React, { useState, useEffect, useRef } from 'react';
import ComponentLibrary from './components/ComponentLibrary.jsx';
import CircuitEditor from './components/CircuitEditor.jsx';
import PropertyPanel from './components/PropertyPanel.jsx';
import SimulationPanel from './components/SimulationPanel.jsx';
import WaveformViewer from './components/WaveformViewer.jsx';
import CircuitList from './components/CircuitList.jsx';
import AdvancedAnalysisPanel from './components/AdvancedAnalysisPanel.jsx';
import MonteCarloResults from './components/MonteCarloResults.jsx';
import {
  getCircuits,
  getCircuit,
  createCircuit as apiCreateCircuit,
  updateCircuit as apiUpdateCircuit,
  deleteCircuit as apiDeleteCircuit,
  simulate as apiSimulate,
  exportNetlistFile
} from './utils/api.js';
import { exportReport } from './utils/pdfExport.js';

export default function App() {
  const [circuitData, setCircuitData] = useState({ components: [], wires: [] });
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [simulationResult, setSimulationResult] = useState(null);
  const [monteCarloResult, setMonteCarloResult] = useState(null);
  const [temperatureSweepResult, setTemperatureSweepResult] = useState(null);
  const [simulationConfig, setSimulationConfig] = useState({ type: 'tran', start: 0, stop: 0.01, step: 1e-5 });
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState(null);
  const [circuits, setCircuits] = useState([]);
  const [currentCircuitId, setCurrentCircuitId] = useState(null);
  const [circuitName, setCircuitName] = useState('未命名电路');
  const [circuitDesc, setCircuitDesc] = useState('');
  const [view, setView] = useState('editor');
  const [showMonteCarloResults, setShowMonteCarloResults] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const editorRef = useRef(null);
  const waveformRef = useRef(null);

  useEffect(() => {
    loadCircuits();
  }, []);

  const loadCircuits = async () => {
    try {
      const data = await getCircuits();
      setCircuits(data);
    } catch (e) {
      console.error('Failed to load circuits:', e);
    }
  };

  const handleNewCircuit = () => {
    setCircuitData({ components: [], wires: [] });
    setSelectedComponent(null);
    setSimulationResult(null);
    setMonteCarloResult(null);
    setTemperatureSweepResult(null);
    setCurrentCircuitId(null);
    setCircuitName('未命名电路');
    setCircuitDesc('');
    setView('editor');
    setShowMonteCarloResults(false);
  };

  const handleLoadCircuit = async (id) => {
    try {
      const data = await getCircuit(id);
      setCircuitData(data.circuit_data);
      setCircuitName(data.name);
      setCircuitDesc(data.description || '');
      setCurrentCircuitId(id);
      setSimulationResult(null);
      setMonteCarloResult(null);
      setTemperatureSweepResult(null);
      setSelectedComponent(null);
      setView('editor');
      setShowMonteCarloResults(false);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSaveCircuit = async () => {
    try {
      if (!circuitName.trim()) {
        setError('请输入电路名称');
        return;
      }
      if (circuitData.components.length === 0) {
        setError('电路不能为空');
        return;
      }

      const payload = {
        name: circuitName,
        description: circuitDesc,
        circuit_data: circuitData
      };

      if (currentCircuitId) {
        await apiUpdateCircuit(currentCircuitId, payload);
      } else {
        const newCircuit = await apiCreateCircuit(payload);
        setCurrentCircuitId(newCircuit.id);
      }
      setError(null);
      loadCircuits();
      setError('保存成功！');
      setTimeout(() => setError(null), 2000);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteCircuit = async (id) => {
    if (!confirm('确定要删除这个电路吗？')) return;
    try {
      await apiDeleteCircuit(id);
      if (currentCircuitId === id) {
        handleNewCircuit();
      }
      loadCircuits();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSimulate = async (data, config, temperature = null) => {
    setSimulationConfig(config);
    setIsSimulating(true);
    setError(null);
    try {
      const result = await apiSimulate(data, config, currentCircuitId, temperature);
      setSimulationResult(result);
      setMonteCarloResult(null);
      setTemperatureSweepResult(null);
      setView('waveform');
    } catch (e) {
      setError(e.message);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleMonteCarloResult = (result) => {
    setMonteCarloResult(result);
    setTemperatureSweepResult(null);
    setSimulationResult(null);
    setView('waveform');
    setShowMonteCarloResults(true);
  };

  const handleTemperatureResult = (result) => {
    setTemperatureSweepResult(result);
    setMonteCarloResult(null);
    setSimulationResult(null);
    setView('waveform');
    setShowMonteCarloResults(false);
  };

  const handleExportNetlist = async (data, config) => {
    try {
      await exportNetlistFile(data, config, `${circuitName}.cir`);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    setError(null);
    try {
      await exportReport({
        circuitName,
        circuitDescription: circuitDesc,
        circuitData,
        simulationResult,
        monteCarloResult,
        temperatureSweepResult,
        simulationConfig,
        netlist: simulationResult?.netlist || '',
        editorElement: editorRef.current,
        waveformElement: waveformRef.current
      });
    } catch (e) {
      console.error('PDF导出失败:', e);
      setError('PDF导出失败: ' + e.message);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const hasAnyResult = simulationResult || monteCarloResult || temperatureSweepResult;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>⚡ Circuit Simulator</h1>
          <input
            type="text"
            className="circuit-name-input"
            value={circuitName}
            onChange={(e) => setCircuitName(e.target.value)}
            placeholder="电路名称"
          />
        </div>
        <div className="header-center">
          <div className="view-toggle">
            <button
              className={`btn ${view === 'editor' ? 'active' : ''}`}
              onClick={() => setView('editor')}
            >
              电路图
            </button>
            <button
              className={`btn ${view === 'waveform' ? 'active' : ''}`}
              onClick={() => setView('waveform')}
              disabled={!hasAnyResult}
            >
              波形
            </button>
          </div>
        </div>
        <div className="header-right">
          <button
            className="btn"
            onClick={handleExportPdf}
            disabled={!hasAnyResult || isExportingPdf}
          >
            {isExportingPdf ? '导出中...' : '📄 导出PDF'}
          </button>
          <button className="btn" onClick={handleSaveCircuit}>
            💾 保存
          </button>
        </div>
      </header>

      {error && (
        <div className={`error-banner ${error.includes('成功') ? 'success' : ''}`}>
          {error}
          <button onClick={() => setError(null)} className="close-btn">✕</button>
        </div>
      )}

      <div className="app-body">
        <aside className="sidebar left">
          <CircuitList
            circuits={circuits}
            currentId={currentCircuitId}
            onSelect={handleLoadCircuit}
            onDelete={handleDeleteCircuit}
            onNew={handleNewCircuit}
          />
          {view === 'editor' && <ComponentLibrary />}
        </aside>

        <main className="main-content">
          {view === 'editor' ? (
            <div ref={editorRef}>
              <CircuitEditor
                circuitData={circuitData}
                onChange={setCircuitData}
                selectedComponent={selectedComponent}
                onSelectComponent={setSelectedComponent}
              />
            </div>
          ) : (
            <div ref={waveformRef} style={{ width: '100%', height: '100%' }}>
              {showMonteCarloResults && monteCarloResult && (
                <MonteCarloResults
                  result={monteCarloResult}
                  onClose={() => setShowMonteCarloResults(false)}
                />
              )}
              <WaveformViewer
                simulationResult={simulationResult}
                monteCarloResult={showMonteCarloResults ? null : monteCarloResult}
                temperatureSweepResult={temperatureSweepResult}
              />
            </div>
          )}
        </main>

        <aside className="sidebar right">
          {view === 'editor' ? (
            <>
              <PropertyPanel
                circuitData={circuitData}
                selectedComponent={selectedComponent}
                onChange={setCircuitData}
              />
              <SimulationPanel
                onSimulate={handleSimulate}
                onExportNetlist={handleExportNetlist}
                circuitData={circuitData}
                isSimulating={isSimulating}
              />
              <AdvancedAnalysisPanel
                circuitData={circuitData}
                simulationConfig={simulationConfig}
                onMonteCarloResult={handleMonteCarloResult}
                onTemperatureResult={handleTemperatureResult}
                isRunning={isSimulating}
                setIsRunning={setIsSimulating}
                setError={setError}
              />
            </>
          ) : (
            <div className="netlist-panel">
              <h3>SPICE 网表</h3>
              <pre className="netlist-content">
                {simulationResult?.netlist ||
                 temperatureSweepResult?.results?.[0]?.netlist ||
                 monteCarloResult?.results?.[0]?.result?.netlist ||
                 '无数据'}
              </pre>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
