from datetime import datetime, timedelta
import math

class CollisionWarning:
    def __init__(self, propagator_a, propagator_b):
        self.prop_a = propagator_a
        self.prop_b = propagator_b

    def calculate_distance(self, time, tle_a_line1, tle_a_line2, tle_b_line1, tle_b_line2):
        pos_a = self.prop_a.get_position_at_time(time)
        pos_b = self.prop_b.get_position_at_time(time)
        
        if pos_a is None or pos_b is None:
            return None
        
        dx = pos_a['x'] - pos_b['x']
        dy = pos_a['y'] - pos_b['y']
        dz = pos_a['z'] - pos_b['z']
        
        distance = math.sqrt(dx*dx + dy*dy + dz*dz)
        return {
            'time': time.isoformat(),
            'distance_km': distance,
            'position_a': pos_a,
            'position_b': pos_b
        }

    def check_approaches(self, start_time=None, duration_hours=24, threshold_km=5.0, time_step_minutes=1):
        if start_time is None:
            start_time = datetime.utcnow()
        
        approaches = []
        current_time = start_time
        end_time = start_time + timedelta(hours=duration_hours)
        time_step = timedelta(minutes=time_step_minutes)
        
        min_distance = float('inf')
        min_distance_time = None
        was_inside_threshold = False
        approach_start = None
        
        while current_time <= end_time:
            result = self._calculate_distance_at_time(current_time)
            
            if result is not None:
                distance = result['distance_km']
                
                if distance < min_distance:
                    min_distance = distance
                    min_distance_time = current_time
                
                if distance < threshold_km:
                    if not was_inside_threshold:
                        approach_start = current_time
                        was_inside_threshold = True
                else:
                    if was_inside_threshold:
                        approach = {
                            'start_time': approach_start.isoformat(),
                            'end_time': current_time.isoformat(),
                            'duration_minutes': (current_time - approach_start).total_seconds() / 60,
                            'min_distance_km': min_distance,
                            'min_distance_time': min_distance_time.isoformat() if min_distance_time else None
                        }
                        approaches.append(approach)
                        was_inside_threshold = False
                        min_distance = float('inf')
                        min_distance_time = None
            
            current_time += time_step
        
        if was_inside_threshold:
            approach = {
                'start_time': approach_start.isoformat(),
                'end_time': end_time.isoformat(),
                'duration_minutes': (end_time - approach_start).total_seconds() / 60,
                'min_distance_km': min_distance,
                'min_distance_time': min_distance_time.isoformat() if min_distance_time else None
            }
            approaches.append(approach)
        
        return {
            'approaches': approaches,
            'total_approaches': len(approaches),
            'min_distance_km': min_distance if not approaches else None,
            'min_distance_time': min_distance_time.isoformat() if min_distance_time and not approaches else None,
            'threshold_km': threshold_km
        }

    def _calculate_distance_at_time(self, time):
        pos_a = self.prop_a.get_position_at_time(time)
        pos_b = self.prop_b.get_position_at_time(time)
        
        if pos_a is None or pos_b is None:
            return None
        
        dx = pos_a['x'] - pos_b['x']
        dy = pos_a['y'] - pos_b['y']
        dz = pos_a['z'] - pos_b['z']
        
        distance = math.sqrt(dx*dx + dy*dy + dz*dz)
        
        rel_vel_x = pos_a.get('vx', 0) - pos_b.get('vx', 0)
        rel_vel_y = pos_a.get('vy', 0) - pos_b.get('vy', 0)
        rel_vel_z = pos_a.get('vz', 0) - pos_b.get('vz', 0)
        relative_velocity = math.sqrt(rel_vel_x*rel_vel_x + rel_vel_y*rel_vel_y + rel_vel_z*rel_vel_z)
        
        return {
            'time': time.isoformat(),
            'distance_km': distance,
            'relative_velocity_km_s': relative_velocity,
            'position_a': pos_a,
            'position_b': pos_b
        }

    def get_conjunction_summary(self, start_time=None, duration_hours=24):
        if start_time is None:
            start_time = datetime.utcnow()
        
        time_step = timedelta(minutes=5)
        current_time = start_time
        end_time = start_time + timedelta(hours=duration_hours)
        
        distances = []
        min_distance = float('inf')
        min_distance_time = None
        max_distance = 0
        
        while current_time <= end_time:
            result = self._calculate_distance_at_time(current_time)
            if result:
                dist = result['distance_km']
                distances.append(dist)
                
                if dist < min_distance:
                    min_distance = dist
                    min_distance_time = current_time
                if dist > max_distance:
                    max_distance = dist
            
            current_time += time_step
        
        avg_distance = sum(distances) / len(distances) if distances else 0
        
        return {
            'start_time': start_time.isoformat(),
            'end_time': end_time.isoformat(),
            'duration_hours': duration_hours,
            'min_distance_km': round(min_distance, 2),
            'min_distance_time': min_distance_time.isoformat() if min_distance_time else None,
            'max_distance_km': round(max_distance, 2),
            'avg_distance_km': round(avg_distance, 2),
            'sample_count': len(distances)
        }
