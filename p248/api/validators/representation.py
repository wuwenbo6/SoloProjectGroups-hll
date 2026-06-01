from __future__ import annotations
from models import RuleResult
from mpd_data import MPDData, Representation, AdaptationSet


def validate_representation(mpd_data: MPDData) -> list[RuleResult]:
    results = []

    all_reps: list[tuple[Representation, AdaptationSet]] = []
    for period in mpd_data.periods:
        for aset in period.adaptation_sets:
            for rep in aset.representations:
                all_reps.append((rep, aset))

    rp001_pass = True
    rp001_fail_details = []
    for rep, aset in all_reps:
        rep_id = rep.id or "(no id)"
        if rep.bandwidth is None:
            rp001_pass = False
            rp001_fail_details.append(f"Representation[@id='{rep_id}'] missing bandwidth attribute")
        else:
            try:
                val = int(rep.bandwidth)
                if val <= 0:
                    rp001_pass = False
                    rp001_fail_details.append(f"Representation[@id='{rep_id}'] bandwidth '{rep.bandwidth}' is not positive")
            except ValueError:
                rp001_pass = False
                rp001_fail_details.append(f"Representation[@id='{rep_id}'] bandwidth '{rep.bandwidth}' is not a valid integer")

    if rp001_pass:
        results.append(RuleResult(
            id="RP-001",
            category="Representation",
            severity="error",
            status="pass",
            description="Each Representation must have bandwidth attribute and it must be a positive integer",
        ))
    else:
        results.append(RuleResult(
            id="RP-001",
            category="Representation",
            severity="error",
            status="fail",
            description="Each Representation must have bandwidth attribute and it must be a positive integer",
            detail="; ".join(rp001_fail_details),
        ))

    rp002_pass = True
    rp002_fail_details = []
    for rep, aset in all_reps:
        if rep.id is None:
            rp002_pass = False
            rp002_fail_details.append("Representation missing id attribute")

    if rp002_pass:
        results.append(RuleResult(
            id="RP-002",
            category="Representation",
            severity="error",
            status="pass",
            description="Each Representation must have id attribute",
        ))
    else:
        results.append(RuleResult(
            id="RP-002",
            category="Representation",
            severity="error",
            status="fail",
            description="Each Representation must have id attribute",
            detail="; ".join(rp002_fail_details),
        ))

    video_reps = [(r, a) for r, a in all_reps if "video" in mpd_data.get_effective_mime(r, a)]
    if video_reps:
        rp003_pass = True
        rp003_fail_details = []
        for rep, aset in video_reps:
            rep_id = rep.id or "(no id)"
            missing = []
            if rep.width is None:
                missing.append("width")
            if rep.height is None:
                missing.append("height")
            if rep.frameRate is None:
                missing.append("frameRate")
            if missing:
                rp003_pass = False
                rp003_fail_details.append(f"Video Representation[@id='{rep_id}'] missing: {', '.join(missing)}")

        if rp003_pass:
            results.append(RuleResult(
                id="RP-003",
                category="Representation",
                severity="warning",
                status="pass",
                description="Video Representation should have width, height, frameRate",
            ))
        else:
            results.append(RuleResult(
                id="RP-003",
                category="Representation",
                severity="warning",
                status="fail",
                description="Video Representation should have width, height, frameRate",
                detail="; ".join(rp003_fail_details),
                suggestion="Add width, height, and frameRate attributes to video Representations",
            ))
    else:
        results.append(RuleResult(
            id="RP-003",
            category="Representation",
            severity="warning",
            status="not_applicable",
            description="Video Representation should have width, height, frameRate",
            detail="No video Representations found",
        ))

    audio_reps = [(r, a) for r, a in all_reps if "audio" in mpd_data.get_effective_mime(r, a)]
    if audio_reps:
        rp004_pass = True
        rp004_fail_details = []
        for rep, aset in audio_reps:
            rep_id = rep.id or "(no id)"
            if rep.audioSamplingRate is None:
                rp004_pass = False
                rp004_fail_details.append(f"Audio Representation[@id='{rep_id}'] missing audioSamplingRate")

        if rp004_pass:
            results.append(RuleResult(
                id="RP-004",
                category="Representation",
                severity="warning",
                status="pass",
                description="Audio Representation should have audioSamplingRate",
            ))
        else:
            results.append(RuleResult(
                id="RP-004",
                category="Representation",
                severity="warning",
                status="fail",
                description="Audio Representation should have audioSamplingRate",
                detail="; ".join(rp004_fail_details),
                suggestion="Add audioSamplingRate attribute to audio Representations",
            ))
    else:
        results.append(RuleResult(
            id="RP-004",
            category="Representation",
            severity="warning",
            status="not_applicable",
            description="Audio Representation should have audioSamplingRate",
            detail="No audio Representations found",
        ))

    rp005_pass = True
    rp005_fail_details = []
    for period in mpd_data.periods:
        for aset in period.adaptation_sets:
            for rep in aset.representations:
                rep_id = rep.id or "(no id)"
                if not aset.codecs and not rep.codecs:
                    rp005_pass = False
                    rp005_fail_details.append(f"Representation[@id='{rep_id}'] has no codecs at AdaptationSet or Representation level")

    if rp005_pass:
        results.append(RuleResult(
            id="RP-005",
            category="Representation",
            severity="error",
            status="pass",
            description="codecs must exist at AdaptationSet or Representation level",
        ))
    else:
        results.append(RuleResult(
            id="RP-005",
            category="Representation",
            severity="error",
            status="fail",
            description="codecs must exist at AdaptationSet or Representation level",
            detail="; ".join(rp005_fail_details),
            suggestion="Add codecs attribute at AdaptationSet or Representation level",
        ))

    rp006_pass = True
    rp006_fail_details = []
    for period in mpd_data.periods:
        for aset in period.adaptation_sets:
            for rep in aset.representations:
                rep_id = rep.id or "(no id)"
                if not aset.mimeType and not rep.mimeType:
                    rp006_pass = False
                    rp006_fail_details.append(f"Representation[@id='{rep_id}'] has no mimeType at AdaptationSet or Representation level")

    if rp006_pass:
        results.append(RuleResult(
            id="RP-006",
            category="Representation",
            severity="error",
            status="pass",
            description="mimeType must exist at AdaptationSet or Representation level",
        ))
    else:
        results.append(RuleResult(
            id="RP-006",
            category="Representation",
            severity="error",
            status="fail",
            description="mimeType must exist at AdaptationSet or Representation level",
            detail="; ".join(rp006_fail_details),
            suggestion="Add mimeType attribute at AdaptationSet or Representation level",
        ))

    return results
