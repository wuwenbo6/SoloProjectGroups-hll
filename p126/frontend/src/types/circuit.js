export const COMPONENT_TYPES = {
  voltage_source: {
    label: '电压源',
    icon: 'V',
    pins: 2,
    defaultValue: 5,
    defaultParams: { waveform: 'dc', dc: 5 }
  },
  current_source: {
    label: '电流源',
    icon: 'I',
    pins: 2,
    defaultValue: 0.001,
    defaultParams: { waveform: 'dc', dc: 0.001 }
  },
  resistor: {
    label: '电阻',
    icon: 'R',
    pins: 2,
    defaultValue: 1000
  },
  capacitor: {
    label: '电容',
    icon: 'C',
    pins: 2,
    defaultValue: 1e-6
  },
  inductor: {
    label: '电感',
    icon: 'L',
    pins: 2,
    defaultValue: 1e-3
  },
  diode: {
    label: '二极管',
    icon: 'D',
    pins: 2,
    defaultValue: 1
  },
  npn: {
    label: 'NPN三极管',
    icon: 'Q',
    pins: 3,
    defaultValue: 1
  },
  pnp: {
    label: 'PNP三极管',
    icon: 'Q',
    pins: 3,
    defaultValue: 1
  },
  nmos: {
    label: 'NMOS',
    icon: 'M',
    pins: 3,
    defaultValue: 1
  },
  pmos: {
    label: 'PMOS',
    icon: 'M',
    pins: 3,
    defaultValue: 1
  },
  opamp: {
    label: '运放',
    icon: 'OP',
    pins: 4,
    defaultValue: 1
  },
  ground: {
    label: '接地',
    icon: 'GND',
    pins: 1,
    defaultValue: 0
  }
};

export const SIMULATION_TYPES = {
  tran: { label: '瞬态分析', fields: ['start', 'stop', 'step'] },
  ac: { label: '交流分析', fields: ['fstart', 'fstop', 'points'] },
  dc: { label: '直流扫描', fields: ['source', 'start', 'stop', 'step'] }
};

export function createComponent(type, x, y) {
  const config = COMPONENT_TYPES[type];
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type,
    x,
    y,
    rotation: 0,
    value: config.defaultValue,
    parameters: { ...(config.defaultParams || {}) },
    pins: Array.from({ length: config.pins }, (_, i) => ({ x: 0, y: 0, index: i }))
  };
}

export function createWire(fromComponent, fromPin, toComponent, toPin) {
  return {
    id: `wire_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    from: { component: fromComponent, pin: fromPin },
    to: { component: toComponent, pin: toPin }
  };
}
