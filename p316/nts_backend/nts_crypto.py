import base64
import json
import os
import struct
import time
import uuid
from dataclasses import dataclass, asdict, field
from typing import List, Optional, Tuple, Dict, Any

from .aes_siv import AESSIV, AuthenticationFailed, AESSIVError


COOKIE_VERSION_1 = 0x01
VERSION_FIELD_LEN = 1
AAD_LEN_FIELD_LEN = 2
SIV_FIELD_LEN = 16
MIN_COOKIE_BINARY_LEN = VERSION_FIELD_LEN + AAD_LEN_FIELD_LEN + SIV_FIELD_LEN
MAX_AAD_LEN = 4096
MAX_CIPHERTEXT_LEN = 65536
MIN_NONCE_LEN = 12
MIN_UNIQUE_ID_LEN = 16
DEFAULT_UNIQUE_ID_LEN = 32


class NTSCookieError(Exception):
    pass


class CookieTooShort(NTSCookieError):
    pass


class UnsupportedVersion(NTSCookieError):
    pass


class AADLengthOverflow(NTSCookieError):
    pass


class AADLengthTooLarge(NTSCookieError):
    pass


class SIVFieldMissing(NTSCookieError):
    pass


class CiphertextTooLarge(NTSCookieError):
    pass


class Base64DecodeFailed(NTSCookieError):
    pass


class NoNonceInAAD(NTSCookieError):
    pass


class NonceTooShort(NTSCookieError):
    pass


class InvalidCookieFormat(NTSCookieError):
    pass


class UniqueIdentifierError(NTSCookieError):
    pass


class UniqueIdentifierTooShort(UniqueIdentifierError):
    pass


class UniqueIdentifierMismatch(UniqueIdentifierError):
    pass


class KeyAgreementError(NTSCookieError):
    pass


@dataclass
class CookieData:
    version: int
    aad: bytes
    nonce: bytes
    siv: bytes
    ciphertext: bytes

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "aad_hex": self.aad.hex(),
            "aad_len": len(self.aad),
            "nonce_hex": self.nonce.hex(),
            "nonce_len": len(self.nonce),
            "siv_hex": self.siv.hex(),
            "ciphertext_hex": self.ciphertext.hex(),
            "ciphertext_len": len(self.ciphertext),
        }


def parse_cookie_binary(raw: bytes) -> CookieData:
    if len(raw) < MIN_COOKIE_BINARY_LEN:
        raise CookieTooShort(
            f"binary data too short: got {len(raw)} bytes, need at least {MIN_COOKIE_BINARY_LEN}"
        )

    offset = 0

    version = raw[offset]
    offset += VERSION_FIELD_LEN

    if version != COOKIE_VERSION_1:
        raise UnsupportedVersion(f"unsupported version: got 0x{version:02x}")

    if len(raw) - offset < AAD_LEN_FIELD_LEN:
        raise CookieTooShort(
            f"need {AAD_LEN_FIELD_LEN} bytes for AAD length field, have {len(raw) - offset}"
        )

    aad_len = struct.unpack("!H", raw[offset:offset + AAD_LEN_FIELD_LEN])[0]
    offset += AAD_LEN_FIELD_LEN

    if aad_len > MAX_AAD_LEN:
        raise AADLengthTooLarge(
            f"AAD length {aad_len} exceeds maximum allowed ({MAX_AAD_LEN})"
        )

    if len(raw) - offset < aad_len:
        raise AADLengthOverflow(
            f"AAD length {aad_len} but only {len(raw) - offset} bytes remain"
        )

    aad = raw[offset:offset + aad_len]
    offset += aad_len

    if len(raw) - offset < SIV_FIELD_LEN:
        raise SIVFieldMissing(
            f"need {SIV_FIELD_LEN} bytes for SIV, have {len(raw) - offset}"
        )

    siv = raw[offset:offset + SIV_FIELD_LEN]
    offset += SIV_FIELD_LEN

    ciphertext_len = len(raw) - offset
    if ciphertext_len > MAX_CIPHERTEXT_LEN:
        raise CiphertextTooLarge(
            f"ciphertext {ciphertext_len} bytes exceeds maximum allowed ({MAX_CIPHERTEXT_LEN})"
        )

    ciphertext = raw[offset:] if ciphertext_len > 0 else b""

    if aad_len >= MIN_NONCE_LEN:
        nonce = aad[:MIN_NONCE_LEN]
    elif aad_len > 0:
        raise NonceTooShort(
            f"AAD too short to contain a valid nonce: got {aad_len} bytes, need at least {MIN_NONCE_LEN}"
        )
    else:
        raise NoNonceInAAD("AAD is empty, cannot extract nonce")

    return CookieData(
        version=version,
        aad=aad,
        nonce=nonce,
        siv=siv,
        ciphertext=ciphertext,
    )


