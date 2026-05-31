import { useState, useRef, useEffect } from 'react';
import { Play, Square, Trash2, Plus, Clock, MousePointer2, Type, Globe, GripVertical, ChevronDown, ChevronUp, Target } from 'lucide-react';
import { useStore } from '../store';
import { Recorder } from '../utils/recorder';
import { ActionStep } from '../../shared/types';

export function LeftPanel() {
  const {
    targetUrl,
    setTargetUrl,
    isRecording,
    setIsRecording,
    steps,
    addStep,
    removeStep,
    clearSteps,
    selectorPriority,
  } = useStore();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  useEffect(() => {
    recorderRef.current = new Recorder(
      (step: ActionStep) => {
        addStep(step);
      },
      () => {},
      selectorPriority
    );

    return () => {
      recorderRef.current?.destroy();
    };
  }, [selectorPriority, addStep]);

  const handleStartRecording = () => {
    if (iframeRef.current && iframeLoaded) {
      recorderRef.current?.start(iframeRef.current);
      setIsRecording(true);
    }
  };

  const handleStopRecording = () => {
    recorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleIframeLoad = () => {
    setIframeLoaded(true);
  };

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'click':
        return <MousePointer2 className="w-4 h-4" />;
      case 'input':
        return <Type className="w-4 h-4" />;
      case 'navigate':
        return <Globe className="w-4 h-4" />;
      case 'wait':
        return <Clock className="w-4 h-4" />;
      case 'waitForElement':
        return <Target className="w-4 h-4" />;
      case 'waitForNetworkIdle':
        return <Clock className="w-4 h-4" />;
      default:
        return <GripVertical className="w-4 h-4" />;
    }
  };

  const getStepColor = (type: string) => {
    switch (type) {
      case 'click':
        return 'text-blue-400 bg-blue-500/10';
      case 'input':
        return 'text-green-400 bg-green-500/10';
      case 'navigate':
        return 'text-purple-400 bg-purple-500/10';
      case 'wait':
        return 'text-yellow-400 bg-yellow-500/10';
      case 'waitForElement':
        return 'text-cyan-400 bg-cyan-500/10';
      case 'waitForNetworkIdle':
        return 'text-orange-400 bg-orange-500/10';
      default:
        return 'text-slate-400 bg-slate-500/10';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-400';
    if (confidence >= 0.7) return 'text-yellow-400';
    return 'text-orange-400';
  };

  return (
    <div className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col h-full">
      <div className="p-4 border-b border-slate-700">
        <label className="text-slate-400 text-xs font-medium mb-2 block">目标网址</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            placeholder="https://example.com"
            disabled={isRecording}
          />
        </div>
      </div>

      <div className="p-4 border-b border-slate-700">
        <div className="flex gap-2">
          {!isRecording ? (
            <button
              onClick={handleStartRecording}
              disabled={!iframeLoaded}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4" />
              开始录制
            </button>
          ) : (
            <button
              onClick={handleStopRecording}
              className="flex-1 bg-slate-600 hover:bg-slate-500 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Square className="w-4 h-4" />
              停止录制
            </button>
          )}
          <button
            onClick={clearSteps}
            disabled={isRecording}
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
            title="清空步骤"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-white font-medium">操作步骤</h3>
          <span className="text-slate-400 text-sm">{steps.length} 步</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {steps.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <MousePointer2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">开始录制后点击元素</p>
              <p className="text-xs mt-1">操作将自动记录在这里</p>
            </div>
          ) : (
            steps.map((step, index) => (
              <div
                key={step.id}
                className="bg-slate-900 rounded-lg overflow-hidden group"
              >
                <div
                  className="p-3 cursor-pointer hover:bg-slate-800 transition-colors"
                  onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-1.5 rounded ${getStepColor(step.type)}`}>
                      {getStepIcon(step.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-medium">Step {index + 1}</span>
                        <span className="text-xs px-2 py-0.5 bg-slate-700 rounded text-slate-300">
                          {step.type}
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs mt-1 truncate">
                        {step.elementDescription || step.selector}
                      </p>
                      {step.value && (
                        <p className="text-blue-400 text-xs mt-1 truncate">
                          → {step.value}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-slate-500 text-xs font-mono">
                          {step.selectorType}: {step.selector}
                        </p>
                        {step.alternativeSelectors && step.alternativeSelectors.length > 0 && (
                          <div className="flex items-center gap-1 text-cyan-400 text-xs">
                            <Target className="w-3 h-3" />
                            {step.alternativeSelectors.length} 备选
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeStep(step.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-400 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {expandedStep === step.id ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>
                </div>

                {expandedStep === step.id && (
                  <div className="border-t border-slate-700 p-3 bg-slate-800/50">
                    <p className="text-slate-400 text-xs font-medium mb-2">备选定位器</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
                        <span className="text-slate-300 font-mono truncate">
                          {step.selectorType}={step.selector}
                        </span>
                      </div>
                      {step.alternativeSelectors?.map((alt, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="w-3 h-3 rounded-full bg-slate-500 flex-shrink-0" />
                          <span className="text-slate-400 font-mono truncate flex-1">
                            {alt.type}={alt.selector}
                          </span>
                          <span className={`${getConfidenceColor(alt.confidence)} flex-shrink-0`}>
                            {Math.round(alt.confidence * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-700">
                      <p className="text-slate-400 text-xs font-medium mb-2">重试配置</p>
                      <div className="grid grid-cols-3 gap-2 text-xs text-slate-500">
                        <div>
                          <span className="text-slate-400">超时:</span> {step.waitOptions?.timeout || 15000}ms
                        </div>
                        <div>
                          <span className="text-slate-400">重试:</span> {step.waitOptions?.retries || 3}次
                        </div>
                        <div>
                          <span className="text-slate-400">稳定:</span> {step.waitOptions?.waitForStable ? '是' : '否'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="border-t border-slate-700">
        <iframe
          ref={iframeRef}
          src={targetUrl}
          onLoad={handleIframeLoad}
          className="w-full h-48 border-0"
          title="Preview"
          sandbox="allow-same-origin allow-scripts allow-forms"
        />
        <div className="p-2 bg-slate-900 text-xs text-slate-500 text-center">
          预览区域 - 用于录制操作
        </div>
      </div>
    </div>
  );
}
