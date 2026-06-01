import base64
import os
import struct
import time
from typing import Optional, List

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from .ntp_parser import (
    NTPTimestamp, NTPPacket, parse_ntp_packet, build_ntp_packet,
    build_nts_extension_field, ExtensionField,
)
from .nts_extension import (
    parse_nts_extension, NTS_UNIQUE_IDENTIFIER, NTS_COOKIE,
    NTS_COOKIE_PLACEHOLDER, NTS_AUTHENTICATOR,
    build_unique_identifier, build_nts_cookie, build_nts_authenticator,
)
from .aes_siv import AESSIV, AuthenticationFailed
from .nts_crypto import (
    NTSSession, create_nts_session, encrypt_cookie, decrypt_cookie,
    nts_server_sign, nts_client_verify, nts_client_sign,
    generate_nonce, generate_unique_identifier, generate_nts_key,
    parse_cookie, CookieData, NTSCookieError,
    create_key_agreement_record, export_key_agreement_records,
    validate_unique_identifier, UniqueIdentifier,
    KeyAgreementRecord, UniqueIdentifierError, UniqueIdentifierTooShort,
    UniqueIdentifierMismatch,
)


app = FastAPI(title="NTPv4 NTS Extension Field Parser", version="1.0.0")

_sessions: dict[str, NTSSession] = {}
_key_agreement_records: dict[str, KeyAgreementRecord] = {}


class ParseRequest(BaseModel):
    packet_hex: str


class CookieDecryptRequest(BaseModel):
    cookie_b64: str
    key_hex: Optional[str] = None


class CookieEncryptRequest(BaseModel):
    plaintext_hex: str
    key_hex: Optional[str] = None
    nonce_hex: Optional[str] = None


class NTSVerifyRequest(BaseModel):
    session_id: str
    auth_nonce_hex: str
    auth_ciphertext_hex: str
    ntp_transmit_hex: str


class NTSSignRequest(BaseModel):
    session_id: str
    ntp_transmit_hex: str


class UniqueIdentifierValidateRequest(BaseModel):
    expected_id_hex: str
    provided_id_hex: str


class KeyAgreementExportRequest(BaseModel):
    session_id: Optional[str] = None
    include_key_material: bool = True
    pretty: bool = True


class SessionResponse(BaseModel):
    session_id: str
    c2s_key_hex: str
    s2c_key_hex: str
    cookie_key_hex: str
    unique_id_hex: str
    key_agreement_record_id: str


def _get_or_create_session(session_id: Optional[str] = None) -> tuple:
    if session_id and session_id in _sessions:
        return session_id, _sessions[session_id]
    sid = os.urandom(8).hex()
    session = create_nts_session()
    _sessions[sid] = session

    record = create_key_agreement_record(session, sid)
    _key_agreement_records[sid] = record

    return sid, session


@app.get("/")
async def index():
    return FileResponse(os.path.join(os.path.dirname(__file__), "static", "index.html"))


@app.post("/api/parse")
async def parse_packet(req: ParseRequest):
    try:
        raw = bytes.fromhex(req.packet_hex)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid hex string: {e}")

    try:
        packet = parse_ntp_packet(raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"NTP parse error: {e}")

    header = packet.header
    ext_info = []
    for ef in packet.extension_fields:
        nts_parsed = None
        if ef.is_nts:
            try:
                nts_obj = parse_nts_extension(ef)
                if nts_obj:
                    nts_parsed = nts_obj.to_dict()
            except Exception as e:
                nts_parsed = {"error": str(e)}

        ext_info.append({
            "field_type": ef.field_type,
            "field_type_hex": ef.field_type_hex,
            "length": ef.length,
            "value_hex": ef.value.hex(),
            "is_nts": ef.is_nts,
            "nts_type_name": ef.nts_type_name if ef.is_nts else None,
            "nts_parsed": nts_parsed,
        })

    result = {
        "header": {
            "leap_indicator": header.leap_indicator,
            "leap_indicator_desc": header.leap_indicator_desc,
            "version": header.version,
            "mode": header.mode,
            "mode_desc": header.mode_desc,
            "stratum": header.stratum,
            "poll": header.poll,
            "precision": header.precision,
            "root_delay": header.root_delay.to_float(),
            "root_dispersion": header.root_dispersion.to_float(),
            "reference_id": header.reference_id,
            "reference_id_str": header.reference_id_str(),
            "reference_timestamp": header.reference_timestamp.to_datetime_str(),
            "originate_timestamp": header.originate_timestamp.to_datetime_str(),
            "receive_timestamp": header.receive_timestamp.to_datetime_str(),
            "transmit_timestamp": header.transmit_timestamp.to_datetime_str(),
        },
        "extension_fields": ext_info,
        "has_nts_extensions": len(packet.nts_extensions) > 0,
        "mac_hex": packet.mac.hex() if packet.mac else "",
        "total_extensions": len(packet.extension_fields),
    }

    return result


