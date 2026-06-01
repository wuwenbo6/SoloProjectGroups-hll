import React from 'react';

export default function CircuitList({ circuits, currentId, onSelect, onDelete, onNew }) {
  return (
    <div className="circuit-list">
      <div className="list-header">
        <h3>我的电路</h3>
        <button className="btn btn-primary" onClick={onNew}>
          + 新建
        </button>
      </div>
      <div className="circuits">
        {circuits.length === 0 ? (
          <p className="hint">暂无电路，点击新建创建</p>
        ) : (
          circuits.map(c => (
            <div
              key={c.id}
              className={`circuit-item ${currentId === c.id ? 'active' : ''}`}
              onClick={() => onSelect(c.id)}
            >
              <div className="circuit-info">
                <div className="circuit-name">{c.name}</div>
                {c.description && <div className="circuit-desc">{c.description}</div>}
                <div className="circuit-date">{new Date(c.updated_at).toLocaleString()}</div>
              </div>
              <button
                className="btn-icon"
                onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                title="删除"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
