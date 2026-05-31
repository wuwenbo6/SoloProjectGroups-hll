import os
import logging
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, List, Optional, Tuple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SWATRunner:
    def __init__(self, project_path: str):
        self.project_path = project_path
        self.swat_model = None
        self._initialize_model()
    
    def _initialize_model(self):
        try:
            import pyswat
            self.swat_model = pyswat.SWAT(self.project_path)
            logger.info(f"SWAT model initialized from {self.project_path}")
        except ImportError:
            logger.warning("PySWAT not available, using mock mode")
            self.swat_model = None
        except Exception as e:
            logger.error(f"Failed to initialize SWAT model: {e}")
            self.swat_model = None
    
    def is_available(self) -> bool:
        return self.swat_model is not None
    
    def set_parameter(self, parameter_name: str, value: float, 
                     subbasin: Optional[int] = None, 
                     change_type: str = 'absolute'):
        if self.swat_model:
            if subbasin:
                self.swat_model.set_parameter(parameter_name, value, subbasin, change_type)
            else:
                self.swat_model.set_parameter(parameter_name, value, change_type=change_type)
        else:
            logger.info(f"Mock: Set parameter {parameter_name} = {value} (type: {change_type})")
    
    def set_parameters(self, parameters: List[Dict]):
        for param in parameters:
            self.set_parameter(
                param.get('name'),
                param.get('value'),
                param.get('subbasin'),
                param.get('change_type', 'absolute')
            )
    
    def run(self, start_date: Optional[str] = None, 
            end_date: Optional[str] = None,
            output_interval: str = 'daily') -> pd.DataFrame:
        if self.swat_model:
            try:
                results = self.swat_model.run(
                    start_date=start_date,
                    end_date=end_date,
                    output_interval=output_interval
                )
                return results
            except Exception as e:
                logger.error(f"SWAT run failed: {e}")
                raise
        else:
            return self._generate_mock_results(start_date, end_date, output_interval)
    
    def _generate_mock_results(self, start_date: Optional[str], 
                               end_date: Optional[str],
                               output_interval: str) -> pd.DataFrame:
        logger.info(f"Generating mock SWAT results from {start_date} to {end_date}")
        
        if start_date:
            start = datetime.strptime(start_date, '%Y-%m-%d')
        else:
            start = datetime(2010, 1, 1)
        
        if end_date:
            end = datetime.strptime(end_date, '%Y-%m-%d')
        else:
            end = datetime(2010, 12, 31)
        
        date_range = pd.date_range(start=start, end=end, freq='D')
        n_days = len(date_range)
        
        logger.info(f"Generating {n_days} days of mock data")
        
        np.random.seed(42)
        
        CHUNK_SIZE = 3650
        if n_days > CHUNK_SIZE * 2:
            return self._generate_large_results(date_range, n_days, CHUNK_SIZE)
        
        day_of_year = np.arange(n_days) % 365
        seasonal_cycle = np.sin(2 * np.pi * day_of_year / 365)
        
        base_flow = 10 + 5 * seasonal_cycle
        flow_noise = np.random.normal(0, 2, n_days)
        streamflow = np.maximum(0.5, base_flow + flow_noise)
        
        sediment = 0.5 * streamflow * (1 + np.random.normal(0, 0.3, n_days))
        sediment = np.maximum(0, sediment)
        
        nitrate = 2 * streamflow * (1 + np.random.normal(0, 0.25, n_days))
        nitrate = np.maximum(0, nitrate)
        
        phosphorus = 0.3 * streamflow * (1 + np.random.normal(0, 0.35, n_days))
        phosphorus = np.maximum(0, phosphorus)
        
        total_nitrogen = nitrate * 1.5
        total_phosphorus = phosphorus * 1.3
        
        results = pd.DataFrame({
            'date': date_range,
            'streamflow': streamflow,
            'sediment_yield': sediment,
            'nitrate_load': nitrate,
            'phosphorus_load': phosphorus,
            'total_nitrogen': total_nitrogen,
            'total_phosphorus': total_phosphorus,
            'subbasin': 1
        })
        
        if output_interval == 'monthly':
            results = results.set_index('date').resample('ME').mean().reset_index()
        elif output_interval == 'yearly':
            results = results.set_index('date').resample('YE').mean().reset_index()
        
        logger.info(f"Generated {len(results)} rows of results")
        return results
    
    def _generate_large_results(self, date_range: pd.DatetimeIndex, 
                                  n_days: int, chunk_size: int) -> pd.DataFrame:
        logger.info(f"Generating large dataset in chunks ({n_days} days total)")
        
        all_results = []
        n_chunks = (n_days + chunk_size - 1) // chunk_size
        
        for chunk_idx in range(n_chunks):
            start_idx = chunk_idx * chunk_size
            end_idx = min((chunk_idx + 1) * chunk_size, n_days)
            chunk_dates = date_range[start_idx:end_idx]
            chunk_len = len(chunk_dates)
            
            day_of_year = chunk_dates.dayofyear.values
            seasonal_cycle = np.sin(2 * np.pi * day_of_year / 365)
            
            np.random.seed(42 + chunk_idx)
            base_flow = 10 + 5 * seasonal_cycle
            flow_noise = np.random.normal(0, 2, chunk_len)
            streamflow = np.maximum(0.5, base_flow + flow_noise)
            
            sediment = 0.5 * streamflow * (1 + np.random.normal(0, 0.3, chunk_len))
            nitrate = 2 * streamflow * (1 + np.random.normal(0, 0.25, chunk_len))
            phosphorus = 0.3 * streamflow * (1 + np.random.normal(0, 0.35, chunk_len))
            
            chunk_df = pd.DataFrame({
                'date': chunk_dates,
                'streamflow': np.maximum(0, streamflow),
                'sediment_yield': np.maximum(0, sediment),
                'nitrate_load': np.maximum(0, nitrate),
                'phosphorus_load': np.maximum(0, phosphorus),
                'total_nitrogen': np.maximum(0, nitrate * 1.5),
                'total_phosphorus': np.maximum(0, phosphorus * 1.3),
                'subbasin': 1
            })
            
            all_results.append(chunk_df)
            logger.info(f"Generated chunk {chunk_idx + 1}/{n_chunks} ({chunk_len} days)")
        
        results = pd.concat(all_results, ignore_index=True)
        logger.info(f"Completed generating {len(results)} rows")
        return results
    
    def get_subbasin_geometries(self) -> List[Dict]:
        if self.swat_model:
            try:
                return self.swat_model.get_subbasin_geometries()
            except Exception as e:
                logger.error(f"Failed to get subbasin geometries: {e}")
        
        return self._generate_mock_geometries()
    
    def _generate_mock_geometries(self) -> List[Dict]:
        return [
            {
                'subbasin_number': 1,
                'name': '上游流域',
                'area': 125.5,
                'centroid_lat': 34.5,
                'centroid_lon': 108.2,
                'geometry': '''{
                    "type": "Polygon",
                    "coordinates": [[[108.0, 34.3], [108.4, 34.3], [108.4, 34.7], [108.0, 34.7], [108.0, 34.3]]]
                }'''
            },
            {
                'subbasin_number': 2,
                'name': '中游流域',
                'area': 98.3,
                'centroid_lat': 34.4,
                'centroid_lon': 108.6,
                'geometry': '''{
                    "type": "Polygon",
                    "coordinates": [[[108.4, 34.2], [108.8, 34.2], [108.8, 34.6], [108.4, 34.6], [108.4, 34.2]]]
                }'''
            },
            {
                'subbasin_number': 3,
                'name': '下游流域',
                'area': 156.2,
                'centroid_lat': 34.3,
                'centroid_lon': 109.0,
                'geometry': '''{
                    "type": "Polygon",
                    "coordinates": [[[108.8, 34.1], [109.3, 34.1], [109.3, 34.5], [108.8, 34.5], [108.8, 34.1]]]
                }'''
            }
        ]
    
    def get_available_parameters(self) -> List[Dict]:
        default_params = [
            {
                'name': 'CN2',
                'description': 'SCS曲线数',
                'default_value': 75,
                'min_value': 35,
                'max_value': 95,
                'units': '-',
                'change_types': ['absolute', 'relative']
            },
            {
                'name': 'SOL_AWC',
                'description': '土壤可利用水量',
                'default_value': 0.2,
                'min_value': 0.05,
                'max_value': 0.5,
                'units': 'mm/mm',
                'change_types': ['absolute', 'relative']
            },
            {
                'name': 'ESCO',
                'description': '土壤蒸发补偿系数',
                'default_value': 0.95,
                'min_value': 0.5,
                'max_value': 1.0,
                'units': '-',
                'change_types': ['absolute']
            },
            {
                'name': 'GWQMN',
                'description': '地下水回流阈值深度',
                'default_value': 1000,
                'min_value': 0,
                'max_value': 5000,
                'units': 'mm',
                'change_types': ['absolute', 'relative']
            },
            {
                'name': 'ALPHA_BF',
                'description': '基流退水常数',
                'default_value': 0.048,
                'min_value': 0.001,
                'max_value': 1.0,
                'units': 'days',
                'change_types': ['absolute']
            },
            {
                'name': 'CH_N2',
                'description': '主河道曼宁n值',
                'default_value': 0.014,
                'min_value': 0.01,
                'max_value': 0.3,
                'units': '-',
                'change_types': ['absolute', 'relative']
            },
            {
                'name': 'CH_K2',
                'description': '主河道有效水力传导率',
                'default_value': 150,
                'min_value': 0,
                'max_value': 300,
                'units': 'mm/hr',
                'change_types': ['absolute', 'relative']
            },
            {
                'name': 'SURLAG',
                'description': '地表径流滞后系数',
                'default_value': 4,
                'min_value': 0.05,
                'max_value': 24,
                'units': 'days',
                'change_types': ['absolute']
            }
        ]
        
        if self.swat_model:
            try:
                params = self.swat_model.get_parameters()
                return params
            except:
                pass
        
        return default_params
