from datetime import datetime, timedelta
from math import radians, degrees, sin, cos, asin, atan2, sqrt, acos
from .sgp4_propagator import SGP4Propagator

class PassPredictor:
    def __init__(self, line1, line2):
        self.propagator = SGP4Propagator(line1, line2)
    
    def calculate_elevation(self, sat_lla, observer_lla):
        obs_lat = radians(observer_lla['latitude'])
        obs_lon = radians(observer_lla['longitude'])
        obs_alt = observer_lla['altitude']
        
        sat_lat = radians(sat_lla['latitude'])
        sat_lon = radians(sat_lla['longitude'])
        sat_alt = sat_lla['altitude']
        
        R = 6378.137
        
        obs_x = (R + obs_alt) * cos(obs_lat) * cos(obs_lon)
        obs_y = (R + obs_alt) * cos(obs_lat) * sin(obs_lon)
        obs_z = (R + obs_alt) * sin(obs_lat)
        
        sat_x = (R + sat_alt) * cos(sat_lat) * cos(sat_lon)
        sat_y = (R + sat_alt) * cos(sat_lat) * sin(sat_lon)
        sat_z = (R + sat_alt) * sin(sat_lat)
        
        dx = sat_x - obs_x
        dy = sat_y - obs_y
        dz = sat_z - obs_z
        
        range_vec = sqrt(dx*dx + dy*dy + dz*dz)
        
        obs_nx = -sin(obs_lat) * cos(obs_lon)
        obs_ny = -sin(obs_lat) * sin(obs_lon)
        obs_nz = cos(obs_lat)
        
        zenith = (dx * obs_nx + dy * obs_ny + dz * obs_nz) / range_vec
        elevation = degrees(asin(zenith))
        
        return elevation
    
    def calculate_azimuth(self, sat_lla, observer_lla):
        obs_lat = radians(observer_lla['latitude'])
        obs_lon = radians(observer_lla['longitude'])
        
        sat_lat = radians(sat_lla['latitude'])
        sat_lon = radians(sat_lla['longitude'])
        
        d_lon = sat_lon - obs_lon
        
        y = sin(d_lon) * cos(sat_lat)
        x = cos(obs_lat) * sin(sat_lat) - sin(obs_lat) * cos(sat_lat) * cos(d_lon)
        
        azimuth = degrees(atan2(y, x))
        if azimuth < 0:
            azimuth += 360
        
        return azimuth
    
    def calculate_range(self, sat_lla, observer_lla):
        obs_lat = radians(observer_lla['latitude'])
        obs_lon = radians(observer_lla['longitude'])
        obs_alt = observer_lla['altitude']
        
        sat_lat = radians(sat_lla['latitude'])
        sat_lon = radians(sat_lla['longitude'])
        sat_alt = sat_lla['altitude']
        
        R = 6378.137
        
        obs_x = (R + obs_alt) * cos(obs_lat) * cos(obs_lon)
        obs_y = (R + obs_alt) * cos(obs_lat) * sin(obs_lon)
        obs_z = (R + obs_alt) * sin(obs_lat)
        
        sat_x = (R + sat_alt) * cos(sat_lat) * cos(sat_lon)
        sat_y = (R + sat_alt) * cos(sat_lat) * sin(sat_lon)
        sat_z = (R + sat_alt) * sin(sat_lat)
        
        dx = sat_x - obs_x
        dy = sat_y - obs_y
        dz = sat_z - obs_z
        
        return sqrt(dx*dx + dy*dy + dz*dz)
    
    def predict_passes(self, observer_lla, start_time=None, duration_hours=24, min_elevation=10.0):
        if start_time is None:
            start_time = datetime.utcnow()
        
