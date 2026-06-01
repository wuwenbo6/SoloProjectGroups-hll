from __future__ import annotations
from models import RuleResult
from mpd_data import MPDData


def _collect_content_protections(mpd_data: MPDData):
    cps = []
    for cp in mpd_data.content_protections:
        cps.append((cp, "MPD"))
    for period in mpd_data.periods:
        for aset in period.adaptation_sets:
            for cp in aset.content_protections:
                cps.append((cp, "AdaptationSet"))
            for rep in aset.representations:
                for cp in rep.content_protections:
                    cps.append((cp, "Representation"))
    return cps


def validate_period(mpd_data: MPDData) -> list[RuleResult]:
    results = []

    periods = mpd_data.periods
    if periods:
        results.append(RuleResult(
            id="PD-001",
            category="Period",
            severity="error",
            status="pass",
            description="MPD must have at least one Period element",
        ))
    else:
        results.append(RuleResult(
            id="PD-001",
            category="Period",
            severity="error",
            status="fail",
            description="MPD must have at least one Period element",
            suggestion="Add at least one Period element to the MPD",
        ))

    if len(periods) > 1:
        pd002_pass = True
        pd002_fail_details = []
        for i in range(1, len(periods)):
            current = periods[i]
            previous = periods[i - 1]
            if not current.start and not previous.duration:
                pd002_pass = False
                pd002_fail_details.append(
                    f"Period[{i}] has no start attribute and Period[{i - 1}] has no duration attribute"
                )

        if pd002_pass:
            results.append(RuleResult(
                id="PD-002",
                category="Period",
                severity="error",
                status="pass",
                description="When multiple Periods, subsequent ones must have start or previous must have duration",
            ))
        else:
            results.append(RuleResult(
                id="PD-002",
                category="Period",
                severity="error",
                status="fail",
                description="When multiple Periods, subsequent ones must have start or previous must have duration",
                detail="; ".join(pd002_fail_details),
                suggestion="Add start attribute to subsequent Periods or duration to preceding Periods",
            ))
    else:
        results.append(RuleResult(
            id="PD-002",
            category="Period",
            severity="error",
            status="not_applicable",
            description="When multiple Periods, subsequent ones must have start or previous must have duration",
            detail="Only one or zero Periods found",
        ))

    pd003_pass = True
    pd003_fail_details = []
    for period in periods:
        for aset in period.adaptation_sets:
            if not aset.representations:
                as_id = aset.id or aset.contentType or "(unknown)"
                pd003_pass = False
                pd003_fail_details.append(f"AdaptationSet[@id='{as_id}'] contains no Representation elements")

    if pd003_pass:
        results.append(RuleResult(
            id="PD-003",
            category="Period",
            severity="error",
            status="pass",
            description="AdaptationSet must contain at least one Representation",
        ))
    else:
        results.append(RuleResult(
            id="PD-003",
            category="Period",
            severity="error",
            status="fail",
            description="AdaptationSet must contain at least one Representation",
            detail="; ".join(pd003_fail_details),
            suggestion="Add at least one Representation to each AdaptationSet",
        ))

    pd004_pass = True
    pd004_fail_details = []
    all_cps = _collect_content_protections(mpd_data)
    for cp, level in all_cps:
        if not cp.schemeIdUri:
            pd004_pass = False
            pd004_fail_details.append(f"{level} ContentProtection element missing schemeIdUri attribute")

    if not all_cps:
        results.append(RuleResult(
            id="PD-004",
            category="Period",
            severity="error",
            status="not_applicable",
            description="ContentProtection elements must have schemeIdUri attribute",
            detail="No ContentProtection elements found",
        ))
    elif pd004_pass:
        results.append(RuleResult(
            id="PD-004",
            category="Period",
            severity="error",
            status="pass",
            description="ContentProtection elements must have schemeIdUri attribute",
        ))
    else:
        results.append(RuleResult(
            id="PD-004",
            category="Period",
            severity="error",
            status="fail",
            description="ContentProtection elements must have schemeIdUri attribute",
            detail="; ".join(pd004_fail_details),
            suggestion="Add schemeIdUri attribute to all ContentProtection elements",
        ))

    return results
