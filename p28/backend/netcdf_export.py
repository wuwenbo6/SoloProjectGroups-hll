import numpy as np
import netCDF4 as nc
from datetime import datetime, timedelta
import os
from typing import List, Dict

def create_cygnss_netcdf(output_path: str, data: List[Dict], grid_data: Dict = None, metadata: Dict = None):
    if os.path.exists(output_path):
        os.remove(output_path)
    
    ds = nc.Dataset(output_path, 'w', format='NETCDF4')
    
    default_metadata = {
        'title': 'CYGNSS Soil Moisture Retrieval Product',
        'institution': 'CYGNSS Processing Center',
        'source': 'CYGNSS constellation DDM measurements',
        'history': f'Created on {datetime.now().isoformat()}',
        'references': 'CYGNSS Soil Moisture Algorithm',
        'version': '1.0'
    }
    
    if metadata:
        default_metadata.update(metadata)
    
    for key, value in default_metadata.items():
        setattr(ds, key, value)
    
    n_obs = len(data)
    
    ds.createDimension('observation', n_obs)
    
    if grid_data:
        lats = np.array(grid_data.get('grid_lats', []))
        lons = np.array(grid_data.get('grid_lons', []))
        ds.createDimension('lat', len(lats))
        ds.createDimension('lon', len(lons))
        
        lat_var = ds.createVariable('lat', 'f4', ('lat',))
        lat_var.units = 'degrees_north'
        lat_var.long_name = 'Latitude'
        lat_var.standard_name = 'latitude'
        lat_var[:] = lats
        
        lon_var = ds.createVariable('lon', 'f4', ('lon',))
        lon_var.units = 'degrees_east'
        lon_var.long_name = 'Longitude'
        lon_var.standard_name = 'longitude'
        lon_var[:] = lons
        
        sm_grid = ds.createVariable('soil_moisture_grid', 'f4', ('lat', 'lon'), fill_value=np.nan)
        sm_grid.units = 'm3 m-3'
        sm_grid.long_name = 'Fused Soil Moisture'
        sm_grid.grid_mapping = 'crs'
        sm_grid[:] = np.array(grid_data.get('soil_moisture_grid', np.nan))
    
    time_var = ds.createVariable('time', 'f8', ('observation',))
    time_var.units = 'seconds since 1970-01-01 00:00:00 UTC'
    time_var.long_name = 'Time of observation'
    time_var.standard_name = 'time'
    
    lat_var = ds.createVariable('latitude', 'f4', ('observation',))
    lat_var.units = 'degrees_north'
    lat_var.long_name = 'Latitude'
    lat_var.standard_name = 'latitude'
    
    lon_var = ds.createVariable('longitude', 'f4', ('observation',))
    lon_var.units = 'degrees_east'
    lon_var.long_name = 'Longitude'
    lon_var.standard_name = 'longitude'
    
    sm_var = ds.createVariable('soil_moisture', 'f4', ('observation',), fill_value=np.nan)
    sm_var.units = 'm3 m-3'
    sm_var.long_name = 'Soil Moisture'
    sm_var.valid_range = [0.0, 0.6]
    
    sm_corr_var = ds.createVariable('soil_moisture_corrected', 'f4', ('observation',), fill_value=np.nan)
    sm_corr_var.units = 'm3 m-3'
    sm_corr_var.long_name = 'Vegetation Corrected Soil Moisture'
    sm_corr_var.valid_range = [0.0, 0.6]
    
    surface_var = ds.createVariable('surface_type', 'S10', ('observation',))
    surface_var.long_name = 'Surface Type Classification'
    
    refl_var = ds.createVariable('reflectivity', 'f4', ('observation',), fill_value=np.nan)
    refl_var.units = '1'
    refl_var.long_name = 'Surface Reflectivity'
    
    snr_var = ds.createVariable('snr', 'f4', ('observation',), fill_value=np.nan)
    snr_var.units = 'dB'
    snr_var.long_name = 'Signal to Noise Ratio'
    
    sharpness_var = ds.createVariable('ddm_sharpness', 'f4', ('observation',), fill_value=np.nan)
    sharpness_var.units = '1'
    sharpness_var.long_name = 'DDM Peak Sharpness'
    
    ndvi_var = ds.createVariable('estimated_ndvi', 'f4', ('observation',), fill_value=np.nan)
    ndvi_var.units = '1'
    ndvi_var.long_name = 'Estimated NDVI'
    ndvi_var.valid_range = [-1.0, 1.0]
    
    vwc_var = ds.createVariable('vegetation_water_content', 'f4', ('observation',), fill_value=np.nan)
    vwc_var.units = 'kg m-2'
    vwc_var.long_name = 'Vegetation Water Content'
    
    ddm_peak_var = ds.createVariable('ddm_peak', 'f4', ('observation',), fill_value=np.nan)
    ddm_peak_var.units = '1'
    ddm_peak_var.long_name = 'DDM Peak Value'
    
    sat_var = ds.createVariable('satellite', 'S15', ('observation',))
    sat_var.long_name = 'Satellite Identifier'
    
    for i, point in enumerate(data):
        ts = point.get('timestamp')
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts)
        elif isinstance(ts, datetime):
            pass
        else:
            ts = datetime.now()
        
        time_var[i] = (ts - datetime(1970, 1, 1)).total_seconds()
        lat_var[i] = point.get('latitude', np.nan)
        lon_var[i] = point.get('longitude', np.nan)
        sm_var[i] = point.get('soil_moisture', np.nan)
        sm_corr_var[i] = point.get('soil_moisture_corrected', point.get('soil_moisture', np.nan))
        surface_var[i] = np.string_(point.get('surface_type', 'unknown'))
        refl_var[i] = point.get('reflectivity', np.nan)
        snr_var[i] = point.get('snr', np.nan)
        sharpness_var[i] = point.get('sharpness', np.nan)
        ndvi_var[i] = point.get('ndvi', point.get('estimated_ndvi', np.nan))
        vwc_var[i] = point.get('vwc', point.get('estimated_vwc', np.nan))
        ddm_peak_var[i] = point.get('ddm_peak', np.nan)
        sat_var[i] = np.string_(point.get('satellite', 'UNKNOWN'))
    
    ds.close()
    
    return output_path

