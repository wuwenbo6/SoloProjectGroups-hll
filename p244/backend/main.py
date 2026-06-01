from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, PlainTextResponse
from typing import Optional
import os

from .key_parser import OpenVPNKeyParser
from .hmac_verifier import HMACVerifier

app = FastAPI(title="OpenVPN tls-auth HMAC Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "OpenVPN tls-auth HMAC Analyzer API is running"}


@app.post("/api/key/parse")
async def parse_key_file(file: UploadFile = File(...)):
    try:
        content = await file.read()
        content_str = content.decode("utf-8")

        key_info = OpenVPNKeyParser.parse_key_file(content_str)

        return {"success": True, "filename": file.filename, "key_info": key_info}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/key/parse-text")
async def parse_key_text(key_content: str = Form(...)):
    try:
        key_info = OpenVPNKeyParser.parse_key_file(key_content)

        return {"success": True, "key_info": key_info}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/key/sample")
async def generate_sample_key():
    sample_key = OpenVPNKeyParser.generate_sample_key()
    key_info = OpenVPNKeyParser.parse_key_file(sample_key)

    return {"success": True, "sample_key": sample_key, "key_info": key_info}


@app.post("/api/hmac/compute")
async def compute_hmac(
    key_hex: str = Form(...),
    message: str = Form(...),
    digest_algorithm: str = Form(default="sha256"),
):
    try:
        key_bytes = bytes.fromhex(key_hex)
        message_bytes = message.encode("utf-8")

        hmac_result = HMACVerifier.compute_hmac(key_bytes, message_bytes, digest_algorithm)

        return {
            "success": True,
            "hmac_hex": hmac_result.hex(),
            "hmac_size_bytes": len(hmac_result),
            "digest_algorithm": digest_algorithm,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/hmac/verify")
async def verify_hmac(
    key_hex: str = Form(...),
    message: str = Form(...),
    hmac_signature: str = Form(...),
    digest_algorithm: str = Form(default="sha256"),
):
    try:
        key_bytes = bytes.fromhex(key_hex)
        message_bytes = message.encode("utf-8")
        hmac_bytes = bytes.fromhex(hmac_signature)

        result = HMACVerifier.verify_handshake_step(
            key_bytes, message_bytes, hmac_bytes, digest_algorithm
        )

        return {"success": True, "verification": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/handshake/simulate")
async def simulate_handshake(
    key_hex: str = Form(...),
    digest_algorithm: str = Form(default="sha256"),
):
    try:
        key_bytes = bytes.fromhex(key_hex)

        handshake_steps = HMACVerifier.simulate_tls_auth_handshake(
            key_bytes, digest_algorithm
        )

        hmac_info = HMACVerifier.get_hmac_info(digest_algorithm)

        return {
            "success": True,
            "handshake_steps": handshake_steps,
            "hmac_info": hmac_info,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/hmac/info")
async def get_hmac_info(digest_algorithm: str = "sha256"):
    try:
        info = HMACVerifier.get_hmac_info(digest_algorithm)
        return {"success": True, "hmac_info": info}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/hmac/algorithms")
async def get_supported_algorithms():
    return {
        "success": True,
        "algorithms": HMACVerifier.SUPPORTED_DIGESTS,
        "default": "sha256",
    }


@app.post("/api/attack/injection")
async def simulate_packet_injection(
    key_hex: str = Form(...),
    message: str = Form(
        default="ClientHello: TLS handshake initiation with sensitive data"
    ),
    digest_algorithm: str = Form(default="sha256"),
):
    try:
        key_bytes = bytes.fromhex(key_hex)
        message_bytes = message.encode("utf-8")

        result = HMACVerifier.simulate_packet_injection_attack(
            key_bytes, message_bytes, digest_algorithm
        )

        return {"success": True, "attack_result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/key/health-report")
async def generate_health_report(key_content: str = Form(...)):
    try:
        key_info = OpenVPNKeyParser.parse_key_file(key_content)
        health_report = OpenVPNKeyParser.generate_key_health_report(key_info)

        return {
            "success": True,
            "key_info": key_info,
            "health_report": health_report,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/key/health-report/export")
async def export_health_report(key_content: str = Form(...)):
    try:
        key_info = OpenVPNKeyParser.parse_key_file(key_content)
        health_report = OpenVPNKeyParser.generate_key_health_report(key_info)
        markdown_report = OpenVPNKeyParser.export_health_report_markdown(health_report)

        return PlainTextResponse(
            content=markdown_report,
            media_type="text/markdown",
            headers={
                "Content-Disposition": 'attachment; filename="key-health-report.md"'
            },
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/hmac/verify-timing")
async def verify_hmac_with_timing(
    key_hex: str = Form(...),
    message: str = Form(...),
    hmac_signature: str = Form(...),
    digest_algorithm: str = Form(default="sha256"),
):
    try:
        key_bytes = bytes.fromhex(key_hex)
        message_bytes = message.encode("utf-8")
        hmac_bytes = bytes.fromhex(hmac_signature)

        result = HMACVerifier.verify_hmac_with_timing_analysis(
            key_bytes, message_bytes, hmac_bytes, digest_algorithm
        )

        return {"success": True, "verification": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")


@app.get("/")
async def read_root():
    index_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "frontend", "index.html"
    )
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {
        "message": "OpenVPN tls-auth HMAC Analyzer API",
        "docs": "/docs",
    }
