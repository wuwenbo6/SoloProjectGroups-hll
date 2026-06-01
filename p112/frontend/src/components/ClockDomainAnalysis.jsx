import React from 'react';

const ClockDomainAnalysis = ({ clockDomains }) => {
  if (!clockDomains || clockDomains.length === 0) {
    return (
      <div className="bg-dark-lighter rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-600/30 flex items-center justify-center">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-300">单时钟域设计</div>
            <div className="text-xs text-gray-500">默认时钟域</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-lighter rounded-lg p-4">
      <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        时钟域分析
      </h4>
      
      <div className="space-y-2">
        {clockDomains.map((domain, index) => (
          <div
            key={index}
            className="flex items-center justify-between py-2 px-3 bg-dark rounded-lg"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-sm text-gray-300">{domain}</span>
            </div>
            <span className="text-xs text-gray-500">时钟域 {index + 1}</span>
          </div>
        ))}
      </div>

      {clockDomains.length > 1 && (
        <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <div className="text-sm font-medium text-amber-400">多时钟域设计</div>
              <div className="text-xs text-gray-400 mt-1">
                检测到 {clockDomains.length} 个时钟域。请注意：
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>确保CDC（时钟域交叉）正确处理</li>
                  <li>使用同步寄存器或FIFO进行跨域数据传输</li>
                  <li>为每个时钟域添加适当的时序约束</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClockDomainAnalysis;
