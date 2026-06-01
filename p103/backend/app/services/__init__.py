from .mutator import ModbusMutator, MutatedPacket
from .monitor import PLCHealthMonitor, HealthCheckResult, DeviceStatus
from .fuzzer import ModbusFuzzer, FuzzerStatus, FuzzerManager

_fuzzer_manager_instance = None

def get_fuzzer_manager():
    global _fuzzer_manager_instance
    if _fuzzer_manager_instance is None:
        _fuzzer_manager_instance = FuzzerManager()
    return _fuzzer_manager_instance

__all__ = [
    "ModbusMutator", "MutatedPacket",
    "PLCHealthMonitor", "HealthCheckResult", "DeviceStatus",
    "ModbusFuzzer", "FuzzerStatus", "FuzzerManager",
    "get_fuzzer_manager"
]
