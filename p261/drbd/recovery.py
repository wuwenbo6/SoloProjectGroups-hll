import time

from .node import STATE_SPLIT_BRAIN, STATE_SYNCING, STATE_RECOVERED, STATE_CONNECTED


class SplitBrainDetector:
    def __init__(self):
        self.detection_log = []

    def detect(self, node_a, node_b):
        status_a = node_a.get_status()
        status_b = node_b.get_status()

        both_primary = status_a["role"] == "PRIMARY" and status_b["role"] == "PRIMARY"
        both_wrote = status_a["generation"] > 0 and status_b["generation"] > 0
        diverged = status_a["generation"] != status_b["generation"]

        bitmap_a = node_a.bitmap
        bitmap_b = node_b.bitmap
        only_a, only_b, common = bitmap_a.diff(bitmap_b)
        has_conflict = len(only_a) > 0 or len(only_b) > 0

        is_split_brain = both_primary and has_conflict

        result = {
            "is_split_brain": is_split_brain,
            "both_primary": both_primary,
            "has_bitmap_diff": has_conflict,
            "only_node_a": sorted(only_a),
            "only_node_b": sorted(only_b),
            "common_blocks": sorted(common),
            "generation_a": status_a["generation"],
            "generation_b": status_b["generation"],
            "timestamp": time.time(),
        }

        if is_split_brain:
            self.detection_log.append(result)
            node_a.state = STATE_SPLIT_BRAIN
            node_b.state = STATE_SPLIT_BRAIN

        return result


class NodeSelector:
    def __init__(self, ts_weight=0.4, dirty_weight=0.6):
        self.ts_weight = ts_weight
        self.dirty_weight = dirty_weight

    def _normalize_timestamp(self, ts_a, ts_b):
        max_ts = max(ts_a, ts_b)
        min_ts = min(ts_a, ts_b)
        if max_ts == min_ts:
            return 0.5, 0.5
        range_ts = max_ts - min_ts
        return (ts_a - min_ts) / range_ts, (ts_b - min_ts) / range_ts

    def _normalize_dirty(self, count_a, count_b):
        max_count = max(count_a, count_b)
        if max_count == 0:
            return 0.5, 0.5
        return count_a / max_count, count_b / max_count

    def select_source(self, node_a, node_b):
        status_a = node_a.get_status()
        status_b = node_b.get_status()

        ts_a = status_a["last_write_ts"]
        ts_b = status_b["last_write_ts"]
        pri_a = status_a["priority"]
        pri_b = status_b["priority"]
        dirty_a = len(status_a["bitmap"]["dirty_blocks"]) if isinstance(status_a["bitmap"], dict) else len(node_a.bitmap.get_dirty_blocks())
        dirty_b = len(status_b["bitmap"]["dirty_blocks"]) if isinstance(status_b["bitmap"], dict) else len(node_b.bitmap.get_dirty_blocks())

        reason = ""

        if ts_a > 0 and ts_b > 0:
            ts_score_a, ts_score_b = self._normalize_timestamp(ts_a, ts_b)
            dirty_score_a, dirty_score_b = self._normalize_dirty(dirty_a, dirty_b)

            score_a = self.ts_weight * ts_score_a + self.dirty_weight * dirty_score_a
            score_b = self.ts_weight * ts_score_b + self.dirty_weight * dirty_score_b

            reason = (
                f"Weighted scoring (ts={self.ts_weight}, dirty={self.dirty_weight}): "
                f"A={score_a:.3f} (ts={ts_score_a:.3f}, dirty={dirty_score_a:.3f}) vs "
                f"B={score_b:.3f} (ts={ts_score_b:.3f}, dirty={dirty_score_b:.3f})"
            )

            if abs(score_a - score_b) < 1e-6:
                if pri_a > pri_b:
                    source, target = node_a, node_b
                    reason += f" → Tiebreak: Node A priority {pri_a} > {pri_b}"
                elif pri_b > pri_a:
                    source, target = node_b, node_a
                    reason += f" → Tiebreak: Node B priority {pri_b} > {pri_a}"
                else:
                    source, target = node_a, node_b
                    reason += " → Tiebreak: Node A default"
            elif score_a > score_b:
                source, target = node_a, node_b
                reason += f" → Node A selected"
            else:
                source, target = node_b, node_a
                reason += f" → Node B selected"
        elif ts_a > 0:
            source, target = node_a, node_b
            reason = "Only Node A has writes"
        elif ts_b > 0:
            source, target = node_b, node_a
            reason = "Only Node B has writes"
        else:
            source, target = node_a, node_b
            reason = "No writes on either node, Node A selected as default"

        return {
            "source": source.node_id,
            "target": target.node_id,
            "source_node": source,
            "target_node": target,
            "reason": reason,
            "source_ts": ts_a if source == node_a else ts_b,
            "target_ts": ts_b if source == node_a else ts_a,
            "source_priority": pri_a if source == node_a else pri_b,
            "target_priority": pri_b if source == node_a else pri_a,
            "source_dirty": dirty_a if source == node_a else dirty_b,
            "target_dirty": dirty_b if source == node_a else dirty_a,
            "weights": {"ts": self.ts_weight, "dirty": self.dirty_weight},
        }


