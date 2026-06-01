"""GSSAPI/Kerberos Authentication Module for NFSv4.

Provides Kerberos authentication support for NFSv4 mounts, including:
- Keytab file based authentication
- Principal configuration
- Security flavor selection (krb5/krb5i/krb5p)
- Credential cache management

NFSv4 security flavors per RFC 8881:
  krb5  - Authentication only
  krb5i - Authentication + Integrity (checksums)
  krb5p - Authentication + Integrity + Privacy (encryption)
"""

import os
import enum
import shutil
import subprocess
import logging
import tempfile
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import gssapi
    _GSSAPI_AVAILABLE = True
except ImportError:
    _GSSAPI_AVAILABLE = False
    logger.debug(
        "python-gssapi not installed. Kerberos auth will use kinit subprocess. "
        "Install with: pip install gssapi"
    )


class NFSSecFlavor(enum.Enum):
    """NFSv4 security flavors for Kerberos authentication.

    Per RFC 8881, these correspond to the RPCSEC_GSS security flavors:
    - krb5:  RPCSEC_GSS_SVC_NONE   (authentication only)
    - krb5i: RPCSEC_GSS_SVC_INTEGRITY (auth + integrity)
    - krb5p: RPCSEC_GSS_SVC_PRIVACY  (auth + integrity + privacy)
    """
    KRB5 = "krb5"
    KRB5I = "krb5i"
    KRB5P = "krb5p"

    @property
    def description(self) -> str:
        descriptions = {
            "krb5": "Authentication only",
            "krb5i": "Authentication + Integrity protection",
            "krb5p": "Authentication + Integrity + Privacy (encryption)",
        }
        return descriptions[self.value]

    @property
    def rpcsec_gss_service(self) -> str:
        service_map = {
            "krb5": "none",
            "krb5i": "integrity",
            "krb5p": "privacy",
        }
        return service_map[self.value]


@dataclass
class GSSAPIConfig:
    """GSSAPI/Kerberos authentication configuration.

    Attributes:
        principal: Kerberos principal (e.g., 'nfs/client.example.com@EXAMPLE.COM')
        keytab: Path to the keytab file
        sec_flavor: NFSv4 security flavor (krb5/krb5i/krb5p)
        realm: Kerberos realm (e.g., 'EXAMPLE.COM')
        kdc: Key Distribution Center hostname
        ccache: Path to credential cache file (default: auto-generated)
        service_name: GSSAPI service name for NFS (default: 'nfs')
    """
    principal: str
    keytab: str
    sec_flavor: NFSSecFlavor = NFSSecFlavor.KRB5P
    realm: Optional[str] = None
    kdc: Optional[str] = None
    ccache: Optional[str] = None
    service_name: str = "nfs"
    _owns_ccache: bool = field(default=False, repr=False)

    def __post_init__(self):
        if not os.path.isfile(self.keytab):
            raise FileNotFoundError(f"Keytab file not found: {self.keytab}")

        if self.realm is None and "@" in self.principal:
            self.realm = self.principal.split("@")[1]

        if self.ccache is None:
            self.ccache = os.path.join(
                tempfile.gettempdir(),
                f"nfs4cc_{os.getuid()}_{id(self)}"
            )
            self._owns_ccache = True

    def to_dict(self) -> dict:
        return {
            "principal": self.principal,
            "keytab": self.keytab,
            "sec_flavor": self.sec_flavor.value,
            "realm": self.realm,
            "kdc": self.kdc,
            "ccache": self.ccache,
            "service_name": self.service_name,
        }

    def cleanup(self) -> None:
        if self._owns_ccache and self.ccache and os.path.exists(self.ccache):
            try:
                os.unlink(self.ccache)
                logger.debug("Cleaned up credential cache: %s", self.ccache)
            except OSError:
                pass


def is_gssapi_available() -> bool:
    """Check if python-gssapi bindings are available."""
    return _GSSAPI_AVAILABLE


def is_kinit_available() -> bool:
    """Check if kinit command is available on the system."""
    return shutil.which("kinit") is not None


