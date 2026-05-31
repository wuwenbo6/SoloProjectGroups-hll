import numpy as np
import os
import shutil
from datetime import datetime
from app import db
from app.models import CalibrationRun, CalibrationParameter

class SCEUACalibrator:
    def __init__(self, inp_file, observed_data=None):
        self.inp_file = inp_file
        self.observed_data = observed_data or {}
        self.parameters = []
        self.best_params = None
        self.best_fitness = float('inf')
        self.calibration_id = None
    
    def add_parameter(self, name, param_type, min_val, max_val, 
                       subcatchment_id=None, link_id=None):
        self.parameters.append({
            'name': name,
            'type': param_type,
            'min': min_val,
            'max': max_val,
            'subcatchment_id': subcatchment_id,
            'link_id': link_id
        })
    
    def run_calibration(self, name="Default Calibration", n_complex=5, 
                         n_iterations=100, n_pop=10):
        calib_record = CalibrationRun(
            name=name,
            status='running',
            start_time=datetime.utcnow(),
            n_parameters=len(self.parameters),
            n_iterations=n_iterations
        )
        db.session.add(calib_record)
        db.session.commit()
        self.calibration_id = calib_record.id
        
        try:
            n_params = len(self.parameters)
            n_complex = max(n_complex, n_params + 1)
            
            population = self._initialize_population(n_pop)
            complexes = self._partition_into_complexes(population, n_complex)
            
            for iteration in range(n_iterations):
                for i in range(n_complex):
                    complexes[i] = self._evolve_complex(complexes[i])
                
                population = np.vstack(complexes)
                population = population[np.argsort([self._fitness(p) for p in population])]
                complexes = self._partition_into_complexes(population, n_complex)
                
                current_best = self._fitness(population[0])
                if current_best < self.best_fitness:
                    self.best_fitness = current_best
                    self.best_params = population[0].copy()
                
                self._save_iteration(iteration, population[0], current_best)
            
            calib_record.status = 'completed'
            calib_record.end_time = datetime.utcnow()
            calib_record.best_fitness = self.best_fitness
            calib_record.best_parameters = str(self.best_params.tolist())
            db.session.commit()
            
            return {
                'success': True,
                'calibration_id': self.calibration_id,
                'best_parameters': self._params_to_dict(self.best_params),
                'best_fitness': self.best_fitness
            }
            
        except Exception as e:
            calib_record.status = 'failed'
            db.session.commit()
            return {'success': False, 'error': str(e)}
    
    def _initialize_population(self, n_pop):
        n_params = len(self.parameters)
        population = np.random.uniform(0, 1, (n_pop, n_params))
        return population
    
    def _partition_into_complexes(self, population, n_complex):
        n_pop = len(population)
        n_per_complex = n_pop // n_complex
        complexes = []
        
        for i in range(n_complex):
            start = i * n_per_complex
            end = start + n_per_complex if i < n_complex - 1 else n_pop
            complexes.append(population[start:end])
        
        return complexes
    
    def _evolve_complex(self, complex_points):
        n_points = len(complex_points)
        n_params = complex_points.shape[1]
        
        sorted_idx = np.argsort([self._fitness(p) for p in complex_points])
        complex_points = complex_points[sorted_idx]
        
        alpha = 1.0
        beta = 0.5
        
        centroid = np.mean(complex_points[:n_points//2], axis=0)
        
        worst = complex_points[-1]
        reflection = centroid + alpha * (centroid - worst)
        reflection = np.clip(reflection, 0, 1)
        
        if self._fitness(reflection) < self._fitness(worst):
            complex_points[-1] = reflection
        else:
            contraction = centroid - beta * (centroid - worst)
            contraction = np.clip(contraction, 0, 1)
            if self._fitness(contraction) < self._fitness(worst):
                complex_points[-1] = contraction
            else:
                for i in range(1, n_points):
                    complex_points[i] = complex_points[0] + 0.5 * (complex_points[i] - complex_points[0])
        
        return complex_points
    
    def _fitness(self, normalized_params):
        param_dict = self._params_to_dict(normalized_params)
        simulated_data = self._run_simulation_with_params(param_dict)
        error = self._calculate_error(simulated_data)
        return error
    
    def _params_to_dict(self, normalized_params):
        result = {}
        for i, param in enumerate(self.parameters):
            norm_val = normalized_params[i] if i < len(normalized_params) else 0.5
            actual_val = param['min'] + norm_val * (param['max'] - param['min'])
            result[f"{param['name']}_{i}"] = {
                'name': param['name'],
                'value': actual_val,
                'subcatchment_id': param.get('subcatchment_id'),
                'link_id': param.get('link_id')
            }
        return result
    
    def _run_simulation_with_params(self, param_dict):
        from app.simulator import SWMMSimulator, SWMMParameterEditor
        
        temp_inp = self.inp_file.replace('.inp', '_calib_temp.inp')
        shutil.copy2(self.inp_file, temp_inp)
        
        editor = SWMMParameterEditor(temp_inp)
        
        for key, param in param_dict.items():
            if param['name'] == 'area' and param['subcatchment_id']:
                editor.modify_subcatchment_area(param['subcatchment_id'], param['value'])
            elif param['name'] == 'roughness' and param['link_id']:
                editor.modify_roughness(param['link_id'], param['value'])
        
        sim = SWMMSimulator(temp_inp)
        result = sim.run_simulation('calibration_temp')
        
        if os.path.exists(temp_inp):
            os.remove(temp_inp)
        
        from app.models import NodeResult
        results = NodeResult.query.filter_by(simulation_id=result['simulation_id']).all()
        return {r.node_id: r.depth for r in results}
    
    def _calculate_error(self, simulated_data):
        if not self.observed_data:
            total_depth = sum(simulated_data.values())
            return total_depth
        
        total_error = 0
        count = 0
        for node_id, obs_depth in self.observed_data.items():
            if node_id in simulated_data:
                error = (simulated_data[node_id] - obs_depth) ** 2
                total_error += error
                count += 1
        
        return np.sqrt(total_error / max(count, 1))
    
    def _save_iteration(self, iteration, best_params, fitness):
        param_dict = self._params_to_dict(best_params)
        for key, param in param_dict.items():
            calib_param = CalibrationParameter(
                calibration_id=self.calibration_id,
                iteration=iteration,
                param_name=param['name'],
                param_value=param['value'],
                fitness=fitness
            )
            db.session.add(calib_param)
        db.session.commit()
    
    def apply_best_parameters(self):
        if not self.best_params:
            return {'success': False, 'error': 'No calibration results available'}
        
        from app.simulator import SWMMParameterEditor
        editor = SWMMParameterEditor(self.inp_file)
        param_dict = self._params_to_dict(self.best_params)
        
        for key, param in param_dict.items():
            if param['name'] == 'area' and param['subcatchment_id']:
                editor.modify_subcatchment_area(param['subcatchment_id'], param['value'])
            elif param['name'] == 'roughness' and param['link_id']:
                editor.modify_roughness(param['link_id'], param['value'])
        
        return {'success': True, 'message': 'Best parameters applied'}
