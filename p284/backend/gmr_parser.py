import numpy as np
from bitarray import bitarray
from typing import List, Dict, Tuple, Optional
import struct
import math

from bch_soft import (
    BCHSoftDecisionDecoder,
    FLWCorrelator,
    LQICalculator,
    ErrorStatistics,
    ErrorStatEntry
)


class GMRConstants:
    SYMBOL_RATE = 38400

    SUPERFRAME_MULTIFRAMES = 36
    MULTIFRAME_BASIC_FRAMES = 32
    BASIC_FRAME_TIMESLOTS = 24

    SYNC_WORD = bitarray('0110111000100101')
    SYNC_WORD_LENGTH = 16

    BCH_CODE_LENGTH = 63
    BCH_INFO_LENGTH = 51
    BCH_PARITY_LENGTH = 12
    BCH_CODES_PER_FRAME = 4

    TIMESLOT_LENGTH = 50
    TIMESLOT_PAYLOAD_LENGTH = 40

    BASIC_FRAME_SIZE = SYNC_WORD_LENGTH + BCH_CODES_PER_FRAME * BCH_CODE_LENGTH + BASIC_FRAME_TIMESLOTS * TIMESLOT_LENGTH
    MULTIFRAME_SIZE = MULTIFRAME_BASIC_FRAMES * BASIC_FRAME_SIZE
    SUPERFRAME_SIZE = SUPERFRAME_MULTIFRAMES * MULTIFRAME_SIZE


class BCHCodec:
    def __init__(self):
        self.n = 63
        self.k = 51
        self.t = 2

        self.gen_poly = self._build_gen_poly()

    def _build_gen_poly(self):
        return [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]

    def encode(self, data: bitarray) -> bitarray:
        if len(data) != self.k:
            raise ValueError(f"Data must be {self.k} bits long, got {len(data)}")

        codeword = bitarray([False] * self.n)
        for i in range(self.k):
            codeword[i] = data[i]

        for i in range(self.k):
            if codeword[i]:
                for j in range(len(self.gen_poly)):
                    if i + j < self.n:
                        codeword[i + j] ^= bool(self.gen_poly[j])

        for i in range(self.k):
            codeword[i] = data[i]

        return codeword

    def decode(self, received: bitarray) -> Tuple[bitarray, int, bool]:
        if len(received) != self.n:
            raise ValueError(f"Received code must be {self.n} bits long")

        r = bitarray(received)

        for i in range(self.k):
            if r[i]:
                for j in range(len(self.gen_poly)):
                    if i + j < self.n:
                        r[i + j] ^= bool(self.gen_poly[j])

        parity_errors = sum(1 for b in r[self.k:] if b)

        if parity_errors == 0:
            return received[:self.k], 0, True
        elif parity_errors <= self.t:
            best_data = None
            best_errors = float('inf')

            for pos1 in range(self.n):
                test_data = bitarray(received)
                test_data[pos1] = not test_data[pos1]
                errors = 1

                r_test = bitarray(test_data)
                for i in range(self.k):
                    if r_test[i]:
                        for j in range(len(self.gen_poly)):
                            if i + j < self.n:
                                r_test[i + j] ^= bool(self.gen_poly[j])

                if sum(1 for b in r_test[self.k:] if b) == 0:
                    if errors < best_errors:
                        best_errors = errors
                        best_data = test_data[:self.k]

                for pos2 in range(pos1 + 1, self.n):
                    test_data2 = bitarray(received)
                    test_data2[pos1] = not test_data2[pos1]
                    test_data2[pos2] = not test_data2[pos2]
                    errors = 2

                    r_test2 = bitarray(test_data2)
                    for i in range(self.k):
                        if r_test2[i]:
                            for j in range(len(self.gen_poly)):
                                if i + j < self.n:
                                    r_test2[i + j] ^= bool(self.gen_poly[j])

                    if sum(1 for b in r_test2[self.k:] if b) == 0:
                        if errors < best_errors:
                            best_errors = errors
                            best_data = test_data2[:self.k]

            if best_data is not None and best_errors <= self.t:
                return best_data, best_errors, True
            else:
                return received[:self.k], -1, False
        else:
            return received[:self.k], -1, False