def is_kdestroy_available() -> bool:
    """Check if kdestroy command is available on the system."""
    return shutil.which("kdestroy") is not None


def _run_kinit(
    principal: str,
    keytab: str,
    ccache: Optional[str] = None,
    realm: Optional[str] = None,
    kdc: Optional[str] = None,
) -> None:
    """Acquire a Kerberos ticket using kinit with a keytab file.

    Args:
        principal: Kerberos principal
        keytab: Path to keytab file
        ccache: Path to credential cache
        realm: Kerberos realm
        kdc: KDC hostname

    Raises:
        RuntimeError: If kinit fails
        FileNotFoundError: If kinit is not found
    """
    kinit_path = shutil.which("kinit")
    if not kinit_path:
        raise FileNotFoundError(
            "kinit command not found. Install Kerberos client tools."
        )

    env = os.environ.copy()
    if ccache:
        env["KRB5CCNAME"] = ccache

    krb5_conf_content = None
    if realm and kdc:
        krb5_conf_path = os.path.join(
            tempfile.gettempdir(), f"krb5_conf_{os.getuid()}_{id(principal)}"
        )
        krb5_conf_content = _generate_krb5_conf(realm, kdc)
        with open(krb5_conf_path, "w") as f:
            f.write(krb5_conf_content)
        env["KRB5_CONFIG"] = krb5_conf_path

    cmd = [kinit_path, "-k", "-t", keytab, principal]

    logger.info("Acquiring Kerberos ticket for principal: %s", principal)
    logger.debug("Running: %s", " ".join(cmd))

    try:
        result = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"kinit failed (exit code {result.returncode}): {result.stderr.strip()}"
            )
        logger.info("Successfully acquired Kerberos ticket")
    except subprocess.TimeoutExpired:
        raise RuntimeError("kinit timed out after 30 seconds")
    finally:
        if krb5_conf_content:
            try:
                os.unlink(env.get("KRB5_CONFIG", ""))
            except OSError:
                pass


def _run_kdestroy(ccache: Optional[str] = None) -> None:
    """Destroy a Kerberos credential cache.

    Args:
        ccache: Path to credential cache
    """
    kdestroy_path = shutil.which("kdestroy")
    if not kdestroy_path:
        logger.warning("kdestroy not found, skipping credential cache cleanup")
        return

    env = os.environ.copy()
    if ccache:
        env["KRB5CCNAME"] = ccache

    try:
        subprocess.run(
            [kdestroy_path],
            env=env,
            capture_output=True,
            text=True,
            timeout=10,
        )
        logger.debug("Destroyed credential cache")
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass


def _gssapi_acquire_cred(
    principal: str,
    keytab: str,
    ccache: Optional[str] = None,
) -> None:
    """Acquire GSSAPI credentials using python-gssapi.

    Args:
        principal: Kerberos principal
        keytab: Path to keytab file
        ccache: Path to credential cache

    Raises:
        RuntimeError: If credential acquisition fails
    """
    if not _GSSAPI_AVAILABLE:
        raise RuntimeError("python-gssapi is not installed")

    env = os.environ.copy()
    if keytab:
        env["KRB5_CLIENT_KTNAME"] = keytab
    if ccache:
        env["KRB5CCNAME"] = ccache

    old_env = {}
    for key, value in env.items():
        if key.startswith("KRB5_"):
            old_env[key] = os.environ.get(key)
            os.environ[key] = value

    try:
        name = gssapi.Name(principal, gssapi.NameType.kerberos_principal)
        store = {"client_keytab": keytab}
        if ccache:
            store["ccache"] = ccache

        cred = gssapi.Credentials(name=name, store=store, usage="initiate")
        cred.acquire()
        logger.info("Acquired GSSAPI credentials for %s", principal)
    except gssapi.exceptions.GSSError as e:
        raise RuntimeError(f"GSSAPI credential acquisition failed: {e}") from e
    finally:
        for key, old_value in old_env.items():
            if old_value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old_value


