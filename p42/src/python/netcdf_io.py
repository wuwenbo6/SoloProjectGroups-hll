import numpy as np
import netCDF4 as nc

_cpp_available = False

try:
    from . import shallow_water as _sw
    _cpp_available = True
except (ImportError, ValueError):
    try:
        import shallow_water as _sw
        _cpp_available = True
    except ImportError:
        _sw = None
        _cpp_available = False


class NetCDFIO:
    @staticmethod
    def write_field(filename, data, var_name, x=None, y=None):
        if _cpp_available:
            ny, nx = data.shape
            if x is None:
                x = np.arange(nx, dtype=np.float64)
            if y is None:
                y = np.arange(ny, dtype=np.float64)
            
            data_vec = data.flatten().tolist()
            x_vec = x.tolist()
            y_vec = y.tolist()
            
            return _sw.NetCDFIO.write_field(filename, data_vec, nx, ny, var_name, x_vec, y_vec)
        else:
            return NetCDFIO.write_field_python(filename, data, var_name, x, y)
    
    @staticmethod
    def write_simulation(filename, h, u, v, dx, dy, step, time):
        if _cpp_available:
            ny, nx = h.shape
            h_vec = h.flatten().tolist()
            u_vec = u.flatten().tolist()
            v_vec = v.flatten().tolist()
            
            return _sw.NetCDFIO.write_simulation(filename, h_vec, u_vec, v_vec, nx, ny, dx, dy, step, time)
        else:
            return NetCDFIO.write_simulation_python(filename, h, u, v, dx, dy, step, time)
    
    @staticmethod
    def read_field(filename, var_name):
        if _cpp_available:
            return _sw.NetCDFIO.read_field_np(filename, var_name)
        else:
            return NetCDFIO.read_field_python(filename, var_name)
    
    @staticmethod
    def read_simulation(filename):
        if _cpp_available:
            h = _sw.NetCDFIO.read_field_np(filename, "h")
            u = _sw.NetCDFIO.read_field_np(filename, "u")
            v = _sw.NetCDFIO.read_field_np(filename, "v")
            return h, u, v
        else:
            return NetCDFIO.read_simulation_python(filename)
    
    @staticmethod
    def write_field_python(filename, data, var_name, x=None, y=None):
        ny, nx = data.shape
        if x is None:
            x = np.arange(nx, dtype=np.float64)
        if y is None:
            y = np.arange(ny, dtype=np.float64)
        
        with nc.Dataset(filename, 'w') as ds:
            ds.createDimension('x', nx)
            ds.createDimension('y', ny)
            
            x_var = ds.createVariable('x', 'f8', ('x',))
            y_var = ds.createVariable('y', 'f8', ('y',))
            data_var = ds.createVariable(var_name, 'f8', ('y', 'x'))
            
            x_var[:] = x
            y_var[:] = y
            data_var[:] = data
        
        return True
    
    @staticmethod
    def read_field_python(filename, var_name):
        with nc.Dataset(filename, 'r') as ds:
            data = ds.variables[var_name][:]
        return data
    
    @staticmethod
    def write_simulation_python(filename, h, u, v, dx, dy, step, time):
        ny, nx = h.shape
        x = np.arange(nx, dtype=np.float64) * dx
        y = np.arange(ny, dtype=np.float64) * dy
        
        with nc.Dataset(filename, 'w') as ds:
            ds.createDimension('x', nx)
            ds.createDimension('y', ny)
            
            x_var = ds.createVariable('x', 'f8', ('x',))
            y_var = ds.createVariable('y', 'f8', ('y',))
            h_var = ds.createVariable('h', 'f8', ('y', 'x'))
            u_var = ds.createVariable('u', 'f8', ('y', 'x'))
            v_var = ds.createVariable('v', 'f8', ('y', 'x'))
            
            ds.step = step
            ds.time = time
            
            x_var[:] = x
            y_var[:] = y
            h_var[:] = h
            u_var[:] = u
            v_var[:] = v
        
        return True
    
    @staticmethod
    def read_simulation_python(filename):
        with nc.Dataset(filename, 'r') as ds:
            h = ds.variables['h'][:]
            u = ds.variables['u'][:]
            v = ds.variables['v'][:]
        return h, u, v
