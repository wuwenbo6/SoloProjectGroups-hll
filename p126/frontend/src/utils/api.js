const API_BASE = '/api';

export async function getCircuits() {
  const res = await fetch(`${API_BASE}/circuits`);
  if (!res.ok) throw new Error('Failed to fetch circuits');
  return res.json();
}

export async function getCircuit(id) {
  const res = await fetch(`${API_BASE}/circuits/${id}`);
  if (!res.ok) throw new Error('Failed to fetch circuit');
  return res.json();
}

export async function createCircuit(circuit) {
  const res = await fetch(`${API_BASE}/circuits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(circuit)
  });
  if (!res.ok) throw new Error('Failed to create circuit');
  return res.json();
}

export async function updateCircuit(id, circuit) {
  const res = await fetch(`${API_BASE}/circuits/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(circuit)
  });
  if (!res.ok) throw new Error('Failed to update circuit');
  return res.json();
}

export async function deleteCircuit(id) {
  const res = await fetch(`${API_BASE}/circuits/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete circuit');
  return res.json();
}

export async function simulate(circuitData, simulationConfig, circuitId = null, temperature = null) {
  const res = await fetch(`${API_BASE}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ circuit_data: circuitData, simulation_config: simulationConfig, circuit_id: circuitId, temperature })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Simulation failed');
  }
  return res.json();
}

export async function monteCarlo(circuitData, simulationConfig, options) {
  const res = await fetch(`${API_BASE}/montecarlo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ circuit_data: circuitData, simulation_config: simulationConfig, ...options })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Monte Carlo failed');
  }
  return res.json();
}

export async function temperatureSweep(circuitData, simulationConfig, temperatures, circuitId = null) {
  const res = await fetch(`${API_BASE}/temperature_sweep`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ circuit_data: circuitData, simulation_config: simulationConfig, temperatures, circuit_id: circuitId })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Temperature sweep failed');
  }
  return res.json();
}

export async function generateNetlist(circuitData, simulationConfig) {
  const res = await fetch(`${API_BASE}/netlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ circuit_data: circuitData, simulation_config: simulationConfig })
  });
  if (!res.ok) throw new Error('Failed to generate netlist');
  return res.json();
}

export async function exportNetlistFile(circuitData, simulationConfig, filename) {
  const res = await fetch(`${API_BASE}/netlist/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ circuit_data: circuitData, simulation_config: simulationConfig, filename })
  });
  if (!res.ok) throw new Error('Failed to export netlist');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'circuit.cir';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
