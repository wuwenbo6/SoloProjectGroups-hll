import random
import struct

CHORD_NOTES = {
    'Cmaj7': [60, 64, 67, 71],
    'C7': [60, 64, 67, 70],
    'Cm7': [60, 63, 67, 70],
    'C': [60, 64, 67],
    'Cm': [60, 63, 67],
    'C#maj7': [61, 65, 68, 72],
    'C#7': [61, 65, 68, 71],
    'C#m7': [61, 64, 68, 71],
    'C#': [61, 65, 68],
    'C#m': [61, 64, 68],
    'Dbmaj7': [61, 65, 68, 72],
    'Db7': [61, 65, 68, 71],
    'Dbm7': [61, 64, 68, 71],
    'Db': [61, 65, 68],
    'Dbm': [61, 64, 68],
    'Dmaj7': [62, 66, 69, 73],
    'D7': [62, 66, 69, 72],
    'Dm7': [62, 65, 69, 72],
    'D': [62, 66, 69],
    'Dm': [62, 65, 69],
    'D#maj7': [63, 67, 70, 74],
    'D#7': [63, 67, 70, 73],
    'D#m7': [63, 66, 70, 73],
    'D#': [63, 67, 70],
    'D#m': [63, 66, 70],
    'Ebmaj7': [63, 67, 70, 74],
    'Eb7': [63, 67, 70, 73],
    'Ebm7': [63, 66, 70, 73],
    'Eb': [63, 67, 70],
    'Ebm': [63, 66, 70],
    'Emaj7': [64, 68, 71, 75],
    'E7': [64, 68, 71, 74],
    'Em7': [64, 67, 71, 74],
    'E': [64, 68, 71],
    'Em': [64, 67, 71],
    'Fmaj7': [65, 69, 72, 76],
    'F7': [65, 69, 72, 75],
    'Fm7': [65, 68, 72, 75],
    'F': [65, 69, 72],
    'Fm': [65, 68, 72],
    'F#maj7': [66, 70, 73, 77],
    'F#7': [66, 70, 73, 76],
    'F#m7': [66, 69, 73, 76],
    'F#': [66, 70, 73],
    'F#m': [66, 69, 73],
    'Gbmaj7': [66, 70, 73, 77],
    'Gb7': [66, 70, 73, 76],
    'Gbm7': [66, 69, 73, 76],
    'Gb': [66, 70, 73],
    'Gbm': [66, 69, 73],
    'Gmaj7': [55, 59, 62, 66],
    'G7': [55, 59, 62, 65],
    'Gm7': [55, 58, 62, 65],
    'G': [55, 59, 62],
    'Gm': [55, 58, 62],
    'G#maj7': [56, 60, 63, 67],
    'G#7': [56, 60, 63, 66],
    'G#m7': [56, 59, 63, 66],
    'G#': [56, 60, 63],
    'G#m': [56, 59, 63],
    'Abmaj7': [56, 60, 63, 67],
    'Ab7': [56, 60, 63, 66],
    'Abm7': [56, 59, 63, 66],
    'Ab': [56, 60, 63],
    'Abm': [56, 59, 63],
    'Amaj7': [57, 61, 64, 68],
    'A7': [57, 61, 64, 67],
    'Am7': [57, 60, 64, 67],
    'A': [57, 61, 64],
    'Am': [57, 60, 64],
    'A#maj7': [58, 62, 65, 69],
    'A#7': [58, 62, 65, 68],
    'A#m7': [58, 61, 65, 68],
    'A#': [58, 62, 65],
    'A#m': [58, 61, 65],
    'Bbmaj7': [58, 62, 65, 69],
    'Bb7': [58, 62, 65, 68],
    'Bbm7': [58, 61, 65, 68],
    'Bb': [58, 62, 65],
    'Bbm': [58, 61, 65],
    'Bmaj7': [59, 63, 66, 70],
    'B7': [59, 63, 66, 69],
    'Bm7': [59, 62, 66, 69],
    'B': [59, 63, 66],
    'Bm': [59, 62, 66]
}

STYLE_PATTERNS = {
    'jazz': {
        'drums': {
            'kick': [0, 2, 4, 6],
            'snare': [1, 3, 5, 7],
            'hihat': [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]
        },
        'bass': 'walking',
        'piano': 'comping'
    },
    'rock': {
        'drums': {
            'kick': [0, 4],
            'snare': [2, 6],
            'hihat': [0, 1, 2, 3, 4, 5, 6, 7]
        },
        'bass': 'root',
        'piano': 'power'
    },
    'pop': {
        'drums': {
            'kick': [0, 3, 4, 7],
            'snare': [2, 6],
            'hihat': [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5]
        },
        'bass': 'arpeggio',
        'piano': 'chordal'
    }
}

