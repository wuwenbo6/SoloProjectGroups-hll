#!/usr/bin/env python3

import threading
import time
import random
import json
from typing import Dict, Optional, Tuple, List
from dataclasses import dataclass, field
from enum import Enum


class ATSTransactionStatus(Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    PAGE_SIZE_MISMATCH = "page_size_mismatch"
    PASID_NOT_FOUND = "pasid_not_found"


class InvalidateType(Enum):
    GLOBAL = "global"
    ADDRESS = "address"
    CONTEXT = "context"
    PASID = "pasid"


@dataclass
class TranslationStats:
    total_requests: int = 0
    atc_hits: int = 0
    atc_misses: int = 0
    translation_success: int = 0
    translation_failed: int = 0
    page_size_mismatch: int = 0
    pasid_not_found: int = 0
    total_latency_ns: int = 0

    @property
    def hit_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return (self.atc_hits / self.total_requests) * 100

    @property
    def success_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return (self.translation_success / self.total_requests) * 100

    @property
    def avg_latency_us(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return (self.total_latency_ns / self.total_requests) / 1000

    def to_dict(self) -> dict:
        return {
            "total_requests": self.total_requests,
            "atc_hits": self.atc_hits,
            "atc_misses": self.atc_misses,
            "translation_success": self.translation_success,
            "translation_failed": self.translation_failed,
            "page_size_mismatch": self.page_size_mismatch,
            "pasid_not_found": self.pasid_not_found,
            "hit_rate": round(self.hit_rate, 2),
            "success_rate": round(self.success_rate, 2),
            "avg_latency_us": round(self.avg_latency_us, 2)
        }


@dataclass
class TranslationEntry:
    iova: int
    hpa: int
    size: int
    page_size: int
    permissions: str
    valid: bool
    last_used: float


@dataclass
class ATSTransaction:
    transaction_id: int
    requester_id: str
    iova: int
    length: int
    requested_page_size: int
    pasid: Optional[int]
    status: ATSTransactionStatus
    result_hpa: Optional[int] = None
    result_page_size: Optional[int] = None
    error_message: Optional[str] = None
    timestamp: float = 0.0


@dataclass
class InvalidateMessage:
    message_id: int
    invalidate_type: InvalidateType
    target_device: Optional[str] = None
    target_iova: Optional[int] = None
    target_pasid: Optional[int] = None
    timestamp: float = 0.0
    acknowledged: bool = False


@dataclass
class ATCCacheEntry:
    iova: int
    hpa: int
    page_size: int
    permissions: str
    pasid: Optional[int]
    timestamp: float


@dataclass
class PASIDContext:
    pasid: int
    process_name: str
    is_valid: bool
    mappings: Dict[int, TranslationEntry] = field(default_factory=dict)
    stats: TranslationStats = field(default_factory=TranslationStats)


class IOMMU:
    def __init__(self, system_page_size: int = 0x1000, pasid_enabled: bool = True):
        self.iova_to_hpa: Dict[int, TranslationEntry] = {}
        self.pasid_contexts: Dict[int, PASIDContext] = {}
        self.system_page_size = system_page_size
        self.pasid_enabled = pasid_enabled
        self.lock = threading.Lock()

    def create_pasid_context(self, pasid: int, process_name: str = "") -> PASIDContext:
        with self.lock:
            if pasid in self.pasid_contexts:
                raise ValueError(f"PASID {pasid} already exists")
            context = PASIDContext(pasid=pasid, process_name=process_name, is_valid=True)
            self.pasid_contexts[pasid] = context
            return context

    def remove_pasid_context(self, pasid: int):
        with self.lock:
            if pasid in self.pasid_contexts:
                del self.pasid_contexts[pasid]

    def add_translation(self, iova: int, hpa: int, size: int, page_size: int = None, 
                       permissions: str = "rw-", pasid: Optional[int] = None):
        if page_size is None:
            page_size = self.system_page_size
        
        entry = TranslationEntry(
            iova=iova,
            hpa=hpa,
            size=size,
            page_size=page_size,
            permissions=permissions,
            valid=True,
            last_used=time.time()
        )
        
        with self.lock:
            if pasid is not None and self.pasid_enabled:
                if pasid not in self.pasid_contexts:
                    raise ValueError(f"PASID {pasid} not found")
                self.pasid_contexts[pasid].mappings[iova] = entry
            else:
                self.iova_to_hpa[iova] = entry

    def remove_translation(self, iova: int, pasid: Optional[int] = None):
        with self.lock:
            if pasid is not None and self.pasid_enabled:
                if pasid in self.pasid_contexts and iova in self.pasid_contexts[pasid].mappings:
                    del self.pasid_contexts[pasid].mappings[iova]
            else:
                if iova in self.iova_to_hpa:
                    del self.iova_to_hpa[iova]

    def translate(self, iova: int, length: int = 4, requested_page_size: int = None,
                  pasid: Optional[int] = None) -> Tuple[Optional[int], Optional[int], Optional[str], Optional[str], Optional[int]]:
        with self.lock:
            mappings = self.iova_to_hpa
            target_pasid = None
            
            if pasid is not None and self.pasid_enabled:
                if pasid not in self.pasid_contexts or not self.pasid_contexts[pasid].is_valid:
                    return None, None, None, f"PASID {pasid} not found or invalid", pasid
                mappings = self.pasid_contexts[pasid].mappings
                target_pasid = pasid

            for base_iova, entry in mappings.items():
                if entry.valid and base_iova <= iova < base_iova + entry.size:
                    if requested_page_size is not None and requested_page_size != entry.page_size:
                        return None, None, None, f"Page size mismatch: requested {hex(requested_page_size)}, system uses {hex(entry.page_size)}", target_pasid
                    
                    offset = iova - base_iova
                    hpa = entry.hpa + offset
                    entry.last_used = time.time()
                    return hpa, entry.page_size, entry.permissions, None, target_pasid
            return None, None, None, "Address not mapped", target_pasid

    def get_all_translations(self, pasid: Optional[int] = None) -> Dict[int, TranslationEntry]:
        with self.lock:
            if pasid is not None and self.pasid_enabled:
                if pasid in self.pasid_contexts:
                    return dict(self.pasid_contexts[pasid].mappings)
                return {}
            return dict(self.iova_to_hpa)

    def get_pasid_contexts(self) -> Dict[int, PASIDContext]:
        with self.lock:
            return dict(self.pasid_contexts)

    def get_pasid_stats(self, pasid: int) -> Optional[TranslationStats]:
        with self.lock:
            if pasid in self.pasid_contexts:
                return self.pasid_contexts[pasid].stats
            return None

    def record_translation(self, pasid: Optional[int], success: bool, 
                          atc_hit: bool, latency_ns: int, error_type: Optional[str] = None):
        with self.lock:
            if pasid is not None and pasid in self.pasid_contexts:
                stats = self.pasid_contexts[pasid].stats
            else:
                return
            
            stats.total_requests += 1
            stats.total_latency_ns += latency_ns
            
            if atc_hit:
                stats.atc_hits += 1
            else:
                stats.atc_misses += 1
            
            if success:
                stats.translation_success += 1
            else:
                stats.translation_failed += 1
                if error_type == "page_size_mismatch":
                    stats.page_size_mismatch += 1
                elif error_type == "pasid_not_found":
                    stats.pasid_not_found += 1

    def invalidate_all(self):
        with self.lock:
            self.iova_to_hpa.clear()
            for context in self.pasid_contexts.values():
                context.mappings.clear()

    def get_system_page_size(self) -> int:
        return self.system_page_size

    def is_pasid_enabled(self) -> bool:
        return self.pasid_enabled


class PCIeDevice:
    def __init__(self, device_id: str, root_complex, device_page_size: int = 0x1000,
                 supported_pasids: List[int] = None):
        self.device_id = device_id
        self.root_complex = root_complex
        self.atc_cache: Dict[Tuple[int, Optional[int]], ATCCacheEntry] = {}
        self.transaction_counter = 0
        self.lock = threading.Lock()
        self.request_history = []
        self.invalidate_history = []
        self.device_page_size = device_page_size
        self.supported_pasids = supported_pasids or []
        self.stats = TranslationStats()

    def generate_transaction_id(self) -> int:
        with self.lock:
            self.transaction_counter += 1
            return self.transaction_counter

    def ats_translate(self, iova: int, length: int = 4, page_size: int = None,
                      pasid: Optional[int] = None) -> Optional[int]:
        if page_size is None:
            page_size = self.device_page_size

        start_time = time.perf_counter_ns()

        cache_key = (iova, pasid)
        if cache_key in self.atc_cache:
            cache_entry = self.atc_cache[cache_key]
            
            if page_size != cache_entry.page_size:
                latency = time.perf_counter_ns() - start_time
                
                self.request_history.append({
                    "type": "ATS_FAILURE",
                    "iova": hex(iova),
                    "pasid": pasid,
                    "reason": f"Page size mismatch: requested {hex(page_size)}, cached {hex(cache_entry.page_size)}",
                    "timestamp": time.time()
                })
                
                self.stats.total_requests += 1
                self.stats.atc_misses += 1
                self.stats.translation_failed += 1
                self.stats.page_size_mismatch += 1
                self.stats.total_latency_ns += latency
                
                return None
            
            latency = time.perf_counter_ns() - start_time
            
            self.request_history.append({
                "type": "ATC_HIT",
                "iova": hex(iova),
                "pasid": pasid,
                "hpa": hex(cache_entry.hpa),
                "page_size": hex(cache_entry.page_size),
                "timestamp": time.time()
            })
            
            self.stats.total_requests += 1
            self.stats.atc_hits += 1
            self.stats.translation_success += 1
            self.stats.total_latency_ns += latency
            
            return cache_entry.hpa

        transaction_id = self.generate_transaction_id()
        transaction = ATSTransaction(
            transaction_id=transaction_id,
            requester_id=self.device_id,
            iova=iova,
            length=length,
            requested_page_size=page_size,
            pasid=pasid,
            status=ATSTransactionStatus.PENDING,
            timestamp=time.time()
        )

        self.request_history.append({
            "type": "ATS_REQUEST",
            "transaction_id": transaction_id,
            "iova": hex(iova),
            "pasid": pasid,
            "requested_page_size": hex(page_size),
            "timestamp": time.time()
        })

        result = self.root_complex.handle_ats_request(transaction)
        
        latency = time.perf_counter_ns() - start_time
        
        self.stats.total_requests += 1
        self.stats.atc_misses += 1
        self.stats.total_latency_ns += latency
        
        atc_hit = False
        success = False
        error_type = None
        
        if result.status == ATSTransactionStatus.COMPLETED and result.result_hpa:
            self.atc_cache[cache_key] = ATCCacheEntry(
                iova=iova,
                hpa=result.result_hpa,
                page_size=result.result_page_size or page_size,
                permissions="rw-",
                pasid=pasid,
                timestamp=time.time()
            )
            self.request_history.append({
                "type": "ATS_COMPLETION",
                "transaction_id": transaction_id,
                "iova": hex(iova),
                "pasid": pasid,
                "hpa": hex(result.result_hpa),
                "page_size": hex(result.result_page_size or page_size),
                "timestamp": time.time()
            })
            success = True
            self.stats.translation_success += 1
        else:
            error_type = None
            if result.status == ATSTransactionStatus.PAGE_SIZE_MISMATCH:
                error_type = "page_size_mismatch"
            elif result.status == ATSTransactionStatus.PASID_NOT_FOUND:
                error_type = "pasid_not_found"
            
            self.request_history.append({
                "type": "ATS_FAILURE",
                "transaction_id": transaction_id,
                "iova": hex(iova),
                "pasid": pasid,
                "reason": result.error_message or "Unknown error",
                "timestamp": time.time()
            })
            self.stats.translation_failed += 1
            if error_type == "page_size_mismatch":
                self.stats.page_size_mismatch += 1
            elif error_type == "pasid_not_found":
                self.stats.pasid_not_found += 1
        
        return result.result_hpa if success else None

    def handle_invalidate(self, message: InvalidateMessage) -> bool:
        with self.lock:
            self.invalidate_history.append({
                "message_id": message.message_id,
                "type": message.invalidate_type.value,
                "target_iova": hex(message.target_iova) if message.target_iova else None,
                "target_pasid": message.target_pasid,
                "timestamp": time.time()
            })

            invalidated_count = 0
            
            if message.invalidate_type == InvalidateType.GLOBAL:
                invalidated_count = len(self.atc_cache)
                self.atc_cache.clear()
            elif message.invalidate_type == InvalidateType.PASID and message.target_pasid is not None:
                keys_to_remove = [k for k in self.atc_cache.keys() if k[1] == message.target_pasid]
                invalidated_count = len(keys_to_remove)
                for k in keys_to_remove:
                    del self.atc_cache[k]
            elif message.invalidate_type == InvalidateType.ADDRESS and message.target_iova is not None:
                keys_to_remove = [k for k in self.atc_cache.keys() if k[0] == message.target_iova]
                invalidated_count = len(keys_to_remove)
                for k in keys_to_remove:
                    del self.atc_cache[k]

            self.request_history.append({
                "type": "INVALIDATE",
                "invalidate_type": message.invalidate_type.value,
                "invalidated_count": invalidated_count,
                "target_pasid": message.target_pasid,
                "timestamp": time.time()
            })

        return True

    def invalidate_atc(self, iova: Optional[int] = None, pasid: Optional[int] = None):
        if iova is None and pasid is None:
            self.atc_cache.clear()
        elif iova is not None and pasid is not None:
            key = (iova, pasid)
            if key in self.atc_cache:
                del self.atc_cache[key]
        elif iova is not None:
            keys = [k for k in self.atc_cache.keys() if k[0] == iova]
            for k in keys:
                del self.atc_cache[k]
        elif pasid is not None:
            keys = [k for k in self.atc_cache.keys() if k[1] == pasid]
            for k in keys:
                del self.atc_cache[k]

    def get_atc_cache(self) -> Dict[Tuple[int, Optional[int]], ATCCacheEntry]:
        return dict(self.atc_cache)

    def get_request_history(self, limit: int = 20):
        return self.request_history[-limit:]

    def get_invalidate_history(self, limit: int = 10):
        return self.invalidate_history[-limit:]

    def get_device_page_size(self) -> int:
        return self.device_page_size

    def get_stats(self) -> TranslationStats:
        return self.stats

    def reset_stats(self):
        self.stats = TranslationStats()


class RootComplex:
    def __init__(self, system_page_size: int = 0x1000, auto_invalidate_interval: float = 30.0,
                 pasid_enabled: bool = True):
        self.iommu = IOMMU(system_page_size, pasid_enabled)
        self.devices: Dict[str, PCIeDevice] = {}
        self.transaction_log = []
        self.invalidate_log: List[InvalidateMessage] = []
        self.invalidate_counter = 0
        self.lock = threading.Lock()
        self.auto_invalidate_interval = auto_invalidate_interval
        self.invalidate_thread = None
        self.auto_invalidate_enabled = False
        self.global_stats = TranslationStats()

    def start_auto_invalidate(self):
        if not self.auto_invalidate_enabled:
            self.auto_invalidate_enabled = True
            self.invalidate_thread = threading.Thread(target=self._auto_invalidate_loop, daemon=True)
            self.invalidate_thread.start()

    def stop_auto_invalidate(self):
        self.auto_invalidate_enabled = False
        if self.invalidate_thread:
            self.invalidate_thread.join()

    def _auto_invalidate_loop(self):
        while self.auto_invalidate_enabled:
            time.sleep(self.auto_invalidate_interval)
            self.broadcast_invalidate(InvalidateType.GLOBAL)

    def broadcast_invalidate(self, invalidate_type: InvalidateType, target_iova: Optional[int] = None,
                            target_pasid: Optional[int] = None) -> int:
        with self.lock:
            self.invalidate_counter += 1
            message_id = self.invalidate_counter
            
            message = InvalidateMessage(
                message_id=message_id,
                invalidate_type=invalidate_type,
                target_iova=target_iova,
                target_pasid=target_pasid,
                timestamp=time.time()
            )
            
            self.invalidate_log.append(message)

        for device in self.devices.values():
            device.handle_invalidate(message)

        with self.lock:
            message.acknowledged = True

        return message_id

    def send_invalidate_to_device(self, device_id: str, invalidate_type: InvalidateType,
                                  target_iova: Optional[int] = None,
                                  target_pasid: Optional[int] = None) -> bool:
        if device_id not in self.devices:
            return False

        with self.lock:
            self.invalidate_counter += 1
            message_id = self.invalidate_counter
            
            message = InvalidateMessage(
                message_id=message_id,
                invalidate_type=invalidate_type,
                target_device=device_id,
                target_iova=target_iova,
                target_pasid=target_pasid,
                timestamp=time.time()
            )
            
            self.invalidate_log.append(message)

        device = self.devices[device_id]
        success = device.handle_invalidate(message)

        with self.lock:
            message.acknowledged = success

        return success

    def register_device(self, device_id: str, device_page_size: int = None,
                        supported_pasids: List[int] = None) -> PCIeDevice:
        if device_page_size is None:
            device_page_size = self.iommu.get_system_page_size()
            
        device = PCIeDevice(device_id, self, device_page_size, supported_pasids)
        self.devices[device_id] = device
        return device

    def handle_ats_request(self, transaction: ATSTransaction) -> ATSTransaction:
        start_time = time.perf_counter_ns()
        
        with self.lock:
            self.transaction_log.append({
                "transaction_id": transaction.transaction_id,
                "requester_id": transaction.requester_id,
                "iova": hex(transaction.iova),
                "pasid": transaction.pasid,
                "length": transaction.length,
                "requested_page_size": hex(transaction.requested_page_size),
                "status": "processing"
            })

        hpa, page_size, perm, error, target_pasid = self.iommu.translate(
            transaction.iova, 
            transaction.length, 
            transaction.requested_page_size,
            transaction.pasid
        )
        
        latency = time.perf_counter_ns() - start_time
        error_type = None
        
        with self.lock:
            if error:
                if "Page size mismatch" in error:
                    transaction.status = ATSTransactionStatus.PAGE_SIZE_MISMATCH
                    error_type = "page_size_mismatch"
                elif "PASID" in error:
                    transaction.status = ATSTransactionStatus.PASID_NOT_FOUND
                    error_type = "pasid_not_found"
                else:
                    transaction.status = ATSTransactionStatus.FAILED
                transaction.error_message = error
                self.transaction_log[-1]["status"] = "failed"
                self.transaction_log[-1]["error"] = error
            else:
                transaction.status = ATSTransactionStatus.COMPLETED
                transaction.result_hpa = hpa
                transaction.result_page_size = page_size
                self.transaction_log[-1]["status"] = "completed"
                self.transaction_log[-1]["hpa"] = hex(hpa)
                self.transaction_log[-1]["page_size"] = hex(page_size)

        success = transaction.status == ATSTransactionStatus.COMPLETED
        self.global_stats.total_requests += 1
        self.global_stats.atc_misses += 1
        self.global_stats.total_latency_ns += latency
        if success:
            self.global_stats.translation_success += 1
        else:
            self.global_stats.translation_failed += 1
            if error_type:
                if error_type == "page_size_mismatch":
                    self.global_stats.page_size_mismatch += 1
                elif error_type == "pasid_not_found":
                    self.global_stats.pasid_not_found += 1

        self.iommu.record_translation(
            target_pasid, success, False, latency, error_type
        )

        return transaction

    def invalidate_address(self, iova: int, pasid: Optional[int] = None):
        self.iommu.remove_translation(iova, pasid)
        self.broadcast_invalidate(InvalidateType.ADDRESS, iova)

    def invalidate_pasid(self, pasid: int):
        self.iommu.remove_pasid_context(pasid)
        self.broadcast_invalidate(InvalidateType.PASID, target_pasid=pasid)

    def get_transaction_log(self, limit: int = 50):
        with self.lock:
            return list(self.transaction_log[-limit:])

    def get_invalidate_log(self, limit: int = 20):
        with self.lock:
            return [{
                "message_id": msg.message_id,
                "type": msg.invalidate_type.value,
                "target_device": msg.target_device,
                "target_iova": hex(msg.target_iova) if msg.target_iova else None,
                "target_pasid": msg.target_pasid,
                "timestamp": msg.timestamp,
                "acknowledged": msg.acknowledged
            } for msg in self.invalidate_log[-limit:]]

    def add_memory_mapping(self, iova: int, hpa: int, size: int, page_size: int = None,
                          permissions: str = "rw-", pasid: Optional[int] = None):
        self.iommu.add_translation(iova, hpa, size, page_size, permissions, pasid)

    def create_pasid(self, pasid: int, process_name: str = ""):
        return self.iommu.create_pasid_context(pasid, process_name)

    def get_mappings(self, pasid: Optional[int] = None):
        return self.iommu.get_all_translations(pasid)

    def get_pasid_contexts(self):
        return self.iommu.get_pasid_contexts()

    def get_system_page_size(self) -> int:
        return self.iommu.get_system_page_size()

    def is_pasid_enabled(self) -> bool:
        return self.iommu.is_pasid_enabled()

    def get_stats(self) -> dict:
        pasid_stats = {}
        pasid_contexts = self.iommu.get_pasid_contexts()
        for pasid, context in pasid_contexts.items():
            pasid_stats[pasid] = context.stats.to_dict()
        
        device_stats = {}
        for device_id, device in self.devices.items():
            device_stats[device_id] = device.get_stats().to_dict()
        
        return {
            "global": self.global_stats.to_dict(),
            "by_device": device_stats,
            "by_pasid": pasid_stats
        }

    def export_stats(self, format: str = "json") -> str:
        stats = self.get_stats()
        if format == "json":
            return json.dumps(stats, indent=2)
        elif format == "csv":
            lines = ["category,key,value"]
            for key, value in stats["global"].items():
                lines.append(f"global,{key},{value}")
            for device_id, dev_stats in stats["by_device"].items():
                for key, value in dev_stats.items():
                    lines.append(f"device:{device_id},{key},{value}")
            for pasid, pasid_stats_data in stats["by_pasid"].items():
                for key, value in pasid_stats_data.items():
                    lines.append(f"pasid:{pasid},{key},{value}")
            return "\n".join(lines)
        else:
            raise ValueError(f"Unsupported format: {format}")

    def reset_stats(self):
        self.global_stats = TranslationStats()
        for device in self.devices.values():
            device.reset_stats()
        pasid_contexts = self.iommu.get_pasid_contexts()
        for context in pasid_contexts.values():
            context.stats = TranslationStats()


class PCIeSimulator:
    def __init__(self, system_page_size: int = 0x1000, auto_invalidate_interval: float = 30.0,
                 pasid_enabled: bool = True):
        self.root_complex = RootComplex(system_page_size, auto_invalidate_interval, pasid_enabled)
        self.is_running = False
        self.simulation_thread = None
        self.system_page_size = system_page_size
        self.pasid_enabled = pasid_enabled

    def initialize_demo_mappings(self):
        mappings = [
            (0x10000000, 0x80000000, 0x1000, 0x1000, "rw-", None),
            (0x10001000, 0x80001000, 0x1000, 0x1000, "rw-", None),
            (0x20000000, 0x90000000, 0x2000, 0x1000, "r--", None),
            (0x30000000, 0xA0000000, 0x1000, 0x1000, "rw-", None),
            (0x40000000, 0xB0000000, 0x4000, 0x1000, "rw-", None),
        ]
        for iova, hpa, size, page_size, perm, pasid in mappings:
            self.root_complex.add_memory_mapping(iova, hpa, size, page_size, perm, pasid)

        if self.pasid_enabled:
            pasid_mappings = [
                (1, "Process_A", [
                    (0x10000000, 0xC0000000, 0x1000, 0x1000, "rw-"),
                    (0x10001000, 0xC0001000, 0x1000, 0x1000, "rw-"),
                ]),
                (2, "Process_B", [
                    (0x10000000, 0xD0000000, 0x1000, 0x1000, "rw-"),
                    (0x20000000, 0xE0000000, 0x2000, 0x1000, "r--"),
                ]),
                (3, "Process_C", [
                    (0x50000000, 0xF0000000, 0x4000, 0x1000, "rw-"),
                ]),
            ]
            for pasid, proc_name, maps in pasid_mappings:
                self.root_complex.create_pasid(pasid, proc_name)
                for iova, hpa, size, page_size, perm in maps:
                    self.root_complex.add_memory_mapping(iova, hpa, size, page_size, perm, pasid)

    def create_device(self, device_id: str, device_page_size: int = None,
                      supported_pasids: List[int] = None) -> PCIeDevice:
        return self.root_complex.register_device(device_id, device_page_size, supported_pasids)

    def create_pasid(self, pasid: int, process_name: str = ""):
        return self.root_complex.create_pasid(pasid, process_name)

    def generate_random_traffic(self, device: PCIeDevice, num_requests: int = 10,
                                use_pasids: bool = False):
        pasids = []
        if use_pasids and self.pasid_enabled:
            pasids = list(self.root_complex.get_pasid_contexts().keys())
        
        for _ in range(num_requests):
            pasid = None
            if use_pasids and pasids:
                pasid = random.choice(pasids)
            
            if pasid is not None:
                valid_iovas = list(self.root_complex.get_mappings(pasid).keys())
            else:
                valid_iovas = list(self.root_complex.get_mappings().keys())
            
            if valid_iovas:
                base_iova = random.choice(valid_iovas)
                offset = random.randint(0, 0xFFF)
                iova = base_iova + offset
                device.ats_translate(iova, pasid=pasid)
                time.sleep(random.uniform(0.01, 0.1))

    def start_simulation(self):
        if not self.is_running:
            self.is_running = True
            self.root_complex.start_auto_invalidate()
            self.simulation_thread = threading.Thread(target=self._simulation_loop, daemon=True)
            self.simulation_thread.start()

    def _simulation_loop(self):
        while self.is_running:
            time.sleep(1)

    def stop_simulation(self):
        self.is_running = False
        self.root_complex.stop_auto_invalidate()
        if self.simulation_thread:
            self.simulation_thread.join()

    def broadcast_invalidate(self, invalidate_type: str = "global", target_iova: int = None,
                            target_pasid: int = None):
        itype_map = {
            "global": InvalidateType.GLOBAL,
            "address": InvalidateType.ADDRESS,
            "context": InvalidateType.CONTEXT,
            "pasid": InvalidateType.PASID
        }
        itype = itype_map.get(invalidate_type, InvalidateType.GLOBAL)
        return self.root_complex.broadcast_invalidate(itype, target_iova, target_pasid)

    def send_invalidate_to_device(self, device_id: str, invalidate_type: str = "global",
                                  target_iova: int = None, target_pasid: int = None):
        itype_map = {
            "global": InvalidateType.GLOBAL,
            "address": InvalidateType.ADDRESS,
            "context": InvalidateType.CONTEXT,
            "pasid": InvalidateType.PASID
        }
        itype = itype_map.get(invalidate_type, InvalidateType.GLOBAL)
        return self.root_complex.send_invalidate_to_device(device_id, itype, target_iova, target_pasid)

    def get_stats(self) -> dict:
        return self.root_complex.get_stats()

    def export_stats(self, format: str = "json") -> str:
        return self.root_complex.export_stats(format)

    def reset_stats(self):
        self.root_complex.reset_stats()

    def get_state(self):
        pasid_contexts = self.root_complex.get_pasid_contexts()
        pasid_info = {}
        for pasid, context in pasid_contexts.items():
            pasid_info[pasid] = {
                "process_name": context.process_name,
                "is_valid": context.is_valid,
                "mapping_count": len(context.mappings),
                "stats": context.stats.to_dict()
            }

        global_mappings = {}
        for k, v in self.root_complex.get_mappings().items():
            global_mappings[hex(k)] = {
                "hpa": hex(v.hpa),
                "size": hex(v.size),
                "page_size": hex(v.page_size),
                "permissions": v.permissions,
                "valid": v.valid,
                "last_used": v.last_used,
                "pasid": None
            }

        for pasid, context in pasid_contexts.items():
            for k, v in context.mappings.items():
                global_mappings[f"{hex(k)}#{pasid}"] = {
                    "hpa": hex(v.hpa),
                    "size": hex(v.size),
                    "page_size": hex(v.page_size),
                    "permissions": v.permissions,
                    "valid": v.valid,
                    "last_used": v.last_used,
                    "pasid": pasid
                }

        return {
            "system_page_size": hex(self.system_page_size),
            "pasid_enabled": self.pasid_enabled,
            "auto_invalidate_interval": self.root_complex.auto_invalidate_interval,
            "auto_invalidate_enabled": self.root_complex.auto_invalidate_enabled,
            "mappings": global_mappings,
            "pasid_contexts": pasid_info,
            "devices": {
                dev_id: {
                    "device_page_size": hex(dev.get_device_page_size()),
                    "atc_cache": {
                        f"{hex(k[0])}#{k[1]}": {
                            "hpa": hex(v.hpa),
                            "page_size": hex(v.page_size),
                            "perm": v.permissions,
                            "pasid": v.pasid
                        } for k, v in dev.get_atc_cache().items()
                    },
                    "history": dev.get_request_history(10),
                    "invalidate_history": dev.get_invalidate_history(5),
                    "stats": dev.get_stats().to_dict()
                } for dev_id, dev in self.root_complex.devices.items()
            },
            "transactions": self.root_complex.get_transaction_log(20),
            "invalidate_log": self.root_complex.get_invalidate_log(10),
            "stats": self.get_stats()
        }
