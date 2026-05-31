import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import Viewer from './components/Viewer';
import ParameterEditor from './components/ParameterEditor';
import ModelSelector from './components/ModelSelector';
import ParameterSets from './components/ParameterSets';
import ExportPanel from './components/ExportPanel';

const modelConfigs = {
  cube: {
    name: '立方体',
    category: '基础',
    parameters: [
      { name: 'width', label: '宽度', type: 'slider', min: 1, max: 100, step: 1, default: 30 },
      { name: 'height', label: '高度', type: 'slider', min: 1, max: 100, step: 1, default: 30 },
      { name: 'depth', label: '深度', type: 'slider', min: 1, max: 100, step: 1, default: 30 }
    ]
  },
  cylinder: {
    name: '圆柱体',
    category: '基础',
    parameters: [
      { name: 'height', label: '高度', type: 'slider', min: 1, max: 200, step: 1, default: 50 },
      { name: 'radius', label: '半径', type: 'slider', min: 1, max: 100, step: 1, default: 20 },
      { name: 'segments', label: '分段数', type: 'slider', min: 3, max: 100, step: 1, default: 32 }
    ]
  },
  bottle: {
    name: '瓶子',
    category: '容器',
    parameters: [
      { name: 'height', label: '瓶身高度', type: 'slider', min: 50, max: 300, step: 1, default: 150 },
      { name: 'radius', label: '瓶身半径', type: 'slider', min: 20, max: 80, step: 1, default: 40 },
      { name: 'wall_thickness', label: '壁厚', type: 'slider', min: 1, max: 10, step: 0.5, default: 2 },
      { name: 'neck_height', label: '瓶颈高度', type: 'slider', min: 10, max: 50, step: 1, default: 20 },
      { name: 'neck_radius', label: '瓶颈半径', type: 'slider', min: 10, max: 40, step: 1, default: 15 },
      { name: 'segments', label: '分段数', type: 'slider', min: 8, max: 100, step: 1, default: 32 }
    ]
  },
  gear_simple: {
    name: '齿轮',
    category: '机械',
    parameters: [
      { name: 'teeth', label: '齿数', type: 'slider', min: 8, max: 60, step: 1, default: 20 },
      { name: 'pitch_diameter', label: '节圆直径', type: 'slider', min: 20, max: 150, step: 1, default: 40 },
      { name: 'face_width', label: '齿宽', type: 'slider', min: 5, max: 50, step: 1, default: 10 },
      { name: 'tooth_depth', label: '齿深', type: 'slider', min: 1, max: 10, step: 0.5, default: 2.5 },
      { name: 'bore_diameter', label: '内孔直径', type: 'slider', min: 0, max: 50, step: 1, default: 10 },
      { name: 'hub_diameter', label: '轮毂直径', type: 'slider', min: 0, max: 80, step: 1, default: 20 },
      { name: 'hub_height', label: '轮毂高度', type: 'slider', min: 0, max: 50, step: 1, default: 0 }
    ]
  },
  thread_simple: {
    name: '螺纹',
    category: '机械',
    parameters: [
      { name: 'diameter', label: '直径', type: 'slider', min: 5, max: 100, step: 1, default: 20 },
      { name: 'length', label: '长度', type: 'slider', min: 10, max: 200, step: 1, default: 50 },
      { name: 'pitch', label: '螺距', type: 'slider', min: 1, max: 10, step: 0.5, default: 2.5 },
      { name: 'thread_depth', label: '螺纹深度', type: 'slider', min: 0.5, max: 5, step: 0.1, default: 1.5 }
    ]
  }
};

const DEBOUNCE_DELAY = 800;

