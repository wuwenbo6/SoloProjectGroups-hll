import numpy as np
from collections import defaultdict
import time
import json
import csv
import io


class Track:
    def __init__(self, track_id, detection, timestamp):
        self.track_id = track_id
        self.state = np.array([detection['range'], detection.get('speed', detection.get('unambiguous_speed', 0))])
        self.prediction = self.state.copy()
        self.history = [{
            'timestamp': timestamp,
            'range': float(self.state[0]),
            'speed': float(self.state[1]),
            'power': float(detection.get('power', 0)),
            'track_id': track_id
        }]
        self.last_update = timestamp
        self.missed_updates = 0
        self.hits = 1
        self.status = 'tentative'
        self.confirm_threshold = 3
        self.delete_threshold = 5

        self.P = np.diag([100.0, 10.0])
        self.Q = np.diag([5.0, 1.0])
        self.R = np.diag([50.0, 5.0])
        self.H = np.eye(2)
        self.F = np.eye(2)

    def predict(self, dt):
        self.F = np.array([[1, dt], [0, 1]])
        self.prediction = self.F @ self.state
        self.P = self.F @ self.P @ self.F.T + self.Q

    def update(self, detection, timestamp):
        z = np.array([detection['range'], detection.get('speed', detection.get('unambiguous_speed', 0))])

        y = z - self.H @ self.prediction
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)

        self.state = self.prediction + K @ y
        self.P = (np.eye(2) - K @ self.H) @ self.P

        self.last_update = timestamp
        self.missed_updates = 0
        self.hits += 1

        self.history.append({
            'timestamp': timestamp,
            'range': float(self.state[0]),
            'speed': float(self.state[1]),
            'power': float(detection.get('power', 0)),
            'track_id': self.track_id
        })

        if self.hits >= self.confirm_threshold and self.status == 'tentative':
            self.status = 'confirmed'

    def mark_missed(self):
        self.missed_updates += 1

    def should_delete(self):
        return self.missed_updates >= self.delete_threshold

    def get_gate_distance(self, detection):
        z = np.array([detection['range'], detection.get('speed', detection.get('unambiguous_speed', 0))])
        y = z - self.H @ self.prediction
        S = self.H @ self.P @ self.H.T + self.R

        try:
            d2 = float(y.T @ np.linalg.inv(S) @ y)
        except np.linalg.LinAlgError:
            d2 = float('inf')

        return d2


class TargetTracker:
    def __init__(self, gate_threshold=25.0, max_gate_distance=500.0, dt=1.0):
        self.tracks = []
        self.next_track_id = 1
        self.gate_threshold = gate_threshold
        self.max_gate_distance = max_gate_distance
        self.dt = dt
        self.scan_count = 0
        self.track_history = defaultdict(list)

    def process_detections(self, detections, timestamp=None):
        if timestamp is None:
            timestamp = self.scan_count * self.dt

        self.scan_count += 1

        for track in self.tracks:
            track.predict(self.dt)

        if not detections:
            for track in self.tracks:
                track.mark_missed()
            self._prune_tracks()
            return self._get_track_info()

        associations = self._associate_detections(detections)

        associated_detections = set()
        for det_idx, track in associations:
            track.update(detections[det_idx], timestamp)
            associated_detections.add(det_idx)

        for track in self.tracks:
            if track not in [t for _, t in associations]:
                track.mark_missed()

        for det_idx in range(len(detections)):
            if det_idx not in associated_detections:
                new_track = Track(self.next_track_id, detections[det_idx], timestamp)
                self.tracks.append(new_track)
                self.next_track_id += 1

        self._prune_tracks()

        return self._get_track_info()

    def _associate_detections(self, detections):
        if not self.tracks or not detections:
            return []

        cost_matrix = np.zeros((len(detections), len(self.tracks)))
        for i, det in enumerate(detections):
            for j, track in enumerate(self.tracks):
                d2 = track.get_gate_distance(det)
                cost_matrix[i, j] = d2

        associations = []
        used_detections = set()
        used_tracks = set()

        for _ in range(min(len(detections), len(self.tracks))):
            min_cost = float('inf')
            min_i, min_j = -1, -1

            for i in range(len(detections)):
                if i in used_detections:
                    continue
                for j in range(len(self.tracks)):
                    if j in used_tracks:
                        continue
                    if cost_matrix[i, j] < min_cost:
                        min_cost = cost_matrix[i, j]
                        min_i, min_j = i, j

            if min_i == -1 or min_cost > self.gate_threshold:
                break

            associations.append((min_i, self.tracks[min_j]))
            used_detections.add(min_i)
            used_tracks.add(min_j)

        return associations

    def _prune_tracks(self):
        self.tracks = [t for t in self.tracks if not t.should_delete()]

    def _get_track_info(self):
        track_list = []
        for track in self.tracks:
            latest = track.history[-1]
            track_info = {
                'track_id': track.track_id,
                'status': track.status,
                'hits': track.hits,
                'missed': track.missed_updates,
                'range': latest['range'],
                'speed': latest['speed'],
                'power': latest['power'],
                'history_length': len(track.history),
                'history': track.history[-20:]
            }
            track_list.append(track_info)
        return track_list

    def get_all_tracks(self):
        return self._get_track_info()

    def export_tracks_json(self):
        export_data = {
            'export_time': time.strftime('%Y-%m-%d %H:%M:%S'),
            'scan_count': self.scan_count,
            'total_tracks': len(self.tracks),
            'tracks': []
        }

        for track in self.tracks:
            track_data = {
                'track_id': track.track_id,
                'status': track.status,
                'hits': track.hits,
                'current_range': float(track.state[0]),
                'current_speed': float(track.state[1]),
                'history': track.history
            }
            export_data['tracks'].append(track_data)

        return json.dumps(export_data, ensure_ascii=False, indent=2)

    def export_tracks_csv(self):
        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow(['track_id', 'status', 'timestamp', 'range_m', 'speed_ms', 'power_db'])

        for track in self.tracks:
            for point in track.history:
                writer.writerow([
                    track.track_id,
                    track.status,
                    point['timestamp'],
                    f"{point['range']:.2f}",
                    f"{point['speed']:.2f}",
                    f"{point['power']:.1f}"
                ])

        return output.getvalue()

    def reset(self):
        self.tracks = []
        self.next_track_id = 1
        self.scan_count = 0
        self.track_history = defaultdict(list)
