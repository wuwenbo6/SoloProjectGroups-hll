import React from 'react';

function ModelSelector({ models, modelConfigs, selectedModel, onModelChange }) {
  const categories = {};
  
  models.forEach(model => {
    const config = modelConfigs[model];
    const category = config?.category || '其他';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(model);
  });

  return (
    <select
      className="select-input"
      value={selectedModel}
      onChange={(e) => onModelChange(e.target.value)}
    >
      {Object.entries(categories).map(([category, categoryModels]) => (
        <optgroup key={category} label={category}>
          {categoryModels.map(model => (
            <option key={model} value={model}>
              {modelConfigs[model]?.name || model}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default ModelSelector;