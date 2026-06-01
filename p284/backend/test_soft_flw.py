import unittest
import numpy as np
from bitarray import bitarray
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from bch_soft import BCHSoftDecisionDecoder, FLWCorrelator
from gmr_parser import GMRConstants, GMRParser


class TestBCHSoftDecisionDecoder(unittest.TestCase):
    def setUp(self):
        self.decoder = BCHSoftDecisionDecoder(n=63, k=51, t=2, chase_depth=4)

    def test_encode_produces_valid_codeword(self):
        data = bitarray([False] * 51)
        data[0] = True
        data[5] = True
        codeword = self.decoder.encode(data)
        self.assertEqual(len(codeword), 63)
        self.assertEqual(codeword[:51], data)
        self.assertTrue(self.decoder._is_valid_codeword(codeword))

    def test_soft_decode_no_errors(self):
        data = bitarray([False] * 51)
        data[0] = True
        data[10] = True
        data[20] = True
        codeword = self.decoder.encode(data)
        soft = self.decoder.hard_to_soft(codeword, snr_db=30.0)
        decoded, errors, valid, dist, info = self.decoder.decode_soft(soft)
        self.assertTrue(valid)
        self.assertEqual(decoded, data)

    def test_soft_decode_with_noise(self):
        data = bitarray([False] * 51)
        data[0] = True
        data[10] = True
        codeword = self.decoder.encode(data)
        soft = self.decoder.hard_to_soft(codeword, snr_db=6.0)
        decoded, errors, valid, dist, info = self.decoder.decode_soft(soft)
        self.assertTrue(valid)

    def test_euclidean_distance_calculation(self):
        codeword = bitarray([True] * 63)
        soft = np.ones(63)
        dist = self.decoder._euclidean_distance(soft, codeword)
        self.assertAlmostEqual(dist, 0.0, places=5)

        soft2 = -np.ones(63)
        dist2 = self.decoder._euclidean_distance(soft2, codeword)
        self.assertAlmostEqual(dist2, 4.0 * 63, places=5)

    def test_hard_to_soft_mapping(self):
        bits = bitarray([True, False, True, False])
        soft = self.decoder.hard_to_soft(bits, snr_db=100.0)
        self.assertEqual(len(soft), 4)
        self.assertGreater(soft[0], 0)
        self.assertLess(soft[1], 0)
        self.assertGreater(soft[2], 0)
        self.assertLess(soft[3], 0)

    def test_chase_patterns_generated(self):
        sorted_indices = np.array([5, 10, 15, 20])
        patterns = self.decoder._generate_chase_patterns(sorted_indices, 4)
        self.assertGreater(len(patterns), 0)
        total_patterns = sum(1 for _ in patterns)
        self.assertGreater(total_patterns, 4)

    def test_soft_decode_info_contains_required_fields(self):
        data = bitarray([False] * 51)
        codeword = self.decoder.encode(data)
        soft = self.decoder.hard_to_soft(codeword, snr_db=20.0)
        _, _, _, _, info = self.decoder.decode_soft(soft)
        self.assertIn('hard_decision_valid', info)
        self.assertIn('chase_trials', info)
        self.assertIn('euclidean_distance', info)
        self.assertIn('reliability_min', info)
        self.assertIn('reliability_avg', info)
        self.assertIn('soft_improvement', info)