class Timeslot:
    def __init__(self, index: int, data: bitarray, slot_type: str = 'unknown'):
        self.index = index
        self.data = data
        self.slot_type = slot_type
        self.is_occupied = len(data) > 0 and any(data)
        self.bch_errors = 0
        self.bch_valid = False
        self.bch_soft_errors = -1
        self.bch_soft_valid = False
        self.bch_soft_euclidean = -1.0
        self.bch_soft_info = {}

    def to_dict(self) -> Dict:
        return {
            'index': self.index,
            'type': self.slot_type,
            'occupied': self.is_occupied,
            'bch_errors': self.bch_errors,
            'bch_valid': self.bch_valid,
            'bch_soft_errors': self.bch_soft_errors,
            'bch_soft_valid': self.bch_soft_valid,
            'bch_soft_euclidean': self.bch_soft_euclidean,
            'payload_length': len(self.data)
        }


class BasicFrame:
    def __init__(self, index: int, data: bitarray):
        self.index = index
        self.raw_data = data
        self.sync_word = None
        self.sync_detected = False
        self.sync_position = -1
        self.timeslots: List[Timeslot] = []
        self.bch_codes: List[bitarray] = []
        self.bch_codec = BCHCodec()
        self.flw_correlator = FLWCorrelator(GMRConstants.SYNC_WORD)
        self.flw_result: Dict = {}
        self.correlation_peak = 0.0
        self.correlation_normalized = 0.0
        self.bch_soft_decoder = BCHSoftDecisionDecoder()

    def parse(self, use_flw: bool = True, use_soft: bool = True) -> None:
        if use_flw:
            self._detect_sync_flw()
        else:
            self._detect_sync()
        if self.sync_detected:
            self._extract_bch_codes()
            self._extract_timeslots(use_soft)

    def _detect_sync_flw(self) -> None:
        result = self.flw_correlator.correlate(self.raw_data)
        self.flw_result = result
        if result['found']:
            self.sync_word = self.raw_data[result['position']:
                                           result['position'] + GMRConstants.SYNC_WORD_LENGTH]
            self.sync_detected = True
            self.sync_position = result['position']
            self.correlation_peak = result['correlation_peak']
            self.correlation_normalized = result['correlation_normalized']
        else:
            if result['correlation_peak'] > 0:
                self.sync_word = self.raw_data[result['position']:
                                               result['position'] + GMRConstants.SYNC_WORD_LENGTH]
                self.sync_detected = True
                self.sync_position = result['position']
                self.correlation_peak = result['correlation_peak']
                self.correlation_normalized = result['correlation_normalized']
            else:
                self._detect_sync()
                if self.sync_detected:
                    self.correlation_peak = float(
                        sum(1 for j in range(GMRConstants.SYNC_WORD_LENGTH)
                            if self.raw_data[self.sync_position + j] == GMRConstants.SYNC_WORD[j]))
                    self.correlation_normalized = self.correlation_peak / GMRConstants.SYNC_WORD_LENGTH

    def _detect_sync(self) -> None:
        sync_word = GMRConstants.SYNC_WORD
        window = len(sync_word)

        for i in range(len(self.raw_data) - window + 1):
            if self.raw_data[i:i + window] == sync_word:
                self.sync_word = sync_word
                self.sync_detected = True
                self.sync_position = i
                break

        if not self.sync_detected:
            best_match = 0
            best_pos = -1
            for i in range(len(self.raw_data) - window + 1):
                match = sum(1 for j in range(window)
                            if self.raw_data[i + j] == sync_word[j])
                if match > best_match:
                    best_match = match
                    best_pos = i
            if best_match >= 12:
                self.sync_word = self.raw_data[best_pos:best_pos + window]
                self.sync_detected = True
                self.sync_position = best_pos

    def _extract_bch_codes(self) -> None:
        bch_length = GMRConstants.BCH_CODE_LENGTH
        start_pos = self.sync_position + GMRConstants.SYNC_WORD_LENGTH

        for i in range(4):
            bch_start = start_pos + i * bch_length
            if bch_start + bch_length <= len(self.raw_data):
                bch_data = self.raw_data[bch_start:bch_start + bch_length]
                self.bch_codes.append(bch_data)

    def _extract_timeslots(self, use_soft: bool = True) -> None:
        ts_length = GMRConstants.TIMESLOT_LENGTH
        ts_count = GMRConstants.BASIC_FRAME_TIMESLOTS
        bch_total_length = 4 * GMRConstants.BCH_CODE_LENGTH
        start_pos = self.sync_position + GMRConstants.SYNC_WORD_LENGTH + bch_total_length

        for i in range(ts_count):
            ts_start = start_pos + i * ts_length
            ts_end = ts_start + ts_length

            if ts_end <= len(self.raw_data):
                ts_data = self.raw_data[ts_start:ts_end]
                slot_type = self._classify_timeslot(i, ts_data)
                timeslot = Timeslot(i, ts_data, slot_type)

                if len(ts_data) >= GMRConstants.BCH_CODE_LENGTH:
                    try:
                        _, errors, valid = self.bch_codec.decode(
                            ts_data[:GMRConstants.BCH_CODE_LENGTH])
                        timeslot.bch_errors = errors
                        timeslot.bch_valid = valid
                    except:
                        timeslot.bch_errors = -1
                        timeslot.bch_valid = False

                    if use_soft:
                        try:
                            soft_syms = self._bits_to_soft(ts_data[:GMRConstants.BCH_CODE_LENGTH])
                            decoded_s, errs_s, valid_s, dist_s, info_s = \
                                self.bch_soft_decoder.decode_soft(soft_syms)
                            timeslot.bch_soft_errors = errs_s
                            timeslot.bch_soft_valid = valid_s
                            timeslot.bch_soft_euclidean = round(dist_s, 4)
                            timeslot.bch_soft_info = info_s
                        except:
                            timeslot.bch_soft_errors = -1
                            timeslot.bch_soft_valid = False
                            timeslot.bch_soft_euclidean = -1.0

                self.timeslots.append(timeslot)
            else:
                self.timeslots.append(Timeslot(i, bitarray(), 'empty'))

    def _bits_to_soft(self, bits: bitarray, snr_db: float = 20.0) -> np.ndarray:
        soft = np.zeros(len(bits))
        sigma = 1.0 / math.sqrt(10 ** (snr_db / 10.0))
        for i, b in enumerate(bits):
            symbol = 1.0 if b else -1.0
            noise = np.random.normal(0, sigma * 0.1)
            soft[i] = symbol + noise
        return soft

    def _classify_timeslot(self, index: int, data: bitarray) -> str:
        if index in [0, 1, 2]:
            return 'signaling'
        elif index in [22, 23]:
            return 'guard'
        elif any(data):
            return 'traffic'
        else:
            return 'idle'

    def to_dict(self) -> Dict:
        return {
            'index': self.index,
            'sync_detected': self.sync_detected,
            'sync_position': self.sync_position,
            'correlation_peak': round(self.correlation_peak, 4),
            'correlation_normalized': round(self.correlation_normalized, 4),
            'flw_result': {
                'found': self.flw_result.get('found', False),
                'position': self.flw_result.get('position', -1),
                'correlation_peak': self.flw_result.get('correlation_peak', 0),
                'correlation_normalized': self.flw_result.get('correlation_normalized', 0),
                'correlation_values': self.flw_result.get('correlation_values', [])[:5]
            },
            'timeslot_count': len(self.timeslots),
            'occupied_timeslots': sum(1 for ts in self.timeslots if ts.is_occupied),
            'bch_count': len(self.bch_codes),
            'timeslots': [ts.to_dict() for ts in self.timeslots]
        }


