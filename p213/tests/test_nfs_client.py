"""Unit tests for NFS client core functionality.

These tests verify core logic that doesn't require an actual NFS connection.
Covers: NFSFileInfo, UTF-8 path handling, GSSAPI config, path normalization.
"""

import os
import stat
import time
import tempfile
import pytest
from dataclasses import dataclass

from nfs4_client.nfs_client import (
    NFSFileInfo,
    nfs4_str_encode,
    nfs4_str_decode,
    validate_utf8_path,
    safe_path_decode,
)
from nfs4_client.auth import (
    GSSAPIConfig,
    GSSAPIAuthManager,
    NFSSecFlavor,
    is_gssapi_available,
    is_kinit_available,
    _generate_krb5_conf,
)


class TestNFSFileInfo:
    """Tests for NFSFileInfo data class."""

    def test_from_stat(self):
        class MockStatResult:
            st_mode = stat.S_IFREG | 0o644
            st_size = 1024
            st_uid = 1000
            st_gid = 1000
            st_atime = time.time()
            st_mtime = time.time()
            st_ctime = time.time()

        stat_result = MockStatResult()
        info = NFSFileInfo.from_stat("test.txt", "/test.txt", stat_result)

        assert info.name == "test.txt"
        assert info.path == "/test.txt"
        assert info.is_dir is False
        assert info.size == 1024
        assert info.uid == 1000
        assert info.gid == 1000

    def test_from_stat_directory(self):
        class MockStatResult:
            st_mode = stat.S_IFDIR | 0o755
            st_size = 4096
            st_uid = 0
            st_gid = 0
            st_atime = time.time()
            st_mtime = time.time()
            st_ctime = time.time()

        stat_result = MockStatResult()
        info = NFSFileInfo.from_stat("docs", "/docs", stat_result)

        assert info.name == "docs"
        assert info.is_dir is True
        assert info.size == 4096

    def test_from_stat_chinese_name(self):
        class MockStatResult:
            st_mode = stat.S_IFDIR | 0o755
            st_size = 4096
            st_uid = 1000
            st_gid = 1000
            st_atime = time.time()
            st_mtime = time.time()
            st_ctime = time.time()

        stat_result = MockStatResult()
        info = NFSFileInfo.from_stat("文档", "/文档", stat_result)

        assert info.name == "文档"
        assert info.path == "/文档"
        assert info.is_dir is True

    def test_to_dict(self):
        now = time.time()
        info = NFSFileInfo(
            name="test.txt",
            path="/test.txt",
            is_dir=False,
            size=1024,
            mode=stat.S_IFREG | 0o644,
            uid=1000,
            gid=1000,
            atime=now,
            mtime=now,
            ctime=now,
        )

        result = info.to_dict()

        assert result["name"] == "test.txt"
        assert result["path"] == "/test.txt"
        assert result["is_dir"] is False
        assert result["size"] == 1024
        assert result["mode_str"] == "-rw-r--r--"
        assert "mtime_str" in result
        assert isinstance(result["mtime_str"], str)

    def test_to_dict_chinese_path(self):
        now = time.time()
        info = NFSFileInfo(
            name="报告",
            path="/文档/报告",
            is_dir=True,
            size=4096,
            mode=stat.S_IFDIR | 0o755,
            uid=1000,
            gid=1000,
            atime=now,
            mtime=now,
            ctime=now,
        )

        result = info.to_dict()
        assert result["name"] == "报告"
        assert result["path"] == "/文档/报告"
        assert result["is_dir"] is True
        assert result["mode_str"] == "drwxr-xr-x"

    def test_to_dict_directory(self):
        now = time.time()
        info = NFSFileInfo(
            name="docs",
            path="/docs",
            is_dir=True,
            size=4096,
            mode=stat.S_IFDIR | 0o755,
            uid=0,
            gid=0,
            atime=now,
            mtime=now,
            ctime=now,
        )

        result = info.to_dict()
        assert result["is_dir"] is True
        assert result["mode_str"] == "drwxr-xr-x"