function App() {
  const [selectedModel, setSelectedModel] = useState('cube');
  const [parameters, setParameters] = useState({});
  const [stlUrl, setStlUrl] = useState(null);
  const [status, setStatus] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('就绪');
  const [parameterSets, setParameterSets] = useState([]);
  const [renderProgress, setRenderProgress] = useState(0);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [toolsAvailable, setToolsAvailable] = useState({ openscad: false, freecad: false });
  
  const debounceTimerRef = useRef(null);
  const isRenderingRef = useRef(false);
  const pendingRenderRef = useRef(null);
  const progressIntervalRef = useRef(null);

  useEffect(() => {
    const config = modelConfigs[selectedModel];
    if (config) {
      const defaultParams = {};
      config.parameters.forEach(p => {
        defaultParams[p.name] = p.default;
      });
      setParameters(defaultParams);
    }
  }, [selectedModel]);

  useEffect(() => {
    loadParameterSets();
    checkTools();
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      cancelCurrentRender();
    };
  }, []);

  useEffect(() => {
    if (Object.keys(parameters).length > 0) {
      scheduleRender();
    }
  }, [parameters, selectedModel]);

  const checkTools = async () => {
    try {
      const response = await axios.get('/api/tools/check');
      if (response.data.success) {
        setToolsAvailable(response.data.tools);
      }
    } catch (error) {
      console.error('检查工具失败:', error);
    }
  };

  const loadParameterSets = async () => {
    try {
      const response = await axios.get('/api/parameter-sets');
      if (response.data.success) {
        setParameterSets(response.data.parameterSets);
      }
    } catch (error) {
      console.error('加载参数集失败:', error);
    }
  };

  const cancelCurrentRender = async () => {
    if (currentJobId) {
      try {
        await axios.post(`/api/cancel/${currentJobId}`);
      } catch (e) {}
      setCurrentJobId(null);
    }
    isRenderingRef.current = false;
    setRenderProgress(0);
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const startProgressSimulation = () => {
    setRenderProgress(0);
    let progress = 0;
    progressIntervalRef.current = setInterval(() => {
      progress += Math.random() * 5;
      if (progress > 95) progress = 95;
      setRenderProgress(progress);
    }, 500);
  };

  const stopProgressSimulation = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setRenderProgress(100);
  };

  const generatePreview = useCallback(async () => {
    if (isRenderingRef.current) {
      pendingRenderRef.current = { modelName: selectedModel, parameters };
      return;
    }

    isRenderingRef.current = true;
    setStatus('loading');
    setStatusMessage('正在生成预览...');
    startProgressSimulation();

    try {
      const response = await axios.post('/api/preview', {
        modelName: selectedModel,
        parameters
      });
      
      if (response.data.success) {
        setStlUrl(response.data.stlUrl);
        setCurrentJobId(response.data.jobId);
        setStatus('idle');
        setStatusMessage(response.data.cached ? '预览已加载 (缓存)' : '预览已更新');
      }
    } catch (error) {
      if (error.code !== 'ERR_CANCELED') {
        setStatus('error');
        setStatusMessage('预览生成失败: ' + error.message);
        console.error('预览生成失败:', error);
      }
    } finally {
      stopProgressSimulation();
      isRenderingRef.current = false;
      
      if (pendingRenderRef.current) {
        const pending = pendingRenderRef.current;
        pendingRenderRef.current = null;
        setTimeout(() => generatePreview(), 100);
      }
    }
  }, [selectedModel, parameters]);

  const scheduleRender = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      generatePreview();
    }, DEBOUNCE_DELAY);
  };

  const handleParameterChange = (name, value) => {
    setParameters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleModelChange = (model) => {
    cancelCurrentRender();
    setSelectedModel(model);
  };

  const handleLoadParameterSet = (paramSet) => {
    if (modelConfigs[paramSet.model_name]) {
      cancelCurrentRender();
      setSelectedModel(paramSet.model_name);
      setParameters(paramSet.parameters);
    }
  };

  const handleSaveParameterSet = async (name) => {
    try {
      const response = await axios.post('/api/parameter-sets', {
        name,
        modelName: selectedModel,
        parameters
      });
      if (response.data.success) {
        loadParameterSets();
        return true;
      }
    } catch (error) {
      console.error('保存参数集失败:', error);
    }
    return false;
  };

  const handleDeleteParameterSet = async (id) => {
    try {
      const response = await axios.delete(`/api/parameter-sets/${id}`);
      if (response.data.success) {
        loadParameterSets();
      }
    } catch (error) {
      console.error('删除参数集失败:', error);
    }
  };

  const handleExport = async (format) => {
    setStatus('loading');
    setStatusMessage(`正在导出 ${format.toUpperCase()}...`);
    startProgressSimulation();
    
    try {
      const response = await axios.post('/api/render', {
        modelName: selectedModel,
        parameters,
        format
      });
      if (response.data.success) {
        const link = document.createElement('a');
        link.href = response.data.downloadUrl;
        link.download = response.data.filename;
        link.click();
        setStatus('idle');
        setStatusMessage('导出成功');
      }
    } catch (error) {
      setStatus('error');
      setStatusMessage('导出失败: ' + error.message);
      console.error('导出失败:', error);
    } finally {
      stopProgressSimulation();
    }
  };

  const handleCancelRender = () => {
    cancelCurrentRender();
    setStatus('idle');
    setStatusMessage('已取消');
  };

  const handleForceRender = () => {
    cancelCurrentRender();
    setTimeout(() => generatePreview(), 100);
  };

  const config = modelConfigs[selectedModel];

  return (
    <div className="app">
      <div className="sidebar">
        <h1>🔧 OpenSCAD 参数化建模器</h1>
        
        <div className="section">
          <div className="section-title">选择模型</div>
          <ModelSelector
            models={Object.keys(modelConfigs)}
            modelConfigs={modelConfigs}
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
          />
        </div>

        <div className="section">
          <div className="section-title">
            参数编辑
            {status === 'loading' && (
              <span style={{ fontSize: '11px', color: '#f39c12', marginLeft: '8px' }}>
                ({Math.round(renderProgress)}%)
              </span>
            )}
          </div>
          <ParameterEditor
            parameters={config?.parameters || []}
            values={parameters}
            onChange={handleParameterChange}
          />
          
          <div style={{ marginTop: '15px', display: 'flex', gap: '8px' }}>
            <button 
              className="btn btn-secondary btn-small"
              onClick={handleForceRender}
              style={{ flex: 1 }}
            >
              🔄 强制刷新
            </button>
            {status === 'loading' && (
              <button 
                className="btn btn-danger btn-small"
                onClick={handleCancelRender}
                style={{ flex: 1 }}
              >
                ✕ 取消
              </button>
            )}
          </div>
        </div>

        <div className="section">
          <div className="section-title">导出模型</div>
          <ExportPanel 
            onExport={handleExport} 
            toolsAvailable={toolsAvailable}
          />
        </div>

        <div className="section">
          <div className="section-title">参数组合</div>
          <ParameterSets
            parameterSets={parameterSets}
            onLoad={handleLoadParameterSet}
            onSave={handleSaveParameterSet}
            onDelete={handleDeleteParameterSet}
          />
        </div>
      </div>

      <div className="main-content">
        <div className="viewer">
          <Viewer stlUrl={stlUrl} status={status} renderProgress={renderProgress} />
        </div>
        <div className="status-bar">
          <div className="status">
            <span className={`status-dot ${status}`}></span>
            <span>{statusMessage}</span>
          </div>
          <div>模型: {config?.name || selectedModel}</div>
        </div>
      </div>
    </div>
  );
}

export default App;