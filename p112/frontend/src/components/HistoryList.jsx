import React from 'react';

const HistoryList = ({ history, onSelect, onDelete, selectedId }) => {
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!history || history.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>暂无历史记录</p>
        <p className="text-sm mt-1">完成估算后记录将显示在这里</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
      {history.map((item) => (
        <div
          key={item.id}
          className={`p-4 rounded-lg border cursor-pointer transition-all duration-200 ${
            selectedId === item.id
              ? 'bg-primary/10 border-primary/50'
              : 'bg-dark-lighter border-dark-lighter hover:border-gray-600'
          }`}
          onClick={() => onSelect(item)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-200 truncate">
                {item.code_name}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {formatDate(item.created_at)}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
              className="ml-2 p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-xs text-gray-400">LUT: {item.lut.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span className="text-xs text-gray-400">DSP: {item.dsp}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-amber-500"></div>
              <span className="text-xs text-gray-400">BRAM: {item.bram}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default HistoryList;
