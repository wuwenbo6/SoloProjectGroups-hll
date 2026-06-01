import struct
from dataclasses import dataclass
from typing import Optional

from .ntp_parser import ExtensionField


NTS_UNIQUE_IDENTIFIER = 0x0104
NTS_COOKIE = 0x0204
NTS_COOKIE_PLACEHOLDER = 0x0304
NTS_AUTHENTICATOR = 0x0404

NTS_AUTH_HEADER_SIZE = 4
NTS_AUTH_NONCE_SIZE = 16
NTS_AUTH_C2S_MIN = 16
NTS_AUTH_S2C_MIN = 16


@dataclass
class UniqueIdentifierField:
    identifier: bytes

    def to_hex(self) -> str:
        return self.identifier.hex()

    def to_dict(self) -> dict:
        return {
            "type": "Unique Identifier",
            "type_code": NTS_UNIQUE_IDENTIFIER,
            "identifier_hex": self.to_hex(),
            "identifier_len": len(self.identifier),
        }


@dataclass
class NTSCookieField:
    cookie: bytes

    def to_hex(self) -> str:
        return self.cookie.hex()

    def to_dict(self) -> dict:
        return {
            "type": "NTS Cookie",
            "type_code": NTS_COOKIE,
            "cookie_hex": self.to_hex(),
            "cookie_len": len(self.cookie),
        }


@dataclass
class NTSCookiePlaceholderField:
    placeholder_len: int

    def to_dict(self) -> dict:
        return {
            "type": "NTS Cookie Placeholder",
            "type_code": NTS_COOKIE_PLACEHOLDER,
            "placeholder_length": self.placeholder_len,
        }


@dataclass
class NTSAuthenticatorField:
    nonce: bytes
    ciphertext: bytes

    @property
    def c2s_length(self) -> int:
        return len(self.ciphertext)

    @property
    def s2c_length(self) -> int:
        return len(self.ciphertext)

    def to_hex(self) -> str:
        return self.nonce.hex() + self.ciphertext.hex()

    def to_dict(self) -> dict:
        return {
            "type": "NTS Authenticator",
            "type_code": NTS_AUTHENTICATOR,
            "nonce_hex": self.nonce.hex(),
            "nonce_len": len(self.nonce),
            "ciphertext_hex": self.ciphertext.hex(),
            "ciphertext_len": len(self.ciphertext),
        }


def parse_unique_identifier(ef: ExtensionField) -> UniqueIdentifierField:
    return UniqueIdentifierField(identifier=ef.value)


def parse_nts_cookie(ef: ExtensionField) -> NTSCookieField:
    return NTSCookieField(cookie=ef.value)


def parse_nts_cookie_placeholder(ef: ExtensionField) -> NTSCookiePlaceholderField:
    return NTSCookiePlaceholderField(placeholder_len=len(ef.value))


def parse_nts_authenticator(ef: ExtensionField) -> NTSAuthenticatorField:
    value = ef.value
    if len(value) < NTS_AUTH_NONCE_SIZE + NTS_AUTH_C2S_MIN:
        raise ValueError(
            f"NTS Authenticator value too short: {len(value)} bytes, "
            f"need at least {NTS_AUTH_NONCE_SIZE + NTS_AUTH_C2S_MIN}"
        )

    nonce = value[:NTS_AUTH_NONCE_SIZE]
    ciphertext = value[NTS_AUTH_NONCE_SIZE:]

    return NTSAuthenticatorField(nonce=nonce, ciphertext=ciphertext)


def parse_nts_extension(ef: ExtensionField) -> Optional[object]:
    if ef.field_type == NTS_UNIQUE_IDENTIFIER:
        return parse_unique_identifier(ef)
    elif ef.field_type == NTS_COOKIE:
        return parse_nts_cookie(ef)
    elif ef.field_type == NTS_COOKIE_PLACEHOLDER:
        return parse_nts_cookie_placeholder(ef)
    elif ef.field_type == NTS_AUTHENTICATOR:
        return parse_nts_authenticator(ef)
    return None


def build_unique_identifier(identifier: bytes) -> ExtensionField:
    from .ntp_parser import build_nts_extension_field
    return build_nts_extension_field(NTS_UNIQUE_IDENTIFIER, identifier)


def build_nts_cookie(cookie: bytes) -> ExtensionField:
    from .ntp_parser import build_nts_extension_field
    return build_nts_extension_field(NTS_COOKIE, cookie)


def build_nts_cookie_placeholder(placeholder_len: int) -> ExtensionField:
    from .ntp_parser import build_nts_extension_field
    return build_nts_extension_field(NTS_COOKIE_PLACEHOLDER, b"\x00" * placeholder_len)


def build_nts_authenticator(nonce: bytes, ciphertext: bytes) -> ExtensionField:
    from .ntp_parser import build_nts_extension_field
    value = nonce + ciphertext
    return build_nts_extension_field(NTS_AUTHENTICATOR, value)