class SimpleMIDI:
    def __init__(self, num_tracks=1):
        self.tracks = [[] for _ in range(num_tracks)]
        self.ticks_per_beat = 480
    
    def _write_var_length(self, value):
        buffer = []
        buffer.append(value & 0x7F)
        value >>= 7
        while value:
            buffer.append((value & 0x7F) | 0x80)
            value >>= 7
        buffer.reverse()
        return bytes(buffer)
    
    def note_on(self, track, delta_tick, channel, note, velocity):
        data = self._write_var_length(delta_tick)
        data += bytes([0x90 | channel, note, velocity])
        self.tracks[track].append(data)
    
    def note_off(self, track, delta_tick, channel, note, velocity=0):
        data = self._write_var_length(delta_tick)
        data += bytes([0x80 | channel, note, velocity])
        self.tracks[track].append(data)
    
    def program_change(self, track, delta_tick, channel, program):
        data = self._write_var_length(delta_tick)
        data += bytes([0xC0 | channel, program])
        self.tracks[track].append(data)
    
    def set_tempo(self, track, delta_tick, bpm):
        microseconds_per_beat = int(60000000 / bpm)
        data = self._write_var_length(delta_tick)
        data += bytes([0xFF, 0x51, 0x03])
        data += bytes([(microseconds_per_beat >> 16) & 0xFF,
                       (microseconds_per_beat >> 8) & 0xFF,
                       microseconds_per_beat & 0xFF])
        self.tracks[track].append(data)
    
    def to_bytes(self):
        result = b'MThd'
        result += struct.pack('>I', 6)
        result += struct.pack('>HH', 1, len(self.tracks))
        result += struct.pack('>H', self.ticks_per_beat)
        
        for track in self.tracks:
            track_data = b''.join(track)
            track_data += self._write_var_length(0) + bytes([0xFF, 0x2F, 0x00])
            result += b'MTrk'
            result += struct.pack('>I', len(track_data))
            result += track_data
        
        return result

