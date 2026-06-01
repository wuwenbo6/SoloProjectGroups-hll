"""NFSv4 Client Core Module.

Provides a high-level interface for mounting and accessing NFSv4 shares.
Uses libnfs as the underlying NFS client library when available.

UTF-8 Path Handling:
    NFSv4 (RFC 8881) mandates that all file name components are UTF-8 encoded
    strings. This module ensures proper UTF-8 encoding/decoding for all path
    operations, including Chinese and other non-ASCII characters.

GSSAPI Authentication:
    Supports Kerberos authentication via GSSAPI, with keytab-based principal
    authentication and configurable security flavors (krb5/krb5i/krb5p).

Performance Statistics:
    Tracks operation latency, throughput, and error rates for all NFS operations.

File Lock Detection:
    Detects file locks (read/write) using multiple strategies.
"""

import os
import re
import stat
import time
import logging
from contextlib import nullcontext
from dataclasses import dataclass, field
from typing import List, Optional, Union, Iterator
from pathlib import PurePosixPath
from urllib.parse import urlparse, quote, unquote

from .auth import GSSAPIConfig, GSSAPIAuthManager, NFSSecFlavor
from .stats import PerformanceStats, LockDetector, LockInfo

logger = logging.getLogger(__name__)

try:
    import libnfs
    _LIBNFS_AVAILABLE = True
except ImportError:
    _LIBNFS_AVAILABLE = False
    logger.warning(
        "libnfs Python bindings not installed. "
        "Install libnfs library and Python bindings for full NFS functionality. "
        "See: https://github.com/sahlberg/libnfs-python"
    )


_UTF8_REPLACEMENT_CHAR = "\ufffd"


def nfs4_str_encode(s: str) -> bytes:
    """Encode a Python string to NFSv4 UTF-8 bytes.

    Per RFC 8881, NFSv4 component strings are UTF-8 encoded.
    This function ensures proper encoding and validates the result.

    Args:
        s: Python string to encode

    Returns:
        UTF-8 encoded bytes

    Raises:
        ValueError: If the string cannot be encoded as valid UTF-8
    """
    try:
        return s.encode("utf-8")
    except UnicodeEncodeError as e:
        raise ValueError(f"Cannot encode string as UTF-8: {e}") from e


def nfs4_str_decode(data: bytes) -> str:
    """Decode NFSv4 UTF-8 bytes to a Python string.

    Per RFC 8881, NFSv4 component strings are UTF-8 encoded.
    Handles potential malformed UTF-8 sequences gracefully.

    Args:
        data: UTF-8 encoded bytes

    Returns:
        Decoded Python string
    """
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        logger.warning("Malformed UTF-8 in NFS path component, using replacement character")
        return data.decode("utf-8", errors="replace")


def validate_utf8_path(path: str) -> str:
    """Validate and normalize a path for NFSv4 UTF-8 compliance.

    Ensures all path components are valid UTF-8. NFSv4 requires
    that file name components be valid UTF-8 strings (RFC 8881 §4.1).

    Args:
        path: File path to validate

    Returns:
        Validated path string

    Raises:
        ValueError: If path contains invalid UTF-8 sequences
    """
    try:
        path.encode("utf-8")
    except UnicodeEncodeError as e:
        raise ValueError(f"Path contains invalid UTF-8: {e}") from e

    for component in PurePosixPath(path).parts:
        if component == "/":
            continue
        try:
            component.encode("utf-8")
        except UnicodeEncodeError as e:
            raise ValueError(
                f"Path component '{component}' is not valid UTF-8: {e}"
            ) from e

    return path


def safe_path_decode(raw: Union[str, bytes]) -> str:
    """Safely decode a path that may contain non-ASCII characters.

    Handles paths returned by libnfs which may contain Chinese characters
    or other Unicode. Ensures consistent UTF-8 handling regardless of
    the source encoding.

    When libnfs returns paths that were originally UTF-8 but got incorrectly
    decoded as latin-1 (a common issue with some NFS implementations),
    this function detects and corrects the mis-decoding by re-encoding
    as latin-1 and decoding as UTF-8.

    Args:
        raw: Raw path string or bytes

    Returns:
        Properly decoded Unicode string
    """
    if isinstance(raw, bytes):
        return nfs4_str_decode(raw)

    has_latin1_artifacts = any(
        0x80 <= ord(c) <= 0xFF for c in raw
    )
    has_high_unicode = any(ord(c) > 0xFF for c in raw)

    if has_latin1_artifacts and not has_high_unicode:
        try:
            return raw.encode("latin-1").decode("utf-8")
        except (UnicodeDecodeError, UnicodeEncodeError):
            pass

    return raw


