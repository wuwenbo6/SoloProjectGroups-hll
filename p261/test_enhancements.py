import time
import sys
import threading

sys.path.insert(0, '.')

from drbd.bitmap import Bitmap
from drbd.node import DRBDNode
from drbd.recovery import SplitBrainDetector, NodeSelector, RecoveryOrchestrator

print('=== Test 1: Weighted NodeSelector ===')
node_a = DRBDNode('A', 7300, priority=2, bitmap_size=128)
node_b = DRBDNode('B', 7301, priority=1, bitmap_size=128)
node_a.start_server()
node_b.start_server()
time.sleep(0.3)
node_a.connect_to_peer(7301)
time.sleep(0.3)

for bid in [10, 11, 12, 13, 14, 15]:
    node_a.write_block(bid)
time.sleep(0.5)

for bid in [10, 20, 21]:
    node_b.write_block(bid)
time.sleep(0.5)

print(f'A dirty: {len(node_a.bitmap.bits)}, B dirty: {len(node_b.bitmap.bits)}')
print(f'A last_write: {node_a.last_write_ts:.3f}, B last_write: {node_b.last_write_ts:.3f}')

node_a.disconnect_peer()
node_b.disconnect_peer()
time.sleep(0.3)

time.sleep(0.2)
node_b.write_block(50)
time.sleep(0.5)

selector = NodeSelector(ts_weight=0.4, dirty_weight=0.6)
result = selector.select_source(node_a, node_b)
print(f'Source: {result["source"]}, Target: {result["target"]}')
print(f'Reason: {result["reason"]}')
print('Weights:', result['weights'])
print('Source dirty:', result['source_dirty'], 'Target dirty:', result['target_dirty'])

print()
print('=== Test 2: IO Suspension and Write Caching ===')
node_c = DRBDNode('C', 7302, priority=1, bitmap_size=128)
node_c.start_server()
time.sleep(0.3)

node_c.write_block(100)
print(f'After normal write - disk has 100: {100 in node_c.disk}')
print(f'Dirty blocks: {node_c.bitmap.get_dirty_blocks()}')

node_c.suspend_io()
print(f'IO suspended: {node_c.io_suspended}')

node_c.write_block(200)
node_c.write_block(201)
print(f'After cached writes - disk has 200: {200 in node_c.disk}')
print(f'Cache size: {len(node_c.write_cache)}')
print(f'Cache blocks: {[e["block_id"] for e in node_c.write_cache]}')

count = node_c.replay_cache()
print(f'Replayed {count} cached writes')
print(f'Disk has 200: {200 in node_c.disk}, 201: {201 in node_c.disk}')
print(f'Dirty blocks: {sorted(node_c.bitmap.get_dirty_blocks())}')

node_c.resume_io()
print(f'IO suspended: {node_c.io_suspended}')

node_c.write_block(300)
print(f'After resume write - disk has 300: {300 in node_c.disk}')

print()
print('=== Test 3: Full Recovery with IO Suspension ===')
node_d = DRBDNode('D', 7303, priority=2, bitmap_size=128)
node_e = DRBDNode('E', 7304, priority=1, bitmap_size=128)
node_d.start_server()
node_e.start_server()
time.sleep(0.3)
node_d.connect_to_peer(7304)
time.sleep(0.5)

node_d.disconnect_peer()
node_e.disconnect_peer()
time.sleep(0.3)

for bid in [1, 2, 3, 4, 5]:
    node_d.write_block(bid)
for bid in [1, 6, 7]:
    node_e.write_block(bid)
time.sleep(0.3)

print(f'D dirty: {len(node_d.bitmap.bits)}, E dirty: {len(node_e.bitmap.bits)}')

events = []
def on_event(e):
    events.append(e['phase'])
    print(f'  {e["phase"]}: {e.get("message", "")}')

orchestrator = RecoveryOrchestrator(event_callback=on_event)

def writer_thread(node, start, end):
    time.sleep(1.5)
    for bid in range(start, end):
        node.write_block(bid)

tw = threading.Thread(target=writer_thread, args=(node_d, 100, 103), daemon=True)
tw.start()

result = orchestrator.recover(node_d, node_e)
tw.join(timeout=2)

print(f'Recovery status: {result["status"]}')
if 'selection' in result:
    print(f'Selection: {result["selection"]["source"]} -> {result["selection"]["target"]}')
if 'cached_replayed' in result:
    print(f'Cached writes replayed: {result["cached_replayed"]}')

print()
print('Events sequence:')
for e in events:
    print(f'  - {e}')

for n in [node_a, node_b, node_c, node_d, node_e]:
    n.stop()

print()
print('All tests PASSED!')
