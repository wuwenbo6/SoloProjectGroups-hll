import unittest
import time
import struct
import os
import tempfile
from ecpri_parser import EcpriParser, EcpriFrame, SlidingWindow, SEQ_MOD, IQSample
from pcapng_exporter import PcapngExporter


def build_frame(message_type, sequence_id, stream_id, extra_payload=b''):
    payload = struct.pack('!H', sequence_id) + struct.pack('!H', stream_id) + extra_payload
    header = bytes([0x10, message_type]) + len(payload).to_bytes(2, 'big')
    return header + payload


def build_rtc_frame(sequence_id, stream_id, rtc_timestamp, rtc_time_offset, extra_payload=b''):
    payload = (
        struct.pack('!H', sequence_id)
        + struct.pack('!H', stream_id)
        + struct.pack('!I', rtc_timestamp)
        + struct.pack('!i', rtc_time_offset)
        + extra_payload
    )
    header = bytes([0x10, 0x02]) + len(payload).to_bytes(2, 'big')
    return header + payload


def build_iq_frame(sequence_id, stream_id, samples):
    payload = struct.pack('!H', sequence_id) + struct.pack('!H', stream_id)
    for sample in samples:
        payload += struct.pack('!h', sample[0]) + struct.pack('!h', sample[1])
    header = bytes([0x10, 0x00]) + len(payload).to_bytes(2, 'big')
    return header + payload


class TestSlidingWindow(unittest.TestCase):

    def test_first_frame(self):
        win = SlidingWindow(stream_id=1)
        frame = EcpriFrame(1, 0, 0, "", 0, 10, 1, b'', 0.0)
        status = win.update(frame)
        self.assertEqual(status, "first")
        self.assertEqual(win.expected_seq, 11)

    def test_in_order(self):
        win = SlidingWindow(stream_id=1)
        for i in range(3):
            frame = EcpriFrame(1, 0, 0, "", 0, i, 1, b'', 0.0)
            win.update(frame)
        self.assertEqual(win.gap_count, 0)
        self.assertEqual(win.reorder_count, 0)
        self.assertEqual(win.duplicate_count, 0)

    def test_duplicate_detection(self):
        win = SlidingWindow(stream_id=1)
        frame1 = EcpriFrame(1, 0, 0, "", 0, 0, 1, b'', 0.0)
        frame2 = EcpriFrame(1, 0, 0, "", 0, 0, 1, b'', 0.0)
        win.update(frame1)
        status = win.update(frame2)
        self.assertEqual(status, "duplicate")
        self.assertEqual(win.duplicate_count, 1)

    def test_gap_detection(self):
        win = SlidingWindow(stream_id=1)
        frame0 = EcpriFrame(1, 0, 0, "", 0, 0, 1, b'', 0.0)
        frame5 = EcpriFrame(1, 0, 0, "", 0, 5, 1, b'', 0.0)
        win.update(frame0)
        status = win.update(frame5)
        self.assertEqual(status, "gap")
        self.assertEqual(win.gap_count, 1)

    def test_reorder_detection(self):
        win = SlidingWindow(stream_id=1)
        frame0 = EcpriFrame(1, 0, 0, "", 0, 0, 1, b'', 0.0)
        frame2 = EcpriFrame(1, 0, 0, "", 0, 2, 1, b'', 0.0)
        frame1 = EcpriFrame(1, 0, 0, "", 0, 1, 1, b'', 0.0)
        win.update(frame0)
        win.update(frame2)
        status = win.update(frame1)
        self.assertEqual(status, "reorder")
        self.assertEqual(win.reorder_count, 1)

    def test_window_advance(self):
        win = SlidingWindow(stream_id=1)
        frame0 = EcpriFrame(1, 0, 0, "", 0, 0, 1, b'', 0.0)
        frame1 = EcpriFrame(1, 0, 0, "", 0, 1, 1, b'', 0.0)
        frame2 = EcpriFrame(1, 0, 0, "", 0, 2, 1, b'', 0.0)
        win.update(frame0)
        win.update(frame2)
        self.assertEqual(win.expected_seq, 1)
        win.update(frame1)
        self.assertEqual(win.expected_seq, 3)

    def test_ordered_frames(self):
        win = SlidingWindow(stream_id=1)
        for seq in [0, 2, 1]:
            frame = EcpriFrame(1, 0, 0, "", 0, seq, 1, b'', 0.0)
            win.update(frame)
        ordered = win.get_ordered_frames()
        self.assertEqual(len(ordered), 3)
        self.assertEqual(ordered[0].sequence_id, 0)
        self.assertEqual(ordered[1].sequence_id, 1)
        self.assertEqual(ordered[2].sequence_id, 2)

    def test_seq_wraparound(self):
        win = SlidingWindow(stream_id=1)
        frame_a = EcpriFrame(1, 0, 0, "", 0, SEQ_MOD - 1, 1, b'', 0.0)
        frame_b = EcpriFrame(1, 0, 0, "", 0, 0, 1, b'', 0.0)
        win.update(frame_a)
        status = win.update(frame_b)
        self.assertEqual(status, "in_order")

    def test_out_of_window(self):
        win = SlidingWindow(stream_id=1, window_size=4)
        frame0 = EcpriFrame(1, 0, 0, "", 0, 0, 1, b'', 0.0)
        frame100 = EcpriFrame(1, 0, 0, "", 0, 100, 1, b'', 0.0)
        win.update(frame0)
        status = win.update(frame100)
        self.assertEqual(status, "out_of_window")


