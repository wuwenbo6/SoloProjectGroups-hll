from __future__ import annotations
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from models import ValidationResult, ValidationSummary, RuleResult
from sax_parser import parse_mpd_sax, ParseError
from mpd_to_hls import mpd_to_hls
from rules_registry import get_rules_registry
from validators import (
    validate_segment_template,
    validate_timescale,
    validate_representation,
    validate_period,
    validate_iop_rules,
)

app = FastAPI(title="DASH-IF IOP MPD Validator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/validate", response_model=ValidationResult)
async def validate_mpd(file: UploadFile = File(...)):
    if not file.filename.endswith((".mpd", ".xml")):
        raise HTTPException(status_code=400, detail="File must be .mpd or .xml")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")

    xml_source = content.decode("utf-8", errors="replace")

    try:
        mpd_data = parse_mpd_sax(content)
    except ParseError as e:
        return ValidationResult(
            status="error",
            filename=file.filename,
            fileSize=len(content),
            mpdType="static",
            profiles=[],
            summary=ValidationSummary(total=0, passed=0, warnings=0, errors=0),
            rules=[RuleResult(
                id="XML-001",
                category="XML Parsing",
                severity="error",
                status="fail",
                description="XML parsing failed",
                detail=str(e),
            )],
            xmlSource=xml_source,
        )

    if not mpd_data.periods:
        return ValidationResult(
            status="error",
            filename=file.filename,
            fileSize=len(content),
            mpdType=mpd_data.type,
            profiles=[],
            summary=ValidationSummary(total=0, passed=0, warnings=0, errors=0),
            rules=[RuleResult(
                id="XML-002",
                category="XML Parsing",
                severity="error",
                status="fail",
                description="No DASH MPD structure found",
                detail="The XML does not appear to be a valid DASH MPD document (missing MPD namespace or required elements)",
            )],
            xmlSource=xml_source,
        )

    mpd_type = mpd_data.type
    profiles = mpd_data.profiles.split(",") if mpd_data.profiles else []

    all_rules = []
    all_rules.extend(validate_segment_template(mpd_data))
    all_rules.extend(validate_timescale(mpd_data))
    all_rules.extend(validate_representation(mpd_data))
    all_rules.extend(validate_period(mpd_data))
    all_rules.extend(validate_iop_rules(mpd_data))

    errors = sum(1 for r in all_rules if r.severity == "error" and r.status == "fail")
    warnings = sum(1 for r in all_rules if r.severity == "warning" and r.status == "fail")
    passed = sum(1 for r in all_rules if r.status == "pass")

    return ValidationResult(
        status="success",
        filename=file.filename,
        fileSize=len(content),
        mpdType=mpd_type,
        profiles=profiles,
        summary=ValidationSummary(
            total=len(all_rules),
            passed=passed,
            warnings=warnings,
            errors=errors,
        ),
        rules=all_rules,
        xmlSource=xml_source,
    )


@app.post("/api/convert")
async def convert_mpd_to_hls(file: UploadFile = File(...)):
    if not file.filename.endswith((".mpd", ".xml")):
        raise HTTPException(status_code=400, detail="File must be .mpd or .xml")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")

    try:
        mpd_data = parse_mpd_sax(content)
    except ParseError as e:
        raise HTTPException(status_code=400, detail=f"XML parsing failed: {str(e)}")

    if not mpd_data.periods:
        raise HTTPException(status_code=400, detail="No DASH MPD structure found")

    result = mpd_to_hls(mpd_data)
    return result


@app.get("/api/convert/{playlist_name}")
async def get_hls_playlist(playlist_name: str):
    raise HTTPException(status_code=400, detail="Use POST /api/convert to upload and convert MPD files")


@app.get("/api/rules")
async def get_rules():
    return get_rules_registry()


@app.get("/api/rules/markdown", response_class=PlainTextResponse)
async def get_rules_markdown():
    rules = get_rules_registry()

    categories = {}
    for rule in rules:
        cat = rule["category"]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(rule)

    lines = ["# DASH-IF IOP MPD Validation Rules Reference", "", f"Total rules: {len(rules)}", ""]

    severity_counts = {"error": 0, "warning": 0, "info": 0}
    for rule in rules:
        severity_counts[rule["severity"]] += 1

    lines.append(f"- **Error**: {severity_counts['error']} rules")
    lines.append(f"- **Warning**: {severity_counts['warning']} rules")
    lines.append(f"- **Info**: {severity_counts['info']} rules")
    lines.append("")
    lines.append("---")
    lines.append("")

    for cat, cat_rules in categories.items():
        lines.append(f"## {cat}")
        lines.append("")
        lines.append(f"| Rule ID | Severity | Description | Spec Reference |")
        lines.append(f"|---------|----------|-------------|----------------|")
        for rule in cat_rules:
            sev_badge = {"error": "🔴 ERROR", "warning": "🟡 WARNING", "info": "🔵 INFO"}[rule["severity"]]
            lines.append(f"| {rule['id']} | {sev_badge} | {rule['description']} | {rule['spec_ref']} |")
        lines.append("")

        for rule in cat_rules:
            lines.append(f"### {rule['id']}: {rule['description']}")
            lines.append(f"")
            lines.append(f"- **Severity**: {rule['severity']}")
            lines.append(f"- **Category**: {rule['category']}")
            lines.append(f"- **Spec Reference**: {rule['spec_ref']}")
            lines.append(f"")
            lines.append(f"**Check Method**:")
            lines.append(f"")
            lines.append(f"{rule['check']}")
            lines.append(f"")

    return "\n".join(lines)
