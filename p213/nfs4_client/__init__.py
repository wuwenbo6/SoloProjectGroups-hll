"""NFSv4 Client Toolkit.

A Python toolkit for mounting and accessing NFSv4 shares, with CLI and HTTP API interfaces.

Features:
    - GSSAPI/Kerberos authentication with keytab support
    - UTF-8 path handling for Chinese and other non-ASCII characters
    - CLI and HTTP REST API interfaces
    - Performance statistics (latency, throughput, error rates)
    - File lock detection
"""

__version__ = "0.3.0"
__author__ = "NFS4 Client Team"

from .nfs_client import NFS4Client, NFSFileInfo
from .auth import GSSAPIConfig, GSSAPIAuthManager, NFSSecFlavor
from .stats import PerformanceStats, LockDetector, LockInfo

__all__ = [
    "NFS4Client",
    "NFSFileInfo",
    "GSSAPIConfig",
    "GSSAPIAuthManager",
    "NFSSecFlavor",
    "PerformanceStats",
    "LockDetector",
    "LockInfo",
]
