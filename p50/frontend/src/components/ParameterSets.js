import React, { useState } from 'react';

function ParameterSets({ parameterSets, onLoad, onSave, onDelete }) {
  const [newSetName, setNewSetName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!newSetName.trim()) return;
    
    setSaving(true);
    const success = await onSave(newSetName);
    if (success) {
      setNewSetName('');
    }
    setSaving(false);
  };

  return (
    <div>
      <div className="input-row">
        <input
          type="text"
          className="text-input"
          placeholder="参数组合名称"
          value={newSetName}
          onChange={(e) => setNewSetName(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSave()}
        />
        <button 
          className="btn btn-success btn-small"
          onClick={handleSave}
          disabled={saving || !newSetName.trim()}
        >
          {saving ? '...' : '保存'}
        </button>
      </div>

      <div style={{ marginTop: '15px' }}>
        {parameterSets.length === 0 ? (
          <div className="empty-state">暂无保存的参数组合</div>
        ) : (
          parameterSets.map(set => (
            <div key={set.id} className="param-set-item">
              <div onClick={() => onLoad(set)} style={{ flex: 1 }}>
                <div className="param-set-name">{set.name}</div>
                <div className="param-set-model">模型: {set.model_name}</div>
              </div>
              <button
                className="btn btn-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(set.id);
                }}
              >
                删除
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ParameterSets;