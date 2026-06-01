import { COMPONENT_TYPES } from '../types/circuit.js';

export function getPinPosition(component, pinIndex) {
  const config = COMPONENT_TYPES[component.type];
  const pins = config.pins;
  const rot = component.rotation || 0;

  const width = 80;
  const height = 60;

  let pinPositions = [];

  if (pins === 2) {
    pinPositions = [
      { x: -width / 2, y: 0 },
      { x: width / 2, y: 0 }
    ];
  } else if (pins === 3) {
    pinPositions = [
      { x: -width / 2, y: -height / 2 },
      { x: -width / 2, y: height / 2 },
      { x: width / 2, y: 0 }
    ];
  } else if (pins === 4) {
    pinPositions = [
      { x: -width / 2, y: -height / 3 },
      { x: -width / 2, y: height / 3 },
      { x: width / 2, y: 0 },
      { x: 0, y: -height / 2 }
    ];
  } else if (pins === 1) {
    pinPositions = [{ x: 0, y: -height / 2 }];
  }

  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const pin = pinPositions[pinIndex] || { x: 0, y: 0 };
  const rotatedX = pin.x * cos - pin.y * sin;
  const rotatedY = pin.x * sin + pin.y * cos;

  return {
    x: component.x + rotatedX,
    y: component.y + rotatedY
  };
}

export function formatValue(value, unit = '') {
  if (Math.abs(value) >= 1e9) return (value / 1e9).toFixed(2) + 'G' + unit;
  if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(2) + 'M' + unit;
  if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(2) + 'k' + unit;
  if (Math.abs(value) >= 1) return value.toFixed(2) + unit;
  if (Math.abs(value) >= 1e-3) return (value * 1e3).toFixed(2) + 'm' + unit;
  if (Math.abs(value) >= 1e-6) return (value * 1e6).toFixed(2) + 'u' + unit;
  if (Math.abs(value) >= 1e-9) return (value * 1e9).toFixed(2) + 'n' + unit;
  return (value * 1e12).toFixed(2) + 'p' + unit;
}

export function getUnitForType(type) {
  switch (type) {
    case 'voltage_source': return 'V';
    case 'current_source': return 'A';
    case 'resistor': return 'Ω';
    case 'capacitor': return 'F';
    case 'inductor': return 'H';
    default: return '';
  }
}

export function pointToLineDistance(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

export function snapToGrid(value, gridSize = 20) {
  return Math.round(value / gridSize) * gridSize;
}
