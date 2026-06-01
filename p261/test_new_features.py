import time
import sys
import threading

sys.path.insert(0, '.')

from drbd.node import DRBDNode
from drbd.recovery import SplitBrainDetector, NodeSelector, ResyncOrchestrator, ReportGenerator

print('=== Test 1: ResyncOrchestrator - Differential Sync ===')
node_a = DRBDNode('A', 7400, priority=2, bitmap_size=128)
node_b = DRBDNode('B', 7401, priority=1, bitmap_size=128)
node_a.start_server()
node_b.start_server()
time.sleep(0.3)
node_a.connect_to_peer(7401)
time.sleep(0.5)

node_a.disconnect_peer()
node_b.disconnect_peer()
time.sleep(0.3)

for bid in [1, 2, 3, 4, 5]:
    node_a.write_block(bid)
for bid in [1, 6, 7]:
    node_b.write_block(bid)
time.sleep(0.3)

print(f'A dirty: {sorted(node_a.bitmap.bits)}')
print(f'B dirty: {sorted(node_b.bitmap.bits)}')

resync_events = []
def on_resync_event(e):
    resync_events.append(e)
    print(f'  {e.get("phase", "")}: {e.get("message", "")}')

resync = ResyncOrchestrator(event_callback=on_resync_event)

diff = resync.compute_diff(node_a, node_b)
print(f'Diff computed: {diff["total_diff"]} blocks to sync')
print(f'  Only source: {diff["only_source"]}')
print(f'  Only target: {diff["only_target"]}')
print(f'  Common: {diff["common"]}')

node_a.connect_to_peer(7401)
time.sleep(0.5)

result = resync.resync(node_a, node_b)
print(f'Resync result: {result["status"]}')
print(f'Blocks synced: {result["blocks_synced"]}')

time.sleep(0.5)
print(f'After resync, A dirty: {sorted(node_a.bitmap.bits)}')
print(f'After resync, B dirty: {sorted(node_b.bitmap.bits)}')
assert node_a.bitmap.bits == node_b.bitmap.bits, 'Bitmaps should be equal after resync'
print('✓ Bitmaps are equal after resync')

print()
print('=== Test 2: ReportGenerator ===')
detector = SplitBrainDetector()
detection = detector.detect(node_a, node_b)
selector = NodeSelector()
selection = selector.select_source(node_a, node_b)

report_gen = ReportGenerator()
report = report_gen.generate(
    node_a, node_b,
    detection_result=detection,
    selection_result={
        'source': selection['source'],
        'target': selection['target'],
        'reason': selection['reason'],
        'weights': selection.get('weights'),
    },
    recovery_result=result,
)

print(f'Report version: {report["report_version"]}')
print(f'Severity: {report["summary"]["severity"]}')
print(f'Split-brain: {report["summary"]["is_split_brain"]}')
print(f'Divergent blocks: {report["summary"]["total_divergent_blocks"]}')
print(f'Source: {report["summary"]["source_node"]}')
print(f'Target: {report["summary"]["target_node"]}')
print(f'Blocks synced: {report["summary"]["blocks_synced"]}')
print(f'Node A dirty count: {report["nodes"]["node_a"]["dirty_count"]}')
print(f'Node B dirty count: {report["nodes"]["node_b"]["dirty_count"]}')
print(f'Bitmap analysis - unique A: {report["bitmap_analysis"]["node_a_unique_count"]}')
print(f'Bitmap analysis - unique B: {report["bitmap_analysis"]["node_b_unique_count"]}')
print(f'Bitmap analysis - common: {report["bitmap_analysis"]["total_common_blocks"]}')

print()
print('=== Test 3: Text Report Formatting ===')
text_report = report_gen.format_text(report)
print(text_report[:800])
print('...')
print(f'Text report length: {len(text_report)} chars')
assert 'DRBD Split-Brain Analysis Report' in text_report, 'Report should contain header'
assert 'Node A' in text_report, 'Report should contain Node A section'
assert 'Node B' in text_report, 'Report should contain Node B section'
assert 'Bitmap Analysis' in text_report, 'Report should contain bitmap analysis'
print('✓ Text report formatting works')

print()
print('=== Test 4: Already Synced ===')
node_a.bitmap.bits.clear()
node_b.bitmap.bits.clear()
resync2 = ResyncOrchestrator()
result2 = resync2.resync(node_a, node_b)
print(f'Already synced result: {result2["status"]}')
assert result2['status'] == 'already_synced', 'Should detect already synced'
assert result2['blocks_synced'] == 0, 'Should sync 0 blocks'
print('✓ Already synced detection works')

for n in [node_a, node_b]:
    n.stop()

print()
print('=== Test 5: Resync while IO suspended with cached writes ===')
node_c = DRBDNode('C', 7402, priority=2, bitmap_size=128)
node_d = DRBDNode('D', 7403, priority=1, bitmap_size=128)
node_c.start_server()
node_d.start_server()
time.sleep(0.3)
node_c.connect_to_peer(7403)
time.sleep(0.5)

node_c.disconnect_peer()
node_d.disconnect_peer()
time.sleep(0.3)

node_c.write_block(10)
node_c.write_block(11)
node_d.write_block(20)
time.sleep(0.3)

node_c.suspend_io()
node_d.suspend_io()
time.sleep(0.2)

def writer_while_syncing():
    time.sleep(0.8)
    node_c.write_block(100)
    node_d.write_block(200)

tw = threading.Thread(target=writer_while_syncing, daemon=True)
tw.start()

node_c.connect_to_peer(7403)
time.sleep(0.5)

resync3 = ResyncOrchestrator()
result3 = resync3.resync(node_c, node_d)
tw.join(timeout=2)

print(f'Resync result: {result3["status"]}, blocks synced: {result3["blocks_synced"]}')
print(f'Node C cache size: {len(node_c.write_cache)}')
print(f'Node D cache size: {len(node_d.write_cache)}')

count_c = node_c.replay_cache()
count_d = node_d.replay_cache()
node_c.resume_io()
node_d.resume_io()
print(f'Replayed {count_c} on C, {count_d} on D')
print(f'Node C disk: {sorted(node_c.disk.keys())}')
print(f'Node D disk: {sorted(node_d.disk.keys())}')

assert 100 in node_c.disk, 'Cached write 100 should be replayed'
assert 200 in node_d.disk, 'Cached write 200 should be replayed'
print('✓ Cached writes during resync are preserved and replayed')

for n in [node_c, node_d]:
    n.stop()

print()
print('All new feature tests PASSED!')