class RecoveryOrchestrator:
    def __init__(self, event_callback=None):
        self.detector = SplitBrainDetector()
        self.selector = NodeSelector()
        self.event_callback = event_callback
        self.recovery_log = []
        self.in_progress = False

    def _emit(self, phase, **kwargs):
        entry = {"phase": phase, "timestamp": time.time(), **kwargs}
        self.recovery_log.append(entry)
        if self.event_callback:
            self.event_callback(entry)

    def recover(self, node_a, node_b):
        if self.in_progress:
            return {"error": "Recovery already in progress"}
        self.in_progress = True

        try:
            return self._do_recover(node_a, node_b)
        finally:
            self.in_progress = False

    def _do_recover(self, node_a, node_b):
        self._emit("start", message="Starting split-brain recovery process")

        self._emit(
            "suspend_io",
            message="Phase 0: Suspending IO on both nodes",
        )
        node_a.suspend_io()
        node_b.suspend_io()
        time.sleep(0.3)
        self._emit(
            "suspend_io_complete",
            message="IO suspended on both nodes. New writes will be cached.",
            cache_a=node_a.write_cache,
            cache_b=node_b.write_cache,
        )

        self._emit(
            "detect",
            message="Phase 1: Detecting split-brain condition",
            node_a=node_a.node_id,
            node_b=node_b.node_id,
        )
        detection = self.detector.detect(node_a, node_b)
        self._emit(
            "detect_result",
            is_split_brain=detection["is_split_brain"],
            only_node_a=detection["only_node_a"],
            only_node_b=detection["only_node_b"],
        )

        if not detection["is_split_brain"]:
            self._emit(
                "no_conflict",
                message="No split-brain detected. Bitmaps are consistent.",
            )
            count_a = node_a.replay_cache()
            count_b = node_b.replay_cache()
            node_a.resume_io()
            node_b.resume_io()
            self._emit(
                "resume_io_complete",
                message=f"IO resumed. Replayed {count_a} writes on A, {count_b} on B.",
            )
            return {"status": "no_conflict", "detection": detection}

        self._emit(
            "select",
            message="Phase 2: Selecting data source node",
        )
        selection = self.selector.select_source(node_a, node_b)
        self._emit(
            "select_result",
            source=selection["source"],
            target=selection["target"],
            reason=selection["reason"],
        )

        source = selection["source_node"]
        target = selection["target_node"]

        source.state = STATE_SYNCING
        target.state = STATE_SYNCING
        self._emit(
            "sync_start",
            message=f"Phase 3: Syncing data from {source.node_id} to {target.node_id}",
            source=source.node_id,
            target=target.node_id,
        )

        only_source, only_target, common = source.bitmap.diff(target.bitmap)
        blocks_to_sync = sorted(only_source | only_target)

        self._emit(
            "bitmap_diff",
            only_source=sorted(only_source),
            only_target=sorted(only_target),
            common=sorted(common),
            blocks_to_sync=blocks_to_sync,
        )

        node_a.send_bitmap()
        node_b.send_bitmap()
        time.sleep(0.3)

        if blocks_to_sync:
            chunk_size = 8
            for i in range(0, len(blocks_to_sync), chunk_size):
                chunk = blocks_to_sync[i : i + chunk_size]
                source.send_sync_data(chunk)
                self._emit(
                    "sync_progress",
                    current=min(i + chunk_size, len(blocks_to_sync)),
                    total=len(blocks_to_sync),
                    blocks=chunk,
                )
                time.sleep(0.3)

        source.send_sync_complete()
        source.state = STATE_RECOVERED
        target.state = STATE_RECOVERED
        self._emit(
            "sync_complete",
            message=f"Synchronization complete. {len(blocks_to_sync)} blocks synced.",
            blocks_synced=len(blocks_to_sync),
        )

        self._emit(
            "resume_io",
            message="Phase 4: Resuming IO and replaying cached writes",
        )
        count_a = node_a.replay_cache()
        count_b = node_b.replay_cache()
        node_a.resume_io()
        node_b.resume_io()
        self._emit(
            "resume_io_complete",
            message=f"IO resumed. Replayed {count_a} cached writes on A, {count_b} on B.",
            replayed_a=count_a,
            replayed_b=count_b,
        )

        self._emit(
            "complete",
            message=f"Recovery complete. {len(blocks_to_sync)} blocks synchronized, {count_a + count_b} cached writes replayed.",
            source=source.node_id,
            target=target.node_id,
            blocks_synced=len(blocks_to_sync),
            cached_replayed=count_a + count_b,
        )

        return {
            "status": "recovered",
            "detection": detection,
            "selection": {
                "source": selection["source"],
                "target": selection["target"],
                "reason": selection["reason"],
            },
            "blocks_synced": len(blocks_to_sync),
            "cached_replayed": count_a + count_b,
        }


