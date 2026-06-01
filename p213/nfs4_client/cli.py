"""NFSv4 Command Line Interface.

Provides a command-line interface for mounting and accessing NFSv4 shares.
Supports GSSAPI/Kerberos authentication and UTF-8 path handling.

Usage:
    nfs4-client mount <nfs_url> [--keytab KEYTAB --principal PRINCIPAL --sec krb5p]
    nfs4-client list <nfs_url> [path]
    nfs4-client read <nfs_url> <path>
    nfs4-client stat <nfs_url> <path>
    nfs4-client serve <nfs_url> [--host HOST] [--port PORT]
"""

import os
import sys
import argparse
import logging
import json
from typing import List, Optional

from .nfs_client import NFS4Client, NFSFileInfo, is_libnfs_available
from .auth import (
    GSSAPIConfig,
    GSSAPIAuthManager,
    NFSSecFlavor,
    is_gssapi_available,
    is_kinit_available,
)

logger = logging.getLogger(__name__)


def _setup_logging(verbose: bool = False) -> None:
    """Setup logging configuration."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def _build_gssapi_config(args: argparse.Namespace) -> Optional[GSSAPIConfig]:
    """Build GSSAPIConfig from CLI arguments if Kerberos options are provided."""
    keytab = getattr(args, "keytab", None)
    principal = getattr(args, "principal", None)
    sec = getattr(args, "sec", None)

    if not keytab and not principal:
        return None

    if not keytab:
        print("✗ --keytab is required when using Kerberos authentication", file=sys.stderr)
        sys.exit(1)
    if not principal:
        print("✗ --principal is required when using Kerberos authentication", file=sys.stderr)
        sys.exit(1)

    if not os.path.isfile(keytab):
        print(f"✗ Keytab file not found: {keytab}", file=sys.stderr)
        sys.exit(1)

    sec_flavor = NFSSecFlavor(sec) if sec else NFSSecFlavor.KRB5P

    realm = getattr(args, "realm", None)
    kdc = getattr(args, "kdc", None)

    return GSSAPIConfig(
        principal=principal,
        keytab=keytab,
        sec_flavor=sec_flavor,
        realm=realm,
        kdc=kdc,
    )


def _format_file_list(files: List[NFSFileInfo], human_readable: bool = False) -> str:
    """Format file list for display."""
    lines = []

    header = f"{'Type':<5} {'Size':>12} {'Mode':<10} {'UID':>5} {'GID':>5} {'Modified':<20} Name"
    lines.append(header)
    lines.append("-" * len(header))

    for f in files:
        ftype = "DIR" if f.is_dir else "FILE"
        size = f._format_size(f.size) if human_readable else str(f.size)
        import stat as stat_mod
        mode_str = stat_mod.filemode(f.mode)
        mtime_str = f._format_time(f.mtime)
        lines.append(
            f"{ftype:<5} {size:>12} {mode_str:<10} {f.uid:>5} {f.gid:>5} {mtime_str:<20} {f.name}"
        )

    return "\n".join(lines)


def _format_stat_info(info: NFSFileInfo, human_readable: bool = False) -> str:
    """Format stat info for display."""
    import stat as stat_mod
    lines = []
    lines.append(f"Path:        {info.path}")
    lines.append(f"Name:        {info.name}")
    lines.append(f"Type:        {'Directory' if info.is_dir else 'File'}")
    size = info._format_size(info.size) if human_readable else str(info.size)
    lines.append(f"Size:        {size}")
    lines.append(f"Mode:        {stat_mod.filemode(info.mode)} ({oct(info.mode)[2:]})")
    lines.append(f"UID:         {info.uid}")
    lines.append(f"GID:         {info.gid}")
    lines.append(f"Accessed:    {info._format_time(info.atime)}")
    lines.append(f"Modified:    {info._format_time(info.mtime)}")
    lines.append(f"Changed:     {info._format_time(info.ctime)}")
    return "\n".join(lines)


def _add_mixins() -> None:
    """Add helper methods to NFSFileInfo for CLI display."""
    def _format_size(self, size_bytes: int) -> str:
        units = ["B", "KB", "MB", "GB", "TB"]
        size = float(size_bytes)
        for unit in units:
            if size < 1024.0 or unit == units[-1]:
                if unit == "B":
                    return f"{int(size)} {unit}"
                return f"{size:.2f} {unit}"
            size /= 1024.0
        return f"{size_bytes} B"

    def _format_time(self, timestamp: float) -> str:
        import time
        return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(timestamp))

    if not hasattr(NFSFileInfo, "_format_size"):
        NFSFileInfo._format_size = _format_size
    if not hasattr(NFSFileInfo, "_format_time"):
        NFSFileInfo._format_time = _format_time


def _add_gssapi_args(parser: argparse.ArgumentParser) -> None:
    """Add GSSAPI/Kerberos arguments to a sub-parser."""
    gssapi_group = parser.add_argument_group("Kerberos/GSSAPI authentication")
    gssapi_group.add_argument(
        "--keytab", "-k",
        help="Path to Kerberos keytab file",
    )
    gssapi_group.add_argument(
        "--principal", "-p",
        help="Kerberos principal (e.g., nfs/client.example.com@EXAMPLE.COM)",
    )
    gssapi_group.add_argument(
        "--sec",
        choices=["krb5", "krb5i", "krb5p"],
        default="krb5p",
        help="NFS security flavor (default: krb5p). "
             "krb5=auth only, krb5i=auth+integrity, krb5p=auth+integrity+privacy",
    )
    gssapi_group.add_argument(
        "--realm",
        help="Kerberos realm (auto-detected from principal if omitted)",
    )
    gssapi_group.add_argument(
        "--kdc",
        help="KDC hostname (for auto krb5.conf generation)",
    )


def _add_stats_args(parser: argparse.ArgumentParser) -> None:
    """Add performance statistics arguments to a sub-parser."""
    stats_group = parser.add_argument_group("Performance statistics")
    stats_group.add_argument(
        "--stats",
        action="store_true",
        help="Show performance statistics after operation",
    )
    stats_group.add_argument(
        "--no-stats",
        action="store_true",
        help="Disable performance statistics collection",
    )
    stats_group.add_argument(
        "--stats-json",
        action="store_true",
        help="Output performance statistics as JSON",
    )


def _print_stats(client: NFS4Client, as_json: bool = False) -> None:
    """Print performance statistics."""
    if not client.has_stats or client.performance_stats is None:
        print("Performance statistics not enabled")
        return

    summary = client.performance_stats.summary()

    if as_json:
        print(json.dumps(summary, indent=2, ensure_ascii=False))
    else:
        print(client.performance_stats.format_summary())


def cmd_mount(args: argparse.Namespace) -> int:
    """Test mounting an NFS share."""
    nfs_url = args.nfs_url
    timeout = args.timeout
    gssapi_config = _build_gssapi_config(args)
    enable_stats = not getattr(args, "no_stats", False)

    print(f"Attempting to mount: {nfs_url}")
    print(f"Timeout: {timeout}s")
    if gssapi_config:
        print(f"Authentication: Kerberos (sec={gssapi_config.sec_flavor.value})")
        print(f"Principal: {gssapi_config.principal}")
        print(f"Keytab: {gssapi_config.keytab}")

    try:
        with NFS4Client(nfs_url, timeout=timeout, gssapi_config=gssapi_config, enable_stats=enable_stats) as client:
            print(f"\n✓ Successfully mounted NFS share")
            print(f"  Host:        {client.host}")
            print(f"  Export path: {client.export_path}")
            if gssapi_config:
                print(f"  Security:    {gssapi_config.sec_flavor.value} ({gssapi_config.sec_flavor.description})")

            root_info = client.stat("/")
            print(f"\nRoot directory info:")
            print(_format_stat_info(root_info, human_readable=True))

            if getattr(args, "stats", False):
                _print_stats(client, getattr(args, "stats_json", False))

            return 0
    except ConnectionError as e:
        print(f"\n✗ Failed to mount: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        logger.exception("Mount failed")
        return 1


def cmd_list(args: argparse.Namespace) -> int:
    """List contents of an NFS directory."""
    nfs_url = args.nfs_url
    path = args.path or "/"
    show_hidden = args.all
    human_readable = args.human_readable
    output_json = args.json
    gssapi_config = _build_gssapi_config(args)
    enable_stats = not getattr(args, "no_stats", False)

    try:
        with NFS4Client(nfs_url, timeout=args.timeout, gssapi_config=gssapi_config, enable_stats=enable_stats) as client:
            files = client.listdir(path, show_hidden=show_hidden)

            if output_json:
                result = {
                    "path": path,
                    "count": len(files),
                    "files": [f.to_dict() for f in files],
                }
                print(json.dumps(result, indent=2, ensure_ascii=False))
            else:
                print(f"Listing: {path}")
                print(f"Total entries: {len(files)}")
                print()
                print(_format_file_list(files, human_readable=human_readable))

            if getattr(args, "stats", False):
                _print_stats(client, getattr(args, "stats_json", False))

            return 0
    except FileNotFoundError:
        print(f"✗ Directory not found: {path}", file=sys.stderr)
        return 1
    except PermissionError:
        print(f"✗ Permission denied: {path}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"✗ Error: {e}", file=sys.stderr)
        logger.exception("List failed")
        return 1


def cmd_read(args: argparse.Namespace) -> int:
    """Read a file from NFS share."""
    nfs_url = args.nfs_url
    path = args.path
    binary = args.binary
    output_file = args.output
    gssapi_config = _build_gssapi_config(args)
    enable_stats = not getattr(args, "no_stats", False)

    try:
        with NFS4Client(nfs_url, timeout=args.timeout, gssapi_config=gssapi_config, enable_stats=enable_stats) as client:
            if not client.exists(path):
                print(f"✗ File not found: {path}", file=sys.stderr)
                return 1
            if client.is_dir(path):
                print(f"✗ Path is a directory: {path}", file=sys.stderr)
                return 1

            content = client.read_file(path, binary=binary)

            if output_file:
                mode = "wb" if binary else "w"
                with open(output_file, mode) as f:
                    f.write(content)
                print(f"✓ Written to: {output_file}")
            else:
                if binary and hasattr(sys.stdout, "buffer"):
                    sys.stdout.buffer.write(content)
                else:
                    print(content, end="" if not binary else "\n")

            if getattr(args, "stats", False):
                _print_stats(client, getattr(args, "stats_json", False))

            return 0
    except FileNotFoundError:
        print(f"✗ File not found: {path}", file=sys.stderr)
        return 1
    except PermissionError:
        print(f"✗ Permission denied: {path}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"✗ Error: {e}", file=sys.stderr)
        logger.exception("Read failed")
        return 1


def cmd_stat(args: argparse.Namespace) -> int:
    """Display file or directory metadata."""
    nfs_url = args.nfs_url
    path = args.path
    human_readable = args.human_readable
    output_json = args.json
    gssapi_config = _build_gssapi_config(args)
    enable_stats = not getattr(args, "no_stats", False)

    try:
        with NFS4Client(nfs_url, timeout=args.timeout, gssapi_config=gssapi_config, enable_stats=enable_stats) as client:
            info = client.stat(path)

            if output_json:
                print(json.dumps(info.to_dict(), indent=2, ensure_ascii=False))
            else:
                print(_format_stat_info(info, human_readable=human_readable))

            if getattr(args, "stats", False):
                _print_stats(client, getattr(args, "stats_json", False))

            return 0
    except FileNotFoundError:
        print(f"✗ Path not found: {path}", file=sys.stderr)
        return 1
    except PermissionError:
        print(f"✗ Permission denied: {path}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"✗ Error: {e}", file=sys.stderr)
        logger.exception("Stat failed")
        return 1


def cmd_lock(args: argparse.Namespace) -> int:
    """Check if a file is locked."""
    nfs_url = args.nfs_url
    path = args.path
    full_check = args.full_check
    output_json = args.json
    gssapi_config = _build_gssapi_config(args)
    enable_stats = not getattr(args, "no_stats", False)

    try:
        with NFS4Client(nfs_url, timeout=args.timeout, gssapi_config=gssapi_config, enable_stats=enable_stats) as client:
            lock_info = client.check_lock(path, full_check=full_check)

            if output_json:
                print(json.dumps(lock_info.to_dict(), indent=2, ensure_ascii=False))
            else:
                print(f"Path:    {lock_info.path}")
                print(f"Status:  {lock_info.status}")
                print(f"Locked:  {'Yes' if lock_info.is_locked else 'No'}")
                if lock_info.lock_type:
                    print(f"Type:    {lock_info.lock_type}")
                if lock_info.owner_pid:
                    print(f"Owner:   PID {lock_info.owner_pid}")
                if lock_info.owner_host:
                    print(f"Host:    {lock_info.owner_host}")

            if getattr(args, "stats", False):
                _print_stats(client, getattr(args, "stats_json", False))

            return 0
    except FileNotFoundError:
        print(f"✗ Path not found: {path}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"✗ Error: {e}", file=sys.stderr)
        logger.exception("Lock check failed")
        return 1


def cmd_serve(args: argparse.Namespace) -> int:
    """Start HTTP REST API server for browsing NFS."""
    from .api import create_app

    nfs_url = args.nfs_url
    host = args.host
    port = args.port
    debug = args.debug
    gssapi_config = _build_gssapi_config(args)
    enable_stats = not getattr(args, "no_stats", False)

    try:
        client = NFS4Client(
            nfs_url, timeout=args.timeout, auto_mount=True,
            gssapi_config=gssapi_config, enable_stats=enable_stats,
        )
        print(f"Testing connection to: {nfs_url}")
        if gssapi_config:
            print(f"  Kerberos: {gssapi_config.sec_flavor.value} ({gssapi_config.principal})")
        client.mount()
        print(f"✓ Successfully connected")
        client.umount()

        print(f"\nStarting HTTP API server...")
        print(f"  NFS share: {nfs_url}")
        print(f"  HTTP host: {host}")
        print(f"  HTTP port: {port}")
        if gssapi_config:
            print(f"  Kerberos:  {gssapi_config.sec_flavor.value}")
        print(f"\nAvailable endpoints:")
        print(f"  GET /api/health          - Health check")
        print(f"  GET /api/ls[?path=...]   - List directory")
        print(f"  GET /api/stat?path=...   - Get file/directory info")
        print(f"  GET /api/read?path=...   - Read file content")
        print(f"  GET /api/download?path=... - Download file")
        print(f"  GET /api/lock?path=...   - Check file lock")
        print(f"  GET /api/stats           - Get performance statistics")
        print(f"\nPress Ctrl+C to stop")

        app = create_app(client)
        app.run(host=host, port=port, debug=debug, threaded=True)

        return 0
    except ConnectionError as e:
        print(f"✗ Failed to connect to NFS server: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"✗ Error: {e}", file=sys.stderr)
        logger.exception("Serve failed")
        return 1


def cmd_check(args: argparse.Namespace) -> int:
    """Check if libnfs and GSSAPI are available."""
    exit_code = 0

    if is_libnfs_available():
        print("✓ libnfs Python bindings are available")
    else:
        print("✗ libnfs Python bindings are NOT installed")
        print()
        print("To install:")
        print("  1. Install libnfs C library:")
        print("     - macOS: brew install libnfs")
        print("     - Ubuntu: sudo apt-get install libnfs-dev")
        print("     - CentOS: sudo yum install libnfs-devel")
        print("  2. Install Python bindings:")
        print("     pip install libnfs")
        exit_code = 1

    print()

    if is_gssapi_available():
        print("✓ python-gssapi bindings are available")
    else:
        print("⚠ python-gssapi bindings are NOT installed")
        print("  Kerberos auth will fall back to kinit subprocess.")
        print("  Install with: pip install gssapi")

    if is_kinit_available():
        print("✓ kinit command is available")
    else:
        print("✗ kinit command is NOT found")
        print("  Install Kerberos client tools:")
        print("     - macOS: builtin or brew install krb5")
        print("     - Ubuntu: sudo apt-get install krb5-user")
        print("     - CentOS: sudo yum install krb5-workstation")
        if not is_gssapi_available():
            exit_code = 1

    return exit_code


def build_parser() -> argparse.ArgumentParser:
    """Build the argument parser."""
    parser = argparse.ArgumentParser(
        prog="nfs4-client",
        description="NFSv4 Client Toolkit - Mount and access NFSv4 shares",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Check prerequisites
  nfs4-client check

  # Test mounting an NFS share
  nfs4-client mount nfs://server.example.com/export/share

  # Mount with Kerberos authentication and show stats
  nfs4-client mount nfs://server.example.com/export/share \\
      --keytab /etc/krb5.keytab \\
      --principal nfs/client.example.com@EXAMPLE.COM \\
      --sec krb5p --stats

  # List directory with performance statistics
  nfs4-client list nfs://server.example.com/export/share "/文档" --stats

  # Read file and show stats as JSON
  nfs4-client read nfs://server.example.com/export/share "/中文目录/说明.txt" --stats-json

  # Check if a file is locked
  nfs4-client lock nfs://server.example.com/export/share /data/file.txt
  nfs4-client lock nfs://server.example.com/export/share /data/file.txt --json

  # Start HTTP API server with stats enabled
  nfs4-client serve nfs://server.example.com/export/share --host 0.0.0.0 --port 8000
        """,
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose logging",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=30,
        help="Connection timeout in seconds (default: 30)",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    check_parser = subparsers.add_parser(
        "check",
        help="Check if libnfs and GSSAPI are installed",
    )
    check_parser.set_defaults(func=cmd_check)

    mount_parser = subparsers.add_parser(
        "mount",
        help="Test mounting an NFS share",
    )
    mount_parser.add_argument("nfs_url", help="NFS URL (nfs://host/export/path)")
    _add_gssapi_args(mount_parser)
    _add_stats_args(mount_parser)
    mount_parser.set_defaults(func=cmd_mount)

    list_parser = subparsers.add_parser(
        "list",
        aliases=["ls"],
        help="List directory contents",
    )
    list_parser.add_argument("nfs_url", help="NFS URL (nfs://host/export/path)")
    list_parser.add_argument("path", nargs="?", default="/", help="Directory path (supports Chinese characters)")
    list_parser.add_argument("-a", "--all", action="store_true", help="Show hidden files")
    list_parser.add_argument("-H", "--human-readable", action="store_true", help="Human-readable sizes")
    list_parser.add_argument("--json", action="store_true", help="JSON output")
    _add_gssapi_args(list_parser)
    _add_stats_args(list_parser)
    list_parser.set_defaults(func=cmd_list)

    read_parser = subparsers.add_parser(
        "read",
        aliases=["cat"],
        help="Read file contents",
    )
    read_parser.add_argument("nfs_url", help="NFS URL (nfs://host/export/path)")
    read_parser.add_argument("path", help="File path (supports Chinese characters)")
    read_parser.add_argument("-b", "--binary", action="store_true", help="Read as binary")
    read_parser.add_argument("-o", "--output", help="Write to output file instead of stdout")
    _add_gssapi_args(read_parser)
    _add_stats_args(read_parser)
    read_parser.set_defaults(func=cmd_read)

    stat_parser = subparsers.add_parser(
        "stat",
        help="Display file/directory metadata",
    )
    stat_parser.add_argument("nfs_url", help="NFS URL (nfs://host/export/path)")
    stat_parser.add_argument("path", help="File or directory path (supports Chinese characters)")
    stat_parser.add_argument("-H", "--human-readable", action="store_true", help="Human-readable sizes")
    stat_parser.add_argument("--json", action="store_true", help="JSON output")
    _add_gssapi_args(stat_parser)
    _add_stats_args(stat_parser)
    stat_parser.set_defaults(func=cmd_stat)

    lock_parser = subparsers.add_parser(
        "lock",
        help="Check if a file is locked",
    )
    lock_parser.add_argument("nfs_url", help="NFS URL (nfs://host/export/path)")
    lock_parser.add_argument("path", help="File path to check")
    lock_parser.add_argument("-f", "--full-check", action="store_true", help="Perform full lock detection")
    lock_parser.add_argument("--json", action="store_true", help="JSON output")
    _add_gssapi_args(lock_parser)
    _add_stats_args(lock_parser)
    lock_parser.set_defaults(func=cmd_lock)

    serve_parser = subparsers.add_parser(
        "serve",
        help="Start HTTP REST API server",
    )
    serve_parser.add_argument("nfs_url", help="NFS URL (nfs://host/export/path)")
    serve_parser.add_argument("--host", default="127.0.0.1", help="HTTP server host (default: 127.0.0.1)")
    serve_parser.add_argument("--port", type=int, default=8000, help="HTTP server port (default: 8000)")
    serve_parser.add_argument("--debug", action="store_true", help="Enable Flask debug mode")
    _add_gssapi_args(serve_parser)
    _add_stats_args(serve_parser)
    serve_parser.set_defaults(func=cmd_serve)

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    """Main entry point for the CLI."""
    _add_mixins()

    parser = build_parser()
    args = parser.parse_args(argv)

    _setup_logging(args.verbose)

    if args.command != "check" and not is_libnfs_available():
        print("✗ libnfs Python bindings are required but not installed.", file=sys.stderr)
        print("Run 'nfs4-client check' for installation instructions.", file=sys.stderr)
        return 1

    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
