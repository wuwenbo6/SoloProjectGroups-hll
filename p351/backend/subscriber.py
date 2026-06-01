from typing import Dict, Optional, List, Tuple
import time
import uuid
from .models import DataRecord, WALEvent, ConflictLog, ConflictResolver, AuditLog


class Subscriber:
    def __init__(self, conflict_resolver: ConflictResolver):
        self.data: Dict[int, DataRecord] = {}
        self.conflict_resolver = conflict_resolver
        self.conflict_logs: List[ConflictLog] = []
        self.audit_logs: List[AuditLog] = []
        self.conflict_count = 0
        self.resolved_incoming = 0
        self.resolved_existing = 0

    def apply_wal(self, event: WALEvent) -> Optional[ConflictLog]:
        conflict_log = None

        if event.type in ("INSERT", "UPDATE"):
            incoming = DataRecord(
                id=event.record_id,
                data=event.data,
                timestamp=event.timestamp
            )

            existing = self.data.get(event.record_id)

            if existing is not None and event.type == "INSERT":
                conflict_log = self._resolve_conflict(incoming, existing, event.type)
            elif existing is not None and event.type == "UPDATE":
                conflict_log = self._resolve_conflict(incoming, existing, event.type)
            else:
                self.data[event.record_id] = incoming
                self._add_audit_log(
                    record_id=event.record_id,
                    operation=event.type,
                    before_value=None,
                    before_ts=None,
                    after_value=incoming.data,
                    after_ts=incoming.timestamp,
                    conflict_resolved=False,
                    conflict_resolution=None
                )

        return conflict_log

    def _resolve_conflict(self, incoming: DataRecord, existing: DataRecord, operation: str) -> ConflictLog:
        self.conflict_count += 1

        resolved, reason = self.conflict_resolver.resolve(incoming, existing)
        self.data[incoming.id] = resolved

        resolved_to = "incoming" if resolved.timestamp == incoming.timestamp else "existing"

        if resolved_to == "incoming":
            self.resolved_incoming += 1
        else:
            self.resolved_existing += 1

        log = ConflictLog(
            id=str(uuid.uuid4()),
            timestamp=time.time(),
            record_id=incoming.id,
            incoming_value=incoming.data,
            incoming_ts=incoming.timestamp,
            existing_value=existing.data,
            existing_ts=existing.timestamp,
            resolved_to=resolved_to,
            reason=reason
        )
        self.conflict_logs.append(log)

        self._add_audit_log(
            record_id=incoming.id,
            operation=operation,
            before_value=existing.data,
            before_ts=existing.timestamp,
            after_value=resolved.data,
            after_ts=resolved.timestamp,
            conflict_resolved=True,
            conflict_resolution=reason
        )

        return log

    def _add_audit_log(
        self,
        record_id: int,
        operation: str,
        before_value: Optional[str],
        before_ts: Optional[float],
        after_value: str,
        after_ts: float,
        conflict_resolved: bool,
        conflict_resolution: Optional[str]
    ):
        log = AuditLog(
            id=str(uuid.uuid4()),
            timestamp=time.time(),
            record_id=record_id,
            operation=operation,
            before_value=before_value,
            before_ts=before_ts,
            after_value=after_value,
            after_ts=after_ts,
            conflict_resolved=conflict_resolved,
            conflict_resolution=conflict_resolution
        )
        self.audit_logs.append(log)

    def get_all_data(self) -> Dict[int, DataRecord]:
        return self.data.copy()

    def get_data_list(self) -> list:
        return [r.to_dict() for r in sorted(self.data.values(), key=lambda x: x.id)]

    def get_conflict_stats(self) -> dict:
        return {
            "total_conflicts": self.conflict_count,
            "resolved_incoming": self.resolved_incoming,
            "resolved_existing": self.resolved_existing,
            "logs": [log.to_dict() for log in self.conflict_logs[-100:]]
        }

    def get_audit_logs(self) -> list:
        return [log.to_dict() for log in self.audit_logs[-200:]]

    def direct_insert(self, record_id: int, data: str, timestamp: Optional[float] = None) -> DataRecord:
        ts = timestamp if timestamp is not None else time.time()
        record = DataRecord(id=record_id, data=data, timestamp=ts)
        self.data[record_id] = record
        return record