def parse_cookie(encoded: str) -> CookieData:
    try:
        raw = base64.b64decode(encoded, validate=True)
    except Exception:
        try:
            raw = base64.b64decode(encoded, validate=False)
        except Exception as e:
            raise Base64DecodeFailed(f"base64 decode failed: {e}")

    return parse_cookie_binary(raw)


def decrypt_cookie(siv: AESSIV, encoded: str) -> bytes:
    cookie = parse_cookie(encoded)

    combined = cookie.siv + cookie.ciphertext
    if len(combined) < SIV_FIELD_LEN:
        raise InvalidCookieFormat(
            f"combined SIV+ciphertext too short: got {len(combined)} bytes, "
            f"need at least {SIV_FIELD_LEN} for SIV tag"
        )

    aad_parts = []
    if len(cookie.aad) > len(cookie.nonce):
        extra_aad = cookie.aad[len(cookie.nonce):]
        if len(extra_aad) > 0:
            aad_parts.append(extra_aad)

    plaintext = siv.decrypt(aad_parts, cookie.nonce, combined)
    return plaintext


def encrypt_cookie(siv: AESSIV, nonce: bytes, plaintext: bytes, extra_aad: Optional[bytes] = None) -> str:
    if len(nonce) < MIN_NONCE_LEN:
        raise NonceTooShort(
            f"nonce too short: got {len(nonce)} bytes, need at least {MIN_NONCE_LEN}"
        )

    aad_parts = []
    if extra_aad:
        aad_parts.append(extra_aad)

    ct = siv.encrypt(aad_parts, nonce, plaintext)

    aad = nonce
    if extra_aad:
        aad = nonce + extra_aad

    cookie_binary = struct.pack("!B", COOKIE_VERSION_1)
    cookie_binary += struct.pack("!H", len(aad))
    cookie_binary += aad
    cookie_binary += ct

    return base64.b64encode(cookie_binary).decode("ascii")


@dataclass
class NTSAuthResult:
    verified: bool
    error: Optional[str] = None
    client_id: Optional[str] = None
    timestamp_verified: Optional[bool] = None


def verify_nts_authenticator(
    siv: AESSIV,
    nonce: bytes,
    ciphertext: bytes,
    expected_plaintext: bytes,
    associated_data: Optional[List[bytes]] = None,
) -> NTSAuthResult:
    try:
        combined = ciphertext
        plaintext = siv.decrypt(associated_data or [], nonce, combined)

        if plaintext == expected_plaintext:
            return NTSAuthResult(
                verified=True,
                client_id=plaintext.hex(),
                timestamp_verified=True,
            )
        else:
            return NTSAuthResult(
                verified=True,
                client_id=plaintext.hex(),
                timestamp_verified=False,
            )

    except AuthenticationFailed:
        return NTSAuthResult(
            verified=False,
            error="Authentication failed: SIV tag mismatch",
        )
    except AESSIVError as e:
        return NTSAuthResult(
            verified=False,
            error=f"AES-SIV error: {e}",
        )


def generate_nts_key() -> bytes:
    return os.urandom(32)


def generate_nonce(length: int = 12) -> bytes:
    return os.urandom(length)


def generate_unique_identifier() -> bytes:
    return os.urandom(32)


@dataclass
class NTSSession:
    c2s_key: bytes
    s2c_key: bytes
    cookie_key: bytes
    unique_id: bytes
    client_cookie: Optional[str] = None
    server_cookie: Optional[str] = None

    @property
    def c2s_siv(self) -> AESSIV:
        return AESSIV(self.c2s_key)

    @property
    def s2c_siv(self) -> AESSIV:
        return AESSIV(self.s2c_key)

    @property
    def cookie_siv(self) -> AESSIV:
        return AESSIV(self.cookie_key)


def create_nts_session(
    c2s_key: Optional[bytes] = None,
    s2c_key: Optional[bytes] = None,
    cookie_key: Optional[bytes] = None,
) -> NTSSession:
    return NTSSession(
        c2s_key=c2s_key or generate_nts_key(),
        s2c_key=s2c_key or generate_nts_key(),
        cookie_key=cookie_key or generate_nts_key(),
        unique_id=generate_unique_identifier(),
    )


