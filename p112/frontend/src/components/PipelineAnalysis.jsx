import React, { useState } from 'react';

const PipelineAnalysis = ({ pipelineInfo, performance }) => {
  const [expandedLoop, setExpandedLoop] = useState(null);

  if (!pipelineInfo || pipelineInfo.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <p>未检测到循环结构</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {performance && (
        <div className="bg-dark-lighter rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-300 mb-3">性能概览</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-xl font-bold text-blue-400">{performance.latency?.toLocaleString()}</div>
              <div className="text-xs text-gray-500">延迟 (周期)</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-emerald-400">
                {performance.throughput?.initiationInterval || '-'}
              </div>
              <div className="text-xs text-gray-500">起始间隔 (II)</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-amber-400">
                {performance.targetFrequency || 100} MHz
              </div>
              <div className="text-xs text-gray-500">目标频率</div>
            </div>
          </div>
        </div>
      )}

      <h3 className="text-sm font-medium text-gray-300">循环流水线分析</h3>

      {pipelineInfo.map((loop, index) => (
        <div
          key={index}
          className="bg-dark-lighter rounded-lg overflow-hidden border border-dark-lighter"
        >
          <div
            className="p-4 cursor-pointer hover:bg-gray-700/30 transition-colors"
            onClick={() => setExpandedLoop(expandedLoop === index ? null : index)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  loop.hasPipeline ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-600/30 text-gray-400'
                }`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-medium text-gray-200">循环 #{loop.id} ({loop.type})</h4>
                  <p className="text-xs text-gray-500">{loop.iterations} 次迭代</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  {loop.hasPipeline && (
                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">
                      流水线 II={loop.targetII}
                    </span>
                  )}
                  {loop.hasUnroll && (
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                      展开
                    </span>
                  )}
                  {loop.hasDataflow && (
                    <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                      数据流
                    </span>
                  )}
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${expandedLoop === index ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-gray-500">流水线深度</div>
                <div className="text-sm font-medium text-gray-300">{loop.pipelineDepth} 级</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">预估 II</div>
                <div className={`text-sm font-medium ${
                  loop.hasPipeline && loop.estimatedII > loop.targetII 
                    ? 'text-amber-400' 
                    : 'text-gray-300'
                }`}>
                  {loop.estimatedII}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">状态</div>
                <div className="text-sm font-medium text-gray-300">
                  {loop.hasPipeline ? '已优化' : '建议优化'}
                </div>
              </div>
            </div>
          </div>

          {expandedLoop === index && loop.recommendations && loop.recommendations.length > 0 && (
            <div className="border-t border-dark px-4 py-4">
              <h5 className="text-xs font-medium text-gray-400 mb-3">优化建议</h5>
              {loop.recommendations.map((rec, rIndex) => (
                <div
                  key={rIndex}
                  className={`p-3 rounded-lg mb-2 border-l-4 ${
                    rec.type === 'pipeline' 
                      ? 'bg-emerald-500/10 border-emerald-500/50' 
                      : rec.type === 'pipeline_ii'
                        ? 'bg-amber-500/10 border-amber-500/50'
                        : 'bg-blue-500/10 border-blue-500/50'
                  }`}
                >
                  <div className="font-medium text-sm text-gray-200">{rec.message}</div>
                  <div className="text-xs text-gray-400 mt-1">{rec.detail}</div>
                  <div className="text-xs text-emerald-400 mt-1">预期收益: {rec.expectedGain}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default PipelineAnalysis;