class TestNFS4StrEncodeDecode:
    """Tests for NFSv4 UTF-8 string encoding/decoding."""

    def test_encode_ascii(self):
        result = nfs4_str_encode("hello")
        assert result == b"hello"

    def test_encode_chinese(self):
        result = nfs4_str_encode("中文路径")
        assert result == "中文路径".encode("utf-8")
        assert isinstance(result, bytes)

    def test_encode_mixed(self):
        result = nfs4_str_encode("/docs/报告/2024.txt")
        assert result == "/docs/报告/2024.txt".encode("utf-8")

    def test_decode_ascii(self):
        result = nfs4_str_decode(b"hello")
        assert result == "hello"

    def test_decode_chinese(self):
        encoded = "中文路径".encode("utf-8")
        result = nfs4_str_decode(encoded)
        assert result == "中文路径"

    def test_decode_malformed_utf8(self):
        malformed = b"\xff\xfe"
        result = nfs4_str_decode(malformed)
        assert isinstance(result, str)

    def test_roundtrip_chinese(self):
        original = "/文档/报告/第一季度.xlsx"
        encoded = nfs4_str_encode(original)
        decoded = nfs4_str_decode(encoded)
        assert decoded == original

    def test_roundtrip_japanese(self):
        original = "/ドキュメント/レポート"
        encoded = nfs4_str_encode(original)
        decoded = nfs4_str_decode(encoded)
        assert decoded == original

    def test_roundtrip_emoji(self):
        original = "/📁文件夹/📄文件.txt"
        encoded = nfs4_str_encode(original)
        decoded = nfs4_str_decode(encoded)
        assert decoded == original


class TestValidateUtf8Path:
    """Tests for UTF-8 path validation."""

    def test_valid_ascii_path(self):
        assert validate_utf8_path("/home/user/docs") == "/home/user/docs"

    def test_valid_chinese_path(self):
        assert validate_utf8_path("/文档/报告") == "/文档/报告"

    def test_valid_mixed_path(self):
        assert validate_utf8_path("/data/2024年/第一季度") == "/data/2024年/第一季度"

    def test_root_path(self):
        assert validate_utf8_path("/") == "/"

    def test_path_with_spaces_and_chinese(self):
        path = "/我的 文档/项目 资料"
        assert validate_utf8_path(path) == path


class TestSafePathDecode:
    """Tests for safe path decoding."""

    def test_decode_str_already_utf8(self):
        result = safe_path_decode("/文档/报告")
        assert result == "/文档/报告"

    def test_decode_bytes_utf8(self):
        result = safe_path_decode("/文档".encode("utf-8"))
        assert result == "/文档"

    def test_decode_ascii_str(self):
        result = safe_path_decode("/home/user")
        assert result == "/home/user"

    def test_decode_latin1_encoded_utf8(self):
        chinese = "中文"
        latin1_bytes = chinese.encode("utf-8").decode("latin-1")
        result = safe_path_decode(latin1_bytes)
        assert result == chinese