def _generate_krb5_conf(realm: str, kdc: str) -> str:
    """Generate a minimal krb5.conf content.

    Args:
        realm: Kerberos realm
        kdc: KDC hostname

    Returns:
        krb5.conf content as string
    """
    return f"""[libdefaults]
    default_realm = {realm}
    dns_lookup_realm = false
    dns_lookup_kdc = false
    ticket_lifetime = 24h
    renew_lifetime = 7d
    forwardable = true
    udp_preference_limit = 0

[realms]
    {realm} = {{
        kdc = {kdc}
        admin_server = {kdc}
    }}

[domain_realm]
    .{realm.lower()} = {realm}
    {realm.lower()} = {realm}
"""


class GSSAPIAuthManager:
    """Manages GSSAPI/Kerberos authentication lifecycle for NFSv4.

    Handles ticket acquisition, renewal, and cleanup.

    Usage:
        config = GSSAPIConfig(
            principal="nfs/client.example.com@EXAMPLE.COM",
            keytab="/etc/krb5.keytab",
            sec_flavor=NFSSecFlavor.KRB5P,
        )

        with GSSAPIAuthManager(config) as auth:
            # Auth ticket is now acquired
            # NFS mount can proceed with Kerberos
            nfs_url = auth.build_nfs_url("server.example.com", "/export")
            ...
        # Ticket is automatically destroyed on exit
    """

    def __init__(self, config: GSSAPIConfig):
        self._config = config
        self._authenticated = False

    @property
    def config(self) -> GSSAPIConfig:
        return self._config

    @property
    def is_authenticated(self) -> bool:
        return self._authenticated

    def authenticate(self) -> None:
        """Acquire Kerberos credentials.

        Tries python-gssapi first, falls back to kinit subprocess.

        Raises:
            RuntimeError: If authentication fails
        """
        config = self._config

        logger.info(
            "Authenticating principal=%s sec=%s keytab=%s",
            config.principal, config.sec_flavor.value, config.keytab,
        )

        if _GSSAPI_AVAILABLE:
            try:
                _gssapi_acquire_cred(
                    principal=config.principal,
                    keytab=config.keytab,
                    ccache=config.ccache,
                )
                self._authenticated = True
                logger.info("GSSAPI authentication successful")
                return
            except Exception as e:
                logger.warning(
                    "python-gssapi auth failed (%s), falling back to kinit", e
                )

        if is_kinit_available():
            try:
                _run_kinit(
                    principal=config.principal,
                    keytab=config.keytab,
                    ccache=config.ccache,
                    realm=config.realm,
                    kdc=config.kdc,
                )
                self._authenticated = True
                logger.info("kinit authentication successful")
                return
            except Exception as e:
                raise RuntimeError(f"Kerberos authentication failed: {e}") from e

        raise RuntimeError(
            "No Kerberos authentication method available. "
            "Install python-gssapi or Kerberos client tools (kinit)."
        )

    def destroy(self) -> None:
        """Destroy Kerberos credentials and clean up."""
        if self._authenticated:
            _run_kdestroy(ccache=self._config.ccache)
            self._config.cleanup()
            self._authenticated = False
            logger.info("Kerberos credentials destroyed")

    def build_nfs_url(self, host: str, export_path: str, port: int = 2049) -> str:
        """Build an NFS URL with security parameters.

        Constructs a URL that includes the security flavor for libnfs.

        Args:
            host: NFS server hostname
            export_path: Export path on the server
            port: NFS port (default 2049)

        Returns:
            NFS URL with security parameters
        """
        sec = self._config.sec_flavor.value
        url = f"nfs://{host}:{port}{export_path}?sec={sec}"
        return url

    def get_env(self) -> dict:
        """Get environment variables needed for Kerberos NFS operations.

        Returns:
            Dictionary of environment variables to set
        """
        env = {}
        if self._config.ccache:
            env["KRB5CCNAME"] = self._config.ccache
        if self._config.keytab:
            env["KRB5_CLIENT_KTNAME"] = self._config.keytab
        return env

    def __enter__(self) -> "GSSAPIAuthManager":
        self.authenticate()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.destroy()

    def __del__(self) -> None:
        try:
            if self._authenticated:
                self.destroy()
        except Exception:
            pass
