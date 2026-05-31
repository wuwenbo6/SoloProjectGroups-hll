import numpy as np
import librosa
from typing import Dict, List, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta
from collections import defaultdict


@dataclass
class AcousticIndices:
    aci: float
    adi: float
    bi: float
    h: float
    nsi: float
    sc: float
    spectral_entropy: float
    temporal_entropy: float
    acoustic_richness: float


class AcousticIndexCalculator:
    def __init__(self, sample_rate: int = 22050, n_fft: int = 2048, hop_length: int = 512):
        self.sample_rate = sample_rate
        self.n_fft = n_fft
        self.hop_length = hop_length
    
    def compute_aci(self, S: np.ndarray) -> float:
        aci = 0
        for i in range(S.shape[0]):
            for j in range(S.shape[1] - 1):
                aci += abs(S[i, j] - S[i, j + 1])
        return aci / (S.shape[0] * S.shape[1])
    
    def compute_adi(self, S_db: np.ndarray, freq_bands: int = 10, db_threshold: float = -50) -> float:
        band_width = S_db.shape[0] // freq_bands
        adi = 0
        for i in range(freq_bands):
            start = i * band_width
            end = start + band_width
            band = S_db[start:end, :]
            peak = np.max(band)
            if peak > db_threshold:
                adi += 1
        return adi / freq_bands
    
    def compute_bi(self, S_db: np.ndarray, min_freq: int = 2000, max_freq: int = 8000) -> float:
        freqs = librosa.fft_frequencies(sr=self.sample_rate, n_fft=self.n_fft)
        mask = (freqs >= min_freq) & (freqs <= max_freq)
        bi_spectrum = S_db[mask, :]
        bi = np.sum(10 ** (bi_spectrum / 10))
        return 10 * np.log10(bi) if bi > 0 else 0
    
    def compute_spectral_entropy(self, S: np.ndarray) -> float:
        power_spectrum = S ** 2
        power_spectrum = power_spectrum / np.sum(power_spectrum, axis=0, keepdims=True)
        entropy = -np.sum(power_spectrum * np.log2(power_spectrum + 1e-10), axis=0)
        return np.mean(entropy) / np.log2(S.shape[0])
    
    def compute_temporal_entropy(self, y: np.ndarray) -> float:
        envelope = np.abs(librosa.onset.onset_strength(y=y, sr=self.sample_rate))
        envelope = envelope / np.sum(envelope) if np.sum(envelope) > 0 else envelope
        entropy = -np.sum(envelope * np.log2(envelope + 1e-10))
        return entropy / np.log2(len(envelope)) if len(envelope) > 1 else 0
    
    def compute_nsi(self, S_db: np.ndarray) -> float:
        low_freq = S_db[:S_db.shape[0]//3, :]
        high_freq = S_db[S_db.shape[0]//3:, :]
        low_energy = np.sum(10 ** (low_freq / 10))
        high_energy = np.sum(10 ** (high_freq / 10))
        return low_energy / (high_energy + 1e-10)
    
    def compute_sc(self, y: np.ndarray) -> float:
        onsets = librosa.onset.onset_detect(y=y, sr=self.sample_rate, hop_length=self.hop_length)
        return len(onsets) / (len(y) / self.sample_rate)
    
    def compute_acoustic_richness(self, S_db: np.ndarray, db_threshold: float = -40) -> float:
        freq_bins_with_activity = np.sum(np.max(S_db, axis=1) > db_threshold)
        return freq_bins_with_activity / S_db.shape[0]
    
    def compute_all(self, y: np.ndarray) -> AcousticIndices:
        S = np.abs(librosa.stft(y, n_fft=self.n_fft, hop_length=self.hop_length))
        S_db = librosa.amplitude_to_db(S, ref=np.max)
        
        return AcousticIndices(
            aci=self.compute_aci(S),
            adi=self.compute_adi(S_db),
            bi=self.compute_bi(S_db),
            h=self.compute_spectral_entropy(S),
            nsi=self.compute_nsi(S_db),
            sc=self.compute_sc(y),
            spectral_entropy=self.compute_spectral_entropy(S),
            temporal_entropy=self.compute_temporal_entropy(y),
            acoustic_richness=self.compute_acoustic_richness(S_db)
        )
    
    def compute_biodiversity_score(self, indices: AcousticIndices) -> float:
        score = (
            0.25 * indices.adi +
            0.25 * indices.acoustic_richness +
            0.2 * indices.spectral_entropy +
            0.15 * indices.temporal_entropy +
            0.15 * (1 / (1 + indices.nsi))
        )
        return min(1.0, score)


class MigrationHotspotAnalyzer:
    def __init__(self):
        self.bird_migration_patterns = {
            'spring': {
                'months': [3, 4, 5],
                'peak_hours': [5, 6, 7, 8],
                'species': ['Acadian Flycatcher', 'Baltimore Oriole', 'Ruby-throated Hummingbird', 'Indigo Bunting']
            },
            'fall': {
                'months': [9, 10, 11],
                'peak_hours': [6, 7, 8, 9, 17, 18],
                'species': ['Yellow Warbler', 'Rose-breasted Grosbeak', 'American Goldfinch', 'Purple Finch']
            },
            'winter': {
                'months': [12, 1, 2],
                'peak_hours': [7, 8, 9, 15, 16],
                'species': ['Dark-eyed Junco', 'White-throated Sparrow', 'Northern Cardinal', 'Downy Woodpecker']
            },
            'summer': {
                'months': [6, 7, 8],
                'peak_hours': [5, 6, 7, 8, 18, 19],
                'species': ['Wood Thrush', 'Red-eyed Vireo', 'Ovenbird', 'Yellow-throated Vireo']
            }
        }
    
    def get_season(self, month: int) -> str:
        if month in [3, 4, 5]:
            return 'spring'
        elif month in [6, 7, 8]:
            return 'summer'
        elif month in [9, 10, 11]:
            return 'fall'
        else:
            return 'winter'
    
    def analyze_recording(self, predictions: List[Dict], recording_time: datetime,
                          acoustic_indices: AcousticIndices) -> Dict:
        season = self.get_season(recording_time.month)
        hour = recording_time.hour
        pattern = self.bird_migration_patterns[season]
        
        is_peak_hour = hour in pattern['peak_hours']
        
        migrating_species_detected = []
        for pred in predictions:
            if pred['species'] in pattern['species']:
                migrating_species_detected.append({
                    'species': pred['species'],
                    'confidence': pred['confidence_percent']
                })
        
        hotspot_score = 0
        if is_peak_hour:
            hotspot_score += 0.3
        
        hotspot_score += len(migrating_species_detected) * 0.15
        hotspot_score += min(acoustic_indices.adi, 1.0) * 0.25
        hotspot_score += min(acoustic_indices.acoustic_richness, 1.0) * 0.3
        
        return {
            'season': season,
            'hour': hour,
            'is_peak_hour': is_peak_hour,
            'peak_hours': pattern['peak_hours'],
            'migrating_species': pattern['species'],
            'detected_migrants': migrating_species_detected,
            'hotspot_score': min(1.0, hotspot_score),
            'hotspot_level': self._get_hotspot_level(hotspot_score)
        }
    
    def _get_hotspot_level(self, score: float) -> str:
        if score >= 0.7:
            return 'high'
        elif score >= 0.4:
            return 'medium'
        elif score >= 0.2:
            return 'low'
        return 'minimal'
    
    def generate_timeline(self, recordings: List[Dict]) -> List[Dict]:
        timeline = defaultdict(lambda: {'count': 0, 'species': set(), 'score': 0})
        
        for rec in recordings:
            dt = datetime.fromisoformat(rec['uploaded_at'])
            date_key = dt.strftime('%Y-%m-%d')
            timeline[date_key]['count'] += 1
            if rec.get('top_prediction'):
                timeline[date_key]['species'].add(rec['top_prediction']['species'])
            timeline[date_key]['score'] = max(timeline[date_key]['score'], rec.get('hotspot_score', 0))
        
        timeline_list = []
        for date_key in sorted(timeline.keys()):
            data = timeline[date_key]
            timeline_list.append({
                'date': date_key,
                'recording_count': data['count'],
                'unique_species': len(data['species']),
                'species_list': list(data['species']),
                'hotspot_score': data['score'],
                'hotspot_level': self._get_hotspot_level(data['score'])
            })
        
        return timeline_list


class EBirdExporter:
    def __init__(self):
        pass
    
    def generate_checklist(self, predictions: List[Dict], location: Dict = None,
                           observation_time: datetime = None, duration_minutes: float = 5.0) -> Dict:
        if observation_time is None:
            observation_time = datetime.now()
        
        location = location or {
            'latitude': 40.7128,
            'longitude': -74.0060,
            'name': 'Unknown Location'
        }
        
        observations = []
        for pred in predictions[:10]:
            observations.append({
                'common_name': pred['species'],
                'scientific_name': self._get_scientific_name(pred['species']),
                'count': 'X',
                'confidence': pred['confidence_percent'],
                'breeding_code': None,
                'comments': f'AI identification confidence: {pred["confidence_percent"]}%'
            })
        
        return {
            'protocol': 'Audio recording',
            'date': observation_time.strftime('%Y-%m-%d'),
            'time': observation_time.strftime('%H:%M'),
            'location': location,
            'duration_minutes': duration_minutes,
            'all_species_reported': False,
            'observer_id': 'ai-bird-classifier',
            'observations': observations,
            'effort': {
                'distance_km': None,
                'area_ha': None,
                'number_observers': 1
            }
        }
    
    def _get_scientific_name(self, common_name: str) -> str:
        names = {
            'American Crow': 'Corvus brachyrhynchos',
            'American Goldfinch': 'Spinus tristis',
            'American Robin': 'Turdus migratorius',
            'Baltimore Oriole': 'Icterus galbula',
            'Barn Swallow': 'Hirundo rustica',
            'Black-capped Chickadee': 'Poecile atricapillus',
            'Blue Jay': 'Cyanocitta cristata',
            'Northern Cardinal': 'Cardinalis cardinalis',
            'Mourning Dove': 'Zenaida macroura',
            'House Finch': 'Haemorhous mexicanus',
            'Song Sparrow': 'Melospiza melodia',
            'Yellow Warbler': 'Setophaga petechia',
            'Downy Woodpecker': 'Dryobates pubescens',
            'Wood Thrush': 'Hylocichla mustelina',
            'Ruby-throated Hummingbird': 'Archilochus colubris'
        }
        return names.get(common_name, 'Unknown species')
    
    def export_csv(self, checklist: Dict) -> str:
        headers = ['Common Name', 'Scientific Name', 'Count', 'Location', 'Date', 'Time', 'Confidence %', 'Comments']
        rows = [headers]
        
        for obs in checklist['observations']:
            rows.append([
                obs['common_name'],
                obs['scientific_name'],
                obs['count'],
                checklist['location']['name'],
                checklist['date'],
                checklist['time'],
                str(obs['confidence']),
                obs['comments']
            ])
        
        return '\n'.join([','.join(row) for row in rows])
    
    def export_ebird_format(self, checklist: Dict) -> str:
        lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<Checklist>',
            f'  <Date>{checklist["date"]}</Date>',
            f'  <Time>{checklist["time"]}</Time>',
            f'  <LocationName>{checklist["location"]["name"]}</LocationName>',
            f'  <Latitude>{checklist["location"]["latitude"]}</Latitude>',
            f'  <Longitude>{checklist["location"]["longitude"]}</Longitude>',
            f'  <DurationMinutes>{checklist["duration_minutes"]}</DurationMinutes>',
            '  <Observations>'
        ]
        
        for obs in checklist['observations']:
            lines.extend([
                '    <Observation>',
                f'      <Species>{obs["common_name"]}</Species>',
                f'      <ScientificName>{obs["scientific_name"]}</ScientificName>',
                f'      <Count>{obs["count"]}</Count>',
                f'      <Confidence>{obs["confidence"]}%</Confidence>',
                '    </Observation>'
            ])
        
        lines.extend([
            '  </Observations>',
            '</Checklist>'
        ])
        
        return '\n'.join(lines)