class LSTMAccompanimentGenerator:
    def __init__(self):
        self.vocab_size = 128
        self.sequence_length = 8
        self._init_simple_model()
    
    def _init_simple_model(self):
        self.drum_patterns = self._generate_drum_patterns()
        self.bass_patterns = self._generate_bass_patterns()
        self.piano_patterns = self._generate_piano_patterns()
    
    def _generate_drum_patterns(self):
        patterns = {}
        for style in ['jazz', 'rock', 'pop']:
            patterns[style] = {
                'kick': [],
                'snare': [],
                'hihat': []
            }
            for i in range(10):
                base = STYLE_PATTERNS[style]['drums']
                variation = {
                    'kick': sorted(list(set(base['kick'] + random.sample(range(8), random.randint(0, 2))))),
                    'snare': sorted(list(set(base['snare'] + random.sample(range(8), random.randint(0, 1))))),
                    'hihat': sorted(list(set(base['hihat'] + random.sample([x/2 for x in range(16)], random.randint(0, 4)))))
                }
                patterns[style]['kick'].append(variation['kick'])
                patterns[style]['snare'].append(variation['snare'])
                patterns[style]['hihat'].append(variation['hihat'])
        return patterns
    
    def _generate_bass_patterns(self):
        patterns = {}
        for style in ['jazz', 'rock', 'pop']:
            patterns[style] = []
            for i in range(10):
                if style == 'jazz':
                    pattern = [0, 1, 2, 3, 4, 5, 6, 7]
                elif style == 'rock':
                    pattern = [0, 2, 4, 6]
                else:
                    pattern = [0, 1.5, 3, 4.5]
                patterns[style].append(pattern)
        return patterns
    
    def _generate_piano_patterns(self):
        patterns = {}
        for style in ['jazz', 'rock', 'pop']:
            patterns[style] = []
            for i in range(10):
                if style == 'jazz':
                    pattern = [0, 2, 4, 6]
                elif style == 'rock':
                    pattern = [0, 1, 2, 3, 4, 5, 6, 7]
                else:
                    pattern = [0, 2, 3.5, 5]
                patterns[style].append(pattern)
        return patterns
    
    def generate_accompaniment(self, chords, style='pop', bpm=120, length=8):
        ticks_per_beat = 480
        chords = chords * ((length // len(chords)) + 1)
        chords = chords[:length]
        
        events = [[], [], []]
        tracks_data = {
            'drums': {'events': []},
            'bass': {'events': []},
            'piano': {'events': []}
        }
        
        events[0].append((0, 'tempo', bpm))
        events[1].append((0, 'tempo', bpm))
        events[2].append((0, 'tempo', bpm))
        
        events[0].append((0, 'program', 9, 0))
        events[1].append((0, 'program', 0, 33))
        events[2].append((0, 'program', 0, 0))
        
        pattern_idx = random.randint(0, 9)
        
        track_info = {
            'drums': {'notes': 0},
            'bass': {'notes': 0},
            'piano': {'notes': 0}
        }
        
        for bar in range(length):
            chord = chords[bar % len(chords)]
            chord_notes = CHORD_NOTES.get(chord, [60, 64, 67])
            bar_start_tick = bar * 4 * ticks_per_beat
            bar_start_beat = bar * 4
            
            drum_pattern = {
                'kick': self.drum_patterns[style]['kick'][pattern_idx],
                'snare': self.drum_patterns[style]['snare'][pattern_idx],
                'hihat': self.drum_patterns[style]['hihat'][pattern_idx]
            }
            
            for beat in drum_pattern['kick']:
                tick = bar_start_tick + int(beat * ticks_per_beat)
                time = bar_start_beat + beat
                events[0].append((tick, 'note_on', 9, 36, 100))
                events[0].append((tick + int(0.5 * ticks_per_beat), 'note_off', 9, 36, 0))
                tracks_data['drums']['events'].append({'type': 'noteon', 'note': 36, 'time': time, 'velocity': 100})
                tracks_data['drums']['events'].append({'type': 'noteoff', 'note': 36, 'time': time + 0.5, 'velocity': 0})
                track_info['drums']['notes'] += 1
            
            for beat in drum_pattern['snare']:
                tick = bar_start_tick + int(beat * ticks_per_beat)
                time = bar_start_beat + beat
                events[0].append((tick, 'note_on', 9, 38, 90))
                events[0].append((tick + int(0.5 * ticks_per_beat), 'note_off', 9, 38, 0))
                tracks_data['drums']['events'].append({'type': 'noteon', 'note': 38, 'time': time, 'velocity': 90})
                tracks_data['drums']['events'].append({'type': 'noteoff', 'note': 38, 'time': time + 0.5, 'velocity': 0})
                track_info['drums']['notes'] += 1
            
            for beat in drum_pattern['hihat']:
                tick = bar_start_tick + int(beat * ticks_per_beat)
                time = bar_start_beat + beat
                events[0].append((tick, 'note_on', 9, 42, 70))
                events[0].append((tick + int(0.25 * ticks_per_beat), 'note_off', 9, 42, 0))
                tracks_data['drums']['events'].append({'type': 'noteon', 'note': 42, 'time': time, 'velocity': 70})
                tracks_data['drums']['events'].append({'type': 'noteoff', 'note': 42, 'time': time + 0.25, 'velocity': 0})
                track_info['drums']['notes'] += 1
            
            bass_root = chord_notes[0] - 24
            bass_pattern = self.bass_patterns[style][pattern_idx]
            for i, beat in enumerate(bass_pattern):
                if style == 'jazz':
                    note = bass_root + (i % 4) * 2
                elif style == 'rock':
                    note = bass_root
                else:
                    note = bass_root + (i % 3) * 2
                tick = bar_start_tick + int(beat * ticks_per_beat)
                time = bar_start_beat + beat
                events[1].append((tick, 'note_on', 0, note, 85))
                events[1].append((tick + int(0.5 * ticks_per_beat), 'note_off', 0, note, 0))
                tracks_data['bass']['events'].append({'type': 'noteon', 'note': note, 'time': time, 'velocity': 85})
                tracks_data['bass']['events'].append({'type': 'noteoff', 'note': note, 'time': time + 0.5, 'velocity': 0})
                track_info['bass']['notes'] += 1
            
            piano_pattern = self.piano_patterns[style][pattern_idx]
            for beat in piano_pattern:
                for i, note in enumerate(chord_notes):
                    if style == 'jazz':
                        offset = random.randint(-1, 1) * 0.1
                        duration = 0.7
                    elif style == 'rock':
                        offset = 0
                        duration = 0.5
                    else:
                        offset = i * 0.05
                        duration = 1.0
                    tick = bar_start_tick + int((beat + offset) * ticks_per_beat)
                    time = bar_start_beat + beat + offset
                    events[2].append((max(bar_start_tick, tick), 'note_on', 0, note, 75))
                    events[2].append((max(bar_start_tick, tick) + int(duration * ticks_per_beat), 'note_off', 0, note, 0))
                    tracks_data['piano']['events'].append({'type': 'noteon', 'note': note, 'time': max(0, time), 'velocity': 75})
                    tracks_data['piano']['events'].append({'type': 'noteoff', 'note': note, 'time': max(0, time) + duration, 'velocity': 0})
                    track_info['piano']['notes'] += 1
        
        midi = SimpleMIDI(3)
        for track_idx, track_events in enumerate(events):
            track_events.sort(key=lambda x: x[0])
            last_tick = 0
            for event in track_events:
                tick = event[0]
                delta = tick - last_tick
                if event[1] == 'tempo':
                    midi.set_tempo(track_idx, delta, event[2])
                elif event[1] == 'program':
                    midi.program_change(track_idx, delta, event[2], event[3])
                elif event[1] == 'note_on':
                    midi.note_on(track_idx, delta, event[2], event[3], event[4])
                elif event[1] == 'note_off':
                    midi.note_off(track_idx, delta, event[2], event[3], event[4])
                last_tick = tick
        
        midi_data = midi.to_bytes()
        return midi_data, track_info, tracks_data

generator = LSTMAccompanimentGenerator()
