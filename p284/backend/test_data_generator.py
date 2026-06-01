import numpy as np
from bitarray import bitarray
import random
from typing import Tuple

from gmr_parser import GMRConstants, BCHCodec


class TestDataGenerator:
    def __init__(self):
        self.bch_codec = BCHCodec()
        self.rng = random.Random(42)

    def generate_superframe(self, occupancy_rate: float = 0.6,
                            error_rate: float = 0.01) -> bitarray:
        sf_bits = bitarray()

        for mf_idx in range(GMRConstants.SUPERFRAME_MULTIFRAMES):
            mf_bits = self._generate_multiframe(mf_idx, occupancy_rate, error_rate)
            sf_bits.extend(mf_bits)

        return sf_bits

    def _generate_multiframe(self, mf_index: int, occupancy_rate: float,
                             error_rate: float) -> bitarray:
        mf_bits = bitarray()

        for bf_idx in range(GMRConstants.MULTIFRAME_BASIC_FRAMES):
            bf_bits = self._generate_basic_frame(
                mf_index, bf_idx, occupancy_rate, error_rate)
            mf_bits.extend(bf_bits)

        return mf_bits

    def _generate_basic_frame(self, mf_index: int, bf_index: int,
                              occupancy_rate: float, error_rate: float) -> bitarray:
        bf_bits = bitarray(GMRConstants.BASIC_FRAME_SIZE)
        bf_bits.setall(0)

        sync_pos = 0
        bf_bits[sync_pos:sync_pos + GMRConstants.SYNC_WORD_LENGTH] = GMRConstants.SYNC_WORD

        bch_start = sync_pos + GMRConstants.SYNC_WORD_LENGTH
        for i in range(4):
            bch_data = self._generate_bch_code(mf_index, bf_index, i)
            bch_pos = bch_start + i * GMRConstants.BCH_CODE_LENGTH
            bf_bits[bch_pos:bch_pos + GMRConstants.BCH_CODE_LENGTH] = bch_data

        ts_start = bch_start + 4 * GMRConstants.BCH_CODE_LENGTH
        for ts_idx in range(GMRConstants.BASIC_FRAME_TIMESLOTS):
            ts_pos = ts_start + ts_idx * GMRConstants.TIMESLOT_LENGTH
            ts_data = self._generate_timeslot(ts_idx, occupancy_rate)
            bf_bits[ts_pos:ts_pos + GMRConstants.TIMESLOT_LENGTH] = ts_data

        if error_rate > 0:
            self._add_errors(bf_bits, error_rate)

        return bf_bits

    def _generate_bch_code(self, mf_index: int, bf_index: int, bch_index: int) -> bitarray:
        info_bits = bitarray()
        for i in range(GMRConstants.BCH_INFO_LENGTH):
            bit_val = (mf_index + bf_index + bch_index + i) % 2 == 0
            info_bits.append(bit_val)

        return self.bch_codec.encode(info_bits)

    def _generate_timeslot(self, ts_index: int, occupancy_rate: float) -> bitarray:
        ts_data = bitarray()
        ts_data.setall(0)
        ts_data.extend(bitarray(GMRConstants.TIMESLOT_LENGTH))

        if ts_index in [0, 1, 2]:
            for i in range(GMRConstants.TIMESLOT_LENGTH):
                ts_data[i] = (i + ts_index) % 2 == 0
        elif ts_index in [22, 23]:
            pass
        else:
            if self.rng.random() < occupancy_rate:
                for i in range(GMRConstants.TIMESLOT_LENGTH):
                    ts_data[i] = self.rng.random() < 0.5

        return ts_data

    def _add_errors(self, bits: bitarray, error_rate: float) -> None:
        for i in range(len(bits)):
            if self.rng.random() < error_rate:
                bits[i] = not bits[i]

    def generate_hex_superframe(self, occupancy_rate: float = 0.6,
                                error_rate: float = 0.01) -> str:
        bits = self.generate_superframe(occupancy_rate, error_rate)
        return bits.tobytes().hex()

    def generate_short_test_frame(self) -> bitarray:
        bits = bitarray()

        sync_pos = 0
        bits[sync_pos:sync_pos + GMRConstants.SYNC_WORD_LENGTH] = GMRConstants.SYNC_WORD

        bch_start = sync_pos + GMRConstants.SYNC_WORD_LENGTH
        for i in range(4):
            info = bitarray('1' * GMRConstants.BCH_INFO_LENGTH)
            bch = self.bch_codec.encode(info)
            bch_pos = bch_start + i * GMRConstants.BCH_CODE_LENGTH
            bits[bch_pos:bch_pos + GMRConstants.BCH_CODE_LENGTH] = bch

        ts_start = bch_start + 4 * GMRConstants.BCH_CODE_LENGTH
        for ts_idx in range(GMRConstants.BASIC_FRAME_TIMESLOTS):
            ts_pos = ts_start + ts_idx * GMRConstants.TIMESLOT_LENGTH
            ts_data = bitarray()
            if ts_idx in [3, 5, 7, 10, 15, 20]:
                for i in range(GMRConstants.TIMESLOT_LENGTH):
                    ts_data.append((i + ts_idx) % 2 == 0)
            else:
                ts_data.extend(bitarray(GMRConstants.TIMESLOT_LENGTH))
            bits[ts_pos:ts_pos + GMRConstants.TIMESLOT_LENGTH] = ts_data

        return bits

    def save_to_file(self, bits: bitarray, filename: str) -> None:
        with open(filename, 'wb') as f:
            f.write(bits.tobytes())

    def load_from_file(self, filename: str) -> bitarray:
        bits = bitarray()
        with open(filename, 'rb') as f:
            bits.fromfile(f)
        return bits