class TestRtcParsing(unittest.TestCase):

    def setUp(self):
        self.parser = EcpriParser()

    def test_rtc_timestamp_and_offset(self):
        rtc_ts = 1234567890
        rtc_off = -500000
        raw = build_rtc_frame(1, 1, rtc_ts, rtc_off)
        frame = self.parser.parse(raw)
        self.assertEqual(frame.rtc_timestamp, rtc_ts)
        self.assertEqual(frame.rtc_time_offset, rtc_off)
        self.assertEqual(frame.message_type_name, "Real-time Control Data")

    def test_rtc_positive_offset(self):
        rtc_ts = 999999
        rtc_off = 250000
        raw = build_rtc_frame(2, 3, rtc_ts, rtc_off)
        frame = self.parser.parse(raw)
        self.assertEqual(frame.rtc_timestamp, rtc_ts)
        self.assertEqual(frame.rtc_time_offset, rtc_off)

    def test_iq_no_rtc_fields(self):
        raw = build_frame(0, 1, 1)
        frame = self.parser.parse(raw)
        self.assertIsNone(frame.rtc_timestamp)
        self.assertIsNone(frame.rtc_time_offset)

    def test_rtc_short_payload(self):
        payload = struct.pack('!H', 1) + struct.pack('!H', 1) + b'\x00\x00'
        header = bytes([0x10, 0x02]) + len(payload).to_bytes(2, 'big')
        raw = header + payload
        frame = self.parser.parse(raw)
        self.assertIsNone(frame.rtc_timestamp)
        self.assertIsNone(frame.rtc_time_offset)

    def test_rtc_exact_minimum_payload(self):
        payload = struct.pack('!H', 1) + struct.pack('!H', 1) + struct.pack('!I', 42) + struct.pack('!i', -100)
        header = bytes([0x10, 0x02]) + len(payload).to_bytes(2, 'big')
        raw = header + payload
        frame = self.parser.parse(raw)
        self.assertEqual(frame.rtc_timestamp, 42)
        self.assertEqual(frame.rtc_time_offset, -100)