def nts_client_verify(
    session: NTSSession,
    ntp_transmit_bytes: bytes,
    auth_nonce: bytes,
    auth_ciphertext: bytes,
) -> NTSAuthResult:
    try:
        siv = session.s2c_siv
        associated_data = [session.unique_id, ntp_transmit_bytes]
        plaintext = siv.decrypt(associated_data, auth_nonce, auth_ciphertext)

        return NTSAuthResult(
            verified=True,
            client_id=plaintext.hex(),
            timestamp_verified=True,
        )
    except AuthenticationFailed:
        return NTSAuthResult(
            verified=False,
            error="Server authentication failed: SIV tag mismatch",
        )
    except AESSIVError as e:
        return NTSAuthResult(
            verified=False,
            error=f"AES-SIV error: {e}",
        )


def nts_server_sign(
    session: NTSSession,
    ntp_transmit_bytes: bytes,
) -> Tuple[bytes, bytes]:
    nonce = generate_nonce(16)
    siv = session.s2c_siv
    associated_data = [session.unique_id, ntp_transmit_bytes]
    plaintext = b"NTSv4-verified"
    ciphertext = siv.encrypt(associated_data, nonce, plaintext)
    return nonce, ciphertext


def nts_client_sign(
    session: NTSSession,
    ntp_transmit_bytes: bytes,
) -> Tuple[bytes, bytes]:
    nonce = generate_nonce(16)
    siv = session.c2s_siv
    associated_data = [session.unique_id, ntp_transmit_bytes]
    plaintext = b"NTSv4-client"
    ciphertext = siv.encrypt(associated_data, nonce, plaintext)
    return nonce, ciphertext


@dataclass
class UniqueIdentifier:
    identifier: bytes
    created_at: float = field(default_factory=time.time)

    def __post_init__(self):
        if len(self.identifier) < MIN_UNIQUE_ID_LEN:
            raise UniqueIdentifierTooShort(
                f"Unique identifier too short: got {len(self.identifier)} bytes, "
                f"need at least {MIN_UNIQUE_ID_LEN}"
            )

    @classmethod
    def generate(cls, length: int = DEFAULT_UNIQUE_ID_LEN) -> "UniqueIdentifier":
        if length < MIN_UNIQUE_ID_LEN:
            raise UniqueIdentifierTooShort(
                f"Requested length {length} too short, minimum is {MIN_UNIQUE_ID_LEN}"
            )
        return cls(identifier=os.urandom(length))

    @classmethod
    def from_uuid(cls) -> "UniqueIdentifier":
        uid = uuid.uuid4()
        return cls(identifier=uid.bytes)

    def to_hex(self) -> str:
        return self.identifier.hex()

    @classmethod
    def from_hex(cls, hex_str: str) -> "UniqueIdentifier":
        try:
            raw = bytes.fromhex(hex_str)
        except ValueError as e:
            raise UniqueIdentifierError(f"Invalid hex string: {e}")
        return cls(identifier=raw)

    def matches(self, other: bytes) -> bool:
        if len(other) != len(self.identifier):
            return False
        result = 0
        for x, y in zip(self.identifier, other):
            result |= x ^ y
        return result == 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "identifier_hex": self.to_hex(),
            "length": len(self.identifier),
            "created_at": self.created_at,
            "created_at_str": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(self.created_at)),
        }


@dataclass
class KeyMaterial:
    c2s_key: bytes
    s2c_key: bytes
    cookie_key: bytes

    def to_dict(self) -> Dict[str, Any]:
        return {
            "c2s_key_hex": self.c2s_key.hex(),
            "c2s_key_len": len(self.c2s_key),
            "s2c_key_hex": self.s2c_key.hex(),
            "s2c_key_len": len(self.s2c_key),
            "cookie_key_hex": self.cookie_key.hex(),
            "cookie_key_len": len(self.cookie_key),
        }


@dataclass
class AuthOperation:
    timestamp: float
    operation: str
    nonce_hex: str
    ciphertext_hex: str
    ntp_transmit_hex: str
    success: bool
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "timestamp_str": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(self.timestamp)),
            "operation": self.operation,
            "nonce_hex": self.nonce_hex,
            "ciphertext_hex": self.ciphertext_hex,
            "ntp_transmit_hex": self.ntp_transmit_hex,
            "success": self.success,
            "error": self.error,
        }


@dataclass
class CookieOperation:
    timestamp: float
    operation: str
    cookie_b64: str
    success: bool
    error: Optional[str] = None
    plaintext_hex: Optional[str] = None
    nonce_hex: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "timestamp_str": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(self.timestamp)),
            "operation": self.operation,
            "cookie_b64": self.cookie_b64,
            "success": self.success,
            "error": self.error,
            "plaintext_hex": self.plaintext_hex,
            "nonce_hex": self.nonce_hex,
        }