class TestNFS4ClientURLParsing:
    """Tests for NFS4Client URL parsing (without actual connection)."""

    def test_parse_nfs_url(self):
        from nfs4_client.nfs_client import NFS4Client, is_libnfs_available

        if not is_libnfs_available():
            pytest.skip("libnfs not available")

        client = NFS4Client("nfs://server.example.com/export/share")
        assert client.host == "server.example.com"
        assert client.export_path == "/export/share"

    def test_parse_nfs4_url(self):
        from nfs4_client.nfs_client import NFS4Client, is_libnfs_available

        if not is_libnfs_available():
            pytest.skip("libnfs not available")

        client = NFS4Client("nfs4://server.example.com/export")
        assert client.host == "server.example.com"
        assert client.export_path == "/export"

    def test_parse_url_with_port(self):
        from nfs4_client.nfs_client import NFS4Client, is_libnfs_available

        if not is_libnfs_available():
            pytest.skip("libnfs not available")

        client = NFS4Client("nfs://server.example.com:2049/export")
        assert client.host == "server.example.com"
        assert client._port == 2049

    def test_parse_invalid_scheme(self):
        from nfs4_client.nfs_client import NFS4Client, is_libnfs_available

        if not is_libnfs_available():
            pytest.skip("libnfs not available")

        with pytest.raises(ValueError, match="Invalid NFS URL scheme"):
            NFS4Client("http://server.example.com/export")

    def test_parse_url_without_hostname(self):
        from nfs4_client.nfs_client import NFS4Client, is_libnfs_available

        if not is_libnfs_available():
            pytest.skip("libnfs not available")

        with pytest.raises(ValueError, match="NFS URL must contain a hostname"):
            NFS4Client("nfs:///export")

    def test_normalize_path(self):
        from nfs4_client.nfs_client import NFS4Client

        assert NFS4Client._normalize_path("test") == "/test"
        assert NFS4Client._normalize_path("/test/path") == "/test/path"
        assert NFS4Client._normalize_path("test/path/../other") == "/test/other"
        assert NFS4Client._normalize_path("/") == "/"

    def test_normalize_chinese_path(self):
        from nfs4_client.nfs_client import NFS4Client

        assert NFS4Client._normalize_path("文档") == "/文档"
        assert NFS4Client._normalize_path("/文档/报告") == "/文档/报告"
        assert NFS4Client._normalize_path("文档/../资料") == "/资料"

    def test_normalize_path_rejects_invalid_utf8(self):
        from nfs4_client.nfs_client import NFS4Client

        with pytest.raises(ValueError, match="not valid UTF-8"):
            NFS4Client._normalize_path("/valid/\ud800")


class TestNFSSecFlavor:
    """Tests for NFS security flavor enum."""

    def test_krb5_values(self):
        assert NFSSecFlavor.KRB5.value == "krb5"
        assert NFSSecFlavor.KRB5I.value == "krb5i"
        assert NFSSecFlavor.KRB5P.value == "krb5p"

    def test_krb5_descriptions(self):
        assert "Authentication only" in NFSSecFlavor.KRB5.description
        assert "Integrity" in NFSSecFlavor.KRB5I.description
        assert "Privacy" in NFSSecFlavor.KRB5P.description

    def test_rpcsec_gss_service_mapping(self):
        assert NFSSecFlavor.KRB5.rpcsec_gss_service == "none"
        assert NFSSecFlavor.KRB5I.rpcsec_gss_service == "integrity"
        assert NFSSecFlavor.KRB5P.rpcsec_gss_service == "privacy"


class TestGSSAPIConfig:
    """Tests for GSSAPI configuration."""

    def test_config_creation(self):
        with tempfile.NamedTemporaryFile(suffix=".keytab", delete=False) as f:
            keytab_path = f.name

        try:
            config = GSSAPIConfig(
                principal="nfs/client.example.com@EXAMPLE.COM",
                keytab=keytab_path,
                sec_flavor=NFSSecFlavor.KRB5P,
            )
            assert config.principal == "nfs/client.example.com@EXAMPLE.COM"
            assert config.keytab == keytab_path
            assert config.sec_flavor == NFSSecFlavor.KRB5P
            assert config.realm == "EXAMPLE.COM"
            config.cleanup()
        finally:
            os.unlink(keytab_path)

    def test_config_realm_auto_detection(self):
        with tempfile.NamedTemporaryFile(suffix=".keytab", delete=False) as f:
            keytab_path = f.name

        try:
            config = GSSAPIConfig(
                principal="host/server@MYREALM.COM",
                keytab=keytab_path,
            )
            assert config.realm == "MYREALM.COM"
            config.cleanup()
        finally:
            os.unlink(keytab_path)

    def test_config_missing_keytab(self):
        with pytest.raises(FileNotFoundError, match="Keytab file not found"):
            GSSAPIConfig(
                principal="nfs/client@EXAMPLE.COM",
                keytab="/nonexistent/keytab",
            )

    def test_config_to_dict(self):
        with tempfile.NamedTemporaryFile(suffix=".keytab", delete=False) as f:
            keytab_path = f.name

        try:
            config = GSSAPIConfig(
                principal="nfs/client@EXAMPLE.COM",
                keytab=keytab_path,
                sec_flavor=NFSSecFlavor.KRB5I,
            )
            d = config.to_dict()
            assert d["principal"] == "nfs/client@EXAMPLE.COM"
            assert d["sec_flavor"] == "krb5i"
            assert d["keytab"] == keytab_path
            assert d["realm"] == "EXAMPLE.COM"
            config.cleanup()
        finally:
            os.unlink(keytab_path)

    def test_config_custom_realm_and_kdc(self):
        with tempfile.NamedTemporaryFile(suffix=".keytab", delete=False) as f:
            keytab_path = f.name

        try:
            config = GSSAPIConfig(
                principal="nfs/client@EXAMPLE.COM",
                keytab=keytab_path,
                realm="CUSTOM.COM",
                kdc="kdc.custom.com",
            )
            assert config.realm == "CUSTOM.COM"
            assert config.kdc == "kdc.custom.com"
            config.cleanup()
        finally:
            os.unlink(keytab_path)


