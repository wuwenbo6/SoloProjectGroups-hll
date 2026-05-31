import pandas as pd
import numpy as np
import json
from typing import Dict, List, Optional, Tuple
from datetime import datetime

class DataProcessor:
    @staticmethod
    def parse_observation_data(file_path: str) -> pd.DataFrame:
        if file_path.endswith('.csv'):
            df = pd.read_csv(file_path)
        elif file_path.endswith('.txt'):
            df = pd.read_csv(file_path, sep=r'\s+')
        elif file_path.endswith('.xlsx'):
            df = pd.read_excel(file_path)
        else:
            raise ValueError(f"Unsupported file format: {file_path}")
        
        date_cols = [col for col in df.columns if 'date' in col.lower() or 'time' in col.lower()]
        if date_cols:
            df['date'] = pd.to_datetime(df[date_cols[0]])
        
        return df
    
    @staticmethod
    def align_simulated_observed(simulated: pd.DataFrame, 
                                  observed: pd.DataFrame,
                                  sim_date_col: str = 'date',
                                  obs_date_col: str = 'date',
                                  sim_value_col: str = 'streamflow',
                                  obs_value_col: str = 'streamflow') -> Tuple[pd.Series, pd.Series]:
        sim_df = simulated.set_index(sim_date_col)
        obs_df = observed.set_index(obs_date_col)
        
        merged = pd.merge(sim_df[[sim_value_col]], obs_df[[obs_value_col]], 
                         left_index=True, right_index=True, 
                         suffixes=('_sim', '_obs'))
        
        merged = merged.dropna()
        
        return merged[f'{sim_value_col}_sim'], merged[f'{obs_value_col}_obs']
    
    @staticmethod
    def compute_statistics(simulated: np.ndarray, observed: np.ndarray) -> Dict:
        if len(simulated) == 0 or len(observed) == 0:
            return {}
        
        residuals = observed - simulated
        
        nse = 1 - (np.sum(residuals**2) / np.sum((observed - np.mean(observed))**2))
        
        r2 = np.corrcoef(simulated, observed)[0, 1]**2
        
        rmse = np.sqrt(np.mean(residuals**2))
        
        mae = np.mean(np.abs(residuals))
        
        pbias = 100 * np.sum(residuals) / np.sum(observed)
        
        mean_obs = np.mean(observed)
        mean_sim = np.mean(simulated)
        kge = 1 - np.sqrt(
            (np.corrcoef(simulated, observed)[0, 1] - 1)**2 +
            (np.std(simulated) / np.std(observed) - 1)**2 +
            (mean_sim / mean_obs - 1)**2
        ) if np.std(observed) > 0 else -999
        
        return {
            'NSE': nse,
            'R2': r2,
            'RMSE': rmse,
            'MAE': mae,
            'PBIAS': pbias,
            'KGE': kge
        }
    
    @staticmethod
    def aggregate_results(results: pd.DataFrame, 
                          agg_interval: str = 'daily') -> pd.DataFrame:
        if agg_interval == 'daily':
            return results
        elif agg_interval == 'monthly':
            return results.set_index('date').resample('ME').mean().reset_index()
        elif agg_interval == 'yearly':
            return results.set_index('date').resample('YE').mean().reset_index()
        else:
            raise ValueError(f"Unsupported aggregation interval: {agg_interval}")
    
    @staticmethod
    def results_to_json(results: pd.DataFrame) -> str:
        results['date'] = results['date'].dt.strftime('%Y-%m-%d')
        return results.to_json(orient='records')
    
    @staticmethod
    def calculate_water_balance(results: pd.DataFrame) -> Dict:
        return {
            'total_streamflow': float(results['streamflow'].sum()),
            'mean_streamflow': float(results['streamflow'].mean()),
            'max_streamflow': float(results['streamflow'].max()),
            'min_streamflow': float(results['streamflow'].min()),
            'total_sediment': float(results['sediment_yield'].sum()),
            'total_nitrate': float(results['nitrate_load'].sum()),
            'total_phosphorus': float(results['phosphorus_load'].sum())
        }
    
    @staticmethod
    def generate_parameter_bounds(param_name: str, default_value: float, 
                                  min_factor: float = 0.5, max_factor: float = 1.5) -> Tuple[float, float]:
        min_val = default_value * min_factor
        max_val = default_value * max_factor
        
        if param_name == 'CN2':
            min_val = max(35, min_val)
            max_val = min(95, max_val)
        elif param_name == 'SOL_AWC':
            min_val = max(0.01, min_val)
            max_val = min(0.8, max_val)
        
        return min_val, max_val
