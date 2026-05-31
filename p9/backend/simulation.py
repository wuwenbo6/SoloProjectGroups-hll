import openmm as mm
import openmm.app as app
import openmm.unit as unit
import numpy as np
import threading
import time
import math
import struct
import os


class ParameterSmoother:
    def __init__(self, transition_steps=200):
        self.transition_steps = transition_steps
        self.current_values = {}
        self.target_values = {}
        self.start_values = {}
        self.transition_progress = {}
        self.lock = threading.Lock()
    
    def set_initial(self, name, value):
        with self.lock:
            self.current_values[name] = value
            self.target_values[name] = value
            self.start_values[name] = value
            self.transition_progress[name] = 1.0
    
    def set_target(self, name, value):
        with self.lock:
            if name in self.current_values:
                self.start_values[name] = self.current_values[name]
            else:
                self.start_values[name] = value
            self.target_values[name] = value
            self.transition_progress[name] = 0.0
    
    def step(self):
        with self.lock:
            for name in self.current_values:
                if self.transition_progress[name] < 1.0:
                    self.transition_progress[name] += 1.0 / self.transition_steps
                    if self.transition_progress[name] > 1.0:
                        self.transition_progress[name] = 1.0
                    
                    t = self.transition_progress[name]
                    smooth_t = 0.5 - 0.5 * math.cos(t * math.pi)
                    self.current_values[name] = (
                        self.start_values[name] * (1 - smooth_t) +
                        self.target_values[name] * smooth_t
                    )
            return {k: v for k, v in self.current_values.items()}
    
    def get_current(self, name):
        with self.lock:
            return self.current_values.get(name)
    
    def is_transitioning(self):
        with self.lock:
            return any(p < 1.0 for p in self.transition_progress.values())


class RDFCalculator:
    def __init__(self, num_bins=100, max_r=3.0):
        self.num_bins = num_bins
        self.max_r = max_r
        self.bin_width = max_r / num_bins
        self.histogram = np.zeros(num_bins)
        self.count = 0
        self.lock = threading.Lock()
    
    def calculate(self, positions, box_vectors):
        with self.lock:
            n = len(positions)
            box_size = box_vectors[0][0]
            
            dists = []
            for i in range(n):
                for j in range(i + 1, n):
                    dx = positions[i][0] - positions[j][0]
                    dy = positions[i][1] - positions[j][1]
                    dz = positions[i][2] - positions[j][2]
                    
                    dx -= box_size * round(dx / box_size)
                    dy -= box_size * round(dy / box_size)
                    dz -= box_size * round(dz / box_size)
                    
                    r = math.sqrt(dx*dx + dy*dy + dz*dz)
                    if r < self.max_r:
                        dists.append(r)
            
            hist, _ = np.histogram(dists, bins=self.num_bins, range=(0, self.max_r))
            self.histogram += hist
            self.count += 1
            
            return self.get_rdf()
    
    def get_rdf(self):
        with self.lock:
            if self.count == 0:
                return {
                    'r': [],
                    'g': [],
                    'count': 0
                }
            
            r = np.arange(self.num_bins) * self.bin_width + self.bin_width / 2
            shell_volumes = 4 * np.pi * r**2 * self.bin_width
            
            avg_hist = self.histogram / self.count
            
            return {
                'r': r.tolist(),
                'g': avg_hist.tolist(),
                'count': self.count
            }
    
    def reset(self):
        with self.lock:
            self.histogram = np.zeros(self.num_bins)
            self.count = 0


class XTCWriter:
    def __init__(self, filename, num_atoms):
        self.filename = filename
        self.num_atoms = num_atoms
        self.frame_count = 0
        self.file = None
    
    def open(self):
        self.file = open(self.filename, 'wb')
        self._write_header()
    
    def _write_header(self):
        header = struct.pack('<4sii', b'XTC ', self.num_atoms, 0)
        self.file.write(header)
    
    def write_frame(self, positions, box_vectors, step, time):
        if self.file is None:
            self.open()
        
        box = np.array([
            box_vectors[0][0], 0, 0,
            0, box_vectors[1][1], 0,
            0, 0, box_vectors[2][2]
        ], dtype=np.float32)
        
        self.file.write(struct.pack('<i', step))
        self.file.write(struct.pack('<f', time))
        self.file.write(struct.pack('<i', 9))
        self.file.write(box.tobytes())
        
        self.file.write(struct.pack('<i', self.num_atoms))
        
        coords = np.array(positions, dtype=np.float32)
        self.file.write(coords.tobytes())
        
        self.frame_count += 1
    
    def close(self):
        if self.file:
            self.file.close()
            self.file = None


