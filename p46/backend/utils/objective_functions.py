import numpy as np
from typing import Callable

class ObjectiveFunctions:
    @staticmethod
    def nse(simulated: np.ndarray, observed: np.ndarray) -> float:
        denominator = np.sum((observed - np.mean(observed))**2)
        if denominator == 0:
            return -np.inf
        return 1 - (np.sum((observed - simulated)**2) / denominator)
    
    @staticmethod
    def kge(simulated: np.ndarray, observed: np.ndarray) -> float:
        if np.std(observed) == 0:
            return -np.inf
        
        r = np.corrcoef(simulated, observed)[0, 1]
        alpha = np.std(simulated) / np.std(observed)
        beta = np.mean(simulated) / np.mean(observed)
        
        return 1 - np.sqrt((r - 1)**2 + (alpha - 1)**2 + (beta - 1)**2)
    
    @staticmethod
    def rmse(simulated: np.ndarray, observed: np.ndarray) -> float:
        return np.sqrt(np.mean((observed - simulated)**2))
    
    @staticmethod
    def mae(simulated: np.ndarray, observed: np.ndarray) -> float:
        return np.mean(np.abs(observed - simulated))
    
    @staticmethod
    def pbias(simulated: np.ndarray, observed: np.ndarray) -> float:
        denominator = np.sum(observed)
        if denominator == 0:
            return np.inf
        return 100 * (np.sum(simulated - observed) / denominator)
    
    @staticmethod
    def r2(simulated: np.ndarray, observed: np.ndarray) -> float:
        return np.corrcoef(simulated, observed)[0, 1]**2
    
    @staticmethod
    def log_nse(simulated: np.ndarray, observed: np.ndarray) -> float:
        sim_log = np.log(np.maximum(simulated, 0.001))
        obs_log = np.log(np.maximum(observed, 0.001))
        
        denominator = np.sum((obs_log - np.mean(obs_log))**2)
        if denominator == 0:
            return -np.inf
        return 1 - (np.sum((obs_log - sim_log)**2) / denominator)
    
    @staticmethod
    def get_function(name: str) -> Callable:
        functions = {
            'NSE': ObjectiveFunctions.nse,
            'KGE': ObjectiveFunctions.kge,
            'RMSE': ObjectiveFunctions.rmse,
            'MAE': ObjectiveFunctions.mae,
            'PBIAS': ObjectiveFunctions.pbias,
            'R2': ObjectiveFunctions.r2,
            'LOG_NSE': ObjectiveFunctions.log_nse
        }
        
        func = functions.get(name.upper())
        if func is None:
            raise ValueError(f"Unknown objective function: {name}")
        return func
    
    @staticmethod
    def is_maximize(name: str) -> bool:
        maximize_metrics = {'NSE', 'KGE', 'R2', 'LOG_NSE'}
        minimize_metrics = {'RMSE', 'MAE', 'PBIAS'}
        
        if name.upper() in maximize_metrics:
            return True
        elif name.upper() in minimize_metrics:
            return False
        else:
            raise ValueError(f"Unknown objective function: {name}")
