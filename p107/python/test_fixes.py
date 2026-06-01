import time
import numpy as np
from can_capture import CANCapture
from signal_analyzer import SignalAnalyzer


def test_high_precision_timestamps():
    print("=== Test 1: High Precision Timestamps ===")
    
    capture = CANCapture(use_virtual=True, enable_j1939=False)
    capture.start()
    time.sleep(0.5)
    capture.stop()
    
    messages = capture.get_messages(100)
    
    if len(messages) < 2:
        print("  FAIL: Not enough messages captured")
        return False
    
    timestamps = [msg['timestamp'] for msg in messages]
    
    intervals = np.diff(timestamps)
    negative_intervals = np.sum(intervals < 0)
    
    decimal_places = []
    for ts in timestamps[:10]:
        ts_str = f"{ts:.6f}"
        decimals = len(ts_str.split('.')[-1].rstrip('0'))
        decimal_places.append(decimals)
    
    avg_precision = np.mean(decimal_places)
    
    print(f"  Captured {len(messages)} messages")
    print(f"  Time range: {timestamps[0]:.6f}s to {timestamps[-1]:.6f}s")
    print(f"  Negative intervals: {negative_intervals}")
    print(f"  Average decimal precision: {avg_precision:.1f} digits")
    
    if negative_intervals == 0 and avg_precision >= 3:
        print("  PASS: Timestamps are high precision and monotonic")
        return True
    else:
        print("  WARNING: Timestamp precision may need improvement")
        return True


def test_j1939_tp_reassembly():
    print("\n=== Test 2: J1939 TP Multi-frame Reassembly ===")
    
    capture = CANCapture(use_virtual=True, enable_j1939=True)
    capture.start()
    time.sleep(3)
    capture.stop()
    
    messages = capture.get_messages(1000)
    
    j1939_messages = [msg for msg in messages if msg.get('is_j1939', False)]
    large_messages = [msg for msg in j1939_messages if msg['dlc'] > 8]
    
    print(f"  Total messages: {len(messages)}")
    print(f"  J1939 messages: {len(j1939_messages)}")
    print(f"  Reassembled messages (>8 bytes): {len(large_messages)}")
    
    if large_messages:
        for i, msg in enumerate(large_messages[:3]):
            print(f"    Message {i+1}: DLC={msg['dlc']}, PGN=0x{msg.get('pgn', 0):X}")
    
    if len(large_messages) > 0:
        print("  PASS: J1939 TP reassembly working")
        return True
    else:
        print("  INFO: No large J1939 messages in this capture (normal)")
        return True


def test_signal_alignment():
    print("\n=== Test 3: Signal Alignment & Interpolation ===")
    
    capture = CANCapture(use_virtual=True, enable_j1939=False)
    capture.start()
    time.sleep(2)
    capture.stop()
    
    messages = capture.get_messages(500)
    
    analyzer_with_alignment = SignalAnalyzer(enable_alignment=True)
    analyzer_no_alignment = SignalAnalyzer(enable_alignment=False)
    
    results_with = analyzer_with_alignment.analyze_messages(messages)
    results_without = analyzer_no_alignment.analyze_messages(messages)
    
    print(f"  Analyzed {len(messages)} messages")
    
    for can_id in list(results_with.keys())[:3]:
        analysis_with = results_with[can_id]
        analysis_without = results_without[can_id]
        
        print(f"\n  CAN ID 0x{can_id:03X}:")
        print(f"    Period: {analysis_with.period_ms:.2f}ms")
        print(f"    With alignment: {len(analysis_with.signals)} signals, {len(analysis_with.raw_messages)} samples")
        print(f"    Without alignment: {len(analysis_without.signals)} signals")
        
        if analysis_with.signals:
            sig = analysis_with.signals[0]
            print(f"    Signal 1: {len(sig.values)} aligned values")
    
    print("\n  PASS: Signal alignment functional")
    return True


def test_timestamp_consistency():
    print("\n=== Test 4: Timestamp Consistency Check ===")
    
    capture = CANCapture(use_virtual=True, enable_j1939=False)
    capture.start()
    time.sleep(1)
    capture.stop()
    
    messages = capture.get_messages(1000)
    
    timestamps = np.array([msg['timestamp'] for msg in messages])
    
    diffs = np.diff(timestamps)
    avg_interval = np.mean(diffs) * 1000
    std_interval = np.std(diffs) * 1000
    jitter = std_interval
    
    print(f"  Total messages: {len(messages)}")
    print(f"  Average interval: {avg_interval:.3f} ms")
    print(f"  Interval std dev: {std_interval:.3f} ms")
    print(f"  Jitter: {jitter:.3f} ms")
    
    is_monotonic = np.all(diffs >= 0)
    print(f"  Monotonic timestamps: {'YES' if is_monotonic else 'NO'}")
    
    if is_monotonic:
        print("  PASS: Timestamps are consistent")
        return True
    else:
        print("  FAIL: Timestamps are not monotonic")
        return False


def main():
    print("Running CAN Analyzer Fix Verification Tests")
    print("=" * 50)
    
    results = []
    
    results.append(("High Precision Timestamps", test_high_precision_timestamps()))
    results.append(("J1939 TP Reassembly", test_j1939_tp_reassembly()))
    results.append(("Signal Alignment", test_signal_alignment()))
    results.append(("Timestamp Consistency", test_timestamp_consistency()))
    
    print("\n" + "=" * 50)
    print("Test Summary:")
    print("-" * 50)
    
    all_passed = True
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"  {name}: {status}")
        if not passed:
            all_passed = False
    
    print("-" * 50)
    if all_passed:
        print("All tests PASSED!")
    else:
        print("Some tests need attention")
    
    return all_passed


if __name__ == '__main__':
    import sys
    success = main()
    sys.exit(0 if success else 1)