@app.post("/api/cookie/encrypt")
async def api_encrypt_cookie(req: CookieEncryptRequest):
    try:
        plaintext = bytes.fromhex(req.plaintext_hex)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid plaintext hex: {e}")

    key = bytes.fromhex(req.key_hex) if req.key_hex else bytes(range(32))
    nonce = bytes.fromhex(req.nonce_hex) if req.nonce_hex else generate_nonce(12)

    if len(key) not in (32, 64):
        raise HTTPException(status_code=400, detail="Key must be 32 or 64 bytes")

    try:
        siv = AESSIV(key)
        encoded = encrypt_cookie(siv, nonce, plaintext)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Encryption error: {e}")

    cookie = parse_cookie(encoded)

    return {
        "cookie_b64": encoded,
        "cookie_binary_hex": base64.b64decode(encoded).hex() if False else _b64_to_hex(encoded),
        "parsed": cookie.to_dict(),
        "plaintext_hex": plaintext.hex(),
        "key_hex": key.hex(),
        "nonce_hex": nonce.hex(),
    }


@app.post("/api/cookie/decrypt")
async def api_decrypt_cookie(req: CookieDecryptRequest):
    key = bytes.fromhex(req.key_hex) if req.key_hex else bytes(range(32))
    if len(key) not in (32, 64):
        raise HTTPException(status_code=400, detail="Key must be 32 or 64 bytes")

    try:
        siv = AESSIV(key)
        cookie = parse_cookie(req.cookie_b64)
        plaintext = decrypt_cookie(siv, req.cookie_b64)
    except NTSCookieError as e:
        raise HTTPException(status_code=400, detail=f"Cookie error: {e}")
    except AuthenticationFailed:
        raise HTTPException(status_code=400, detail="Cookie authentication failed: SIV tag mismatch")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Decryption error: {e}")

    return {
        "plaintext_hex": plaintext.hex(),
        "plaintext_ascii": plaintext.decode("ascii", errors="replace"),
        "parsed_cookie": cookie.to_dict(),
    }


@app.post("/api/nts/session")
async def create_session():
    sid, session = _get_or_create_session()
    record = _key_agreement_records.get(sid)
    return SessionResponse(
        session_id=sid,
        c2s_key_hex=session.c2s_key.hex(),
        s2c_key_hex=session.s2c_key.hex(),
        cookie_key_hex=session.cookie_key.hex(),
        unique_id_hex=session.unique_id.hex(),
        key_agreement_record_id=record.record_id if record else "",
    )