class ResyncOrchestrator:
    def __init__(self, event_callback=None):
        self.event_callback = event_callback
        self.in_progress = False
        self.sync_log = []

    def _emit(self, **kwargs):
        entry = {"timestamp": time.time(), **kwargs}
        self.sync_log.append(entry)
        if self.event_callback:
            self.event_callback(entry)

    def compute_diff(self, source_node, target_node):
        only_source, only_target, common = source_node.bitmap.diff(target_node.bitmap)
        return {
            "only_source": sorted(only_source),
            "only_target": sorted(only_target),
            "common": sorted(common),
            "blocks_to_sync": sorted(only_source | only_target),
            "source_dirty_count": len(source_node.bitmap.bits),
            "target_dirty_count": len(target_node.bitmap.bits),
            "total_diff": len(only_source | only_target),
        }

    def resync(self, source_node, target_node, chunk_size=8):
        if self.in_progress:
            return {"error": "Resync already in progress"}
        self.in_progress = True

        try:
            return self._do_resync(source_node, target_node, chunk_size)
        finally:
            self.in_progress = False

    def _do_resync(self, source_node, target_node, chunk_size):
        self._emit(
            phase="resync_start",
            message=f"Starting differential resync from {source_node.node_id} to {target_node.node_id}",
            source=source_node.node_id,
            target=target_node.node_id,
        )

        diff = self.compute_diff(source_node, target_node)
        self._emit(
            phase="resync_diff",
            message=f"Computed diff: {diff['total_diff']} blocks to sync",
            only_source=diff["only_source"],
            only_target=diff["only_target"],
            common=diff["common"],
            blocks_to_sync=diff["blocks_to_sync"],
        )

        blocks_to_sync = diff["blocks_to_sync"]
        if not blocks_to_sync:
            self._emit(
                phase="resync_complete",
                message="No diff found. Nodes already in sync.",
                blocks_synced=0,
            )
            return {"status": "already_synced", "diff": diff, "blocks_synced": 0}

        source_node.send_bitmap()
        target_node.send_bitmap()
        time.sleep(0.3)

        for i in range(0, len(blocks_to_sync), chunk_size):
            chunk = blocks_to_sync[i : i + chunk_size]
            source_node.send_sync_data(chunk)
            self._emit(
                phase="resync_progress",
                current=min(i + chunk_size, len(blocks_to_sync)),
                total=len(blocks_to_sync),
                blocks=chunk,
            )
            time.sleep(0.3)

        source_node.send_sync_complete()
        source_node.bitmap.merge_from(target_node.bitmap)
        target_node.bitmap.merge_from(source_node.bitmap)

        self._emit(
            phase="resync_complete",
            message=f"Resync complete. {len(blocks_to_sync)} blocks synchronized.",
            blocks_synced=len(blocks_to_sync),
            only_source=diff["only_source"],
            only_target=diff["only_target"],
        )

        return {
            "status": "resynced",
            "source": source_node.node_id,
            "target": target_node.node_id,
            "diff": diff,
            "blocks_synced": len(blocks_to_sync),
        }


