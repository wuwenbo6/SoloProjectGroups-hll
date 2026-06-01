import React from 'react';
import { COMPONENT_TYPES } from '../types/circuit.js';

export default function ComponentLibrary({ onDragStart }) {
  const categories = [
    {
      name: '电源',
      items: ['voltage_source', 'current_source', 'ground']
    },
    {
      name: '无源元件',
      items: ['resistor', 'capacitor', 'inductor']
    },
    {
      name: '半导体',
      items: ['diode', 'npn', 'pnp', 'nmos', 'pmos']
    },
    {
      name: '集成电路',
      items: ['opamp']
    }
  ];

  const handleDragStart = (e, type) => {
    e.dataTransfer.setData('componentType', type);
    e.dataTransfer.effectAllowed = 'copy';
    if (onDragStart) onDragStart(type);
  };

  return (
    <div className="component-library">
      <h3>元件库</h3>
      {categories.map(cat => (
        <div key={cat.name} className="category">
          <div className="category-title">{cat.name}</div>
          <div className="component-grid">
            {cat.items.map(type => {
              const config = COMPONENT_TYPES[type];
              return (
                <div
                  key={type}
                  className="component-item"
                  draggable
                  onDragStart={(e) => handleDragStart(e, type)}
                  title={config.label}
                >
                  <div className="component-icon">{config.icon}</div>
                  <div className="component-name">{config.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