@app.post("/api/nts/sign")
async def nts_sign(req: NTSSignRequest):
    if req.session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = _sessions[req.session_id]
    record = _key_agreement_records.get(req.session_id)

    try:
        ntp_transmit = bytes.fromhex(req.ntp_transmit_hex)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid hex: {e}")

    s_nonce, s_ciphertext = nts_server_sign(session, ntp_transmit)
    c_nonce, c_ciphertext = nts_client_sign(session, ntp_transmit)

    if record:
        record.add_auth_operation(
            operation="server_sign",
            nonce=s_nonce,
            ciphertext=s_ciphertext,
            ntp_transmit=ntp_transmit,
            success=True,
        )
        record.add_auth_operation(
            operation="client_sign",
            nonce=c_nonce,
            ciphertext=c_ciphertext,
            ntp_transmit=ntp_transmit,
            success=True,
        )

    cookie_plaintext = f"nts-session-{req.session_id}".encode()
    cookie_nonce = generate_nonce(12)
    cookie_b64 = encrypt_cookie(session.cookie_siv, cookie_nonce, cookie_plaintext)

    if record:
        record.add_cookie_operation(
            operation="encrypt",
            cookie_b64=cookie_b64,
            success=True,
            plaintext=cookie_plaintext,
            nonce=cookie_nonce,
        )
        record.server_cookie = cookie_b64

    return {
        "server_auth": {
            "nonce_hex": s_nonce.hex(),
            "ciphertext_hex": s_ciphertext.hex(),
        },
        "client_auth": {
            "nonce_hex": c_nonce.hex(),
            "ciphertext_hex": c_ciphertext.hex(),
        },
        "cookie": cookie_b64,
        "unique_id_hex": session.unique_id.hex(),
    }


@app.post("/api/nts/verify")
async def nts_verify(req: NTSVerifyRequest):
    if req.session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = _sessions[req.session_id]
    record = _key_agreement_records.get(req.session_id)

    try:
        auth_nonce = bytes.fromhex(req.auth_nonce_hex)
        auth_ciphertext = bytes.fromhex(req.auth_ciphertext_hex)
        ntp_transmit = bytes.fromhex(req.ntp_transmit_hex)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid hex: {e}")

    result = nts_client_verify(session, ntp_transmit, auth_nonce, auth_ciphertext)

    if record:
        record.add_auth_operation(
            operation="client_verify",
            nonce=auth_nonce,
            ciphertext=auth_ciphertext,
            ntp_transmit=ntp_transmit,
            success=result.verified,
            error=result.error,
        )

    return {
        "verified": result.verified,
        "error": result.error,
        "client_id": result.client_id,
        "timestamp_verified": result.timestamp_verified,
    }


@app.get("/api/nts/secure-time")
async def secure_time(session_id: Optional[str] = None):
    sid, session = _get_or_create_session(session_id)

    now = time.time()
    ntp_secs = int(now) + 2208988800
    ntp_frac = int((now % 1) * (2**32))

    tx_ts = NTPTimestamp(seconds=ntp_secs, fraction=ntp_frac)

    now_dt = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(now))
    frac_str = f".{int((now % 1) * 1e6):06d}"

    ntp_transmit = struct.pack("!II", tx_ts.seconds, tx_ts.fraction)

    s_nonce, s_ciphertext = nts_server_sign(session, ntp_transmit)

    cookie_plaintext = f"nts-session-{sid}".encode()
    cookie_nonce = generate_nonce(12)
    cookie_b64 = encrypt_cookie(session.cookie_siv, cookie_nonce, cookie_plaintext)

    uid_ef = build_unique_identifier(session.unique_id)
    cookie_ef = build_nts_cookie(cookie_b64.encode())
    auth_ef = build_nts_authenticator(s_nonce, s_ciphertext)

    ntp_packet = build_ntp_packet(
        mode=4,
        version=4,
        stratum=2,
        poll=6,
        precision=-20,
        reference_id=0x4C4F434C,
        transmit_ts=tx_ts,
        extension_fields=[uid_ef, cookie_ef, auth_ef],
    )

    packet = parse_ntp_packet(ntp_packet)

    ext_details = []
    for ef in packet.extension_fields:
        nts_parsed = None
        if ef.is_nts:
            try:
                nts_obj = parse_nts_extension(ef)
                if nts_obj:
                    nts_parsed = nts_obj.to_dict()
            except Exception as e:
                nts_parsed = {"error": str(e)}

        ext_details.append({
            "field_type_hex": ef.field_type_hex,
            "nts_type_name": ef.nts_type_name if ef.is_nts else None,
            "length": ef.length,
            "nts_parsed": nts_parsed,
        })

    return {
        "session_id": sid,
        "utc_time": now_dt + frac_str,
        "ntp_transmit_timestamp": tx_ts.to_datetime_str(),
        "leap_indicator": 0,
        "stratum": 2,
        "verified": True,
        "extension_fields": ext_details,
        "auth_nonce_hex": s_nonce.hex(),
        "auth_ciphertext_hex": s_ciphertext.hex(),
        "packet_hex": ntp_packet.hex(),
    }