class TestPerStreamSeqTracking(unittest.TestCase):

    def setUp(self):
        self.parser = EcpriParser()

    def test_independent_stream_sequences(self):
        for seq in range(5):
            self.parser.parse(build_frame(0, seq, 1))
            self.parser.parse(build_frame(0, seq, 2))

        stats1 = self.parser.get_stream_stats(1)
        stats2 = self.parser.get_stream_stats(2)

        self.assertEqual(stats1["expected_seq"], 5)
        self.assertEqual(stats2["expected_seq"], 5)
        self.assertEqual(stats1["gap_count"], 0)
        self.assertEqual(stats2["gap_count"], 0)

    def test_stream_ordered_frames(self):
        self.parser.parse(build_frame(0, 0, 1))
        self.parser.parse(build_frame(0, 2, 1))
        self.parser.parse(build_frame(0, 1, 1))

        ordered = self.parser.get_stream_ordered_frames(1)
        self.assertEqual(len(ordered), 3)
        self.assertEqual(ordered[0]["sequence_id"], 0)
        self.assertEqual(ordered[1]["sequence_id"], 1)
        self.assertEqual(ordered[2]["sequence_id"], 2)

    def test_seq_status_in_frame(self):
        frame0 = self.parser.parse(build_frame(0, 0, 1))
        self.assertEqual(frame0.seq_status, "first")

        frame1 = self.parser.parse(build_frame(0, 1, 1))
        self.assertEqual(frame1.seq_status, "in_order")

        frame_dup = self.parser.parse(build_frame(0, 1, 1))
        self.assertEqual(frame_dup.seq_status, "duplicate")

        frame_gap = self.parser.parse(build_frame(0, 5, 1))
        self.assertEqual(frame_gap.seq_status, "gap")

    def test_stream_stats_window_info(self):
        for seq in [0, 2, 2, 5]:
            self.parser.parse(build_frame(0, seq, 1))

        stats = self.parser.get_stream_stats(1)
        self.assertIsNotNone(stats["expected_seq"])
        self.assertGreater(stats["gap_count"], 0)
        self.assertGreater(stats["duplicate_count"], 0)


class TestExistingParserCompat(unittest.TestCase):

    def setUp(self):
        self.parser = EcpriParser()

    def test_parse_iq_data_frame(self):
        frame = self.parser.parse(build_frame(0, 1, 1))
        self.assertEqual(frame.message_type_name, "IQ Data")
        self.assertEqual(frame.sequence_id, 1)
        self.assertEqual(frame.stream_id, 1)

    def test_parse_real_time_control_frame(self):
        frame = self.parser.parse(build_frame(2, 2, 2))
        self.assertEqual(frame.message_type_name, "Real-time Control Data")
        self.assertEqual(frame.sequence_id, 2)
        self.assertEqual(frame.stream_id, 2)

    def test_invalid_frame_too_short(self):
        with self.assertRaises(ValueError):
            self.parser.parse(b'\x00\x00')

    def test_get_all_streams(self):
        for i in range(3):
            self.parser.parse(build_frame(0, i, 1))
            self.parser.parse(build_frame(0, i, 2))
        streams = self.parser.get_all_streams()
        self.assertEqual(len(streams), 2)


