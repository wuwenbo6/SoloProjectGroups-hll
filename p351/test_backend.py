import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend import Publisher, Subscriber, TimestampConflictResolver, Simulator
from backend.models import DataRecord
import time


def test_data_record():
    print("=== Testing DataRecord ===")
    record = DataRecord(id=1, data="test", timestamp=1234567890.0)
    assert record.id == 1
    assert record.data == "test"
    assert record.timestamp == 1234567890.0
    print("✓ DataRecord tests passed")


def test_conflict_resolver():
    print("\n=== Testing ConflictResolver ===")
    resolver = TimestampConflictResolver()

    newer = DataRecord(id=1, data="newer", timestamp=2000.0)
    older = DataRecord(id=1, data="older", timestamp=1000.0)

    resolved, reason = resolver.resolve(newer, older)
    assert resolved.data == "newer", f"Expected 'newer', got '{resolved.data}'"
    print(f"✓ Incoming newer record wins: {reason}")

    resolved, reason = resolver.resolve(older, newer)
    assert resolved.data == "newer", f"Expected 'newer', got '{resolved.data}'"
    print(f"✓ Existing newer record wins: {reason}")

    print("✓ ConflictResolver tests passed")


def test_publisher():
    print("\n=== Testing Publisher ===")
    pub = Publisher()

    event1 = pub.insert(1, "value1")
    assert event1.type == "INSERT"
    assert event1.record_id == 1
    assert 1 in pub.data
    assert pub.data[1].data == "value1"
    print(f"✓ Insert record: id=1, data='value1'")

    event2 = pub.update(1, "value1_updated")
    assert event2.type == "UPDATE"
    assert pub.data[1].data == "value1_updated"
    print(f"✓ Update record: id=1, data='value1_updated'")

    wal = pub.get_next_wal()
    assert wal.type == "INSERT"
    print(f"✓ Get WAL from queue: {wal.type}")

    print("✓ Publisher tests passed")


def test_subscriber():
    print("\n=== Testing Subscriber ===")
    resolver = TimestampConflictResolver()
    sub = Subscriber(resolver)

    from backend.models import WALEvent
    import uuid

    insert_event = WALEvent(
        id=str(uuid.uuid4()),
        type="INSERT",
        record_id=1,
        data="sub_value1",
        timestamp=time.time()
    )
    conflict = sub.apply_wal(insert_event)
    assert conflict is None
    assert 1 in sub.data
    assert sub.data[1].data == "sub_value1"
    print(f"✓ Normal insert (no conflict)")

    audit_logs = sub.get_audit_logs()
    assert len(audit_logs) == 1
    assert audit_logs[0]["operation"] == "INSERT"
    assert audit_logs[0]["conflict_resolved"] == False
    print(f"✓ Audit log created for normal insert")

    insert_event2 = WALEvent(
        id=str(uuid.uuid4()),
        type="INSERT",
        record_id=1,
        data="conflicting_value",
        timestamp=time.time() + 1.0
    )
    conflict = sub.apply_wal(insert_event2)
    assert conflict is not None
    assert conflict.resolved_to == "incoming"
    assert sub.data[1].data == "conflicting_value"
    assert sub.conflict_count == 1
    print(f"✓ Conflict resolved to incoming (newer timestamp)")
    print(f"  Reason: {conflict.reason}")

    audit_logs = sub.get_audit_logs()
    assert len(audit_logs) == 2
    assert audit_logs[1]["conflict_resolved"] == True
    assert "UTC" in audit_logs[1]["conflict_resolution"]
    print(f"✓ Audit log created with conflict resolution (UTC timestamp)")

    insert_event3 = WALEvent(
        id=str(uuid.uuid4()),
        type="INSERT",
        record_id=1,
        data="older_value",
        timestamp=time.time() - 10.0
    )
    conflict = sub.apply_wal(insert_event3)
    assert conflict is not None
    assert conflict.resolved_to == "existing"
    assert sub.data[1].data == "conflicting_value"
    assert sub.conflict_count == 2
    print(f"✓ Conflict resolved to existing (newer timestamp)")
    print(f"  Reason: {conflict.reason}")

    stats = sub.get_conflict_stats()
    assert stats["total_conflicts"] == 2
    assert stats["resolved_incoming"] == 1
    assert stats["resolved_existing"] == 1
    print(f"✓ Conflict stats: total=2, incoming=1, existing=1")

    audit_logs = sub.get_audit_logs()
    assert len(audit_logs) == 3
    print(f"✓ Total audit logs: 3")

    print("✓ Subscriber tests passed")


def test_simulator():
    print("\n=== Testing Simulator ===")
    sim = Simulator()

    result = sim.insert(1, "sim_value1")
    assert result["success"]
    assert len(result["publisher_data"]) == 1
    assert len(result["subscriber_data"]) == 1
    print(f"✓ Simulator insert: id=1")

    result = sim.insert_conflict_pair(2)
    assert result["success"]
    assert result["conflict_log"] is not None
    print(f"✓ Triggered conflict on id=2: resolved_to={result['conflict_log']['resolved_to']}")

    state = sim.get_state()
    assert state["conflict_count"] >= 1
    print(f"✓ State reports {state['conflict_count']} conflicts")

    result = sim.reset()
    assert result["success"]
    state = sim.get_state()
    assert state["conflict_count"] == 0
    assert len(state["publisher_data"]) == 0
    print(f"✓ Reset simulator state")

    print("✓ Simulator tests passed")


def test_end_to_end():
    print("\n=== Testing End-to-End Flow ===")
    sim = Simulator()

    print("1. Inserting 3 records into publisher...")
    for i in range(1, 4):
        result = sim.insert(i, f"data_{i}")
        print(f"   Inserted id={i}, replicated to subscriber")

    state = sim.get_state()
    assert len(state["publisher_data"]) == 3
    assert len(state["subscriber_data"]) == 3
    assert state["conflict_count"] == 0
    print("   ✓ All 3 records replicated without conflict")

    print("\n2. Manually inserting conflicting record into subscriber...")
    sim.subscriber.direct_insert(2, "subscriber_override", time.time() - 5.0)
    print("   ✓ Inserted id=2 with older timestamp into subscriber directly")

    print("\n3. Updating same id in publisher (will cause conflict)...")
    result = sim.update(2, "publisher_new_value")
    print(f"   ✓ Updated id=2 in publisher")

    state = sim.get_state()
    assert state["conflict_count"] == 1

    sub_data = {r["id"]: r for r in state["subscriber_data"]}
    pub_data = {r["id"]: r for r in state["publisher_data"]}

    print(f"\n4. Conflict resolution result:")
    print(f"   Publisher value (ts={pub_data[2]['timestamp']:.6f}): {pub_data[2]['data']}")
    print(f"   Subscriber value (ts={sub_data[2]['timestamp']:.6f}): {sub_data[2]['data']}")

    conflict_log = state["conflict_logs"][-1]
    print(f"   Resolved to: {conflict_log['resolved_to']}")
    print(f"   Reason: {conflict_log['reason']}")

    if conflict_log["resolved_to"] == "incoming":
        assert sub_data[2]["data"] == "publisher_new_value"
    else:
        assert sub_data[2]["data"] == "subscriber_override"

    print("\n✓ End-to-end test passed!")


if __name__ == "__main__":
    try:
        test_data_record()
        test_conflict_resolver()
        test_publisher()
        test_subscriber()
        test_simulator()
        test_end_to_end()
        print("\n" + "=" * 50)
        print("ALL TESTS PASSED! ✓")
        print("=" * 50)
    except AssertionError as e:
        print(f"\n✗ TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