@app.post("/api/nts/verify-packet")
async def verify_nts_packet(req: ParseRequest):
    try:
        raw = bytes.fromhex(req.packet_hex)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid hex string: {e}")

    try:
        packet = parse_ntp_packet(raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"NTP parse error: {e}")

    nts_exts = packet.nts_extensions
    if not nts_exts:
        return {
            "verified": False,
            "error": "No NTS extension fields found in packet",
            "header": {
                "transmit_timestamp": packet.header.transmit_timestamp.to_datetime_str(),
            },
        }

    unique_id = None
    cookie_b64 = None
    auth_nonce = None
    auth_ciphertext = None

    for ef in nts_exts:
        try:
            nts_obj = parse_nts_extension(ef)
            if ef.field_type == NTS_UNIQUE_IDENTIFIER:
                unique_id = ef.value
            elif ef.field_type == NTS_COOKIE:
                cookie_b64 = ef.value
            elif ef.field_type == NTS_AUTHENTICATOR:
                from .nts_extension import parse_nts_authenticator
                auth = parse_nts_authenticator(ef)
                auth_nonce = auth.nonce
                auth_ciphertext = auth.ciphertext
        except Exception:
            pass

    verification_results = {
        "has_unique_identifier": unique_id is not None,
        "has_cookie": cookie_b64 is not None,
        "has_authenticator": auth_nonce is not None,
        "unique_id_hex": unique_id.hex() if unique_id else None,
    }

    tx_ts = packet.header.transmit_timestamp
    ntp_transmit = struct.pack("!II", tx_ts.seconds, tx_ts.fraction)

    session_matched = None
    for sid, session in _sessions.items():
        if session.unique_id == unique_id:
            session_matched = sid
            break

    if session_matched and auth_nonce and auth_ciphertext:
        session = _sessions[session_matched]
        result = nts_client_verify(session, ntp_transmit, auth_nonce, auth_ciphertext)
        verification_results["session_id"] = session_matched
        verification_results["verified"] = result.verified
        verification_results["verification_error"] = result.error
        verification_results["timestamp_verified"] = result.timestamp_verified
    elif auth_nonce and auth_ciphertext:
        verification_results["verified"] = False
        verification_results["verification_error"] = "No matching session found for unique identifier"
    else:
        verification_results["verified"] = None
        verification_results["verification_error"] = "Missing authenticator field for verification"

    ext_info = []
    for ef in packet.extension_fields:
        nts_parsed = None
        if ef.is_nts:
            try:
                nts_obj = parse_nts_extension(ef)
                if nts_obj:
                    nts_parsed = nts_obj.to_dict()
            except Exception as e:
                nts_parsed = {"error": str(e)}
        ext_info.append({
            "field_type_hex": ef.field_type_hex,
            "nts_type_name": ef.nts_type_name if ef.is_nts else None,
            "length": ef.length,
            "nts_parsed": nts_parsed,
        })

    return {
        **verification_results,
        "header": {
            "leap_indicator": packet.header.leap_indicator,
            "leap_indicator_desc": packet.header.leap_indicator_desc,
            "version": packet.header.version,
            "mode": packet.header.mode,
            "mode_desc": packet.header.mode_desc,
            "stratum": packet.header.stratum,
            "transmit_timestamp": tx_ts.to_datetime_str(),
        },
        "extension_fields": ext_info,
    }


import base64


def _b64_to_hex(b64_str: str) -> str:
    return base64.b64decode(b64_str).hex()


app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static")


