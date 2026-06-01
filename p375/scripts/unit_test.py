#!/usr/bin/env python3
"""
P4模拟器单元测试
"""

import sys
import unittest
import time

sys.path.insert(0, '../backend')

from p4_simulator import (
    VirtualSwitch,
    PortType,
    PortStatus,
    MirrorDirection,
    PacketHandler,
    TokenBucket,
)


class TestPort(unittest.TestCase):
    def test_port_creation(self):
        from p4_simulator import Port
        port = Port(id=1, name="test-port", type=PortType.NORMAL)
        self.assertEqual(port.id, 1)
        self.assertEqual(port.name, "test-port")
        self.assertEqual(port.type, PortType.NORMAL)
        self.assertEqual(port.status, PortStatus.DOWN)

    def test_port_status_change(self):
        from p4_simulator import Port
        port = Port(id=1, name="test-port")
        port.set_status(PortStatus.UP)
        self.assertEqual(port.status, PortStatus.UP)

    def test_port_counters(self):
        from p4_simulator import Port
        port = Port(id=1, name="test-port")
        port.increment_rx()
        port.increment_rx()
        port.increment_tx()
        self.assertEqual(port.rx_packets, 2)
        self.assertEqual(port.tx_packets, 1)


class TestMacTable(unittest.TestCase):
    def test_mac_learning(self):
        from p4_simulator import MacTable
        mac_table = MacTable(aging_time=60)
        result = mac_table.learn("00:11:22:33:44:55", 1)
        self.assertTrue(result)
        self.assertEqual(mac_table.size(), 1)

    def test_mac_lookup(self):
        from p4_simulator import MacTable
        mac_table = MacTable()
        mac_table.learn("00:11:22:33:44:55", 1)
        port_id = mac_table.lookup("00:11:22:33:44:55")
        self.assertEqual(port_id, 1)

    def test_mac_lookup_not_found(self):
        from p4_simulator import MacTable
        mac_table = MacTable()
        port_id = mac_table.lookup("aa:bb:cc:dd:ee:ff")
        self.assertIsNone(port_id)

    def test_mac_aging(self):
        from p4_simulator import MacTable
        mac_table = MacTable(aging_time=1)
        mac_table.learn("00:11:22:33:44:55", 1)
        time.sleep(1.1)
        port_id = mac_table.lookup("00:11:22:33:44:55")
        self.assertIsNone(port_id)

    def test_mac_table_clear(self):
        from p4_simulator import MacTable
        mac_table = MacTable()
        mac_table.learn("00:11:22:33:44:55", 1)
        mac_table.learn("aa:bb:cc:dd:ee:ff", 2)
        self.assertEqual(mac_table.size(), 2)
        mac_table.clear()
        self.assertEqual(mac_table.size(), 0)


class TestMirrorEngine(unittest.TestCase):
    def test_add_mirror_rule(self):
        from p4_simulator import MirrorEngine, MirrorDirection
        engine = MirrorEngine()
        rule = engine.add_rule(1, 5, MirrorDirection.INGRESS)
        self.assertEqual(rule.source_port, 1)
        self.assertEqual(rule.monitor_port, 5)
        self.assertEqual(rule.direction, MirrorDirection.INGRESS)

    def test_has_mirror_rule(self):
        from p4_simulator import MirrorEngine, MirrorDirection
        engine = MirrorEngine()
        engine.add_rule(1, 5, MirrorDirection.INGRESS)
        self.assertTrue(engine.has_mirror_rule(1, MirrorDirection.INGRESS))
        self.assertFalse(engine.has_mirror_rule(2, MirrorDirection.INGRESS))

    def test_get_monitor_ports(self):
        from p4_simulator import MirrorEngine, MirrorDirection
        engine = MirrorEngine()
        engine.add_rule(1, 5, MirrorDirection.INGRESS)
        engine.add_rule(1, 6, MirrorDirection.INGRESS)
        ports = engine.get_monitor_ports(1, MirrorDirection.INGRESS)
        self.assertEqual(sorted(ports), [5, 6])

    def test_remove_mirror_rule(self):
        from p4_simulator import MirrorEngine, MirrorDirection
        engine = MirrorEngine()
        rule = engine.add_rule(1, 5, MirrorDirection.INGRESS)
        result = engine.remove_rule(rule.id)
        self.assertTrue(result)
        self.assertEqual(len(engine.get_all_rules()), 0)

    def test_process_mirror_with_metadata(self):
        from p4_simulator import MirrorEngine, MirrorDirection
        engine = MirrorEngine(rate_limit_mbps=1000)
        engine.add_rule(1, 5, MirrorDirection.INGRESS)
        result = engine.process_mirror(100, 1, MirrorDirection.INGRESS, time.time())
        self.assertTrue(result.mirrored)
        self.assertEqual(result.monitor_ports, [5])
        self.assertEqual(len(result.metadata), 1)
        self.assertEqual(result.metadata[0].original_source_port, 1)
        self.assertEqual(result.metadata[0].packet_size, 100)