class TestFLWCorrelator(unittest.TestCase):
    def setUp(self):
        self.sync_word = GMRConstants.SYNC_WORD
        self.correlator = FLWCorrelator(self.sync_word, threshold=0.75)

    def test_correlate_exact_match(self):
        data = bitarray(self.sync_word)
        result = self.correlator.correlate(data)
        self.assertTrue(result['found'])
        self.assertEqual(result['position'], 0)
        self.assertAlmostEqual(result['correlation_normalized'], 1.0, places=3)

    def test_correlate_with_offset(self):
        prefix = bitarray([False] * 50)
        data = prefix + bitarray(self.sync_word)
        result = self.correlator.correlate(data)
        self.assertTrue(result['found'])
        self.assertEqual(result['position'], 50)

    def test_correlate_no_match(self):
        data = bitarray([False] * 200)
        result = self.correlator.correlate(data)
        self.assertFalse(result['found'])

    def test_correlate_with_errors(self):
        sync = bitarray(self.sync_word)
        sync[3] = not sync[3]
        sync[7] = not sync[7]
        data = bitarray([False] * 20) + sync + bitarray([False] * 50)
        result = self.correlator.correlate(data)
        self.assertTrue(result['found'] or result['correlation_normalized'] > 0.5)

    def test_correlate_soft(self):
        sync_soft = np.array([1.0 if b else -1.0 for b in self.sync_word])
        noise = np.random.normal(0, 0.1, len(sync_soft))
        soft_data = np.concatenate([np.zeros(20), sync_soft + noise, np.zeros(50)])
        result = self.correlator.correlate_soft(soft_data)
        self.assertTrue(result['found'])
        self.assertIn('snr_estimate', result)

    def test_multi_peak_detect(self):
        sync1 = bitarray([False] * 20) + bitarray(self.sync_word)
        sync2 = bitarray([False] * 80) + bitarray(self.sync_word)
        data = sync1 + sync2 + bitarray([False] * 50)
        result = self.correlator.multi_peak_detect(data, num_peaks=3)
        self.assertIsInstance(result, list)
        if len(result) > 0:
            self.assertIn('position', result[0])
            self.assertIn('normalized', result[0])
            self.assertIn('valid', result[0])

    def test_snr_estimation(self):
        sync_soft = np.array([5.0 if b else -5.0 for b in self.sync_word])
        noise_region = np.random.normal(0, 0.5, len(self.sync_word))
        soft_data = np.concatenate([noise_region, sync_soft, noise_region])
        result = self.correlator.correlate_soft(soft_data)
        self.assertIn('snr_estimate', result)
        if result['found']:
            self.assertGreater(result['snr_estimate'], 0)

    def test_correlation_values_returned(self):
        data = bitarray([False] * 20) + bitarray(self.sync_word) + bitarray([False] * 50)
        result = self.correlator.correlate(data)
        self.assertIn('correlation_values', result)
        self.assertIsInstance(result['correlation_values'], list)


class TestIntegrationSoftFlw(unittest.TestCase):
    def test_gmr_parser_with_flw_and_soft(self):
        from test_data_generator import TestDataGenerator
        gen = TestDataGenerator()
        bits = gen.generate_superframe(occupancy_rate=0.5, error_rate=0.02)
        parser = GMRParser()
        sf = parser.parse_bitarray(bits, use_flw=True, use_soft=True)
        self.assertIsNotNone(sf)
        self.assertIn(sf.sync_status, ['locked', 'acquiring', 'searching'])

    def test_gmr_parser_without_flw_and_soft(self):
        from test_data_generator import TestDataGenerator
        gen = TestDataGenerator()
        bits = gen.generate_superframe(occupancy_rate=0.5, error_rate=0.01)
        parser = GMRParser()
        sf = parser.parse_bitarray(bits, use_flw=False, use_soft=False)
        self.assertIsNotNone(sf)

    def test_flw_correlations_extracted(self):
        from test_data_generator import TestDataGenerator
        gen = TestDataGenerator()
        bits = gen.generate_superframe(occupancy_rate=0.5, error_rate=0.01)
        parser = GMRParser()
        parser.parse_bitarray(bits, use_flw=True, use_soft=True)
        flw_data = parser.extract_flw_correlations()
        self.assertIsInstance(flw_data, list)
        if len(flw_data) > 0:
            self.assertIn('correlation_normalized', flw_data[0])
            self.assertIn('flw_found', flw_data[0])
            self.assertIn('correlation_peak', flw_data[0])

    def test_soft_decode_stats_extracted(self):
        from test_data_generator import TestDataGenerator
        gen = TestDataGenerator()
        bits = gen.generate_superframe(occupancy_rate=0.5, error_rate=0.02)
        parser = GMRParser()
        parser.parse_bitarray(bits, use_flw=True, use_soft=True)
        stats = parser.extract_soft_decode_stats()
        self.assertIsInstance(stats, dict)
        self.assertIn('hard_valid', stats)
        self.assertIn('soft_valid', stats)
        self.assertIn('soft_improved', stats)
        self.assertIn('soft_gain_pct', stats)


