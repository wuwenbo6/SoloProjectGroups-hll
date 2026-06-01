const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const {
  getAllCircuits,
  getCircuitById,
  createCircuit,
  updateCircuit,
  deleteCircuit,
  createSimulation
} = require('./db');
const { generateNetlist, exportNetlist } = require('./netlistGenerator');
const { runSimulation } = require('./simulator');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/circuits', async (req, res) => {
  try {
    const circuits = await getAllCircuits();
    res.json(circuits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/circuits/:id', async (req, res) => {
  try {
    const circuit = await getCircuitById(req.params.id);
    if (!circuit) {
      res.status(404).json({ error: 'Circuit not found' });
      return;
    }
    res.json({
      ...circuit,
      circuit_data: JSON.parse(circuit.circuit_data)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/circuits', async (req, res) => {
  try {
    const { name, description = '', circuit_data } = req.body;
    if (!name || !circuit_data) {
      res.status(400).json({ error: 'Name and circuit_data are required' });
      return;
    }
    const id = uuidv4();
    const netlist = exportNetlist(circuit_data, { type: 'tran', stop: 0.01, step: 1e-5 });
    const circuit = await createCircuit(id, name, description, netlist, JSON.stringify(circuit_data));
    res.status(201).json({ ...circuit, circuit_data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/circuits/:id', async (req, res) => {
  try {
    const { name, description, circuit_data } = req.body;
    if (!name || !circuit_data) {
      res.status(400).json({ error: 'Name and circuit_data are required' });
      return;
    }
    const existing = await getCircuitById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Circuit not found' });
      return;
    }
    const netlist = exportNetlist(circuit_data, { type: 'tran', stop: 0.01, step: 1e-5 });
    const circuit = await updateCircuit(req.params.id, name, description || existing.description, netlist, JSON.stringify(circuit_data));
    res.json({ ...circuit, circuit_data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/circuits/:id', async (req, res) => {
  try {
    const changes = await deleteCircuit(req.params.id);
    if (changes === 0) {
      res.status(404).json({ error: 'Circuit not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/simulate', async (req, res) => {
  try {
    const { circuit_data, simulation_config, circuit_id = null, timeout, temperature = null } = req.body;
    if (!circuit_data) {
      res.status(400).json({ error: 'circuit_data is required' });
      return;
    }

    const netlist = generateNetlist(circuit_data, simulation_config, { temperature });
    const timeoutMs = timeout || (simulation_config?.type === 'tran' ? 15000 : 10000);
    const result = await runSimulation(netlist, timeoutMs);

    const simId = uuidv4();
    await createSimulation(simId, circuit_id, netlist, result);

    res.json({
      id: simId,
      netlist,
      result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function gaussianRandom(mean = 0, std = 1) {
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  return mean + std * Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

function applyTolerance(value, tolerance, distribution = 'uniform') {
  if (tolerance <= 0) return value;
  if (distribution === 'uniform') {
    const delta = value * tolerance * (Math.random() * 2 - 1);
    return value + delta;
  } else if (distribution === 'gaussian') {
    const sigma = value * tolerance / 3;
    return Math.max(0, gaussianRandom(value, sigma));
  }
  return value;
}

app.post('/api/montecarlo', async (req, res) => {
  try {
    const {
      circuit_data,
      simulation_config,
      tolerances = [],
      runs = 50,
      distribution = 'gaussian',
      circuit_id = null,
      measure_points = null
    } = req.body;

    if (!circuit_data) {
      res.status(400).json({ error: 'circuit_data is required' });
      return;
    }

    const { components = [] } = circuit_data;
    const validTolerances = tolerances.filter(t =>
      t.component_id && t.tolerance > 0 && t.tolerance < 1);

    if (validTolerances.length === 0) {
      res.status(400).json({ error: 'No valid tolerances specified' });
      return;
    }

    const nominalValues = {};
    validTolerances.forEach(t => {
      const comp = components.find(c => c.id === t.component_id);
      if (comp) {
        nominalValues[t.component_id] = {
          value: comp.value,
          tolerance: t.tolerance,
          type: comp.type
        };
      }
    });

    const results = [];
    let failedRuns = 0;
    const errors = [];

    for (let i = 0; i < runs; i++) {
      try {
        const valueOverrides = {};
        const runParams = { run: i + 1, values: {} };

        validTolerances.forEach(t => {
          const nom = nominalValues[t.component_id];
          if (nom) {
            const varied = applyTolerance(nom.value, t.tolerance, distribution);
            valueOverrides[t.component_id] = varied;
            runParams.values[t.component_id] = varied;
          }
        });

        const netlist = generateNetlist(circuit_data, simulation_config, { valueOverrides });
        const result = await runSimulation(netlist, 8000);

        let measuredValues = {};
        if (measure_points && result.data) {
          measure_points.forEach(point => {
            if (result.data[point]) {
              const vals = result.data[point];
              if (Array.isArray(vals) && vals.length > 0) {
                const last = vals[vals.length - 1];
                if (typeof last === 'object' && last !== null) {
                  measuredValues[point] = {
                    mag: Math.sqrt(last.real ** 2 + last.imag ** 2),
                    phase: Math.atan2(last.imag, last.real) * 180 / Math.PI
                  };
                } else {
                  measuredValues[point] = last;
                }
              }
            }
          });
        }

        results.push({
          ...runParams,
          measured: measuredValues,
          result
        });
      } catch (err) {
        failedRuns++;
        errors.push({ run: i + 1, error: err.message });
      }
    }

    let stats = null;
    if (measure_points && results.length > 0) {
      stats = {};
      measure_points.forEach(point => {
        const values = results
          .filter(r => r.measured && r.measured[point] !== undefined)
          .map(r => typeof r.measured[point] === 'object' ? r.measured[point].mag : r.measured[point]);

        if (values.length > 0) {
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
          const std = Math.sqrt(variance);
          stats[point] = {
            mean,
            std,
            min: Math.min(...values),
            max: Math.max(...values),
            values,
            nominal: null
          };

          const firstComp = components.find(c => c.id === validTolerances[0]?.component_id);
          if (firstComp) {
            stats[point].nominal = firstComp.value;
          }
        }
      });
    }

    const simId = uuidv4();

    res.json({
      id: simId,
      runs: results.length,
      failed_runs: failedRuns,
      distribution,
      tolerances: validTolerances,
      results,
      errors,
      stats,
      nominal_values: nominalValues
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/temperature_sweep', async (req, res) => {
  try {
    const {
      circuit_data,
      simulation_config,
      temperatures = [27, -40, 0, 85, 125],
      circuit_id = null
    } = req.body;

    if (!circuit_data) {
      res.status(400).json({ error: 'circuit_data is required' });
      return;
    }

    if (!Array.isArray(temperatures) || temperatures.length === 0) {
      res.status(400).json({ error: 'Invalid temperatures array' });
      return;
    }

    const sortedTemps = [...new Set(temperatures)].sort((a, b) => a - b);
    const results = [];
    const errors = [];

    for (const temp of sortedTemps) {
      try {
        const netlist = generateNetlist(circuit_data, simulation_config, { temperature: temp });
        const result = await runSimulation(netlist, 8000);
        results.push({
          temperature: temp,
          result,
          netlist
        });
      } catch (err) {
        errors.push({ temperature: temp, error: err.message });
      }
    }

    const simId = uuidv4();

    res.json({
      id: simId,
      temperatures: sortedTemps,
      results,
      errors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/netlist', (req, res) => {
  try {
    const { circuit_data, simulation_config } = req.body;
    if (!circuit_data) {
      res.status(400).json({ error: 'circuit_data is required' });
      return;
    }
    const netlist = exportNetlist(circuit_data, simulation_config);
    res.json({ netlist });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/netlist/export', (req, res) => {
  try {
    const { circuit_data, simulation_config, filename = 'circuit.cir' } = req.body;
    if (!circuit_data) {
      res.status(400).json({ error: 'circuit_data is required' });
      return;
    }
    const netlist = exportNetlist(circuit_data, simulation_config);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(netlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ngspice: 'checking...' });
});

app.listen(PORT, () => {
  console.log(`Circuit Simulator backend running on http://localhost:${PORT}`);
});
