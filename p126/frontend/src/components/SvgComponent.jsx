import React from 'react';
import { COMPONENT_TYPES } from '../types/circuit.js';
import { formatValue, getUnitForType } from '../utils/circuitUtils.js';

export default function SvgComponent({ component, selected, onPinMouseDown, onMouseDown }) {
  const config = COMPONENT_TYPES[component.type];
  const { x, y, rotation = 0, id, type, value, parameters = {} } = component;

  const width = 80;
  const height = 60;

  const unit = getUnitForType(type);
  const displayValue = formatValue(value, unit);

  function renderComponentBody() {
    switch (type) {
      case 'voltage_source':
        return (
          <g>
            <circle cx="0" cy="0" r="20" fill="white" stroke="#333" strokeWidth="2" />
            <line x1="-8" y1="0" x2="8" y2="0" stroke="#333" strokeWidth="2" />
            <line x1="0" y1="-8" x2="0" y2="-3" stroke="#333" strokeWidth="2" />
            {parameters.waveform === 'sine' && (
              <path d="M -12 8 Q -6 0, 0 8 T 12 8" fill="none" stroke="#666" strokeWidth="1.5" />
            )}
          </g>
        );
      case 'current_source':
        return (
          <g>
            <circle cx="0" cy="0" r="20" fill="white" stroke="#333" strokeWidth="2" />
            <line x1="-8" y1="0" x2="8" y2="0" stroke="#333" strokeWidth="2" />
            <polygon points="2,0 6,-4 6,4" fill="#333" />
          </g>
        );
      case 'resistor':
        return (
          <g>
            <path
              d="M -30 0 L -20 0 L -15 -8 L -5 8 L 5 -8 L 15 8 L 20 0 L 30 0"
              fill="none"
              stroke="#333"
              strokeWidth="2"
            />
          </g>
        );
      case 'capacitor':
        return (
          <g>
            <line x1="-30" y1="0" x2="-5" y2="0" stroke="#333" strokeWidth="2" />
            <line x1="5" y1="0" x2="30" y2="0" stroke="#333" strokeWidth="2" />
            <line x1="-5" y1="-15" x2="-5" y2="15" stroke="#333" strokeWidth="2" />
            <line x1="5" y1="-15" x2="5" y2="15" stroke="#333" strokeWidth="2" />
          </g>
        );
      case 'inductor':
        return (
          <g>
            <path
              d="M -30 0 Q -25 -12, -20 0 Q -15 12, -10 0 Q -5 -12, 0 0 Q 5 12, 10 0 Q 15 -12, 20 0 L 30 0"
              fill="none"
              stroke="#333"
              strokeWidth="2"
            />
          </g>
        );
      case 'diode':
        return (
          <g>
            <line x1="-30" y1="0" x2="-10" y2="0" stroke="#333" strokeWidth="2" />
            <line x1="10" y1="0" x2="30" y2="0" stroke="#333" strokeWidth="2" />
            <polygon points="-10,-12 -10,12 10,0" fill="white" stroke="#333" strokeWidth="2" />
            <line x1="10" y1="-12" x2="10" y2="12" stroke="#333" strokeWidth="2" />
          </g>
        );
      case 'npn':
        return (
          <g>
            <line x1="-30" y1="-15" x2="-10" y2="-15" stroke="#333" strokeWidth="2" />
            <line x1="-30" y1="15" x2="-10" y2="15" stroke="#333" strokeWidth="2" />
            <line x1="10" y1="0" x2="30" y2="0" stroke="#333" strokeWidth="2" />
            <line x1="-10" y1="-20" x2="-10" y2="20" stroke="#333" strokeWidth="2" />
            <line x1="-10" y1="-10" x2="10" y2="0" stroke="#333" strokeWidth="2" />
            <line x1="-10" y1="10" x2="10" y2="0" stroke="#333" strokeWidth="2" />
            <polygon points="5,-3 10,0 5,3" fill="#333" />
          </g>
        );
      case 'pnp':
        return (
          <g>
            <line x1="-30" y1="-15" x2="-10" y2="-15" stroke="#333" strokeWidth="2" />
            <line x1="-30" y1="15" x2="-10" y2="15" stroke="#333" strokeWidth="2" />
            <line x1="10" y1="0" x2="30" y2="0" stroke="#333" strokeWidth="2" />
            <line x1="-10" y1="-20" x2="-10" y2="20" stroke="#333" strokeWidth="2" />
            <line x1="-10" y1="-10" x2="10" y2="0" stroke="#333" strokeWidth="2" />
            <line x1="-10" y1="10" x2="10" y2="0" stroke="#333" strokeWidth="2" />
            <polygon points="-5,-3 -10,0 -5,3" fill="#333" />
          </g>
        );
      case 'nmos':
        return (
          <g>
            <line x1="-30" y1="-15" x2="-15" y2="-15" stroke="#333" strokeWidth="2" />
            <line x1="-30" y1="15" x2="-15" y2="15" stroke="#333" strokeWidth="2" />
            <line x1="15" y1="0" x2="30" y2="0" stroke="#333" strokeWidth="2" />
            <line x1="-15" y1="-20" x2="-15" y2="20" stroke="#333" strokeWidth="2" />
            <line x1="-10" y1="-20" x2="-10" y2="20" stroke="#333" strokeWidth="2" />
            <line x1="-10" y1="-15" x2="15" y2="-15" stroke="#333" strokeWidth="2" />
            <line x1="-10" y1="15" x2="15" y2="15" stroke="#333" strokeWidth="2" />
            <line x1="-10" y1="0" x2="15" y2="0" stroke="#333" strokeWidth="2" />
            <polygon points="8,-3 15,0 8,3" fill="#333" />
          </g>
        );
      case 'pmos':
        return (
          <g>
            <line x1="-30" y1="-15" x2="-15" y2="-15" stroke="#333" strokeWidth="2" />
            <line x1="-30" y1="15" x2="-15" y2="15" stroke="#333" strokeWidth="2" />
            <line x1="15" y1="0" x2="30" y2="0" stroke="#333" strokeWidth="2" />
            <line x1="-15" y1="-20" x2="-15" y2="20" stroke="#333" strokeWidth="2" />
            <line x1="-10" y1="-20" x2="-10" y2="20" stroke="#333" strokeWidth="2" />
            <line x1="-10" y1="-15" x2="15" y2="-15" stroke="#333" strokeWidth="2" />
            <line x1="-10" y1="15" x2="15" y2="15" stroke="#333" strokeWidth="2" />
            <line x1="-10" y1="0" x2="15" y2="0" stroke="#333" strokeWidth="2" />
            <polygon points="-8,-3 -15,0 -8,3" fill="#333" />
          </g>
        );
      case 'opamp':
        return (
          <g>
            <polygon points="-20,-25 -20,25 25,0" fill="white" stroke="#333" strokeWidth="2" />
            <text x="-12" y="-8" fontSize="10" fill="#333">+</text>
            <text x="-12" y="18" fontSize="10" fill="#333">-</text>
            <text x="5" y="4" fontSize="8" fill="#333">OP</text>
          </g>
        );
      case 'ground':
        return (
          <g>
            <line x1="0" y1="-30" x2="0" y2="0" stroke="#333" strokeWidth="2" />
            <line x1="-15" y1="0" x2="15" y2="0" stroke="#333" strokeWidth="2" />
            <line x1="-10" y1="8" x2="10" y2="8" stroke="#333" strokeWidth="2" />
            <line x1="-5" y1="16" x2="5" y2="16" stroke="#333" strokeWidth="2" />
          </g>
        );
      default:
        return (
          <rect x={-width / 2} y={-height / 2} width={width} height={height} fill="white" stroke="#333" strokeWidth="2" />
        );
    }
  }

  function renderPins() {
    const pins = config.pins;
    const pinPositions = [];

    if (pins === 2) {
      pinPositions.push({ x: -width / 2, y: 0, idx: 0 });
      pinPositions.push({ x: width / 2, y: 0, idx: 1 });
    } else if (pins === 3) {
      pinPositions.push({ x: -width / 2, y: -height / 2, idx: 0 });
      pinPositions.push({ x: -width / 2, y: height / 2, idx: 1 });
      pinPositions.push({ x: width / 2, y: 0, idx: 2 });
    } else if (pins === 4) {
      pinPositions.push({ x: -width / 2, y: -height / 3, idx: 0 });
      pinPositions.push({ x: -width / 2, y: height / 3, idx: 1 });
      pinPositions.push({ x: width / 2, y: 0, idx: 2 });
      pinPositions.push({ x: 0, y: -height / 2, idx: 3 });
    } else if (pins === 1) {
      pinPositions.push({ x: 0, y: -height / 2, idx: 0 });
    }

    return pinPositions.map(pin => (
      <circle
        key={pin.idx}
        cx={pin.x}
        cy={pin.y}
        r="6"
        fill="#4a90d9"
        stroke="white"
        strokeWidth="2"
        style={{ cursor: 'crosshair' }}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (onPinMouseDown) onPinMouseDown(id, pin.idx, e);
        }}
        onMouseUp={(e) => {
          e.stopPropagation();
        }}
      />
    ));
  }

  return (
    <g
      transform={`translate(${x}, ${y}) rotate(${rotation})`}
      style={{ cursor: 'move' }}
      onMouseDown={(e) => {
        if (onMouseDown) onMouseDown(id, e);
      }}
      className={selected ? 'selected-component' : ''}
    >
      {selected && (
        <rect
          x={-width / 2 - 5}
          y={-height / 2 - 5}
          width={width + 10}
          height={height + 10}
          fill="none"
          stroke="#4a90d9"
          strokeWidth="2"
          strokeDasharray="5,3"
        />
      )}
      {renderComponentBody()}
      {renderPins()}
      <text x="0" y={height / 2 + 20} textAnchor="middle" fontSize="11" fill="#555">
        {displayValue}
      </text>
    </g>
  );
}