class ReportGenerator:
    def generate(self, node_a, node_b, detection_result=None, selection_result=None, recovery_result=None):
        status_a = node_a.get_status()
        status_b = node_b.get_status()

        only_a, only_b, common = node_a.bitmap.diff(node_b.bitmap)

        report = {
            "report_version": "1.0",
            "generated_at": time.time(),
            "summary": {},
            "nodes": {
                "node_a": self._extract_node_info(node_a, status_a),
                "node_b": self._extract_node_info(node_b, status_b),
            },
            "bitmap_analysis": {
                "only_node_a": sorted(only_a),
                "only_node_b": sorted(only_b),
                "common_blocks": sorted(common),
                "total_divergent_blocks": len(only_a) + len(only_b),
                "total_common_blocks": len(common),
                "node_a_unique_count": len(only_a),
                "node_b_unique_count": len(only_b),
            },
            "detection": detection_result,
            "selection": selection_result,
            "recovery": recovery_result,
        }

        is_split_brain = detection_result.get("is_split_brain", False) if detection_result else (len(only_a) > 0 or len(only_b) > 0)
        total_divergent = len(only_a) + len(only_b)

        if is_split_brain and total_divergent > 0:
            severity = "critical" if total_divergent > 20 else "warning"
        elif total_divergent > 0:
            severity = "warning"
        else:
            severity = "ok"

        report["summary"] = {
            "is_split_brain": is_split_brain,
            "severity": severity,
            "total_divergent_blocks": total_divergent,
            "source_node": selection_result.get("source") if selection_result else "not_selected",
            "target_node": selection_result.get("target") if selection_result else "not_selected",
            "recovery_status": recovery_result.get("status") if recovery_result else "not_started",
            "blocks_synced": recovery_result.get("blocks_synced", 0) if recovery_result else 0,
            "cached_replayed": recovery_result.get("cached_replayed", 0) if recovery_result else 0,
        }

        return report

    def _extract_node_info(self, node, status):
        return {
            "node_id": node.node_id,
            "priority": node.priority,
            "state": node.state,
            "role": node.role,
            "generation": node.generation,
            "last_write_ts": node.last_write_ts,
            "last_write_ts_str": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(node.last_write_ts)) if node.last_write_ts > 0 else None,
            "connected": node.connected,
            "io_suspended": node.io_suspended,
            "dirty_blocks": node.bitmap.get_dirty_blocks(),
            "dirty_count": len(node.bitmap.get_dirty_blocks()),
            "disk_blocks": list(node.disk.keys()),
            "write_cache_size": len(node.write_cache),
            "write_cache_blocks": [e["block_id"] for e in node.write_cache],
        }

    def format_text(self, report):
        lines = []
        lines.append("=" * 72)
        lines.append("DRBD Split-Brain Analysis Report")
        lines.append("=" * 72)
        lines.append(f"Generated at: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(report['generated_at']))}")
        lines.append("")

        s = report["summary"]
        lines.append("Summary")
        lines.append("-" * 72)
        lines.append(f"  Split-Brain Detected : {s['is_split_brain']}")
        lines.append(f"  Severity            : {s['severity'].upper()}")
        lines.append(f"  Divergent Blocks    : {s['total_divergent_blocks']}")
        lines.append(f"  Recovery Status     : {s['recovery_status']}")
        lines.append(f"  Source Node         : {s['source_node']}")
        lines.append(f"  Target Node         : {s['target_node']}")
        lines.append(f"  Blocks Synced       : {s['blocks_synced']}")
        lines.append(f"  Cached Replayed     : {s['cached_replayed']}")
        lines.append("")

        for nid in ["node_a", "node_b"]:
            n = report["nodes"][nid]
            lines.append(f"Node {n['node_id'].upper()}")
            lines.append("-" * 72)
            lines.append(f"  Priority            : {n['priority']}")
            lines.append(f"  State               : {n['state']}")
            lines.append(f"  Role                : {n['role']}")
            lines.append(f"  Generation          : {n['generation']}")
            lines.append(f"  Last Write          : {n['last_write_ts_str'] or 'never'}")
            lines.append(f"  Connected           : {n['connected']}")
            lines.append(f"  IO Suspended        : {n['io_suspended']}")
            lines.append(f"  Dirty Blocks        : {n['dirty_count']}")
            lines.append(f"  Write Cache         : {n['write_cache_size']} entries")
            if n["dirty_blocks"]:
                lines.append(f"  Dirty Block IDs     : {self._format_block_list(n['dirty_blocks'])}")
            lines.append("")

        ba = report["bitmap_analysis"]
        lines.append("Bitmap Analysis")
        lines.append("-" * 72)
        lines.append(f"  Unique to Node A    : {ba['node_a_unique_count']} blocks")
        if ba["only_node_a"]:
            lines.append(f"    Blocks: {self._format_block_list(ba['only_node_a'])}")
        lines.append(f"  Unique to Node B    : {ba['node_b_unique_count']} blocks")
        if ba["only_node_b"]:
            lines.append(f"    Blocks: {self._format_block_list(ba['only_node_b'])}")
        lines.append(f"  Common Blocks       : {ba['total_common_blocks']} blocks")
        lines.append(f"  Total Divergent     : {ba['total_divergent_blocks']} blocks")
        lines.append("")

        if report["selection"]:
            sel = report["selection"]
            lines.append("Node Selection")
            lines.append("-" * 72)
            lines.append(f"  Source              : {sel.get('source', 'N/A')}")
            lines.append(f"  Target              : {sel.get('target', 'N/A')}")
            lines.append(f"  Reason              : {sel.get('reason', 'N/A')}")
            if "weights" in sel:
                lines.append(f"  Weights             : ts={sel['weights']['ts']}, dirty={sel['weights']['dirty']}")
            lines.append("")

        if report["recovery"]:
            rec = report["recovery"]
            lines.append("Recovery Details")
            lines.append("-" * 72)
            lines.append(f"  Status              : {rec.get('status', 'N/A')}")
            lines.append(f"  Blocks Synced       : {rec.get('blocks_synced', 0)}")
            lines.append(f"  Cached Replayed     : {rec.get('cached_replayed', 0)}")
            lines.append("")

        lines.append("=" * 72)
        lines.append("End of Report")
        lines.append("=" * 72)

        return "\n".join(lines)

    def _format_block_list(self, blocks):
        blocks = sorted(blocks)
        if len(blocks) <= 20:
            return ", ".join(str(b) for b in blocks)
        first = ", ".join(str(b) for b in blocks[:10])
        last = ", ".join(str(b) for b in blocks[-5:])
        return f"{first}, ... ({len(blocks) - 15} more), {last}"