@dataclass
class NFSFileInfo:
    """Metadata for an NFS file or directory."""
    name: str
    path: str
    is_dir: bool
    size: int
    mode: int
    uid: int
    gid: int
    atime: float
    mtime: float
    ctime: float

    @classmethod
    def from_stat(cls, name: str, path: str, stat_result: os.stat_result) -> "NFSFileInfo":
        """Create NFSFileInfo from an os.stat_result object."""
        safe_name = safe_path_decode(name)
        safe_path = safe_path_decode(path)
        return cls(
            name=safe_name,
            path=safe_path,
            is_dir=stat.S_ISDIR(stat_result.st_mode),
            size=stat_result.st_size,
            mode=stat_result.st_mode,
            uid=stat_result.st_uid,
            gid=stat_result.st_gid,
            atime=stat_result.st_atime,
            mtime=stat_result.st_mtime,
            ctime=stat_result.st_ctime,
        )

    def to_dict(self) -> dict:
        """Convert to a dictionary for JSON serialization."""
        return {
            "name": self.name,
            "path": self.path,
            "is_dir": self.is_dir,
            "size": self.size,
            "mode": self.mode,
            "mode_str": stat.filemode(self.mode),
            "uid": self.uid,
            "gid": self.gid,
            "atime": self.atime,
            "mtime": self.mtime,
            "ctime": self.ctime,
            "atime_str": time.ctime(self.atime),
            "mtime_str": time.ctime(self.mtime),
            "ctime_str": time.ctime(self.ctime),
        }


