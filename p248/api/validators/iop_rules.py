from __future__ import annotations
from models import RuleResult
from mpd_data import MPDData, AdaptationSet


def _is_video_aset(mpd_data: MPDData, aset: AdaptationSet) -> bool:
    as_mime = (aset.mimeType or "").lower()
    as_content_type = (aset.contentType or "").lower()
    if "video" in as_mime or "video" in as_content_type:
        return True
    for rep in aset.representations:
        rep_mime = (rep.mimeType or "").lower()
        if "video" in rep_mime:
            return True
    return False


def validate_iop_rules(mpd_data: MPDData) -> list[RuleResult]:
    results = []

    profiles_str = mpd_data.profiles or ""
    profiles = [p.strip() for p in profiles_str.split(",") if p.strip()]
    iop_found = any("dashif.org" in p for p in profiles)
    if iop_found:
        results.append(RuleResult(
            id="IOP-001",
            category="DASH-IF IOP",
            severity="warning",
            status="pass",
            description="profiles attribute should contain DASH-IF IOP profile URI",
        ))
    else:
        results.append(RuleResult(
            id="IOP-001",
            category="DASH-IF IOP",
            severity="warning",
            status="fail",
            description="profiles attribute should contain DASH-IF IOP profile URI",
            detail=f"No DASH-IF IOP profile found in profiles: {profiles_str or '(empty)'}",
            suggestion="Add a DASH-IF IOP profile URI (e.g., urn:mpeg:dash:profile:isoff-live:2011 or http://dashif.org/guidelines/dash264) to the profiles attribute",
        ))

    has_template = False
    total_seg_lists = 0
    total_seg_bases = 0
    for period in mpd_data.periods:
        for aset in period.adaptation_sets:
            if aset.segment_template:
                has_template = True
            for rep in aset.representations:
                if rep.segment_template:
                    has_template = True
            total_seg_lists += aset.segment_lists
            total_seg_bases += aset.segment_bases

    if has_template and total_seg_lists == 0 and total_seg_bases == 0:
        results.append(RuleResult(
            id="IOP-002",
            category="DASH-IF IOP",
            severity="info",
            status="pass",
            description="Recommend SegmentTemplate over SegmentList or SegmentBase",
        ))
    elif not has_template and total_seg_lists == 0 and total_seg_bases == 0:
        results.append(RuleResult(
            id="IOP-002",
            category="DASH-IF IOP",
            severity="info",
            status="not_applicable",
            description="Recommend SegmentTemplate over SegmentList or SegmentBase",
            detail="No segment addressing elements found",
        ))
    else:
        details = []
        if total_seg_lists > 0:
            details.append(f"Found {total_seg_lists} SegmentList element(s)")
        if total_seg_bases > 0:
            details.append(f"Found {total_seg_bases} SegmentBase element(s)")
        results.append(RuleResult(
            id="IOP-002",
            category="DASH-IF IOP",
            severity="info",
            status="fail",
            description="Recommend SegmentTemplate over SegmentList or SegmentBase",
            detail="; ".join(details),
            suggestion="Consider using SegmentTemplate instead of SegmentList or SegmentBase for IOP compliance",
        ))

    rep_baseurl_count = 0
    for period in mpd_data.periods:
        for aset in period.adaptation_sets:
            for rep in aset.representations:
                rep_baseurl_count += len(rep.base_urls)

    if rep_baseurl_count > 0:
        results.append(RuleResult(
            id="IOP-003",
            category="DASH-IF IOP",
            severity="warning",
            status="fail",
            description="BaseURL should not be used at Representation level",
            detail=f"Found {rep_baseurl_count} BaseURL element(s) at Representation level",
            suggestion="Move BaseURL to AdaptationSet level per IOP recommendation",
        ))
    else:
        results.append(RuleResult(
            id="IOP-003",
            category="DASH-IF IOP",
            severity="warning",
            status="pass",
            description="BaseURL should not be used at Representation level",
        ))

    video_adaptation_sets = []
    for period in mpd_data.periods:
        for aset in period.adaptation_sets:
            if _is_video_aset(mpd_data, aset):
                video_adaptation_sets.append(aset)

    if video_adaptation_sets:
        iop004_pass = True
        iop004_fail_details = []
        for aset in video_adaptation_sets:
            as_id = aset.id or "(unknown)"
            has_content_component = len(aset.content_components) > 0
            has_par = aset.par is not None
            if not has_content_component and not has_par:
                iop004_pass = False
                iop004_fail_details.append(
                    f"Video AdaptationSet[@id='{as_id}'] has no ContentComponent or par attribute"
                )

        if iop004_pass:
            results.append(RuleResult(
                id="IOP-004",
                category="DASH-IF IOP",
                severity="info",
                status="pass",
                description="Video AdaptationSet should have ContentComponent or par attribute",
            ))
        else:
            results.append(RuleResult(
                id="IOP-004",
                category="DASH-IF IOP",
                severity="info",
                status="fail",
                description="Video AdaptationSet should have ContentComponent or par attribute",
                detail="; ".join(iop004_fail_details),
                suggestion="Add ContentComponent element or par attribute to video AdaptationSets",
            ))
    else:
        results.append(RuleResult(
            id="IOP-004",
            category="DASH-IF IOP",
            severity="info",
            status="not_applicable",
            description="Video AdaptationSet should have ContentComponent or par attribute",
            detail="No video AdaptationSets found",
        ))

    return results