def export_to_netcdf(data: List[Dict], output_dir: str = None, filename: str = None, grid_data: Dict = None) -> str:
    if output_dir is None:
        output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'exports')
    
    os.makedirs(output_dir, exist_ok=True)
    
    if filename is None:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'cygnss_soil_moisture_{timestamp}.nc'
    
    output_path = os.path.join(output_dir, filename)
    
    return create_cygnss_netcdf(output_path, data, grid_data)

def read_netcdf(file_path: str) -> Dict:
    ds = nc.Dataset(file_path, 'r')
    
    result = {
        'metadata': {},
        'observations': []
    }
    
    for attr in ds.ncattrs():
        result['metadata'][attr] = getattr(ds, attr)
    
    if 'lat' in ds.dimensions and 'lon' in ds.dimensions:
        result['grid'] = {
            'lats': ds.variables['lat'][:].tolist(),
            'lons': ds.variables['lon'][:].tolist(),
            'soil_moisture': ds.variables['soil_moisture_grid'][:].tolist()
        }
    
    n_obs = ds.dimensions['observation'].size
    for i in range(n_obs):
        st_val = ds.variables['surface_type'][i]
        sat_val = ds.variables['satellite'][i]
        if hasattr(st_val, 'tobytes'):
            st_val = st_val.tobytes().decode('utf-8').strip()
        if hasattr(sat_val, 'tobytes'):
            sat_val = sat_val.tobytes().decode('utf-8').strip()
        
        point = {
            'timestamp': datetime(1970, 1, 1) + timedelta(seconds=float(ds.variables['time'][i])),
            'latitude': float(ds.variables['latitude'][i]),
            'longitude': float(ds.variables['longitude'][i]),
            'soil_moisture': float(ds.variables['soil_moisture'][i]),
            'soil_moisture_corrected': float(ds.variables['soil_moisture_corrected'][i]),
            'surface_type': st_val,
            'reflectivity': float(ds.variables['reflectivity'][i]),
            'snr': float(ds.variables['snr'][i]),
            'satellite': sat_val
        }
        result['observations'].append(point)
    
    ds.close()
    
    return result
