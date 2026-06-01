from sgp4.api import Satrec, jday
from sgp4 import exporter
import numpy as np
from datetime import datetime, timedelta
from math import sin, cos, sqrt, atan2, radians, pi, degrees

class SGP4Propagator:
    def __init__(self, line1, line2):
        self.satellite = Satrec.twoline2rv(line1, line2)
    
    def get_position_at_time(self, dt):
        jd, fr = jday(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second + dt.microsecond/1e6)
        e, r, v = self.satellite.sgp4(jd, fr)
        if e != 0:
            return None
        return {
            'x': r[0],
            'y': r[1],
            'z': r[2],
            'vx': v[0],
            'vy': v[1],
            'vz': v[2]
        }
    
    def get_ground_track(self, start_time, duration_minutes=180, interval_seconds=30):
        points = []
        current = start_time
        end = start_time + timedelta(minutes=duration_minutes)
        
        while current <= end:
            pos = self.get_position_at_time(current)
            if pos:
                lla = self.eci_to_lla(pos['x'], pos['y'], pos['z'], current)
                points.append({
                    'time': current.isoformat(),
                    'latitude': lla['latitude'],
                    'longitude': lla['longitude'],
                    'altitude': lla['altitude'],
                    'x': pos['x'],
                    'y': pos['y'],
                    'z': pos['z']
                })
            current += timedelta(seconds=interval_seconds)
        
        return points
    
    def get_orbit_path(self, num_points=360):
        points = []
        now = datetime.utcnow()

# #region debug-point H3:improved-drag
import json, urllib.request as ur; _p='.dbg/tle-orbit-smoothing-bug.env'; _u,_s='http://127.0.0.1:7777/event','tle-orbit-smoothing-bug'; exec("try:\n with open(_p) as f: c=f.read(); _u=next((l.split('=',1)[1] for l in c.split('\\n') if l.startswith('DEBUG_SERVER_URL=')),_u); _s=next((l.split('=',1)[1] for l in c.split('\\n') if l.startswith('DEBUG_SESSION_ID=')),_s)\nexcept: pass"); ur.urlopen(ur.Request(_u, data=json.dumps({"sessionId":_s,"runId":"post-fix","hypothesisId":"H3","location":"sgp4_propagator.py:47","msg":"[DEBUG] get_orbit_path with improved error model","data":{"bstar":float(self.satellite.bstar),"period":float(self.satellite.period),"has_error_model":True}}).encode(), headers={"Content-Type":"application/json"})).read()
# #endregion

        for i in range(num_points):
            dt = now + timedelta(seconds=i * self.satellite.period * 60 / num_points)
            pos = self.get_position_at_time(dt)
            if pos:
                lla = self.eci_to_lla(pos['x'], pos['y'], pos['z'], dt)
                points.append({
                    'longitude': lla['longitude'],
                    'latitude': lla['latitude'],
                    'altitude': lla['altitude']
                })

        return points
    
    def estimate_prediction_error(self, predict_hours, altitude_km=None):
        if altitude_km is None:
            now = datetime.utcnow()
            pos = self.get_position_at_time(now)
            if pos:
                lla = self.eci_to_lla(pos['x'], pos['y'], pos['z'], now)
                altitude_km = lla['altitude']
            else:
                altitude_km = 400

        bstar = float(self.satellite.bstar)
        
        if altitude_km < 200:
            base_error_km_per_hour = 2.5
            decay_factor = 1.8
        elif altitude_km < 500:
            base_error_km_per_hour = 0.8
            decay_factor = 1.4
        elif altitude_km < 1000:
            base_error_km_per_hour = 0.3
            decay_factor = 1.2
        elif altitude_km < 2000:
            base_error_km_per_hour = 0.1
            decay_factor = 1.1
        else:
            base_error_km_per_hour = 0.03
            decay_factor = 1.05

        bstar_factor = 1.0
        if bstar > 0:
            bstar_factor = 1.0 + bstar * 1000
        elif bstar < 0:
            bstar_factor = 0.8

        total_error_km = base_error_km_per_hour * bstar_factor * (predict_hours ** decay_factor)
        along_track_error_km = total_error_km * 0.7
        cross_track_error_km = total_error_km * 0.2
        radial_error_km = total_error_km * 0.1

        if predict_hours <= 1:
            confidence = 0.95
        elif predict_hours <= 4:
            confidence = 0.85
        elif predict_hours <= 12:
            confidence = 0.70
        elif predict_hours <= 24:
            confidence = 0.55
        elif predict_hours <= 48:
            confidence = 0.35
        else:
            confidence = 0.20

        if altitude_km < 300 and bstar > 0.0001:
            confidence *= 0.6

        return {
            'total_error_km': round(total_error_km, 2),
            'along_track_error_km': round(along_track_error_km, 2),
            'cross_track_error_km': round(cross_track_error_km, 2),
            'radial_error_km': round(radial_error_km, 2),
            'confidence': round(confidence, 2),
            'altitude_km': round(altitude_km, 1),
            'bstar': bstar,
            'predict_hours': predict_hours
        }
    
    def eci_to_lla(self, x, y, z, dt):
        jd, fr = jday(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second)
        t = (jd - 2451545.0 + fr) / 36525.0
        
        theta = 280.46061837 + 360.98564736629 * (jd - 2451545.0 + fr) + 0.0003032 * t * t
        theta = theta % 360.0
        theta_rad = radians(theta)
        
        x_rot = x * cos(theta_rad) + y * sin(theta_rad)
        y_rot = -x * sin(theta_rad) + y * cos(theta_rad)
        z_rot = z
        
        a = 6378.137
        e2 = 0.00669437999014
        
        r = sqrt(x_rot**2 + y_rot**2)
        longitude = degrees(atan2(y_rot, x_rot))
        
        latitude = degrees(atan2(z_rot, r))
        h = 0
        
        for _ in range(5):
            sin_lat = sin(radians(latitude))
            N = a / sqrt(1 - e2 * sin_lat**2)
            h = r / cos(radians(latitude)) - N
            latitude = degrees(atan2(z_rot, r * (1 - e2 * N / (N + h))))
        
        altitude = h
        
        return {
            'latitude': latitude,
            'longitude': longitude,
            'altitude': altitude
        }
    
    def get_current_position(self):
        return self.get_position_at_time(datetime.utcnow())
