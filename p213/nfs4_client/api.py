"""HTTP REST API for NFSv4 file browsing.

Provides RESTful endpoints for browsing and accessing NFSv4 shares.
Uses Flask as the web framework.

Endpoints:
    GET /api/health          - Health check
    GET /api/ls              - List directory contents
    GET /api/stat            - Get file/directory metadata
    GET /api/read            - Read text file content
    GET /api/download        - Download file (binary)
    GET /api/search          - Search files (recursive)
    GET /api/stats           - Get performance statistics
    GET /api/stats/reset     - Reset performance statistics
    GET /api/lock            - Check file lock status
"""

import os
import logging
import mimetypes
from urllib.parse import unquote
from typing import Optional

from flask import Flask, jsonify, request, Response, stream_with_context, send_file
from flask_cors import CORS

from .nfs_client import NFS4Client

logger = logging.getLogger(__name__)


def create_app(nfs_client: NFS4Client) -> Flask:
    """Create and configure the Flask application.

    Args:
        nfs_client: Configured NFS4Client instance

    Returns:
        Configured Flask application
    """
    app = Flask(__name__)
    CORS(app)

    app.config["nfs_client"] = nfs_client
    app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024 * 1024

    def _get_client() -> NFS4Client:
        """Get the NFS client from app config."""
        return app.config["nfs_client"]

    def _get_path_param() -> str:
        """Get and decode the path parameter from request."""
        path = request.args.get("path", "/")
        path = unquote(path)
        if not path.startswith("/"):
            path = "/" + path
        return path

    def _error_response(message: str, status_code: int = 400) -> tuple:
        """Create a standardized error response."""
        return jsonify({
            "error": True,
            "message": message,
            "status_code": status_code,
        }), status_code

    @app.route("/api/health", methods=["GET"])
    def health_check():
        """Health check endpoint."""
        client = _get_client()
        try:
            if not client.is_mounted:
                client.mount()
            root_stat = client.stat("/")
            result = {
                "status": "healthy",
                "nfs_mounted": client.is_mounted,
                "nfs_host": client.host,
                "nfs_export": client.export_path,
                "encoding": client.encoding,
                "root_exists": root_stat is not None,
            }
            if client.gssapi_config is not None:
                result["kerberos"] = {
                    "enabled": True,
                    "sec_flavor": client.gssapi_config.sec_flavor.value,
                    "principal": client.gssapi_config.principal,
                    "realm": client.gssapi_config.realm,
                }
            else:
                result["kerberos"] = {"enabled": False}
            return jsonify(result)
        except Exception as e:
            logger.error("Health check failed: %s", e)
            return jsonify({
                "status": "unhealthy",
                "error": str(e),
            }), 503

    @app.route("/api/ls", methods=["GET"])
    @app.route("/api/list", methods=["GET"])
    def list_directory():
        """List directory contents.

        Query Parameters:
            path: Directory path (default: /)
            hidden: Show hidden files (true/false, default: false)
            json: Response format (ignored, always JSON)

        Returns:
            JSON with directory contents
        """
        client = _get_client()
        path = _get_path_param()
        show_hidden = request.args.get("hidden", "false").lower() == "true"

        try:
            if not client.is_mounted:
                client.mount()

            files = client.listdir(path, show_hidden=show_hidden)

            return jsonify({
                "success": True,
                "path": path,
                "count": len(files),
                "files": [f.to_dict() for f in files],
            })
        except FileNotFoundError:
            return _error_response(f"Directory not found: {path}", 404)
        except PermissionError:
            return _error_response(f"Permission denied: {path}", 403)
        except Exception as e:
            logger.exception("Failed to list directory %s", path)
            return _error_response(f"Internal error: {str(e)}", 500)

    @app.route("/api/stat", methods=["GET"])
    def get_stat():
        """Get file or directory metadata.

        Query Parameters:
            path: File or directory path (required)

        Returns:
            JSON with file metadata
        """
        client = _get_client()
        path = _get_path_param()

        if path == "/":
            return _error_response("Path parameter is required", 400)

        try:
            if not client.is_mounted:
                client.mount()

            info = client.stat(path)

            return jsonify({
                "success": True,
                "path": path,
                "info": info.to_dict(),
            })
        except FileNotFoundError:
            return _error_response(f"Path not found: {path}", 404)
        except PermissionError:
            return _error_response(f"Permission denied: {path}", 403)
        except Exception as e:
            logger.exception("Failed to stat %s", path)
            return _error_response(f"Internal error: {str(e)}", 500)

    @app.route("/api/read", methods=["GET"])
    def read_file():
        """Read text file content.

        Query Parameters:
            path: File path (required)
            encoding: Text encoding (default: utf-8)

        Returns:
            Text file content with appropriate headers
        """
        client = _get_client()
        path = _get_path_param()
        encoding = request.args.get("encoding", "utf-8")

        if path == "/":
            return _error_response("Path parameter is required", 400)

        try:
            if not client.is_mounted:
                client.mount()

            if not client.exists(path):
                return _error_response(f"File not found: {path}", 404)

            if client.is_dir(path):
                return _error_response(f"Path is a directory: {path}", 400)

            content = client.read_file(path, binary=False, encoding=encoding)
            mime_type, _ = mimetypes.guess_type(path)
            if mime_type is None:
                mime_type = "text/plain"

            return Response(
                content,
                mimetype=mime_type,
                headers={
                    "Content-Disposition": f"inline; filename*=UTF-8''{os.path.basename(path)}",
                },
            )
        except FileNotFoundError:
            return _error_response(f"File not found: {path}", 404)
        except PermissionError:
            return _error_response(f"Permission denied: {path}", 403)
        except UnicodeDecodeError:
            return _error_response(
                f"File is not valid {encoding} text. Use /api/download for binary files.",
                400,
            )
        except Exception as e:
            logger.exception("Failed to read file %s", path)
            return _error_response(f"Internal error: {str(e)}", 500)

    @app.route("/api/download", methods=["GET"])
    def download_file():
        """Download a file (binary or text).

        Query Parameters:
            path: File path (required)
            inline: Display inline instead of download (true/false, default: false)

        Returns:
            File stream with appropriate headers
        """
        client = _get_client()
        path = _get_path_param()
        inline = request.args.get("inline", "false").lower() == "true"

        if path == "/":
            return _error_response("Path parameter is required", 400)

        try:
            if not client.is_mounted:
                client.mount()

            if not client.exists(path):
                return _error_response(f"File not found: {path}", 404)

            if client.is_dir(path):
                return _error_response(f"Path is a directory: {path}", 400)

            file_info = client.stat(path)
            filename = os.path.basename(path)
            mime_type, _ = mimetypes.guess_type(path)
            if mime_type is None:
                mime_type = "application/octet-stream"

            disposition = "inline" if inline else "attachment"

            def generate():
                yield from client.read_file_chunked(path)

            return Response(
                stream_with_context(generate()),
                mimetype=mime_type,
                headers={
                    "Content-Disposition": f"{disposition}; filename*=UTF-8''{filename}",
                    "Content-Length": str(file_info.size),
                    "Accept-Ranges": "bytes",
                },
            )
        except FileNotFoundError:
            return _error_response(f"File not found: {path}", 404)
        except PermissionError:
            return _error_response(f"Permission denied: {path}", 403)
        except Exception as e:
            logger.exception("Failed to download file %s", path)
            return _error_response(f"Internal error: {str(e)}", 500)

    @app.route("/api/search", methods=["GET"])
    def search_files():
        """Search for files recursively.

        Query Parameters:
            path: Root directory path (default: /)
            q: Search query (filename contains)
            type: Filter by type (file/dir/all, default: all)
            max_depth: Maximum recursion depth (default: 5)
            hidden: Include hidden files (true/false, default: false)

        Returns:
            JSON with matching files
        """
        client = _get_client()
        path = _get_path_param()
        query = request.args.get("q", "").lower()
        file_type = request.args.get("type", "all").lower()
        max_depth = int(request.args.get("max_depth", "5"))
        show_hidden = request.args.get("hidden", "false").lower() == "true"

        if file_type not in ("file", "dir", "all"):
            return _error_response("Invalid type. Must be 'file', 'dir', or 'all'", 400)

        try:
            if not client.is_mounted:
                client.mount()

            if not client.exists(path):
                return _error_response(f"Path not found: {path}", 404)

            if not client.is_dir(path):
                return _error_response(f"Path is not a directory: {path}", 400)

            matches = []
            for dirpath, dirnames, filenames in client.walk(
                path, show_hidden=show_hidden, max_depth=max_depth
            ):
                if file_type in ("dir", "all"):
                    for dirname in dirnames:
                        if query in dirname.lower():
                            full_path = os.path.join(dirpath, dirname)
                            try:
                                info = client.stat(full_path)
                                matches.append(info.to_dict())
                            except Exception:
                                pass

                if file_type in ("file", "all"):
                    for filename in filenames:
                        if query in filename.lower():
                            full_path = os.path.join(dirpath, filename)
                            try:
                                info = client.stat(full_path)
                                matches.append(info.to_dict())
                            except Exception:
                                pass

            return jsonify({
                "success": True,
                "path": path,
                "query": query,
                "type_filter": file_type,
                "max_depth": max_depth,
                "count": len(matches),
                "matches": matches,
            })
        except FileNotFoundError:
            return _error_response(f"Path not found: {path}", 404)
        except PermissionError:
            return _error_response(f"Permission denied: {path}", 403)
        except Exception as e:
            logger.exception("Failed to search in %s", path)
            return _error_response(f"Internal error: {str(e)}", 500)

    @app.route("/api/stats", methods=["GET"])
    def get_performance_stats():
        """Get performance statistics.

        Query Parameters:
            reset: Reset statistics after retrieval (true/false, default: false)

        Returns:
            JSON with performance statistics
        """
        client = _get_client()

        if not client.has_stats or client.performance_stats is None:
            return jsonify({
                "success": True,
                "enabled": False,
                "message": "Performance statistics not enabled",
            })

        reset = request.args.get("reset", "false").lower() == "true"
        summary = client.performance_stats.summary()

        if reset:
            client.performance_stats.reset()

        return jsonify({
            "success": True,
            "enabled": True,
            "stats": summary,
        })

    @app.route("/api/stats/reset", methods=["POST", "GET"])
    def reset_performance_stats():
        """Reset performance statistics."""
        client = _get_client()

        if client.has_stats and client.performance_stats is not None:
            client.performance_stats.reset()
            return jsonify({
                "success": True,
                "message": "Performance statistics reset",
            })

        return jsonify({
            "success": True,
            "message": "Performance statistics not enabled",
        })

    @app.route("/api/lock", methods=["GET"])
    @app.route("/api/lock/check", methods=["GET"])
    def check_file_lock():
        """Check if a file is locked.

        Query Parameters:
            path: Path to the file (required)
            full: Perform full check (true/false, default: false)

        Returns:
            JSON with lock status
        """
        client = _get_client()
        path = _get_path_param()

        if path == "/":
            return _error_response("Path parameter is required", 400)

        full_check = request.args.get("full", "false").lower() == "true"

        try:
            if not client.is_mounted:
                client.mount()

            lock_info = client.check_lock(path, full_check=full_check)

            return jsonify({
                "success": True,
                "path": path,
                "lock": lock_info.to_dict(),
            })
        except FileNotFoundError:
            return _error_response(f"File not found: {path}", 404)
        except Exception as e:
            logger.exception("Failed to check lock for %s", path)
            return _error_response(f"Internal error: {str(e)}", 500)

    @app.route("/api", methods=["GET"])
    def api_root():
        """API root endpoint listing available endpoints."""
        return jsonify({
            "name": "NFSv4 Client API",
            "version": "1.1",
            "endpoints": {
                "health": "/api/health",
                "list": "/api/ls?path=/directory",
                "stat": "/api/stat?path=/file.txt",
                "read": "/api/read?path=/file.txt",
                "download": "/api/download?path=/file.pdf",
                "search": "/api/search?q=query&path=/&type=file",
                "stats": "/api/stats",
                "stats_reset": "/api/stats/reset",
                "lock": "/api/lock?path=/file.txt",
            },
            "nfs_server": {
                "host": nfs_client.host,
                "export": nfs_client.export_path,
            },
        })

    @app.route("/", methods=["GET"])
    def root():
        """Root endpoint with basic info."""
        return jsonify({
            "name": "NFSv4 Client HTTP API",
            "version": "1.1",
            "status": "running",
            "api_endpoint": "/api",
            "docs": {
                "GET /api": "List available API endpoints",
                "GET /api/health": "Health check",
                "GET /api/ls?path=PATH": "List directory contents",
                "GET /api/stat?path=PATH": "Get file/directory metadata",
                "GET /api/read?path=PATH": "Read text file content",
                "GET /api/download?path=PATH": "Download file",
                "GET /api/search?q=QUERY&path=PATH": "Search files",
                "GET /api/stats": "Get performance statistics",
                "GET /api/stats/reset": "Reset performance statistics",
                "GET /api/lock?path=PATH": "Check file lock status",
            },
        })

    @app.errorhandler(404)
    def not_found(e):
        return _error_response("Endpoint not found", 404)

    @app.errorhandler(500)
    def internal_error(e):
        logger.exception("Internal server error")
        return _error_response("Internal server error", 500)

    return app