class Multiframe:
    def __init__(self, index: int, data: bitarray):
        self.index = index
        self.raw_data = data
        self.basic_frames: List[BasicFrame] = []
        self.sync_status = 'searching'
        self.lqi = None

    def parse(self, use_flw: bool = True, use_soft: bool = True) -> None:
        frame_size = GMRConstants.BASIC_FRAME_SIZE
        frame_count = GMRConstants.MULTIFRAME_BASIC_FRAMES

        for i in range(frame_count):
            start = i * frame_size
            end = start + frame_size
            if end <= len(self.raw_data):
                frame_data = self.raw_data[start:end]
                bf = BasicFrame(i, frame_data)
                bf.parse(use_flw=use_flw, use_soft=use_soft)
                self.basic_frames.append(bf)

        self._calculate_sync_status()

    def _calculate_sync_status(self) -> None:
        synced_frames = sum(1 for bf in self.basic_frames if bf.sync_detected)
        total_frames = len(self.basic_frames)

        if total_frames == 0:
            self.sync_status = 'searching'
        elif synced_frames >= total_frames * 0.9:
            self.sync_status = 'locked'
        elif synced_frames >= total_frames * 0.5:
            self.sync_status = 'acquiring'
        else:
            self.sync_status = 'searching'

    def get_timeslot_occupancy(self) -> List[List[bool]]:
        occupancy = []
        for bf in self.basic_frames:
            row = [ts.is_occupied for ts in bf.timeslots]
            occupancy.append(row)
        return occupancy

    def to_dict(self) -> Dict:
        return {
            'index': self.index,
            'sync_status': self.sync_status,
            'basic_frame_count': len(self.basic_frames),
            'synced_frames': sum(1 for bf in self.basic_frames if bf.sync_detected),
            'basic_frames': [bf.to_dict() for bf in self.basic_frames],
            'timeslot_occupancy': self.get_timeslot_occupancy()
        }