class TestGSSAPIAuthManager:
    """Tests for GSSAPI authentication manager."""

    def test_build_nfs_url_krb5(self):
        with tempfile.NamedTemporaryFile(suffix=".keytab", delete=False) as f:
            keytab_path = f.name

        try:
            config = GSSAPIConfig(
                principal="nfs/client@EXAMPLE.COM",
                keytab=keytab_path,
                sec_flavor=NFSSecFlavor.KRB5,
            )
            manager = GSSAPIAuthManager(config)
            url = manager.build_nfs_url("server.example.com", "/export")
            assert "sec=krb5" in url
            assert "server.example.com" in url
            assert "/export" in url
            config.cleanup()
        finally:
            os.unlink(keytab_path)

    def test_build_nfs_url_krb5p(self):
        with tempfile.NamedTemporaryFile(suffix=".keytab", delete=False) as f:
            keytab_path = f.name

        try:
            config = GSSAPIConfig(
                principal="nfs/client@EXAMPLE.COM",
                keytab=keytab_path,
                sec_flavor=NFSSecFlavor.KRB5P,
            )
            manager = GSSAPIAuthManager(config)
            url = manager.build_nfs_url("server.example.com", "/export", port=2049)
            assert "sec=krb5p" in url
            config.cleanup()
        finally:
            os.unlink(keytab_path)

    def test_get_env(self):
        with tempfile.NamedTemporaryFile(suffix=".keytab", delete=False) as f:
            keytab_path = f.name

        try:
            config = GSSAPIConfig(
                principal="nfs/client@EXAMPLE.COM",
                keytab=keytab_path,
            )
            manager = GSSAPIAuthManager(config)
            env = manager.get_env()
            assert "KRB5CCNAME" in env
            assert "KRB5_CLIENT_KTNAME" in env
            assert env["KRB5_CLIENT_KTNAME"] == keytab_path
            config.cleanup()
        finally:
            os.unlink(keytab_path)


class TestKrb5ConfGeneration:
    """Tests for krb5.conf generation."""

    def test_generate_krb5_conf(self):
        content = _generate_krb5_conf("EXAMPLE.COM", "kdc.example.com")
        assert "EXAMPLE.COM" in content
        assert "kdc.example.com" in content
        assert "[libdefaults]" in content
        assert "[realms]" in content
        assert "[domain_realm]" in content

    def test_generate_krb5_conf_chinese_realm(self):
        content = _generate_krb5_conf("TEST.CN", "kdc.test.cn")
        assert "TEST.CN" in content
        assert "kdc.test.cn" in content
        assert "test.cn" in content


class TestIsLibnfsAvailable:
    """Tests for libnfs availability check."""

    def test_is_libnfs_available_returns_bool(self):
        from nfs4_client.nfs_client import is_libnfs_available

        result = is_libnfs_available()
        assert isinstance(result, bool)

    def test_is_gssapi_available_returns_bool(self):
        result = is_gssapi_available()
        assert isinstance(result, bool)

    def test_is_kinit_available_returns_bool(self):
        result = is_kinit_available()
        assert isinstance(result, bool)