class TestTokenBucket(unittest.TestCase):
    def test_token_bucket_initialization(self):
        bucket = TokenBucket(rate_mbps=10, burst_size=10000)
        self.assertEqual(bucket.rate_mbps, 10)
        self.assertEqual(bucket.tokens, 10000)

    def test_consume_success(self):
        bucket = TokenBucket(rate_mbps=100, burst_size=1000)
        self.assertTrue(bucket.consume(500))
        self.assertEqual(int(bucket.tokens_raw), 500)

    def test_consume_failure(self):
        bucket = TokenBucket(rate_mbps=10, burst_size=100)
        bucket.consume(100)
        self.assertFalse(bucket.consume(100))
        self.assertEqual(bucket.stats_dropped, 1)

    def test_refill(self):
        bucket = TokenBucket(rate_mbps=100, burst_size=10000)
        bucket.consume(10000)
        self.assertEqual(int(bucket.tokens_raw), 0)
        time.sleep(0.05)
        self.assertGreater(bucket.tokens, 0)

    def test_set_rate(self):
        bucket = TokenBucket(rate_mbps=10, burst_size=10000)
        bucket.set_rate(100)
        self.assertEqual(bucket.rate_mbps, 100)
        self.assertEqual(bucket.rate_bps, int(100 * 1_000_000 / 8))

    def test_get_stats(self):
        bucket = TokenBucket(rate_mbps=100, burst_size=1000)
        bucket.consume(100)
        bucket.consume(200)
        stats = bucket.get_stats()
        self.assertEqual(stats.total_packets_passed, 2)
        self.assertEqual(stats.total_bytes_passed, 300)
        self.assertEqual(stats.total_packets_dropped, 0)

    def test_reset(self):
        bucket = TokenBucket(rate_mbps=100, burst_size=1000)
        bucket.consume(500)
        bucket.reset()
        self.assertEqual(bucket.tokens, 1000)
        self.assertEqual(bucket.stats_passed, 0)


class TestPacketHandler(unittest.TestCase):
    def test_create_test_packet(self):
        handler = PacketHandler()
        packet_bytes = handler.create_test_packet(
            src_mac="00:11:22:33:44:55",
            dst_mac="aa:bb:cc:dd:ee:ff",
            src_ip="192.168.1.10",
            dst_ip="192.168.1.20",
            src_port=12345,
            dst_port=80,
            protocol="tcp",
            payload="Test"
        )
        self.assertIsInstance(packet_bytes, bytes)
        self.assertGreater(len(packet_bytes), 0)

    def test_parse_packet(self):
        handler = PacketHandler()
        packet_bytes = handler.create_test_packet(
            src_mac="00:11:22:33:44:55",
            dst_mac="aa:bb:cc:dd:ee:ff",
            src_ip="192.168.1.10",
            dst_ip="192.168.1.20",
            src_port=12345,
            dst_port=80,
            protocol="tcp"
        )
        info = handler.parse_packet(packet_bytes, 1, 'original')
        self.assertEqual(info.ethernet['srcMac'], "00:11:22:33:44:55")
        self.assertEqual(info.ethernet['dstMac'], "aa:bb:cc:dd:ee:ff")
        self.assertEqual(info.ip['srcIp'], "192.168.1.10")
        self.assertEqual(info.ip['dstIp'], "192.168.1.20")
        self.assertEqual(info.transport['srcPort'], 12345)
        self.assertEqual(info.transport['dstPort'], 80)