class TestIQSampleParsing(unittest.TestCase):

    def setUp(self):
        self.parser = EcpriParser()

    def test_parse_iq_samples(self):
        samples = [(100, 200), (-300, 400), (500, -600)]
        raw = build_iq_frame(1, 1, samples)
        frame = self.parser.parse(raw)
        self.assertIsNotNone(frame.iq_samples)
        self.assertEqual(len(frame.iq_samples), 3)
        self.assertEqual(frame.iq_samples[0].i, 100)
        self.assertEqual(frame.iq_samples[0].q, 200)
        self.assertEqual(frame.iq_samples[1].i, -300)
        self.assertEqual(frame.iq_samples[1].q, 400)
        self.assertEqual(frame.iq_samples[2].i, 500)
        self.assertEqual(frame.iq_samples[2].q, -600)

    def test_iq_sample_to_dict(self):
        sample = IQSample(i=123, q=-456)
        d = sample.to_dict()
        self.assertEqual(d["i"], 123)
        self.assertEqual(d["q"], -456)

    def test_rtc_no_iq_samples(self):
        raw = build_rtc_frame(1, 1, 12345, 67890)
        frame = self.parser.parse(raw)
        self.assertIsNone(frame.iq_samples)

    def test_short_payload_no_iq_samples(self):
        payload = struct.pack('!H', 1) + struct.pack('!H', 1)
        header = bytes([0x10, 0x00]) + len(payload).to_bytes(2, 'big')
        raw = header + payload
        frame = self.parser.parse(raw)
        self.assertIsNone(frame.iq_samples)

    def test_get_iq_samples(self):
        samples1 = [(100, 200), (-300, 400)]
        samples2 = [(500, 600), (-700, 800)]
        self.parser.parse(build_iq_frame(1, 1, samples1))
        self.parser.parse(build_iq_frame(2, 2, samples2))
        self.parser.parse(build_rtc_frame(3, 1, 123, 456))

        all_samples = self.parser.get_iq_samples()
        self.assertEqual(len(all_samples), 4)

        stream1_samples = self.parser.get_iq_samples(stream_id=1)
        self.assertEqual(len(stream1_samples), 2)
        for s in stream1_samples:
            self.assertEqual(s["stream_id"], 1)

    def test_iq_sample_count_in_frames(self):
        samples = [(100, 200), (-300, 400), (500, -600)]
        self.parser.parse(build_iq_frame(1, 1, samples))
        self.parser.parse(build_rtc_frame(2, 1, 123, 456))

        frames = self.parser.get_recent_frames()
        self.assertEqual(frames[0]["iq_sample_count"], 3)
        self.assertEqual(frames[1]["iq_sample_count"], 0)


class TestPcapngExport(unittest.TestCase):

    def setUp(self):
        self.parser = EcpriParser()

    def test_export_empty(self):
        exporter = PcapngExporter(frames=[])
        data = exporter.export_to_bytes()
        self.assertGreater(len(data), 0)
        self.assertEqual(data[0:4], b'\x0a\x0d\x0d\x0a')

    def test_export_with_frames(self):
        samples = [(100, 200), (-300, 400)]
        self.parser.parse(build_iq_frame(1, 1, samples))
        self.parser.parse(build_rtc_frame(2, 1, 12345, -67890))

        exporter = PcapngExporter(frames=self.parser.get_raw_frames())
        data = exporter.export_to_bytes()
        self.assertGreater(len(data), 100)
        self.assertEqual(data[0:4], b'\x0a\x0d\x0d\x0a')

    def test_export_to_file(self):
        self.parser.parse(build_frame(0, 1, 1, b'\x00' * 16))

        with tempfile.NamedTemporaryFile(suffix='.pcapng', delete=False) as tmp:
            tmp_path = tmp.name

        try:
            exporter = PcapngExporter(frames=self.parser.get_raw_frames())
            exporter.export(filename=tmp_path)
            self.assertTrue(os.path.exists(tmp_path))
            self.assertGreater(os.path.getsize(tmp_path), 0)
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    def test_ethernet_encapsulation(self):
        samples = [(100, 200)]
        self.parser.parse(build_iq_frame(1, 1, samples))
        exporter = PcapngExporter(frames=self.parser.get_raw_frames())
        data = exporter.export_to_bytes()
        self.assertIn(b'\xae\xfe', data)

    def test_block_structure(self):
        self.parser.parse(build_frame(0, 1, 1, b'\x00' * 8))
        exporter = PcapngExporter(frames=self.parser.get_raw_frames())
        data = exporter.export_to_bytes()

        self.assertEqual(data[0:4], b'\x0a\x0d\x0d\x0a')
        block_len = struct.unpack('<I', data[4:8])[0]
        self.assertGreater(block_len, 0)
        self.assertEqual(data[8:12], b'\x4d\x3c\x2b\x1a')


if __name__ == '__main__':
    unittest.main()
