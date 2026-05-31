import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Callable

from ..utils.swat_runner import SWATRunner

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MorrisAnalyzer:
    def __init__(self, 
                 swat_runner: SWATRunner,
                 parameters: List[Dict],
                 target_variable: str = 'streamflow',
                 n_samples: int = 100,
                 n_levels: int = 4):
        self.swat_runner = swat_runner
        self.parameters = self._process_parameters(parameters)
        self.target_variable = target_variable
        self.n_samples = n_samples
        self.n_levels = n_levels
        self.n_params = len(self.parameters)
        
        self.results = None
        self.sensitivity_indices = None
        self.elementary_effects = None
    
    def _process_parameters(self, parameters: List[Dict]) -> List[Dict]:
        processed = []
        for param in parameters:
            processed.append({
                'name': param.get('name'),
                'min': param.get('min_value', param.get('min')),
                'max': param.get('max_value', param.get('max'))
            })
        return processed
    
    def _generate_trajectory(self, base_point: np.ndarray, delta: float) -> np.ndarray:
        trajectory = np.zeros((self.n_params + 1, self.n_params))
        trajectory[0] = base_point.copy()
        
        permutation = np.random.permutation(self.n_params)
        
        for i in range(self.n_params):
            trajectory[i + 1] = trajectory[i].copy()
            param_idx = permutation[i]
            if trajectory[i, param_idx] + delta <= 1.0:
                trajectory[i + 1, param_idx] += delta
            else:
                trajectory[i + 1, param_idx] -= delta
        
        return trajectory
    
    def _scale_to_real_space(self, normalized_point: np.ndarray) -> np.ndarray:
        real_point = np.zeros_like(normalized_point)
        for i, param in enumerate(self.parameters):
            real_point[i] = param['min'] + normalized_point[i] * (param['max'] - param['min'])
        return real_point
    
    def _run_model(self, param_values: np.ndarray) -> Optional[float]:
        params = []
        for i, param in enumerate(self.parameters):
            params.append({
                'name': param['name'],
                'value': param_values[i],
                'change_type': 'absolute'
            })
        
        try:
            self.swat_runner.set_parameters(params)
            results = self.swat_runner.run()
            
            if results is not None and self.target_variable in results.columns:
                return results[self.target_variable].mean()
            return None
        except Exception as e:
            logger.error(f"Model run failed: {e}")
            return None
    
    def _calculate_elementary_effects(self, trajectory: np.ndarray, outputs: np.ndarray) -> np.ndarray:
        delta = (self.n_levels - 1) / (2 * (self.n_levels - 1))
        
        effects = np.zeros(self.n_params)
        
        for i in range(self.n_params):
            param_idx = np.where(np.abs(trajectory[i + 1] - trajectory[i]) > 1e-10)[0][0]
            step = trajectory[i + 1, param_idx] - trajectory[i, param_idx]
            effects[param_idx] = (outputs[i + 1] - outputs[i]) / (step * (self.parameters[param_idx]['max'] - self.parameters[param_idx]['min']))
        
        return effects
    
    def run(self, callback: Optional[Callable] = None) -> Dict:
        logger.info(f"Starting Morris sensitivity analysis with {self.n_params} parameters")
        logger.info(f"n_samples={self.n_samples}, n_levels={self.n_levels}")
        
        delta = (self.n_levels - 1) / (2 * (self.n_levels - 1))
        
        all_effects = []
        
        for sample_idx in range(self.n_samples):
            base_point = np.random.choice(np.linspace(0, 1 - delta, self.n_levels), 
                                         size=self.n_params)
            
            trajectory = self._generate_trajectory(base_point, delta)
            
            outputs = np.zeros(self.n_params + 1)
            valid_run = True
            
            for i in range(self.n_params + 1):
                real_params = self._scale_to_real_space(trajectory[i])
                output = self._run_model(real_params)
                
                if output is None:
                    valid_run = False
                    break
                outputs[i] = output
            
            if valid_run:
                effects = self._calculate_elementary_effects(trajectory, outputs)
                all_effects.append(effects)
            
            if callback and (sample_idx + 1) % 10 == 0:
                callback({
                    'completed': sample_idx + 1,
                    'total': self.n_samples,
                    'valid_effects': len(all_effects)
                })
        
        if len(all_effects) == 0:
            raise RuntimeError("No valid model runs completed")
        
        all_effects = np.array(all_effects)
        self.elementary_effects = all_effects
        
        mu = np.mean(all_effects, axis=0)
        mu_star = np.mean(np.abs(all_effects), axis=0)
        sigma = np.std(all_effects, axis=0)
        
        self.sensitivity_indices = pd.DataFrame({
            'parameter': [p['name'] for p in self.parameters],
            'mu': mu,
            'mu_star': mu_star,
            'sigma': sigma
        })
        
        self.sensitivity_indices = self.sensitivity_indices.sort_values('mu_star', ascending=False)
        self.sensitivity_indices['rank'] = range(1, len(self.sensitivity_indices) + 1)
        
        logger.info("Morris analysis completed")
        logger.info(f"Sensitivity indices:\n{self.sensitivity_indices}")
        
        return self.get_results()
    
    def get_results(self) -> Dict:
        if self.sensitivity_indices is None:
            return {'error': 'Analysis not yet run'}
        
        return {
            'parameters': [p['name'] for p in self.parameters],
            'target_variable': self.target_variable,
            'n_samples': self.n_samples,
            'n_valid_samples': len(self.elementary_effects) if self.elementary_effects is not None else 0,
            'sensitivity_indices': self.sensitivity_indices.to_dict('records'),
            'elementary_effects': self.elementary_effects.tolist() if self.elementary_effects is not None else None
        }
    
    def get_ranked_parameters(self) -> List[str]:
        if self.sensitivity_indices is None:
            return []
        return self.sensitivity_indices['parameter'].tolist()
    
    def plot_sensitivity(self, output_path: Optional[str] = None):
        if self.sensitivity_indices is None:
            raise ValueError("Run analysis first")
        
        import matplotlib.pyplot as plt
        
        fig, ax = plt.subplots(figsize=(10, 6))
        
        scatter = ax.scatter(
            self.sensitivity_indices['mu_star'],
            self.sensitivity_indices['sigma'],
            s=100,
            alpha=0.7
        )
        
        for i, row in self.sensitivity_indices.iterrows():
            ax.annotate(
                row['parameter'],
                (row['mu_star'], row['sigma']),
                xytext=(5, 5),
                textcoords='offset points'
            )
        
        ax.set_xlabel('μ* (Mean absolute elementary effect)')
        ax.set_ylabel('σ (Standard deviation)')
        ax.set_title('Morris Sensitivity Analysis')
        ax.grid(True, alpha=0.3)
        
        plt.tight_layout()
        
        if output_path:
            plt.savefig(output_path, dpi=300, bbox_inches='tight')
            logger.info(f"Plot saved to {output_path}")
        
        return fig