class NFS4Client:
    """High-level NFSv4 client for mounting and accessing remote shares.

    Supports GSSAPI/Kerberos authentication and UTF-8 path handling
    for non-ASCII file names (including Chinese characters).

    Examples:
        Basic usage:
        >>> client = NFS4Client("nfs://server.example.com/export/share")
        >>> client.mount()
        >>> files = client.listdir("/")

        With Kerberos authentication:
        >>> from nfs4_client.auth import GSSAPIConfig, NFSSecFlavor
        >>> config = GSSAPIConfig(
        ...     principal="nfs/client.example.com@EXAMPLE.COM",
        ...     keytab="/etc/krb5.keytab",
        ...     sec_flavor=NFSSecFlavor.KRB5P,
        ... )
        >>> client = NFS4Client(
        ...     "nfs://server.example.com/export/share",
        ...     gssapi_config=config,
        ... )

        Chinese path handling:
        >>> files = client.listdir("/文档/报告")
        >>> content = client.read_file("/中文目录/说明.txt")

        With performance statistics:
        >>> client = NFS4Client("nfs://server/export", enable_stats=True)
        >>> stats = client.performance_stats.summary()
    """

    def __init__(
        self,
        nfs_url: str,
        timeout: int = 30,
        read_size: int = 1024 * 1024,
        auto_mount: bool = False,
        gssapi_config: Optional[GSSAPIConfig] = None,
        encoding: str = "utf-8",
        enable_stats: bool = True,
        lock_timeout: float = 1.0,
    ):
        """Initialize the NFSv4 client.

        Args:
            nfs_url: NFS server URL in format nfs://host/export/path
            timeout: Connection timeout in seconds
            read_size: Default read buffer size
            auto_mount: If True, automatically mount on first operation
            gssapi_config: GSSAPI/Kerberos authentication configuration.
                           When provided, Kerberos authentication will be
                           performed before mounting.
            encoding: Character encoding for path operations (default: utf-8).
                      NFSv4 mandates UTF-8; this should not be changed unless
                      dealing with legacy NFSv3 servers.
            enable_stats: Enable performance statistics collection (default: True)
            lock_timeout: Timeout for file lock detection in seconds (default: 1.0)

        Raises:
            ValueError: If the NFS URL is invalid
            RuntimeError: If libnfs is not available
        """
        if not _LIBNFS_AVAILABLE:
            raise RuntimeError(
                "libnfs Python bindings are not installed. "
                "Please install libnfs and its Python bindings first."
            )

        self._nfs_url = nfs_url
        self._timeout = timeout
        self._read_size = read_size
        self._auto_mount = auto_mount
        self._gssapi_config = gssapi_config
        self._encoding = encoding
        self._nfs_context: Optional["libnfs.NFS"] = None
        self._mounted = False
        self._auth_manager: Optional[GSSAPIAuthManager] = None

        self._stats = PerformanceStats() if enable_stats else None
        self._lock_detector = LockDetector(timeout=lock_timeout)

        if self._stats is not None:
            self._stats.start()

        self._parse_url(nfs_url)

    def _parse_url(self, url: str) -> None:
        """Parse and validate the NFS URL."""
        parsed = urlparse(url)
        if parsed.scheme not in ("nfs", "nfs4"):
            raise ValueError(
                f"Invalid NFS URL scheme: {parsed.scheme}. "
                "URL must start with 'nfs://' or 'nfs4://'"
            )
        if not parsed.hostname:
            raise ValueError("NFS URL must contain a hostname")

        self._host = parsed.hostname
        self._port = parsed.port or 2049
        self._export_path = unquote(parsed.path or "/")

        try:
            validate_utf8_path(self._export_path)
        except ValueError as e:
            raise ValueError(f"Export path contains invalid UTF-8: {e}") from e

        logger.debug(
            "Parsed NFS URL: host=%s, port=%d, export=%s",
            self._host, self._port, self._export_path
        )

    @property
    def is_mounted(self) -> bool:
        """Check if the client is currently mounted."""
        return self._mounted and self._nfs_context is not None

    @property
    def host(self) -> str:
        """Get the NFS server hostname."""
        return self._host

    @property
    def export_path(self) -> str:
        """Get the NFS export path."""
        return self._export_path

    @property
    def gssapi_config(self) -> Optional[GSSAPIConfig]:
        """Get the GSSAPI configuration, if any."""
        return self._gssapi_config

    @property
    def encoding(self) -> str:
        """Get the character encoding used for path operations."""
        return self._encoding

    @property
    def performance_stats(self) -> Optional[PerformanceStats]:
        """Get the performance stats instance, if enabled."""
        return self._stats

    @property
    def has_stats(self) -> bool:
        """Check if performance statistics are enabled."""
        return self._stats is not None and self._stats.enabled

    @property
    def lock_detector(self) -> LockDetector:
        """Get the lock detector instance."""
        return self._lock_detector

    def mount(self) -> None:
        """Mount the NFS share.

        If GSSAPI configuration is provided, Kerberos authentication
        will be performed before mounting. The security flavor will
        be included in the mount URL.

        Raises:
            ConnectionError: If mounting fails
            RuntimeError: If already mounted
        """
        if self.is_mounted:
            raise RuntimeError("Already mounted")

        stats_ctx = self._stats.measure("mount") if self._stats else nullcontext()

        with stats_ctx:
            try:
                if self._gssapi_config is not None:
                    self._auth_manager = GSSAPIAuthManager(self._gssapi_config)
                    self._auth_manager.authenticate()

                    mount_url = self._auth_manager.build_nfs_url(
                        self._host, self._export_path, self._port
                    )

                    env_overrides = self._auth_manager.get_env()
                    for key, value in env_overrides.items():
                        os.environ[key] = value

                    logger.info(
                        "Mounting NFS share with Kerberos: %s (sec=%s)",
                        self._nfs_url, self._gssapi_config.sec_flavor.value,
                    )
                else:
                    mount_url = self._nfs_url
                    logger.info("Mounting NFS share: %s", self._nfs_url)

                self._nfs_context = libnfs.NFS(mount_url)
                self._mounted = True
                logger.info("Successfully mounted NFS share")
            except Exception as e:
                logger.error("Failed to mount NFS share: %s", e)
                if self._auth_manager is not None:
                    try:
                        self._auth_manager.destroy()
                    except Exception:
                        pass
                    self._auth_manager = None
                self._nfs_context = None
                self._mounted = False
                raise ConnectionError(f"Failed to mount NFS share: {e}") from e

    def umount(self) -> None:
        """Unmount the NFS share and clean up resources."""
        stats_ctx = self._stats.measure("umount") if self._stats else nullcontext()

        with stats_ctx:
            if self._nfs_context is not None:
                logger.info("Unmounting NFS share")
                try:
                    self._nfs_context = None
                finally:
                    self._mounted = False

            if self._auth_manager is not None:
                try:
                    self._auth_manager.destroy()
                except Exception:
                    pass
                self._auth_manager = None

    def _ensure_mounted(self) -> None:
        """Ensure the client is mounted before performing operations."""
        if not self.is_mounted:
            if self._auto_mount:
                self.mount()
            else:
                raise RuntimeError(
                    "NFS share not mounted. Call mount() first or set auto_mount=True."
                )

    @staticmethod
    def _normalize_path(path: str) -> str:
        """Normalize a path to be absolute and POSIX-style.

        Resolves . and .. components, removes duplicate slashes.
        Validates UTF-8 encoding for NFSv4 compliance.
        """
        if not path.startswith("/"):
            path = "/" + path

        try:
            validate_utf8_path(path)
        except ValueError as e:
            raise ValueError(f"Path is not valid UTF-8 for NFSv4: {e}") from e

        parts = []
        for part in PurePosixPath(path).parts:
            if part == "..":
                if parts and parts[-1] != "/":
                    parts.pop()
            elif part == ".":
                continue
            elif part == "/" and parts:
                continue
            else:
                parts.append(part)

        if not parts:
            return "/"

        if len(parts) == 1 and parts[0] == "/":
            return "/"

        if parts[0] == "/":
            return "/" + "/".join(parts[1:])

        return "/" + "/".join(parts)

    def _encode_path(self, path: str) -> str:
        """Encode a path for use with libnfs, ensuring UTF-8 compliance.

        For paths containing Chinese or other non-ASCII characters,
        this ensures the path is properly encoded as UTF-8 before
        being sent to the NFS server (per RFC 8881).

        Args:
            path: Path string to encode

        Returns:
            UTF-8 compliant path string
        """
        try:
            path.encode(self._encoding)
            return path
        except UnicodeEncodeError:
            logger.warning("Path encoding issue, normalizing: %s", path)
            return path.encode(self._encoding, errors="replace").decode(self._encoding)

    def listdir(
        self,
        path: str = "/",
        show_hidden: bool = False,
    ) -> List[NFSFileInfo]:
        """List contents of a directory on the NFS share.

        Args:
            path: Directory path relative to the mount point.
                  Supports Chinese and other Unicode characters.
            show_hidden: Include hidden files (starting with .)

        Returns:
            List of NFSFileInfo objects for each entry in the directory

        Raises:
            FileNotFoundError: If the directory doesn't exist
            PermissionError: If access is denied
            RuntimeError: If not mounted
        """
        self._ensure_mounted()
        norm_path = self._normalize_path(path)
        encoded_path = self._encode_path(norm_path)
        logger.debug("Listing directory: %s (encoded: %s)", norm_path, encoded_path)

        stats_ctx = self._stats.measure("listdir") if self._stats else nullcontext()

        with stats_ctx:
            try:
                entries = self._nfs_context.listdir(encoded_path)
            except FileNotFoundError:
                raise
            except PermissionError:
                raise
            except Exception as e:
                logger.error("Failed to list directory %s: %s", encoded_path, e)
                raise RuntimeError(f"Failed to list directory: {e}") from e

            file_infos: List[NFSFileInfo] = []
            for raw_entry in entries:
                entry = safe_path_decode(raw_entry)
                if not show_hidden and entry.startswith("."):
                    continue

                entry_path = str(PurePosixPath(norm_path) / entry)
                encoded_entry_path = self._encode_path(entry_path)
                try:
                    stat_result = self._nfs_context.stat(encoded_entry_path)
                    file_info = NFSFileInfo.from_stat(entry, entry_path, stat_result)
                    file_infos.append(file_info)
                except Exception as e:
                    logger.warning("Failed to stat %s: %s", entry_path, e)
                    file_infos.append(NFSFileInfo(
                        name=entry,
                        path=entry_path,
                        is_dir=False,
                        size=0,
                        mode=0,
                        uid=0,
                        gid=0,
                        atime=0,
                        mtime=0,
                        ctime=0,
                    ))

            return sorted(file_infos, key=lambda f: (not f.is_dir, f.name.lower()))

    def stat(self, path: str) -> NFSFileInfo:
        """Get file/directory metadata.

        Args:
            path: Path to the file or directory.
                  Supports Chinese and other Unicode characters.

        Returns:
            NFSFileInfo with file metadata

        Raises:
            FileNotFoundError: If the path doesn't exist
            PermissionError: If access is denied
        """
        self._ensure_mounted()
        norm_path = self._normalize_path(path)
        encoded_path = self._encode_path(norm_path)
        logger.debug("Stating: %s (encoded: %s)", norm_path, encoded_path)

        stats_ctx = self._stats.measure("stat") if self._stats else nullcontext()

        with stats_ctx:
            try:
                stat_result = self._nfs_context.stat(encoded_path)
                name = safe_path_decode(PurePosixPath(norm_path).name)
                return NFSFileInfo.from_stat(name, norm_path, stat_result)
            except FileNotFoundError:
                raise
            except PermissionError:
                raise
            except Exception as e:
                logger.error("Failed to stat %s: %s", encoded_path, e)
                raise RuntimeError(f"Failed to stat path: {e}") from e

    def exists(self, path: str) -> bool:
        """Check if a path exists on the NFS share."""
        try:
            self.stat(path)
            return True
        except (FileNotFoundError, RuntimeError):
            return False

    def is_dir(self, path: str) -> bool:
        """Check if a path is a directory."""
        return self.stat(path).is_dir

    def read_file(
        self,
        path: str,
        binary: bool = False,
        encoding: Optional[str] = None,
    ) -> Union[bytes, str]:
        """Read the entire contents of a file.

        Args:
            path: Path to the file. Supports Chinese and other Unicode characters.
            binary: If True, return bytes; otherwise return str
            encoding: Encoding to use when decoding text files.
                      Defaults to the client's encoding setting (utf-8).

        Returns:
            File contents as bytes or str
        """
        self._ensure_mounted()
        norm_path = self._normalize_path(path)
        encoded_path = self._encode_path(norm_path)
        file_encoding = encoding or self._encoding
        logger.debug("Reading file: %s (encoded: %s)", norm_path, encoded_path)

        stats_ctx = self._stats.measure("read_file") if self._stats else nullcontext()

        with stats_ctx:
            try:
                with self._nfs_context.open(encoded_path, mode="r") as f:
                    content = f.read()
            except IsADirectoryError:
                raise
            except FileNotFoundError:
                raise
            except PermissionError:
                raise
            except Exception as e:
                logger.error("Failed to read file %s: %s", encoded_path, e)
                raise RuntimeError(f"Failed to read file: {e}") from e

            if self._stats is not None:
                bytes_read = len(content) if isinstance(content, bytes) else len(content.encode(file_encoding))
                self._stats.record("read_file_bytes", 0, bytes_read, error=False)

            if not binary and isinstance(content, bytes):
                try:
                    content = content.decode(file_encoding)
                except UnicodeDecodeError:
                    logger.warning("File %s is not valid %s, returning bytes", norm_path, file_encoding)
                    return content

            return content

    def read_file_chunked(
        self,
        path: str,
        chunk_size: Optional[int] = None,
    ) -> Iterator[bytes]:
        """Read a file in chunks for memory-efficient streaming."""
        self._ensure_mounted()
        norm_path = self._normalize_path(path)
        encoded_path = self._encode_path(norm_path)
        chunk_size = chunk_size or self._read_size

        logger.debug("Reading file in chunks: %s (chunk_size=%d)", encoded_path, chunk_size)

        start_time = time.perf_counter() if self._stats else None
        total_bytes = 0
        error = False

        try:
            with self._nfs_context.open(encoded_path, mode="r") as f:
                while True:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    total_bytes += len(chunk)
                    yield chunk
        except FileNotFoundError:
            error = True
            raise
        except PermissionError:
            error = True
            raise
        except Exception as e:
            error = True
            logger.error("Failed to read file %s in chunks: %s", encoded_path, e)
            raise RuntimeError(f"Failed to read file: {e}") from e
        finally:
            if self._stats is not None and start_time is not None:
                duration = time.perf_counter() - start_time
                self._stats.record("read_file_chunked", duration, total_bytes, error)

    def check_lock(self, path: str, full_check: bool = False) -> LockInfo:
        """Check if a file on the NFS share is locked.

        This method checks for file locks by attempting to open the file
        in different modes. Note that for remote NFS locks, detection
        depends on NLM (Network Lock Manager) support and local client
        lock visibility.

        Args:
            path: Path to the file on the NFS share
            full_check: Perform additional checks (slower)

        Returns:
            LockInfo object with lock status
        """
        self._ensure_mounted()
        norm_path = self._normalize_path(path)
        encoded_path = self._encode_path(norm_path)

        start_time = time.perf_counter() if self._stats else None
        error = False

        try:
            if not self.exists(norm_path):
                return LockInfo(path=norm_path, status="unlocked")

            if self.is_dir(norm_path):
                return LockInfo(path=norm_path, status="unlocked")

            can_read = self._try_open_for_read(encoded_path)
            can_write = self._try_open_for_write(encoded_path)

            if not can_read and not can_write:
                status = "locked_write"
            elif not can_write:
                status = "locked_write"
            else:
                status = "unlocked"

            return LockInfo(path=norm_path, status=status)
        except Exception as e:
            error = True
            logger.warning("Error checking lock for %s: %s", norm_path, e)
            return LockInfo(path=norm_path, status="unknown")
        finally:
            if self._stats is not None and start_time is not None:
                duration = time.perf_counter() - start_time
                self._stats.record("check_lock", duration, 0, error)

    def _try_open_for_read(self, encoded_path: str) -> bool:
        """Try to open a file for reading to detect locks."""
        try:
            fd = os.open(encoded_path, os.O_RDONLY | os.O_NONBLOCK)
            os.close(fd)
            return True
        except (OSError, PermissionError):
            return False

    def _try_open_for_write(self, encoded_path: str) -> bool:
        """Try to open a file for writing to detect locks."""
        try:
            fd = os.open(encoded_path, os.O_WRONLY | os.O_NONBLOCK)
            os.close(fd)
            return True
        except (OSError, PermissionError):
            return False

    def walk(
        self,
        path: str = "/",
        show_hidden: bool = False,
        max_depth: Optional[int] = None,
    ) -> Iterator[tuple]:
        """Recursively walk a directory tree.

        Similar to os.walk(), yields tuples of (dirpath, dirnames, filenames).
        All path components are properly decoded as UTF-8.
        """
        def _walk(current_path: str, depth: int = 0) -> Iterator[tuple]:
            if max_depth is not None and depth > max_depth:
                return

            entries = self.listdir(current_path, show_hidden=show_hidden)
            dirnames = [e.name for e in entries if e.is_dir]
            filenames = [e.name for e in entries if not e.is_dir]

            yield current_path, dirnames, filenames

            for dirname in dirnames:
                next_path = str(PurePosixPath(current_path) / dirname)
                yield from _walk(next_path, depth + 1)

        norm_path = self._normalize_path(path)
        yield from _walk(norm_path)

    def __enter__(self) -> "NFS4Client":
        """Context manager entry."""
        if not self.is_mounted:
            self.mount()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Context manager exit - ensures unmount."""
        self.umount()

    def __del__(self) -> None:
        """Destructor - attempt to clean up."""
        try:
            if self.is_mounted:
                self.umount()
        except Exception:
            pass


def is_libnfs_available() -> bool:
    """Check if libnfs Python bindings are available."""
    return _LIBNFS_AVAILABLE
