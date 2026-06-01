from typing import Tuple
from .models import DataRecord, ConflictResolver, to_utc_timestamp


class TimestampConflictResolver(ConflictResolver):
    def resolve(self, incoming: DataRecord, existing: DataRecord) -> Tuple[DataRecord, str]:
        incoming_utc = to_utc_timestamp(incoming.timestamp)
        existing_utc = to_utc_timestamp(existing.timestamp)

        if incoming_utc > existing_utc:
            return incoming, f"保留传入记录：UTC时间戳更新 ({incoming_utc:.6f} > {existing_utc:.6f})"
        return existing, f"保留本地记录：UTC时间戳更新或相等 ({existing_utc:.6f} >= {incoming_utc:.6f})"