class TestVirtualSwitch(unittest.TestCase):
    def setUp(self):
        self.switch = VirtualSwitch("test-switch")
        self.switch.start()

    def tearDown(self):
        self.switch.stop()

    def test_switch_starts(self):
        self.assertTrue(self.switch.status.running)

    def test_default_ports(self):
        ports = self.switch.get_all_ports()
        self.assertEqual(len(ports), 5)
        self.assertEqual(ports[0].type, PortType.NORMAL)
        self.assertEqual(ports[4].type, PortType.MONITOR)

    def test_send_packet_mac_learning(self):
        result = self.switch.send_test_packet(
            src_mac="00:11:22:33:44:55",
            dst_mac="aa:bb:cc:dd:ee:ff",
            src_ip="192.168.1.10",
            dst_ip="192.168.1.20",
            src_port=12345,
            dst_port=80,
            in_port_id=1,
            protocol="tcp"
        )
        self.assertIsNotNone(result)
        self.assertTrue(result.mac_learned)
        self.assertEqual(self.switch.mac_table.size(), 1)

    def test_send_packet_mirroring(self):
        self.switch.add_mirror_rule(1, 5, MirrorDirection.INGRESS)
        result = self.switch.send_test_packet(
            src_mac="00:11:22:33:44:55",
            dst_mac="aa:bb:cc:dd:ee:ff",
            src_ip="192.168.1.10",
            dst_ip="192.168.1.20",
            src_port=12345,
            dst_port=80,
            in_port_id=1,
            protocol="tcp"
        )
        self.assertIsNotNone(result)
        self.assertEqual(result.mirror_ports, [5])

    def test_packet_counters(self):
        initial_rx = self.switch.status.total_rx_packets
        self.switch.send_test_packet(
            src_mac="00:11:22:33:44:55",
            dst_mac="aa:bb:cc:dd:ee:ff",
            src_ip="192.168.1.10",
            dst_ip="192.168.1.20",
            src_port=12345,
            dst_port=80,
            in_port_id=1,
            protocol="tcp"
        )
        self.assertEqual(self.switch.status.total_rx_packets, initial_rx + 1)

    def test_reset(self):
        self.switch.send_test_packet(
            src_mac="00:11:22:33:44:55",
            dst_mac="aa:bb:cc:dd:ee:ff",
            src_ip="192.168.1.10",
            dst_ip="192.168.1.20",
            src_port=12345,
            dst_port=80,
            in_port_id=1,
            protocol="tcp"
        )
        self.assertGreater(self.switch.status.total_rx_packets, 0)
        self.switch.reset()
        self.assertEqual(self.switch.status.total_rx_packets, 0)
        self.assertEqual(self.switch.mac_table.size(), 0)


class TestForwardingPipeline(unittest.TestCase):
    def setUp(self):
        self.switch = VirtualSwitch("test")
        self.switch.start()

    def tearDown(self):
        self.switch.stop()

    def test_unknown_destination_floods(self):
        result = self.switch.send_test_packet(
            src_mac="00:11:22:33:44:55",
            dst_mac="aa:bb:cc:dd:ee:ff",
            src_ip="192.168.1.10",
            dst_ip="192.168.1.20",
            src_port=12345,
            dst_port=80,
            in_port_id=1,
            protocol="tcp"
        )
        self.assertEqual(result.action.value, 'flood')

    def test_known_destination_forwards(self):
        self.switch.send_test_packet(
            src_mac="aa:bb:cc:dd:ee:ff",
            dst_mac="00:11:22:33:44:55",
            src_ip="192.168.1.20",
            dst_ip="192.168.1.10",
            src_port=9999,
            dst_port=80,
            in_port_id=2,
            protocol="tcp"
        )
        result = self.switch.send_test_packet(
            src_mac="00:11:22:33:44:55",
            dst_mac="aa:bb:cc:dd:ee:ff",
            src_ip="192.168.1.10",
            dst_ip="192.168.1.20",
            src_port=80,
            dst_port=9999,
            in_port_id=1,
            protocol="tcp"
        )
        self.assertEqual(result.action.value, 'forward')
        self.assertEqual(result.out_ports, [2])


def run_tests():
    print("\n" + "╔" + "═" * 58 + "╗")
    print("║" + " " * 18 + "P4 模拟器单元测试" + " " * 22 + "║")
    print("╚" + "═" * 58 + "╝")
    print()

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    suite.addTests(loader.loadTestsFromTestCase(TestPort))
    suite.addTests(loader.loadTestsFromTestCase(TestMacTable))
    suite.addTests(loader.loadTestsFromTestCase(TestMirrorEngine))
    suite.addTests(loader.loadTestsFromTestCase(TestTokenBucket))
    suite.addTests(loader.loadTestsFromTestCase(TestPacketHandler))
    suite.addTests(loader.loadTestsFromTestCase(TestVirtualSwitch))
    suite.addTests(loader.loadTestsFromTestCase(TestForwardingPipeline))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print()
    if result.wasSuccessful():
        print("✅ 所有测试通过!")
    else:
        print(f"❌ 测试失败: {len(result.failures)} 个失败, {len(result.errors)} 个错误")

    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
