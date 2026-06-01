from can_capture import CANCapture
from signal_analyzer import SignalAnalyzer
from dbc_generator import DBCGenerator
from database import Database
import time
import os

def main():
    print('=== Testing CAN Capture ===')
    capture = CANCapture(use_virtual=True)
    capture.start()
    time.sleep(2)
    capture.stop()
    messages = capture.get_messages(1000)
    print(f'Captured {len(messages)} messages')

    print('\n=== Testing Signal Analyzer ===')
    analyzer = SignalAnalyzer()
    results = analyzer.analyze_messages(messages)
    for can_id, analysis in results.items():
        print(f'CAN ID 0x{can_id:03X}: {len(analysis.signals)} signals')

    print('\n=== Testing DBC Generator ===')
    generator = DBCGenerator()
    generator.from_analysis_results(results)
    os.makedirs('../output', exist_ok=True)
    content = generator.generate('../output/test.dbc')
    print(f'DBC generated, length: {len(content)} bytes')

    print('\n=== Testing Database ===')
    db = Database('../data/test.db')
    project_id = db.create_project('Test Project', 'Integration test')
    print(f'Created project: {project_id}')
    count = db.insert_messages(project_id, messages)
    print(f'Inserted {count} messages')
    can_ids = db.get_unique_can_ids(project_id)
    print(f'Unique CAN IDs: {[hex(c) for c in can_ids]}')

    signals_by_can_id = {}
    for cid, analysis in results.items():
        signals_by_can_id[cid] = []
        for sig in analysis.signals:
            signals_by_can_id[cid].append({
                'name': sig.name,
                'start_bit': sig.start_bit,
                'bit_length': sig.bit_length,
                'confidence': sig.confidence
            })
    db.save_signals(project_id, signals_by_can_id)
    print('Signals saved to database')

    saved_signals = db.get_signals(project_id)
    total_signals = sum(len(sigs) for sigs in saved_signals.values())
    print(f'Retrieved {total_signals} signals from database')

    print('\n=== All tests passed! ===')

if __name__ == '__main__':
    main()