class TestLQICalculator(unittest.TestCase):
    def setUp(self):
        from bch_soft import LQICalculator
        from gmr_parser import GMRConstants
        self.lqi_calc = LQICalculator(GMRConstants.SYNC_WORD)

    def test_calculate_returns_metrics(self):
        from test_data_generator import TestDataGenerator
        gen = TestDataGenerator()
        bits = gen.generate_superframe(occupancy_rate=0.5, error_rate=0.01)
        sample = bits[:2000]
        bch_stats = {'total': 100, 'valid': 95, 'corrected': 3}
        metrics = self.lqi_calc.calculate(sample, bch_stats=bch_stats, sync_status='locked')
        self.assertIsNotNone(metrics)
        self.assertGreaterEqual(metrics.lqi_value, 0)
        self.assertLessEqual(metrics.lqi_value, 100)
        self.assertIn(metrics.lqi_quality, ['excellent', 'good', 'fair', 'poor', 'bad'])

    def test_lqi_score_ranges(self):
        from bch_soft import LQIMetrics
        m = LQIMetrics()
        m.correlation_normalized = 0.98
        m.snr_db = 25.0
        m.bch_error_rate = 0.001
        m.evm = 3.0
        m.sync_lock_status = 'locked'
        score = self.lqi_calc._compute_lqi_score(m)
        self.assertGreaterEqual(score, 80)

    def test_quality_classification(self):
        self.assertEqual(self.lqi_calc._classify_quality(95), 'excellent')
        self.assertEqual(self.lqi_calc._classify_quality(75), 'good')
        self.assertEqual(self.lqi_calc._classify_quality(50), 'fair')
        self.assertEqual(self.lqi_calc._classify_quality(25), 'poor')
        self.assertEqual(self.lqi_calc._classify_quality(10), 'bad')

    def test_history_recorded(self):
        from test_data_generator import TestDataGenerator
        gen = TestDataGenerator()
        bits = gen.generate_superframe(occupancy_rate=0.5, error_rate=0.01)
        sample = bits[:2000]
        for i in range(5):
            self.lqi_calc.calculate(sample, sync_status='locked')
        history = self.lqi_calc.get_history(10)
        self.assertEqual(len(history), 5)

    def test_statistics_calculated(self):
        from test_data_generator import TestDataGenerator
        gen = TestDataGenerator()
        bits = gen.generate_superframe(occupancy_rate=0.5, error_rate=0.01)
        sample = bits[:2000]
        for i in range(3):
            self.lqi_calc.calculate(sample, sync_status='locked')
        stats = self.lqi_calc.get_statistics()
        self.assertIn('lqi_avg', stats)
        self.assertIn('snr_avg', stats)
        self.assertIn('lqi_min', stats)
        self.assertIn('lqi_max', stats)
        self.assertEqual(stats['sample_count'], 3)