class Superframe:
    def __init__(self, data: bitarray):
        self.raw_data = data
        self.multiframes: List[Multiframe] = []
        self.sync_status = 'searching'
        self.frame_number = 0

    def parse(self, use_flw: bool = True, use_soft: bool = True) -> None:
        mf_size = GMRConstants.MULTIFRAME_SIZE
        mf_count = GMRConstants.SUPERFRAME_MULTIFRAMES

        for i in range(mf_count):
            start = i * mf_size
            end = start + mf_size
            if end <= len(self.raw_data):
                mf_data = self.raw_data[start:end]
                mf = Multiframe(i, mf_data)
                mf.parse(use_flw=use_flw, use_soft=use_soft)
                self.multiframes.append(mf)

        self._calculate_sync_status()

    def _calculate_sync_status(self) -> None:
        statuses = [mf.sync_status for mf in self.multiframes]
        locked_count = statuses.count('locked')
        acquiring_count = statuses.count('acquiring')

        if locked_count >= len(statuses) * 0.8:
            self.sync_status = 'locked'
        elif locked_count + acquiring_count >= len(statuses) * 0.5:
            self.sync_status = 'acquiring'
        else:
            self.sync_status = 'searching'

    def get_combined_timeslot_occupancy(self) -> Dict:
        result = {
            'superframe_index': self.frame_number,
            'multiframes': []
        }

        for mf in self.multiframes:
            mf_data = {
                'multiframe_index': mf.index,
                'sync_status': mf.sync_status,
                'occupancy': mf.get_timeslot_occupancy()
            }
            result['multiframes'].append(mf_data)

        return result

    def to_dict(self) -> Dict:
        return {
            'sync_status': self.sync_status,
            'multiframe_count': len(self.multiframes),
            'locked_multiframes': sum(1 for mf in self.multiframes if mf.sync_status == 'locked'),
            'multiframes': [mf.to_dict() for mf in self.multiframes],
            'combined_occupancy': self.get_combined_timeslot_occupancy()
        }