@app.get("/api/nts/unique-identifier/generate")
async def generate_uid(length: int = Query(32, ge=16, le=128, description="Unique identifier length in bytes (16-128)")):
    try:
        uid = UniqueIdentifier.generate(length)
    except UniqueIdentifierTooShort as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "identifier_hex": uid.to_hex(),
        "length": len(uid.identifier),
        "created_at": uid.created_at,
        "created_at_str": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(uid.created_at)),
    }


@app.get("/api/nts/unique-identifier/generate-uuid")
async def generate_uid_uuid():
    uid = UniqueIdentifier.from_uuid()
    return {
        "identifier_hex": uid.to_hex(),
        "length": len(uid.identifier),
        "created_at": uid.created_at,
        "created_at_str": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(uid.created_at)),
    }


@app.post("/api/nts/unique-identifier/validate")
async def validate_uid(req: UniqueIdentifierValidateRequest):
    try:
        expected = bytes.fromhex(req.expected_id_hex)
        provided = bytes.fromhex(req.provided_id_hex)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid hex: {e}")

    try:
        match = validate_unique_identifier(expected, provided)
    except UniqueIdentifierTooShort as e:
        raise HTTPException(status_code=400, detail=str(e))
    except UniqueIdentifierMismatch as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "valid": match,
        "expected_id_hex": expected.hex(),
        "provided_id_hex": provided.hex(),
        "length_matched": len(expected) == len(provided),
    }


@app.get("/api/nts/unique-identifier/info")
async def uid_info(identifier_hex: str = Query(..., description="Unique identifier hex string")):
    try:
        uid = UniqueIdentifier.from_hex(identifier_hex)
    except UniqueIdentifierError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid hex: {e}")

    return uid.to_dict()


@app.get("/api/nts/key-agreement/list")
async def list_key_agreement_records():
    summaries = []
    for sid, record in _key_agreement_records.items():
        summaries.append({
            **record.get_summary(),
            "session_id": sid,
        })

    return {
        "total": len(summaries),
        "records": summaries,
    }


@app.get("/api/nts/key-agreement/{session_id}")
async def get_key_agreement_record(
    session_id: str,
    include_key_material: bool = Query(True, description="Include key material in response"),
):
    if session_id not in _key_agreement_records:
        raise HTTPException(status_code=404, detail="Key agreement record not found")

    record = _key_agreement_records[session_id]
    return record.to_dict(include_key_material=include_key_material)


@app.post("/api/nts/key-agreement/export")
async def export_key_agreement(req: KeyAgreementExportRequest):
    records: List[KeyAgreementRecord] = []
    if req.session_id:
        if req.session_id not in _key_agreement_records:
            raise HTTPException(status_code=404, detail="Key agreement record not found")
        records = [_key_agreement_records[req.session_id]]
    else:
        records = list(_key_agreement_records.values())

    json_output = export_key_agreement_records(records, req.include_key_material, req.pretty)

    return Response(
        content=json_output,
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename=key-agreement-{time.strftime('%Y%m%d-%H%M%S')}.json"
        },
    )


@app.get("/api/nts/key-agreement/{session_id}/export")
async def export_single_key_agreement(
    session_id: str,
    include_key_material: bool = Query(True, description="Include key material in export"),
    pretty: bool = Query(True, description="Pretty print JSON"),
):
    if session_id not in _key_agreement_records:
        raise HTTPException(status_code=404, detail="Key agreement record not found")

    record = _key_agreement_records[session_id]
    json_output = record.export_json(include_key_material, pretty)

    return Response(
        content=json_output,
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename=key-agreement-{session_id}.json"
        },
    )


@app.delete("/api/nts/key-agreement/{session_id}")
async def delete_key_agreement_record(session_id: str):
    if session_id not in _key_agreement_records:
        raise HTTPException(status_code=404, detail="Key agreement record not found")

    if session_id in _sessions:
        del _sessions[session_id]
    del _key_agreement_records[session_id]

    return {
        "deleted": True,
        "session_id": session_id,
    }


@app.delete("/api/nts/key-agreement")
async def delete_all_key_agreement_records():
    count = len(_key_agreement_records)
    _key_agreement_records.clear()
    _sessions.clear()

    return {
        "deleted": True,
        "count": count,
    }