class LennardJonesSimulation:
    def __init__(self, species_configs=None, transition_steps=200, 
                 rdf_enabled=True, rdf_bins=100, rdf_max_r=3.0):
        if species_configs is None:
            species_configs = [{
                'name': 'Ar',
                'count': 216,
                'epsilon': 1.0,
                'sigma': 0.34,
                'mass': 39.95,
                'color': '#00d4ff'
            }]
        
        self.species_configs = species_configs
        self.num_particles = sum(s['count'] for s in species_configs)
        self.particle_species = []
        for idx, species in enumerate(species_configs):
            self.particle_species.extend([idx] * species['count'])
        self.particle_species = np.array(self.particle_species)
        
        self.param_smoothers = {}
        for idx, species in enumerate(species_configs):
            smoother = ParameterSmoother(transition_steps=transition_steps)
            smoother.set_initial(f'temperature', 300.0)
            smoother.set_initial(f'species_{idx}_epsilon', species['epsilon'])
            smoother.set_initial(f'species_{idx}_sigma', species['sigma'])
            self.param_smoothers[idx] = smoother
        
        self.global_smoother = ParameterSmoother(transition_steps=transition_steps)
        self.global_smoother.set_initial('temperature', 300.0)
        self.global_smoother.set_initial('pressure', 1.0)
        
        self.simulation = None
        self.is_running = False
        self.simulation_thread = None
        self.positions = None
        self.velocities = None
        self.box_vectors = None
        self.step_count = 0
        self.potential_energy = 0.0
        self.kinetic_energy = 0.0
        self.timestamp = 0.0
        self.dt = 0.005
        self.lock = threading.Lock()
        
        self.rdf_enabled = rdf_enabled
        self.rdf_calculator = RDFCalculator(num_bins=rdf_bins, max_r=rdf_max_r) if rdf_enabled else None
        self.rdf_update_interval = 50
        
        self.xtc_writer = None
        self.is_recording = False
        
        self._create_system()
    
    def _create_system(self):
        system = mm.System()
        
        max_sigma = max(s['sigma'] for s in self.species_configs)
        
        for idx, species in enumerate(self.species_configs):
            mass = species['mass'] * unit.atomic_mass_unit
            for _ in range(species['count']):
                system.addParticle(mass)
        
        lj_force = mm.NonbondedForce()
        lj_force.setNonbondedMethod(mm.NonbondedForce.CutoffPeriodic)
        lj_force.setCutoffDistance(2.5 * max_sigma * unit.nanometers)
        
        for idx, species in enumerate(self.species_configs):
            epsilon = species['epsilon'] * unit.kilojoules_per_mole
            sigma = species['sigma'] * unit.nanometers
            for _ in range(species['count']):
                lj_force.addParticle(0.0, sigma, epsilon)
        
        system.addForce(lj_force)
        
        box_size = max_sigma * (self.num_particles ** (1/3)) * 1.5
        system.setDefaultPeriodicBoxVectors(
            mm.Vec3(box_size, 0, 0),
            mm.Vec3(0, box_size, 0),
            mm.Vec3(0, 0, box_size)
        )
        
        temperature = 300.0 * unit.kelvin
        integrator = mm.LangevinIntegrator(
            temperature,
            1.0 / unit.picoseconds,
            self.dt * unit.picoseconds
        )
        
        initial_positions = self._create_initial_positions(box_size)
        
        topology = app.Topology()
        chain = topology.addChain()
        for species in self.species_configs:
            element = app.Element.getBySymbol(species['name'][:2]) if len(species['name']) >= 2 else app.Element.getBySymbol('Ar')
            residue = topology.addResidue(species['name'], chain)
            for _ in range(species['count']):
                topology.addAtom(species['name'], element, residue)
        
        self.simulation = app.Simulation(topology, system, integrator)
        self.simulation.context.setPositions(initial_positions)
        self.simulation.context.setVelocitiesToTemperature(temperature)
        
        state = self.simulation.context.getState(getPositions=True, getEnergy=True, getVelocities=True)
        self.positions = state.getPositions(asNumpy=True)._value.astype(np.float32)
        self.velocities = state.getVelocities(asNumpy=True)._value.astype(np.float32)
        self.box_vectors = state.getPeriodicBoxVectors()._value
        self.potential_energy = state.getPotentialEnergy()._value
        self.kinetic_energy = state.getKineticEnergy()._value
        self.timestamp = time.time()
    
    def _create_initial_positions(self, box_size):
        positions = []
        n = int(np.ceil(self.num_particles ** (1/3)))
        spacing = box_size / n
        
        for i in range(n):
            for j in range(n):
                for k in range(n):
                    if len(positions) < self.num_particles:
                        x = (i + 0.5) * spacing
                        y = (j + 0.5) * spacing
                        z = (k + 0.5) * spacing
                        positions.append(mm.Vec3(x, y, z))
        
        return positions
    
    def _update_simulation_parameters(self):
        if self.global_smoother.is_transitioning():
            params = self.global_smoother.step()
            if 'temperature' in params:
                integrator = self.simulation.context.getIntegrator()
                integrator.setTemperature(params['temperature'] * unit.kelvin)
        
        for idx, smoother in self.param_smoothers.items():
            if smoother.is_transitioning():
                smoother.step()
                epsilon = smoother.get_current(f'species_{idx}_epsilon')
                sigma = smoother.get_current(f'species_{idx}_sigma')
                
                forces = self.simulation.system.getForces()
                for force in forces:
                    if isinstance(force, mm.NonbondedForce):
                        start_idx = sum(s['count'] for s in self.species_configs[:idx])
                        end_idx = start_idx + self.species_configs[idx]['count']
                        for i in range(start_idx, end_idx):
                            force.setParticleParameters(
                                i, 0.0,
                                sigma * unit.nanometers,
                                epsilon * unit.kilojoules_per_mole
                            )
                        force.updateParametersInContext(self.simulation.context)
                        break
    
    def step(self, num_steps=10):
        if self.simulation is None:
            return
        
        with self.lock:
            for _ in range(num_steps):
                self._update_simulation_parameters()
                self.simulation.step(1)
                self.step_count += 1
                
                if self.is_recording and self.xtc_writer:
                    state = self.simulation.context.getState(getPositions=True)
                    pos = state.getPositions(asNumpy=True)._value
                    box = state.getPeriodicBoxVectors()._value
                    self.xtc_writer.write_frame(
                        pos, box, self.step_count, 
                        self.step_count * self.dt
                    )
            
            state = self.simulation.context.getState(
                getPositions=True, getEnergy=True, getVelocities=True
            )
            self.positions = state.getPositions(asNumpy=True)._value.astype(np.float32)
            self.velocities = state.getVelocities(asNumpy=True)._value.astype(np.float32)
            self.potential_energy = state.getPotentialEnergy()._value
            self.kinetic_energy = state.getKineticEnergy()._value
            self.timestamp = time.time()
            
            if self.rdf_enabled and self.step_count % self.rdf_update_interval == 0:
                self.rdf_calculator.calculate(self.positions, self.box_vectors)
    
    def start(self, steps_per_update=10, update_interval=0.033):
        if self.is_running:
            return
        
        self.is_running = True
        
        def run_simulation():
            while self.is_running:
                self.step(steps_per_update)
                time.sleep(update_interval)
        
        self.simulation_thread = threading.Thread(target=run_simulation)
        self.simulation_thread.daemon = True
        self.simulation_thread.start()
    
    def stop(self):
        self.is_running = False
        if self.simulation_thread:
            self.simulation_thread.join()
            self.simulation_thread = None
    
    def start_recording(self, filename='trajectory.xtc'):
        with self.lock:
            if self.xtc_writer:
                self.xtc_writer.close()
            self.xtc_writer = XTCWriter(filename, self.num_particles)
            self.xtc_writer.open()
            self.is_recording = True
    
    def stop_recording(self):
        with self.lock:
            self.is_recording = False
            if self.xtc_writer:
                self.xtc_writer.close()
                self.xtc_writer = None
    
    def get_state(self, compact=False):
        with self.lock:
            if compact:
                return {
                    'p': self.positions.flatten().tolist(),
                    's': self.step_count,
                    't': self.timestamp,
                    'pe': round(self.potential_energy, 2),
                    'ke': round(self.kinetic_energy, 2),
                    'bv': [list(v) for v in self.box_vectors],
                    'species': self.particle_species.tolist(),
                    'recording': self.is_recording
                }
            else:
                return {
                    'positions': self.positions.tolist(),
                    'velocities': self.velocities.tolist(),
                    'box_vectors': [list(v) for v in self.box_vectors],
                    'step_count': self.step_count,
                    'timestamp': self.timestamp,
                    'dt': self.dt,
                    'potential_energy': self.potential_energy,
                    'kinetic_energy': self.kinetic_energy,
                    'temperature': self.global_smoother.get_current('temperature'),
                    'pressure': self.global_smoother.get_current('pressure'),
                    'num_particles': self.num_particles,
                    'species_configs': self.species_configs,
                    'particle_species': self.particle_species.tolist(),
                    'recording': self.is_recording
                }
    
    def get_rdf(self):
        if self.rdf_calculator:
            return self.rdf_calculator.get_rdf()
        return None
    
    def reset_rdf(self):
        if self.rdf_calculator:
            self.rdf_calculator.reset()
    
    def update_species_parameters(self, species_idx, epsilon=None, sigma=None):
        with self.lock:
            if species_idx < len(self.species_configs):
                if epsilon is not None:
                    self.param_smoothers[species_idx].set_target(f'species_{species_idx}_epsilon', epsilon)
                if sigma is not None:
                    self.param_smoothers[species_idx].set_target(f'species_{species_idx}_sigma', sigma)
    
    def update_global_parameters(self, temperature=None, pressure=None):
        with self.lock:
            if temperature is not None:
                self.global_smoother.set_target('temperature', temperature)
            if pressure is not None:
                self.global_smoother.set_target('pressure', pressure)
    
    def reset(self):
        with self.lock:
            self.stop()
            self.step_count = 0
            if self.rdf_calculator:
                self.rdf_calculator.reset()
            if self.xtc_writer:
                self.xtc_writer.close()
                self.xtc_writer = None
            self.is_recording = False
            self._create_system()
