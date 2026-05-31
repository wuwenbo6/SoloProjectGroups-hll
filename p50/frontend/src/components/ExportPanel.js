import React from 'react';

function ExportPanel({ onExport }) {
  return (
    <div className="export-options">
      <button 
        className="btn btn-primary"
        onClick={() => onExport('stl')}
      >
        导出 STL
      </button>
      <button 
        className="btn btn-secondary"
        onClick={() => onExport('3mf')}
      >
        导出 3MF
      </button>
    </div>
  );
}

export default ExportPanel;