class TestErrorStatistics(unittest.TestCase):
    def setUp(self):
        from bch_soft import ErrorStatistics, ErrorStatEntry
        self.error_stats = ErrorStatistics()
        self.ErrorStatEntry = ErrorStatEntry

    def test_add_entry(self):
        entry = self.ErrorStatEntry(
            multiframe=0,
            basic_frame=0,
            timeslot=3,
            bch_index=None,
            error_type='bch_corrected',
            bit_errors=1,
            error_rate=0.01
        )
        self.error_stats.add_entry(entry)
        self.assertEqual(len(self.error_stats.entries), 1)
        self.assertEqual(self.error_stats.total_bit_errors, 1)

    def test_record_frame(self):
        self.error_stats.record_frame(has_error=True, bit_count=1000, error_count=5)
        self.error_stats.record_frame(has_error=False, bit_count=1000, error_count=0)
        self.assertEqual(self.error_stats.total_frames, 2)
        self.assertEqual(self.error_stats.frame_error_count, 1)
        self.assertEqual(self.error_stats.total_bits_processed, 2000)
        self.assertEqual(self.error_stats.total_bit_errors, 5)

    def test_get_summary(self):
        self.error_stats.record_frame(has_error=True, bit_count=1000, error_count=10)
        self.error_stats.record_frame(has_error=False, bit_count=1000, error_count=0)
        entry = self.ErrorStatEntry(0, 0, 3, None, 'bch_corrected', 1, 0.01)
        self.error_stats.add_entry(entry)
        summary = self.error_stats.get_summary()
        self.assertEqual(summary['total_frames'], 2)
        self.assertAlmostEqual(summary['bit_error_rate'], 0.005)
        self.assertAlmostEqual(summary['frame_error_rate'], 0.5)

    def test_export_csv(self):
        entry = self.ErrorStatEntry(0, 0, 3, None, 'bch_corrected', 1, 0.01)
        self.error_stats.add_entry(entry)
        csv_content = self.error_stats.export_csv()
        self.assertIn('multiframe', csv_content)
        self.assertIn('basic_frame', csv_content)
        self.assertIn('bch_corrected', csv_content)

    def test_export_json(self):
        entry = self.ErrorStatEntry(0, 0, 3, None, 'bch_uncorrectable', 2, 0.02)
        self.error_stats.add_entry(entry)
        json_content = self.error_stats.export_json()
        self.assertIn('"summary"', json_content)
        self.assertIn('"entries"', json_content)
        self.assertIn('bch_uncorrectable', json_content)

    def test_error_distribution(self):
        entries = [
            self.ErrorStatEntry(0, 0, 3, None, 'bch_corrected', 1, 0.01),
            self.ErrorStatEntry(0, 1, 5, None, 'bch_corrected', 1, 0.01),
            self.ErrorStatEntry(1, 0, 3, None, 'bch_uncorrectable', 2, 0.02),
            self.ErrorStatEntry(0, 0, 10, None, 'sync_lost', 0, 0.0),
        ]
        for e in entries:
            self.error_stats.add_entry(e)
        dist = self.error_stats.get_error_distribution()
        self.assertIn('by_multiframe', dist)
        self.assertIn('by_basic_frame', dist)
        self.assertIn('by_timeslot', dist)
        self.assertEqual(dist['by_multiframe'].get(0, 0), 3)
        self.assertEqual(dist['by_multiframe'].get(1, 0), 1)

    def test_clear(self):
        entry = self.ErrorStatEntry(0, 0, 3, None, 'bch_corrected', 1, 0.01)
        self.error_stats.add_entry(entry)
        self.error_stats.record_frame(has_error=True, bit_count=1000, error_count=1)
        self.error_stats.clear()
        self.assertEqual(len(self.error_stats.entries), 0)
        self.assertEqual(self.error_stats.total_frames, 0)
        self.assertEqual(self.error_stats.total_bit_errors, 0)


class TestIntegrationLQIErrors(unittest.TestCase):
    def test_parser_with_lqi_and_errors(self):
        from gmr_parser import GMRParser
        from test_data_generator import TestDataGenerator
        parser = GMRParser()
        gen = TestDataGenerator()
        bits = gen.generate_superframe(occupancy_rate=0.5, error_rate=0.02)
        sf = parser.parse_bitarray(bits, use_flw=True, use_soft=True)
        lqi = parser.get_lqi()
        self.assertIsNotNone(lqi)
        self.assertIn('lqi_value', lqi)
        self.assertIn('lqi_quality', lqi)
        self.assertGreaterEqual(lqi['lqi_value'], 0)
        self.assertLessEqual(lqi['lqi_value'], 100)
        error_summary = parser.get_error_summary()
        self.assertIsNotNone(error_summary)
        self.assertIn('total_frames', error_summary)
        self.assertIn('bit_error_rate', error_summary)

    def test_error_export_apis(self):
        from gmr_parser import GMRParser
        from test_data_generator import TestDataGenerator
        parser = GMRParser()
        gen = TestDataGenerator()
        bits = gen.generate_superframe(occupancy_rate=0.5, error_rate=0.02)
        parser.parse_bitarray(bits)
        csv_data = parser.export_error_csv(limit=10)
        self.assertIn('multiframe', csv_data)
        json_data = parser.export_error_json(limit=10)
        self.assertIn('summary', json_data)
        dist = parser.get_error_distribution()
        self.assertIsInstance(dist, dict)


if __name__ == '__main__':
    unittest.main()
