import os
import numpy as np
from pyswmm import Simulation, Nodes, Links
from shapely.geometry import Point
import geojson


class SWMMSimulator:
    def __init__(self, inp_file_path):
        self.inp_file_path = inp_file_path
        self.base_path = os.path.dirname(os.path.abspath(__file__))
        
    def generate_rainfall_series(self, return_period, duration_hours=24, timestep_min=5):
        n_steps = int(duration_hours * 60 / timestep_min)
        time_points = np.arange(n_steps) * timestep_min / 60
        
        if return_period == 2:
            peak_intensity = 20.0
            a, b = 15.0, 0.6
        elif return_period == 50:
            peak_intensity = 80.0
            a, b = 60.0, 0.5
        else:
            raise ValueError("Unsupported return period")
        
        t_peak = duration_hours * 0.3
        rainfall = np.zeros(n_steps)
        
        for i, t in enumerate(time_points):
            if t <= t_peak:
                rainfall[i] = peak_intensity * (t / t_peak) ** b
            else:
                rainfall[i] = peak_intensity * np.exp(-a * (t - t_peak) / duration_hours)
        
        total_rain = np.sum(rainfall) * timestep_min / 60
        return rainfall, time_points
    
    def create_inp_file(self, return_period):
        template_path = os.path.join(self.base_path, 'swmm_template.inp')
        
        if not os.path.exists(template_path):
            self._create_template_inp(template_path)
        
        with open(template_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        rainfall, times = self.generate_rainfall_series(return_period)
        rain_str = ""
        for i, rain in enumerate(rainfall):
            hour = int(i * 5 / 60)
            minute = (i * 5) % 60
            rain_str += f"Gage1 01/01/2024 {hour:02d}:{minute:02d} {rain:.4f}\n"
        
        content = content.replace('{{RAINFALL_DATA}}', rain_str)
        
        output_path = os.path.join(self.base_path, f'swmm_model_{return_period}yr.inp')
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return output_path
    
    def _create_template_inp(self, path):
        template = """[TITLE]
Urban Drainage Simulation - Return Period Model

[OPTIONS]
FLOW_UNITS           CMS
INFILTRATION         HORTON
FLOW_ROUTING         DYNWAVE
START_DATE           01/01/2024
START_TIME           00:00:00
REPORT_START_DATE    01/01/2024
REPORT_START_TIME    00:00:00
END_DATE             01/01/2024
END_TIME             24:00:00
SWEEP_START          01/01
SWEEP_END            12/31
WET_STEP             0:05:00
DRY_STEP             1:00:00
ROUTING_STEP         0:00:30
REPORT_STEP          0:05:00
RULE_STEP            0:00:05
INERTIAL_DAMPING     PARTIAL
NORMAL_FLOW_LIMITED  BOTH
FORCE_MAIN_EQUATION  H-W
VARIABLE_STEP        0.75
LENGTHENING_STEP     0
MIN_SURFAREA         0
MAX_TRIALS           10
HEAD_TOLERANCE       0.0015
SYS_FLOW_TOL         5
LAT_FLOW_TOL         5
SLOPE_WEIGHTING      NO
IGNORE_GROUNDWATER   NO
IGNORE_SNOWMELT      YES
IGNORE_ROUTING       NO
IGNORE_QUALITY       YES

[EVAPORATION]
Dry Only              0.0

[TEMPERATURE]
TIMESERIES        NONE

[RAINGAGES]
;;Name           Format    Interval  SCF    Source  
;;-------------- ---------- ---------- ------ --------
Gage1            VOLUME    0:05:00   1.0    TIMESERIES Gage1_TS

[SUBCATCHMENTS]
;;Name          RainGage     Outlet     Area     %Imperv   Width    Slope     Curblen    
;;-------------- ---------- ---------- --------- --------- --------- --------- ---------
SC1             Gage1        J1         50.0     75.0      500.0    0.02      0
SC2             Gage1        J2         40.0     60.0      400.0    0.015     0
SC3             Gage1        J3         60.0     80.0      600.0    0.025     0
SC4             Gage1        J4         45.0     70.0      450.0    0.018     0
SC5             Gage1        J5         55.0     65.0      550.0    0.022     0

[SUBAREAS]
;;Subcatchment   N-Imperv   N-Perv     S-Imperv   S-Perv     PctZero    
;;-------------- ---------- ---------- ---------- ---------- ----------
SC1             0.01       0.1        0.05       0.2        25
SC2             0.01       0.1        0.05       0.2        30
SC3             0.01       0.1        0.05       0.2        20
SC4             0.01       0.1        0.05       0.2        28
SC5             0.01       0.1        0.05       0.2        32

[INFILTRATION]
;;Subcatchment   MaxRate    MinRate    Decay      DryTime    MaxInfil   
;;-------------- ---------- ---------- ---------- ---------- ----------
SC1             76.2       3.81       2.0        7.0        0
SC2             76.2       3.81       2.0        7.0        0
SC3             76.2       3.81       2.0        7.0        0
SC4             76.2       3.81       2.0        7.0        0
SC5             76.2       3.81       2.0        7.0        0

[JUNCTIONS]
;;Name           Elevation  MaxDepth   InitDepth  SurDepth   Aponded    
;;-------------- ---------- ---------- ---------- ---------- ----------
J1               100.0      5.0        0.0        2.0        0
J2               98.5       5.0        0.0        2.0        0
J3               97.0       5.0        0.0        2.5        0
J4               95.5       5.0        0.0        2.0        0
J5               94.0       5.0        0.0        3.0        0
J6               92.5       6.0        0.0        2.0        0
J7               91.0       6.0        0.0        2.5        0
J8               89.5       6.0        0.0        2.0        0

[OUTFALLS]
;;Name           Elevation  Type       Stage Data       
;;-------------- ---------- ---------- ----------------
OUT1             88.0       FREE

[CONDUITS]
;;Name           FromNode    ToNode      Length     Roughness  InOffset   OutOffset  InitFlow   MaxFlow   
;;-------------- ---------- ---------- ---------- ---------- ---------- ---------- ---------- ----------
C1               J1          J3          150.0      0.013      0.0        0.0        0          0
C2               J2          J3          120.0      0.013      0.0        0.0        0          0
C3               J3          J6          180.0      0.013      0.0        0.0        0          0
C4               J4          J6          140.0      0.013      0.0        0.0        0          0
C5               J5          J7          160.0      0.013      0.0        0.0        0          0
C6               J6          J7          200.0      0.013      0.0        0.0        0          0
C7               J7          J8          220.0      0.013      0.0        0.0        0          0
C8               J8          OUT1        250.0      0.013      0.0        0.0        0          0

[XSECTIONS]
;;Link           Shape        Geom1     Geom2     Geom3     Geom4     Barrels    
;;-------------- ---------- --------- --------- --------- --------- ---------
C1               CIRCULAR     1.2       0.0       0.0       0.0       1
C2               CIRCULAR     1.0       0.0       0.0       0.0       1
C3               CIRCULAR     1.8       0.0       0.0       0.0       1
C4               CIRCULAR     1.2       0.0       0.0       0.0       1
C5               CIRCULAR     1.5       0.0       0.0       0.0       1
C6               CIRCULAR     2.0       0.0       0.0       0.0       1
C7               CIRCULAR     2.2       0.0       0.0       0.0       1
C8               CIRCULAR     2.5       0.0       0.0       0.0       1

[TIMESERIES]
;;Name           Date        Time       Value
;;-------------- ---------- ---------- -------
{{RAINFALL_DATA}}

[REPORT]
INPUT               NO
SUBCATCHMENTS       NONE
NODES               ALL
LINKS               NONE
"""
        with open(path, 'w', encoding='utf-8') as f:
            f.write(template)
    
    def run_simulation(self, return_period):
        inp_file = self.create_inp_file(return_period)
        
        node_coords = {
            'J1': (116.397, 39.908),
            'J2': (116.403, 39.908),
            'J3': (116.400, 39.903),
            'J4': (116.394, 39.900),
            'J5': (116.406, 39.900),
            'J6': (116.397, 39.895),
            'J7': (116.403, 39.892),
            'J8': (116.400, 39.887),
            'OUT1': (116.400, 39.882)
        }
        
        results = {
            'return_period': return_period,
            'nodes': [],
            'max_flooding': []
        }
        
        with Simulation(inp_file) as sim:
            nodes = Nodes(sim)
            
            for step in sim:
                current_time = sim.current_time
                
                for node_id, (lon, lat) in node_coords.items():
                    if node_id in nodes:
                        node = nodes[node_id]
                        depth = node.depth
                        flooding = node.flooding
                        
                        results['nodes'].append({
                            'node_id': node_id,
                            'time': current_time.strftime('%Y-%m-%d %H:%M:%S'),
                            'depth': float(depth),
                            'flooding': float(flooding),
                            'lon': lon,
                            'lat': lat
                        })
        
        max_flood_dict = {}
        for record in results['nodes']:
            node_id = record['node_id']
            if node_id not in max_flood_dict or record['flooding'] > max_flood_dict[node_id]['flooding']:
                max_flood_dict[node_id] = record
        
        results['max_flooding'] = list(max_flood_dict.values())
        
        return results
    
    def generate_depth_points(self, results, grid_size=20):
        max_flooding = results['max_flooding']
        
        lons = [p['lon'] for p in max_flooding]
        lats = [p['lat'] for p in max_flooding]
        floodings = [p['flooding'] for p in max_flooding]
        
        min_lon, max_lon = min(lons), max(lons)
        min_lat, max_lat = min(lats), max(lats)
        
        lon_range = max_lon - min_lon
        lat_range = max_lat - min_lat
        min_lon -= lon_range * 0.2
        max_lon += lon_range * 0.2
        min_lat -= lat_range * 0.2
        max_lat += lat_range * 0.2
        
        grid_lons = np.linspace(min_lon, max_lon, grid_size)
        grid_lats = np.linspace(min_lat, max_lat, grid_size)
        
        depth_points = []
        
        for i, glon in enumerate(grid_lons):
            for j, glat in enumerate(grid_lats):
                distances = []
                weights = []
                
                for k, (lon, lat) in enumerate(zip(lons, lats)):
                    dist = np.sqrt((glon - lon)**2 + (glat - lat)**2)
                    if dist < 1e-6:
                        weight = 1.0
                    else:
                        weight = 1.0 / (dist ** 2)
                    distances.append(dist)
                    weights.append(weight)
                
                total_weight = sum(weights)
                if total_weight > 0:
                    interpolated_depth = sum(w * f for w, f in zip(weights, floodings)) / total_weight
                    interpolated_depth = interpolated_depth * np.exp(-min(distances) * 1000)
                else:
                    interpolated_depth = 0.0
                
                if interpolated_depth > 0.01:
                    depth_points.append({
                        'lon': float(glon),
                        'lat': float(glat),
                        'depth': float(interpolated_depth)
                    })
        
        return depth_points
    
    def generate_contour_geojson(self, depth_points, levels=[0.1, 0.3, 0.5, 1.0, 2.0]):
        from scipy.interpolate import griddata
        
        if not depth_points:
            return geojson.FeatureCollection([])
        
        lons = [p['lon'] for p in depth_points]
        lats = [p['lat'] for p in depth_points]
        depths = [p['depth'] for p in depth_points]
        
        grid_lon, grid_lat = np.meshgrid(
            np.linspace(min(lons), max(lons), 100),
            np.linspace(min(lats), max(lats), 100)
        )
        
        grid_depth = griddata((lons, lats), depths, (grid_lon, grid_lat), method='cubic')
        grid_depth = np.nan_to_num(grid_depth, nan=0.0)
        
        features = []
        
        colors = ['#ffffcc', '#c7e9b4', '#7fcdbb', '#41b6c4', '#2c7fb8', '#253494']
        
        for i, level in enumerate(levels):
            mask = grid_depth >= level
            if np.any(mask):
                features.append(geojson.Feature(
                    properties={
                        'level': level,
                        'fill': colors[min(i, len(colors)-1)],
                        'stroke': '#000000',
                        'fill-opacity': 0.6
                    },
                    geometry=geojson.Polygon([])
                ))
        
        point_features = []
        for dp in depth_points:
            point_features.append(geojson.Feature(
                properties={'depth': dp['depth']},
                geometry=geojson.Point((dp['lon'], dp['lat']))
            ))
        
        return geojson.FeatureCollection(point_features)
