function generateNetlist(circuitData, simulationConfig, options = {}) {
  const { components = [], wires = [] } = circuitData;
  const { type = 'tran', start = 0, stop = 0.01, step = 1e-5 } = simulationConfig || {};
  const { temperature = null, valueOverrides = {} } = options;

  const nodeMap = buildNodeMap(components, wires);
  let netlist = '* Circuit Simulator Netlist\n';

  if (temperature !== null) {
    netlist += `.temp ${temperature}\n`;
  }

  const ground = findGround(components, nodeMap);
  if (ground === null) {
    throw new Error('Circuit must have a ground node (0)');
  }

  const compNetlist = components
    .filter(c => c.type !== 'ground')
    .map(c => {
      const compWithOverride = valueOverrides[c.id]
        ? { ...c, value: valueOverrides[c.id], parameters: { ...c.parameters, ...(valueOverrides[`${c.id}_params`] || {}) } }
        : c;
      return componentToNetlist(compWithOverride, nodeMap);
    })
    .join('\n');

  netlist += compNetlist + '\n';

  if (type === 'tran') {
    netlist += `.tran ${step} ${stop} ${start}\n`;
  } else if (type === 'ac') {
    const { fstart = 1, fstop = 1e6, points = 100 } = simulationConfig;
    netlist += `.ac dec ${points} ${fstart} ${fstop}\n`;
  } else if (type === 'dc') {
    const { source, start = 0, stop = 5, step = 0.1 } = simulationConfig;
    netlist += `.dc ${source} ${start} ${stop} ${step}\n`;
  }

  netlist += '.print tran all\n';
  netlist += '.print ac all\n';
  netlist += '.print dc all\n';
  netlist += '.end\n';

  return netlist;
}

function buildNodeMap(components, wires) {
  const nodeMap = new Map();
  let nodeCounter = 1;

  components.forEach(comp => {
    if (comp.type === 'ground') {
      comp.pins.forEach((pin, idx) => {
        const key = `${comp.id}_pin${idx}`;
        nodeMap.set(key, '0');
      });
      return;
    }
    comp.pins.forEach((pin, idx) => {
      const key = `${comp.id}_pin${idx}`;
      if (!nodeMap.has(key)) {
        nodeMap.set(key, String(nodeCounter++));
      }
    });
  });

  wires.forEach(wire => {
    const fromKey = `${wire.from.component}_pin${wire.from.pin}`;
    const toKey = `${wire.to.component}_pin${wire.to.pin}`;

    const fromNode = nodeMap.get(fromKey) || String(nodeCounter++);
    const toNode = nodeMap.get(toKey) || String(nodeCounter++);

    if (fromNode !== toNode) {
      const minNode = Math.min(parseInt(fromNode), parseInt(toNode)).toString();
      const maxNode = Math.max(parseInt(fromNode), parseInt(toNode)).toString();

      nodeMap.forEach((val, key) => {
        if (val === maxNode) {
          nodeMap.set(key, minNode);
        }
      });

      nodeMap.set(toKey, minNode);
      nodeMap.set(fromKey, minNode);
    }
  });

  return nodeMap;
}

function findGround(components, nodeMap) {
  const groundComp = components.find(c => c.type === 'ground');
  if (!groundComp) return null;
  return '0';
}

function componentToNetlist(component, nodeMap) {
  const { id, type, value = 1, parameters = {} } = component;
  const pins = component.pins || [];
  const nodes = pins.map((_, idx) => nodeMap.get(`${id}_pin${idx}`) || '0');

  const prefixMap = {
    voltage_source: 'V',
    current_source: 'I',
    resistor: 'R',
    capacitor: 'C',
    inductor: 'L',
    diode: 'D',
    npn: 'Q',
    pnp: 'Q',
    nmos: 'M',
    pmos: 'M',
    opamp: 'X'
  };

  const prefix = prefixMap[type] || 'X';
  const name = `${prefix}${id.replace(/[^a-zA-Z0-9]/g, '')}`;

  switch (type) {
    case 'voltage_source': {
      const { waveform = 'dc', dc = 0, amplitude = 1, frequency = 1000, phase = 0 } = parameters;
      if (waveform === 'dc') {
        return `${name} ${nodes[0]} ${nodes[1]} DC ${dc}`;
      } else if (waveform === 'sine') {
        return `${name} ${nodes[0]} ${nodes[1]} SIN(0 ${amplitude} ${frequency} 0 0 ${phase})`;
      } else if (waveform === 'pulse') {
        const { vlow = 0, vhigh = 5, delay = 0, rise = 1e-9, fall = 1e-9, width = 0.5e-3, period = 1e-3 } = parameters;
        return `${name} ${nodes[0]} ${nodes[1]} PULSE(${vlow} ${vhigh} ${delay} ${rise} ${fall} ${width} ${period})`;
      }
      return `${name} ${nodes[0]} ${nodes[1]} DC ${dc}`;
    }
    case 'current_source': {
      const { waveform = 'dc', dc = 0.001, amplitude = 0.001, frequency = 1000 } = parameters;
      if (waveform === 'dc') {
        return `${name} ${nodes[0]} ${nodes[1]} DC ${dc}`;
      }
      return `${name} ${nodes[0]} ${nodes[1]} SIN(0 ${amplitude} ${frequency})`;
    }
    case 'resistor':
      return `${name} ${nodes[0]} ${nodes[1]} ${value}`;
    case 'capacitor':
      return `${name} ${nodes[0]} ${nodes[1]} ${value}`;
    case 'inductor':
      return `${name} ${nodes[0]} ${nodes[1]} ${value}`;
    case 'diode':
      return `${name} ${nodes[0]} ${nodes[1]} Dmod\n.model Dmod D`;
    case 'npn':
      return `${name} ${nodes[0]} ${nodes[1]} ${nodes[2]} NPNmod\n.model NPNmod NPN`;
    case 'pnp':
      return `${name} ${nodes[0]} ${nodes[1]} ${nodes[2]} PNPmod\n.model PNPmod PNP`;
    case 'nmos':
      return `${name} ${nodes[0]} ${nodes[1]} ${nodes[2]} ${nodes[2]} NMOSmod\n.model NMOSmod NMOS`;
    case 'pmos':
      return `${name} ${nodes[0]} ${nodes[1]} ${nodes[2]} ${nodes[2]} PMOSmod\n.model PMOSmod PMOS`;
    case 'opamp':
      return `${name} ${nodes[0]} ${nodes[1]} ${nodes[2]} ${nodes[3]} OPAMP\n.subckt OPAMP in+ in- out v+ v-\nE1 out 0 in+ in- 1e6\n.ends OPAMP`;
    default:
      return `${name} ${nodes.join(' ')} ${value}`;
  }
}

function exportNetlist(circuitData, simulationConfig) {
  return generateNetlist(circuitData, simulationConfig);
}

module.exports = {
  generateNetlist,
  exportNetlist,
  buildNodeMap
};
