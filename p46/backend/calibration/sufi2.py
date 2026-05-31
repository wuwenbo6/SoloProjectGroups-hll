import logging
import numpy as np
import pandas as pd
import json
from typing import Dict, List, Callable, Optional, Tuple
from scipy.stats import norm, uniform
from datetime import datetime

from ..utils.swat_runner import SWATRunner
from ..utils.objective_functions import ObjectiveFunctions
from ..utils.data_processor import DataProcessor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SUFI2:
    PARAM_PHYSICAL_BOUNDS = {
        'CN2': (35, 95),
        'SOL_AWC': (0.01, 0.8),
        'ESCO': (0.1, 1.0),
        'GWQMN': (0, 10000),
        'ALPHA_BF': (0.001, 1.0),
        'CH_N2': (0.005, 0.3),
        'CH_K2': (0, 500),
        'SURLAG': (0.05, 24),
        'EPCO': (0.01, 1.0),
        'GW_REVAP': (0.02, 0.2),
        'REVAPMN': (0, 5000),
        'RCHRG_DP': (0, 1.0)
    }
    
    def __init__(self, 
                 swat_runner: SWATRunner,
                 parameters: List[Dict],
                 observed_data: pd.DataFrame,
                 objective_func: str = 'NSE',
                 target_variable: str = 'streamflow',
                 n_samples: int = 500,
                 max_iterations: int = 100):
        self.swat_runner = swat_runner
        self.parameters = self._process_parameters(parameters)
        self.observed_data = observed_data
        self.objective_func_name = objective_func
        self.objective_func = ObjectiveFunctions.get_function(objective_func)
        self.is_maximize = ObjectiveFunctions.is_maximize(objective_func)
        self.target_variable = target_variable
        self.n_samples = n_samples
        self.max_iterations = max_iterations
        
        self.current_iteration = 0
        self.best_objective = -np.inf if self.is_maximize else np.inf
        self.best_parameters = None
        self.history = []
        self.param_covariance = None
        self.divergence_count = 0
        self.max_divergence = 5
        
        self._initialize_covariance()
    
    def _process_parameters(self, parameters: List[Dict]) -> List[Dict]:
        processed = []
        for param in parameters:
            name = param.get('name')
            min_val = param.get('min_value', param.get('min'))
            max_val = param.get('max_value', param.get('max'))
            initial_val = param.get('initial_value', param.get('initial', 
                            (min_val + max_val) / 2 if min_val and max_val else None))
            
            if name in self.PARAM_PHYSICAL_BOUNDS:
                phys_min, phys_max = self.PARAM_PHYSICAL_BOUNDS[name]
                min_val = max(min_val, phys_min) if min_val else phys_min
                max_val = min(max_val, phys_max) if max_val else phys_max
                if initial_val:
                    initial_val = np.clip(initial_val, min_val, max_val)
            
            processed.append({
                'name': name,
                'min': min_val,
                'max': max_val,
                'initial': initial_val,
                'distribution': param.get('distribution', 'uniform'),
                'change_type': param.get('change_type', 'relative')
            })
        return processed
    
    def _initialize_covariance(self):
        n_params = len(self.parameters)
        param_ranges = np.array([p['max'] - p['min'] for p in self.parameters])
        self.param_covariance = np.diag((param_ranges / 6) ** 2)
        self.initial_covariance = self.param_covariance.copy()
    
    def _enforce_bounds(self, sample: np.ndarray) -> np.ndarray:
        bounded = sample.copy()
        for j, param in enumerate(self.parameters):
            bounded[j] = np.clip(bounded[j], param['min'], param['max'])
        return bounded
    
    def _is_within_bounds(self, sample: np.ndarray) -> bool:
        for j, param in enumerate(self.parameters):
            if sample[j] < param['min'] or sample[j] > param['max']:
                return False
        return True
    
    def _sample_parameters(self, n_samples: int) -> np.ndarray:
        n_params = len(self.parameters)
        samples = np.zeros((n_samples, n_params))
        means = np.array([p['initial'] for p in self.parameters])
        
        max_attempts = 100
        for i in range(n_samples):
            valid_sample = None
            for attempt in range(max_attempts):
                try:
                    sample = np.random.multivariate_normal(means, self.param_covariance)
                    if self._is_within_bounds(sample):
                        valid_sample = sample
                        break
                except np.linalg.LinAlgError:
                    self._reset_covariance()
                    sample = np.random.multivariate_normal(means, self.param_covariance)
            
            if valid_sample is not None:
                samples[i] = valid_sample
            else:
                sample = np.random.multivariate_normal(means, self.param_covariance)
                samples[i] = self._enforce_bounds(sample)
        
        return samples
    
    def _reset_covariance(self):
        logger.warning("Resetting covariance matrix to initial state")
        self.param_covariance = self.initial_covariance.copy()
        self.divergence_count += 1
    
    def _check_divergence(self, current_cov: np.ndarray) -> bool:
        initial_det = np.linalg.det(self.initial_covariance)
        current_det = np.linalg.det(current_cov)
        
        if initial_det > 0 and current_det > initial_det * 1000:
            return True
        
        diag_ratio = np.max(np.diag(current_cov)) / np.max(np.diag(self.initial_covariance))
        if diag_ratio > 100:
            return True
        
        return False
    
    def _update_covariance(self, top_samples: np.ndarray, objective_values: np.ndarray):
        if len(top_samples) < 2:
            return
        
        weights = self._calculate_weights(objective_values)
        weighted_mean = np.average(top_samples, weights=weights, axis=0)
        
        for i, param in enumerate(self.parameters):
            param['initial'] = np.clip(weighted_mean[i], param['min'], param['max'])
        
        diff = top_samples - weighted_mean
        weighted_cov = np.zeros_like(self.param_covariance)
        for i in range(len(top_samples)):
            weighted_cov += weights[i] * np.outer(diff[i], diff[i])
        
        shrinkage_factor = 0.3
        weighted_cov = (1 - shrinkage_factor) * weighted_cov + shrinkage_factor * self.initial_covariance
        
        eigvals = np.linalg.eigvalsh(weighted_cov)
        min_eigval = np.min(eigvals)
        if min_eigval <= 0:
            jitter = abs(min_eigval) + 1e-6
            weighted_cov = weighted_cov + jitter * np.eye(len(weighted_cov))
        
        if self._check_divergence(weighted_cov):
            logger.warning("Detected covariance divergence, resetting...")
            self._reset_covariance()
        else:
            self.param_covariance = weighted_cov
    
    def _calculate_weights(self, objective_values: np.ndarray) -> np.ndarray:
        if self.is_maximize:
            normalized = objective_values - np.min(objective_values)
        else:
            normalized = np.max(objective_values) - objective_values
        
        total = np.sum(normalized)
        if total > 0:
            return normalized / total
        else:
            return np.ones_like(normalized) / len(normalized)
    
    def _calculate_p_factor(self, simulated_sets: List[np.ndarray], observed: np.ndarray) -> float:
        if len(simulated_sets) == 0:
            return 0.0
        
        simulated_array = np.array(simulated_sets)
        lower_bound = np.percentile(simulated_array, 2.5, axis=0)
        upper_bound = np.percentile(simulated_array, 97.5, axis=0)
        
        within_bounds = np.sum((observed >= lower_bound) & (observed <= upper_bound))
        return within_bounds / len(observed)
    
    def _calculate_r_factor(self, simulated_sets: List[np.ndarray], observed: np.ndarray) -> float:
        if len(simulated_sets) == 0:
            return np.inf
        
        simulated_array = np.array(simulated_sets)
        mean_lower = np.mean(np.percentile(simulated_array, 2.5, axis=0))
        mean_upper = np.mean(np.percentile(simulated_array, 97.5, axis=0))
        
        obs_std = np.std(observed)
        if obs_std == 0:
            return np.inf
        
        return (mean_upper - mean_lower) / obs_std
    
    def _run_simulation(self, param_values: np.ndarray) -> Optional[pd.DataFrame]:
        params = []
        for i, param in enumerate(self.parameters):
            params.append({
                'name': param['name'],
                'value': param_values[i],
                'change_type': param['change_type']
            })
        
        try:
            self.swat_runner.set_parameters(params)
            results = self.swat_runner.run()
            return results
        except Exception as e:
            logger.error(f"Simulation failed: {e}")
            return None
    
    def _check_simulation_divergence(self, simulated: pd.DataFrame) -> bool:
        target_col = self.target_variable
        if target_col not in simulated.columns:
            return True
        
        values = simulated[target_col].values
        
        if np.any(np.isnan(values)) or np.any(np.isinf(values)):
            return True
        
        if np.any(values < 0):
            return True
        
        obs_mean = self.observed_data[self.target_variable].mean()
        sim_mean = np.mean(values)
        if sim_mean > obs_mean * 100 or sim_mean < obs_mean * 0.01:
            return True
        
        return False
    
    def _evaluate_objective(self, simulated: pd.DataFrame) -> Optional[float]:
        try:
            if self._check_simulation_divergence(simulated):
                return None
            
            sim_vals, obs_vals = DataProcessor.align_simulated_observed(
                simulated, self.observed_data,
                sim_value_col=self.target_variable,
                obs_value_col=self.target_variable
            )
            
            if len(sim_vals) == 0:
                return None
            
            obj_value = self.objective_func(sim_vals.values, obs_vals.values)
            
            if np.isnan(obj_value) or np.isinf(obj_value):
                return None
            
            return obj_value
        except Exception as e:
            logger.error(f"Objective evaluation failed: {e}")
            return None
    
    def run(self, callback: Optional[Callable] = None) -> Dict:
        logger.info(f"Starting SUFI-2 calibration with {len(self.parameters)} parameters")
        logger.info(f"Objective function: {self.objective_func_name}")
        
        all_simulations = []
        all_objectives = []
        
        for iteration in range(self.max_iterations):
            self.current_iteration = iteration + 1
            logger.info(f"Iteration {self.current_iteration}/{self.max_iterations}")
            
            samples = self._sample_parameters(self.n_samples)
            iteration_objectives = []
            iteration_simulated = []
            valid_samples = []
            
            for i, sample in enumerate(samples):
                results = self._run_simulation(sample)
                
                if results is not None:
                    obj_value = self._evaluate_objective(results)
                    
                    if obj_value is not None and not np.isnan(obj_value):
                        iteration_objectives.append(obj_value)
                        valid_samples.append(sample)
                        iteration_simulated.append(results[self.target_variable].values)
                        
                        if (self.is_maximize and obj_value > self.best_objective) or \
                           (not self.is_maximize and obj_value < self.best_objective):
                            self.best_objective = obj_value
                            self.best_parameters = sample.copy()
                            logger.info(f"New best objective: {obj_value:.4f}")
            
            if len(valid_samples) == 0:
                logger.warning("No valid samples in iteration")
                continue
            
            valid_samples = np.array(valid_samples)
            iteration_objectives = np.array(iteration_objectives)
            
            n_top = max(10, int(len(valid_samples) * 0.1))
            if self.is_maximize:
                top_indices = np.argsort(iteration_objectives)[-n_top:]
            else:
                top_indices = np.argsort(iteration_objectives)[:n_top]
            
            top_samples = valid_samples[top_indices]
            top_objectives = iteration_objectives[top_indices]
            
            self._update_covariance(top_samples, top_objectives)
            
            p_factor = self._calculate_p_factor(iteration_simulated, 
                                                self.observed_data[self.target_variable].values)
            r_factor = self._calculate_r_factor(iteration_simulated,
                                                self.observed_data[self.target_variable].values)
            
            iteration_result = {
                'iteration': self.current_iteration,
                'best_objective': float(self.best_objective),
                'mean_objective': float(np.mean(iteration_objectives)),
                'p_factor': float(p_factor),
                'r_factor': float(r_factor),
                'n_valid_samples': len(valid_samples)
            }
            self.history.append(iteration_result)
            
            logger.info(f"Iteration {self.current_iteration} complete: "
                       f"best={self.best_objective:.4f}, "
                       f"P-factor={p_factor:.3f}, "
                       f"R-factor={r_factor:.3f}")
            
            if callback:
                callback(iteration_result)
        
        return self.get_results()
    
    def get_results(self) -> Dict:
        best_params_dict = {}
        if self.best_parameters is not None:
            for i, param in enumerate(self.parameters):
                best_params_dict[param['name']] = float(self.best_parameters[i])
        
        return {
            'best_objective': float(self.best_objective),
            'best_parameters': best_params_dict,
            'history': self.history,
            'n_iterations': self.current_iteration,
            'objective_function': self.objective_func_name,
            'target_variable': self.target_variable
        }
    
    def get_param_ranges(self) -> Dict[str, Tuple[float, float]]:
        ranges = {}
        for param in self.parameters:
            ranges[param['name']] = (param['min'], param['max'])
        return ranges
    
    def save_results(self, filepath: str):
        results = self.get_results()
        with open(filepath, 'w') as f:
            json.dump(results, f, indent=2)
        logger.info(f"Results saved to {filepath}")