class GMRParser:
    def __init__(self):
        self.bch_codec = BCHCodec()
        self.bch_soft_decoder = BCHSoftDecisionDecoder()
        self.flw_correlator = FLWCorrelator(GMRConstants.SYNC_WORD)
        self.lqi_calculator = LQICalculator(GMRConstants.SYNC_WORD)
        self.error_stats = ErrorStatistics()
        self.current_superframe = None
        self.current_lqi = None
        self.frame_counter = 0

    def parse_bytes(self, raw_bytes: bytes, use_flw: bool = True,
                    use_soft: bool = True) -> Superframe:
        bits = bitarray()
        bits.frombytes(raw_bytes)
        return self.parse_bitarray(bits, use_flw=use_flw, use_soft=use_soft)

    def parse_bitarray(self, bits: bitarray, use_flw: bool = True,
                       use_soft: bool = True, calculate_lqi: bool = True,
                       collect_errors: bool = True) -> Superframe:
        if len(bits) < GMRConstants.MULTIFRAME_SIZE:
            padding = bitarray(
                GMRConstants.MULTIFRAME_SIZE - len(bits))
            padding.setall(0)
            bits.extend(padding)

        if len(bits) < GMRConstants.SUPERFRAME_SIZE:
            repeat = (GMRConstants.SUPERFRAME_SIZE // len(bits)) + 1
            bits = bits * repeat
            bits = bits[:GMRConstants.SUPERFRAME_SIZE]
        else:
            bits = bits[:GMRConstants.SUPERFRAME_SIZE]

        sf = Superframe(bits)
        sf.frame_number = self.frame_counter
        sf.parse(use_flw=use_flw, use_soft=use_soft)

        self.current_superframe = sf
        self.frame_counter += 1

        if calculate_lqi:
            self._calculate_lqi_for_superframe(sf)

        if collect_errors:
            self._collect_error_statistics(sf)

        return sf

    def _calculate_lqi_for_superframe(self, sf: Superframe) -> None:
        bch_stats = self._collect_bch_stats(sf)
        total_bits = GMRConstants.SUPERFRAME_SIZE
        total_errors = 0
        corrected_count = 0
        valid_count = 0
        total_count = 0

        for mf in sf.multiframes:
            for bf in mf.basic_frames:
                for ts in bf.timeslots:
                    if ts.bch_errors >= 0:
                        total_count += 1
                        if ts.bch_valid:
                            valid_count += 1
                        if ts.bch_errors > 0 and ts.bch_valid:
                            corrected_count += 1
                        if ts.bch_errors > 0:
                            total_errors += ts.bch_errors

        bch_summary = {
            'total': total_count,
            'valid': valid_count,
            'corrected': corrected_count,
            'total_errors': total_errors
        }

        if len(sf.raw_data) >= GMRConstants.BASIC_FRAME_SIZE:
            frame_sample = sf.raw_data[:GMRConstants.BASIC_FRAME_SIZE]
            self.current_lqi = self.lqi_calculator.calculate(
                frame_sample,
                bch_stats=bch_summary,
                sync_status=sf.sync_status
            )

        for mf in sf.multiframes:
            mf_bch = self._collect_bch_stats_for_multiframe(mf)
            if len(mf.raw_data) >= GMRConstants.BASIC_FRAME_SIZE:
                mf_sample = mf.raw_data[:GMRConstants.BASIC_FRAME_SIZE]
                mf.lqi = self.lqi_calculator.calculate(
                    mf_sample,
                    bch_stats=mf_bch,
                    sync_status=mf.sync_status
                )

    def _collect_bch_stats(self, sf: Superframe) -> Dict:
        total = 0
        valid = 0
        corrected = 0
        for mf in sf.multiframes:
            for bf in mf.basic_frames:
                for ts in bf.timeslots:
                    total += 1
                    if ts.bch_valid:
                        valid += 1
                    if ts.bch_errors > 0 and ts.bch_valid:
                        corrected += 1
        return {'total': total, 'valid': valid, 'corrected': corrected}

    def _collect_bch_stats_for_multiframe(self, mf: 'Multiframe') -> Dict:
        total = 0
        valid = 0
        corrected = 0
        for bf in mf.basic_frames:
            for ts in bf.timeslots:
                total += 1
                if ts.bch_valid:
                    valid += 1
                if ts.bch_errors > 0 and ts.bch_valid:
                    corrected += 1
        return {'total': total, 'valid': valid, 'corrected': corrected}

    def _collect_error_statistics(self, sf: Superframe) -> None:
        has_any_error = False
        total_bits = 0
        total_errors = 0

        for mf in sf.multiframes:
            for bf in mf.basic_frames:
                for ts in bf.timeslots:
                    total_bits += len(ts.data)
                    if ts.bch_errors > 0:
                        total_errors += ts.bch_errors
                        if not ts.bch_valid:
                            has_any_error = True
                            entry = ErrorStatEntry(
                                multiframe=mf.index,
                                basic_frame=bf.index,
                                timeslot=ts.index,
                                bch_index=None,
                                error_type='bch_uncorrectable',
                                bit_errors=ts.bch_errors,
                                error_rate=ts.bch_errors / max(len(ts.data), 1)
                            )
                            self.error_stats.add_entry(entry)
                        elif ts.bch_errors > 0:
                            entry = ErrorStatEntry(
                                multiframe=mf.index,
                                basic_frame=bf.index,
                                timeslot=ts.index,
                                bch_index=None,
                                error_type='bch_corrected',
                                bit_errors=ts.bch_errors,
                                error_rate=ts.bch_errors / max(len(ts.data), 1)
                            )
                            self.error_stats.add_entry(entry)

                for i, bch in enumerate(bf.bch_codes):
                    try:
                        _, errors, valid = self.bch_codec.decode(bch)
                        if errors > 0 and not valid:
                            entry = ErrorStatEntry(
                                multiframe=mf.index,
                                basic_frame=bf.index,
                                timeslot=None,
                                bch_index=i,
                                error_type='bch_header_uncorrectable',
                                bit_errors=errors,
                                error_rate=errors / GMRConstants.BCH_CODE_LENGTH
                            )
                            self.error_stats.add_entry(entry)
                        elif errors > 0 and valid:
                            entry = ErrorStatEntry(
                                multiframe=mf.index,
                                basic_frame=bf.index,
                                timeslot=None,
                                bch_index=i,
                                error_type='bch_header_corrected',
                                bit_errors=errors,
                                error_rate=errors / GMRConstants.BCH_CODE_LENGTH
                            )
                            self.error_stats.add_entry(entry)
                    except:
                        pass

        if not bf.sync_detected:
            has_any_error = True
            entry = ErrorStatEntry(
                multiframe=mf.index,
                basic_frame=bf.index,
                timeslot=None,
                bch_index=None,
                error_type='sync_lost',
                bit_errors=0,
                error_rate=0.0
            )
            self.error_stats.add_entry(entry)

        self.error_stats.record_frame(
            has_error=has_any_error,
            bit_count=total_bits,
            error_count=total_errors
        )

    def parse_hex_string(self, hex_str: str, use_flw: bool = True,
                         use_soft: bool = True) -> Superframe:
        hex_str = hex_str.replace(' ', '').replace('\n', '')
        raw_bytes = bytes.fromhex(hex_str)
        return self.parse_bytes(raw_bytes, use_flw=use_flw, use_soft=use_soft)

    def get_sync_status(self) -> Dict:
        if self.current_superframe is None:
            return {'status': 'no_data', 'details': 'No frame parsed yet'}

        return {
            'superframe_status': self.current_superframe.sync_status,
            'superframe_number': self.current_superframe.frame_number,
            'multiframe_statuses': [
                {
                    'index': mf.index,
                    'status': mf.sync_status,
                    'synced_basic_frames': sum(1 for bf in mf.basic_frames if bf.sync_detected)
                }
                for mf in self.current_superframe.multiframes
            ]
        }

    def extract_bch_codes(self) -> List[Dict]:
        if self.current_superframe is None:
            return []

        bch_data = []
        for mf in self.current_superframe.multiframes:
            for bf in mf.basic_frames:
                for i, bch in enumerate(bf.bch_codes):
                    try:
                        decoded, errors, valid = self.bch_codec.decode(bch)
                        soft_decoded = None
                        soft_valid = None
                        soft_errors = None
                        soft_euclidean = None
                        soft_info = {}
                        try:
                            soft_syms = self.bch_soft_decoder.hard_to_soft(bch, snr_db=20.0)
                            sd, se, sv, sed, sei = self.bch_soft_decoder.decode_soft(soft_syms)
                            soft_decoded = sd.to01()
                            soft_valid = sv
                            soft_errors = se
                            soft_euclidean = round(sed, 4)
                            soft_info = sei
                        except:
                            pass

                        bch_data.append({
                            'multiframe': mf.index,
                            'basic_frame': bf.index,
                            'bch_index': i,
                            'data': bch.to01(),
                            'decoded': decoded.to01(),
                            'errors': errors,
                            'valid': valid,
                            'soft_decoded': soft_decoded,
                            'soft_valid': soft_valid,
                            'soft_errors': soft_errors,
                            'soft_euclidean': soft_euclidean,
                            'soft_improvement': soft_info.get('soft_improvement', False)
                        })
                    except:
                        bch_data.append({
                            'multiframe': mf.index,
                            'basic_frame': bf.index,
                            'bch_index': i,
                            'data': bch.to01(),
                            'decoded': '',
                            'errors': -1,
                            'valid': False,
                            'soft_decoded': None,
                            'soft_valid': None,
                            'soft_errors': None,
                            'soft_euclidean': None,
                            'soft_improvement': False
                        })
        return bch_data

    def extract_flw_correlations(self) -> List[Dict]:
        if self.current_superframe is None:
            return []

        flw_data = []
        for mf in self.current_superframe.multiframes:
            for bf in mf.basic_frames:
                flw_data.append({
                    'multiframe': mf.index,
                    'basic_frame': bf.index,
                    'sync_detected': bf.sync_detected,
                    'correlation_peak': round(bf.correlation_peak, 4),
                    'correlation_normalized': round(bf.correlation_normalized, 4),
                    'flw_found': bf.flw_result.get('found', False),
                    'flw_position': bf.flw_result.get('position', -1),
                    'flw_peak': bf.flw_result.get('correlation_peak', 0),
                    'flw_normalized': bf.flw_result.get('correlation_normalized', 0)
                })
        return flw_data

    def extract_soft_decode_stats(self) -> Dict:
        if self.current_superframe is None:
            return {}

        hard_valid = 0
        hard_invalid = 0
        soft_valid = 0
        soft_invalid = 0
        soft_improved = 0
        soft_euclidean_sum = 0.0
        soft_euclidean_count = 0

        for mf in self.current_superframe.multiframes:
            for bf in mf.basic_frames:
                for ts in bf.timeslots:
                    if ts.bch_valid:
                        hard_valid += 1
                    else:
                        hard_invalid += 1
                    if ts.bch_soft_valid:
                        soft_valid += 1
                    else:
                        soft_invalid += 1
                    if not ts.bch_valid and ts.bch_soft_valid:
                        soft_improved += 1
                    if ts.bch_soft_euclidean >= 0:
                        soft_euclidean_sum += ts.bch_soft_euclidean
                        soft_euclidean_count += 1

        return {
            'hard_valid': hard_valid,
            'hard_invalid': hard_invalid,
            'soft_valid': soft_valid,
            'soft_invalid': soft_invalid,
            'soft_improved': soft_improved,
            'soft_euclidean_avg': round(soft_euclidean_sum / soft_euclidean_count, 4) if soft_euclidean_count > 0 else 0,
            'soft_gain_pct': round(soft_improved / max(hard_invalid, 1) * 100, 2)
        }

    def get_lqi(self) -> Optional[Dict]:
        if self.current_lqi is None:
            return None
        return self.current_lqi.to_dict()

    def get_lqi_history(self, count: int = 10) -> List[Dict]:
        return self.lqi_calculator.get_history(count)

    def get_lqi_statistics(self) -> Dict:
        return self.lqi_calculator.get_statistics()

    def get_error_summary(self) -> Dict:
        return self.error_stats.get_summary()

    def get_error_entries(self, limit: int = 100) -> List[Dict]:
        entries = self.error_stats.entries[-limit:]
        return [e.to_dict() for e in entries]

    def get_error_distribution(self) -> Dict:
        return self.error_stats.get_error_distribution()

    def export_error_csv(self, limit: int = 1000) -> str:
        return self.error_stats.export_csv(limit)

    def export_error_json(self, limit: int = 1000) -> str:
        return self.error_stats.export_json(limit)

    def clear_error_stats(self) -> None:
        self.error_stats.clear()
        self.lqi_calculator.history.clear()
        self.current_lqi = None

    def extract_traffic_timeslots(self) -> List[Dict]:
        if self.current_superframe is None:
            return []

        traffic_slots = []
        for mf in self.current_superframe.multiframes:
            for bf in mf.basic_frames:
                for ts in bf.timeslots:
                    if ts.slot_type == 'traffic' and ts.is_occupied:
                        traffic_slots.append({
                            'multiframe': mf.index,
                            'basic_frame': bf.index,
                            'timeslot': ts.index,
                            'data': ts.data.to01(),
                            'bch_valid': ts.bch_valid,
                            'bch_errors': ts.bch_errors
                        })
        return traffic_slots