@dataclass
class KeyAgreementRecord:
    record_id: str
    session_id: str
    created_at: float
    key_material: KeyMaterial
    unique_identifier: UniqueIdentifier
    auth_operations: List[AuthOperation] = field(default_factory=list)
    cookie_operations: List[CookieOperation] = field(default_factory=list)
    server_cookie: Optional[str] = None
    client_cookie: Optional[str] = None
    negotiated_protocol: str = "NTSv4"
    aead_algorithm: str = "AEAD_AES_SIV_CMAC_256"
    status: str = "active"

    def to_dict(self, include_key_material: bool = True) -> Dict[str, Any]:
        data = {
            "record_id": self.record_id,
            "session_id": self.session_id,
            "created_at": self.created_at,
            "created_at_str": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(self.created_at)),
            "negotiated_protocol": self.negotiated_protocol,
            "aead_algorithm": self.aead_algorithm,
            "status": self.status,
            "unique_identifier": self.unique_identifier.to_dict(),
            "server_cookie": self.server_cookie,
            "client_cookie": self.client_cookie,
            "auth_operations_count": len(self.auth_operations),
            "cookie_operations_count": len(self.cookie_operations),
        }
        if include_key_material:
            data["key_material"] = self.key_material.to_dict()
        data["auth_operations"] = [op.to_dict() for op in self.auth_operations]
        data["cookie_operations"] = [op.to_dict() for op in self.cookie_operations]
        return data

    def export_json(self, include_key_material: bool = True, pretty: bool = False) -> str:
        indent = 2 if pretty else None
        return json.dumps(self.to_dict(include_key_material), indent=indent)

    def add_auth_operation(
        self,
        operation: str,
        nonce: bytes,
        ciphertext: bytes,
        ntp_transmit: bytes,
        success: bool,
        error: Optional[str] = None,
    ) -> AuthOperation:
        op = AuthOperation(
            timestamp=time.time(),
            operation=operation,
            nonce_hex=nonce.hex(),
            ciphertext_hex=ciphertext.hex(),
            ntp_transmit_hex=ntp_transmit.hex(),
            success=success,
            error=error,
        )
        self.auth_operations.append(op)
        return op

    def add_cookie_operation(
        self,
        operation: str,
        cookie_b64: str,
        success: bool,
        error: Optional[str] = None,
        plaintext: Optional[bytes] = None,
        nonce: Optional[bytes] = None,
    ) -> CookieOperation:
        op = CookieOperation(
            timestamp=time.time(),
            operation=operation,
            cookie_b64=cookie_b64,
            success=success,
            error=error,
            plaintext_hex=plaintext.hex() if plaintext else None,
            nonce_hex=nonce.hex() if nonce else None,
        )
        self.cookie_operations.append(op)
        return op

    def get_summary(self) -> Dict[str, Any]:
        return {
            "record_id": self.record_id,
            "session_id": self.session_id,
            "created_at_str": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(self.created_at)),
            "status": self.status,
            "aead_algorithm": self.aead_algorithm,
            "unique_id_prefix": self.unique_identifier.to_hex()[:16] + "...",
            "auth_ops": len(self.auth_operations),
            "cookie_ops": len(self.cookie_operations),
        }


def create_key_agreement_record(
    session: NTSSession,
    session_id: str,
) -> KeyAgreementRecord:
    record = KeyAgreementRecord(
        record_id=str(uuid.uuid4()),
        session_id=session_id,
        created_at=time.time(),
        key_material=KeyMaterial(
            c2s_key=session.c2s_key,
            s2c_key=session.s2c_key,
            cookie_key=session.cookie_key,
        ),
        unique_identifier=UniqueIdentifier(identifier=session.unique_id),
        server_cookie=session.server_cookie,
        client_cookie=session.client_cookie,
    )
    return record


def export_key_agreement_records(
    records: List[KeyAgreementRecord],
    include_key_material: bool = True,
    pretty: bool = False,
) -> str:
    data = [r.to_dict(include_key_material) for r in records]
    indent = 2 if pretty else None
    return json.dumps(data, indent=indent)


def validate_unique_identifier(
    expected_id: bytes,
    provided_id: bytes,
) -> bool:
    if len(expected_id) < MIN_UNIQUE_ID_LEN:
        raise UniqueIdentifierTooShort(
            f"Expected identifier too short: {len(expected_id)} bytes"
        )
    if len(provided_id) < MIN_UNIQUE_ID_LEN:
        raise UniqueIdentifierTooShort(
            f"Provided identifier too short: {len(provided_id)} bytes"
        )
    if len(expected_id) != len(provided_id):
        raise UniqueIdentifierMismatch(
            f"Identifier length mismatch: expected {len(expected_id)}, got {len(provided_id)}"
        )

    result = 0
    for x, y in zip(expected_id, provided_id):
        result |= x ^ y
    return result == 0