# #region debug-point H3:improved-prediction
import json, urllib.request as ur; _p='.dbg/tle-orbit-smoothing-bug.env'; _u,_s='http://127.0.0.1:7777/event','tle-orbit-smoothing-bug'; exec("try:\n with open(_p) as f: c=f.read(); _u=next((l.split('=',1)[1] for l in c.split('\\n') if l.startswith('DEBUG_SERVER_URL=')),_u); _s=next((l.split('=',1)[1] for l in c.split('\\n') if l.startswith('DEBUG_SESSION_ID=')),_s)\nexcept: pass"); ur.urlopen(ur.Request(_u, data=json.dumps({"sessionId":_s,"runId":"post-fix","hypothesisId":"H3","location":"predictor.py:86","msg":"[DEBUG] predict_passes with error estimation","data":{"duration_hours":duration_hours,"has_error_model":True}}).encode(), headers={"Content-Type":"application/json"})).read()
# #endregion

        error_estimates = {}
        for i in range(0, duration_hours, 6):
            horizon = max(i, 1)
            error_estimates[horizon] = self.propagator.estimate_prediction_error(horizon)
        
        passes = []
        current_pass = None
        time_step = timedelta(seconds=10)
        current_time = start_time
        end_time = start_time + timedelta(hours=duration_hours)
        
        while current_time < end_time:
            pos = self.propagator.get_position_at_time(current_time)
            if pos is None:
                current_time += time_step
                continue
            
            sat_lla = self.propagator.eci_to_lla(pos['x'], pos['y'], pos['z'], current_time)
            elevation = self.calculate_elevation(sat_lla, observer_lla)
            
            if elevation > min_elevation:
                if current_pass is None:
                    hours_ahead = max(1, int((current_time - start_time).total_seconds() / 3600) + 1)
                    error_key = min(range(0, duration_hours, 6), key=lambda x: abs(x - hours_ahead))
                    error_key = max(error_key, 1)
                    
                    current_pass = {
                        'start_time': current_time,
                        'max_elevation': elevation,
                        'max_elevation_time': current_time,
                        'points': [],
                        'prediction_error': error_estimates.get(error_key, error_estimates[max(error_estimates.keys())])
                    }
                
                azimuth = self.calculate_azimuth(sat_lla, observer_lla)
                rng = self.calculate_range(sat_lla, observer_lla)
                
                current_pass['points'].append({
                    'time': current_time.isoformat(),
                    'elevation': elevation,
                    'azimuth': azimuth,
                    'range': rng,
                    'latitude': sat_lla['latitude'],
                    'longitude': sat_lla['longitude']
                })
                
                if elevation > current_pass['max_elevation']:
                    current_pass['max_elevation'] = elevation
                    current_pass['max_elevation_time'] = current_time
            else:
                if current_pass is not None:
                    current_pass['end_time'] = current_time
                    current_pass['duration'] = (current_pass['end_time'] - current_pass['start_time']).total_seconds()
                    
                    if current_pass['duration'] > 60:
                        current_pass['start_azimuth'] = current_pass['points'][0]['azimuth']
                        current_pass['end_azimuth'] = current_pass['points'][-1]['azimuth']
                        passes.append(current_pass)
                    
                    current_pass = None
            
            current_time += time_step
        
        if current_pass is not None:
            current_pass['end_time'] = current_time
            current_pass['duration'] = (current_pass['end_time'] - current_pass['start_time']).total_seconds()
            if current_pass['duration'] > 60:
                current_pass['start_azimuth'] = current_pass['points'][0]['azimuth']
                current_pass['end_azimuth'] = current_pass['points'][-1]['azimuth']
                passes.append(current_pass)
        
        for p in passes:
            p['start_time'] = p['start_time'].isoformat()
            p['end_time'] = p['end_time'].isoformat()
            p['max_elevation_time'] = p['max_elevation_time'].isoformat()
            if 'prediction_error' in p:
                hours_ahead = max(1, int((datetime.fromisoformat(p['start_time']) - start_time).total_seconds() / 3600) + 1)
                p['prediction_error'] = self.propagator.estimate_prediction_error(hours_ahead)
        
        return passes
