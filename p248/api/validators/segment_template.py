from __future__ import annotations
from models import RuleResult
from mpd_data import MPDData, SegmentTemplate


def _collect_templates(mpd_data: MPDData) -> list[tuple[SegmentTemplate, str]]:
    templates = []
    for period in mpd_data.periods:
        for aset in period.adaptation_sets:
            if aset.segment_template:
                templates.append((aset.segment_template, "AdaptationSet"))
            for rep in aset.representations:
                if rep.segment_template:
                    templates.append((rep.segment_template, "Representation"))
    return templates


def validate_segment_template(mpd_data: MPDData) -> list[RuleResult]:
    results = []
    templates = _collect_templates(mpd_data)

    if not templates:
        results.append(RuleResult(
            id="ST-001",
            category="SegmentTemplate",
            severity="error",
            status="not_applicable",
            description="SegmentTemplate must have media attribute or SegmentTimeline child",
            detail="No SegmentTemplate elements found in the MPD",
        ))
        results.append(RuleResult(
            id="ST-002",
            category="SegmentTemplate",
            severity="error",
            status="not_applicable",
            description="Template identifiers in media must be consistent with index attribute",
        ))
        results.append(RuleResult(
            id="ST-003",
            category="SegmentTemplate",
            severity="warning",
            status="not_applicable",
            description="initialization attribute should not contain $Number$ or $Time$",
        ))
        results.append(RuleResult(
            id="ST-004",
            category="SegmentTemplate",
            severity="error",
            status="not_applicable",
            description="timescale when explicitly set must be a positive integer",
        ))
        results.append(RuleResult(
            id="ST-005",
            category="SegmentTemplate",
            severity="error",
            status="not_applicable",
            description="startNumber should be a non-negative integer",
        ))
        results.append(RuleResult(
            id="ST-006",
            category="SegmentTemplate",
            severity="error",
            status="not_applicable",
            description="SegmentTimeline t and d attributes must be non-negative integers",
        ))
        return results

    st001_pass = True
    st001_fail_details = []
    for st, level in templates:
        if not st.media and st.segment_timeline is None:
            st001_pass = False
            st001_fail_details.append(f"SegmentTemplate at {level} lacks both media attribute and SegmentTimeline child")

    if st001_pass:
        results.append(RuleResult(
            id="ST-001",
            category="SegmentTemplate",
            severity="error",
            status="pass",
            description="SegmentTemplate must have media attribute or SegmentTimeline child",
        ))
    else:
        results.append(RuleResult(
            id="ST-001",
            category="SegmentTemplate",
            severity="error",
            status="fail",
            description="SegmentTemplate must have media attribute or SegmentTimeline child",
            detail="; ".join(st001_fail_details),
        ))

    st002_pass = True
    st002_fail_details = []
    for st, level in templates:
        if st.media and st.index:
            if st.index == "number" and "$Number$" not in st.media:
                st002_pass = False
                st002_fail_details.append(f"{level} index='number' but $Number$ not found in media template '{st.media}'")
            if st.index == "time" and "$Time$" not in st.media:
                st002_pass = False
                st002_fail_details.append(f"{level} index='time' but $Time$ not found in media template '{st.media}'")

    if st002_pass:
        results.append(RuleResult(
            id="ST-002",
            category="SegmentTemplate",
            severity="error",
            status="pass",
            description="Template identifiers in media must be consistent with index attribute",
        ))
    else:
        results.append(RuleResult(
            id="ST-002",
            category="SegmentTemplate",
            severity="error",
            status="fail",
            description="Template identifiers in media must be consistent with index attribute",
            detail="; ".join(st002_fail_details),
        ))

    st003_pass = True
    st003_fail_details = []
    for st, level in templates:
        if st.initialization:
            if "$Number$" in st.initialization or "$Time$" in st.initialization:
                st003_pass = False
                st003_fail_details.append(f"{level} initialization '{st.initialization}' contains $Number$ or $Time$")

    if st003_pass:
        results.append(RuleResult(
            id="ST-003",
            category="SegmentTemplate",
            severity="warning",
            status="pass",
            description="initialization attribute should not contain $Number$ or $Time$",
        ))
    else:
        results.append(RuleResult(
            id="ST-003",
            category="SegmentTemplate",
            severity="warning",
            status="fail",
            description="initialization attribute should not contain $Number$ or $Time$",
            detail="; ".join(st003_fail_details),
            suggestion="Remove $Number$ and $Time$ from initialization attribute",
        ))

    st004_pass = True
    st004_fail_details = []
    for st, level in templates:
        if st.timescale is not None:
            try:
                val = int(st.timescale)
                if val <= 0:
                    st004_pass = False
                    st004_fail_details.append(f"{level} timescale '{st.timescale}' is not a positive integer")
            except ValueError:
                st004_pass = False
                st004_fail_details.append(f"{level} timescale '{st.timescale}' is not a valid integer")

    if st004_pass:
        results.append(RuleResult(
            id="ST-004",
            category="SegmentTemplate",
            severity="error",
            status="pass",
            description="timescale when explicitly set must be a positive integer",
        ))
    else:
        results.append(RuleResult(
            id="ST-004",
            category="SegmentTemplate",
            severity="error",
            status="fail",
            description="timescale when explicitly set must be a positive integer",
            detail="; ".join(st004_fail_details),
        ))

    st005_pass = True
    st005_fail_details = []
    for st, level in templates:
        if st.startNumber is not None:
            try:
                val = int(st.startNumber)
                if val < 0:
                    st005_pass = False
                    st005_fail_details.append(f"{level} startNumber '{st.startNumber}' is negative")
            except ValueError:
                st005_pass = False
                st005_fail_details.append(f"{level} startNumber '{st.startNumber}' is not a valid integer")

    if st005_pass:
        results.append(RuleResult(
            id="ST-005",
            category="SegmentTemplate",
            severity="error",
            status="pass",
            description="startNumber should be a non-negative integer",
        ))
    else:
        results.append(RuleResult(
            id="ST-005",
            category="SegmentTemplate",
            severity="error",
            status="fail",
            description="startNumber should be a non-negative integer",
            detail="; ".join(st005_fail_details),
        ))

    st006_pass = True
    st006_fail_details = []
    for st, level in templates:
        if st.segment_timeline:
            for s in st.segment_timeline.elements:
                if s.t is not None:
                    try:
                        if int(s.t) < 0:
                            st006_pass = False
                            st006_fail_details.append(f"{level} SegmentTimeline t attribute '{s.t}' is negative")
                    except ValueError:
                        st006_pass = False
                        st006_fail_details.append(f"{level} SegmentTimeline t attribute '{s.t}' is not a valid integer")
                if s.d is not None:
                    try:
                        if int(s.d) < 0:
                            st006_pass = False
                            st006_fail_details.append(f"{level} SegmentTimeline d attribute '{s.d}' is negative")
                    except ValueError:
                        st006_pass = False
                        st006_fail_details.append(f"{level} SegmentTimeline d attribute '{s.d}' is not a valid integer")

    if st006_pass:
        results.append(RuleResult(
            id="ST-006",
            category="SegmentTemplate",
            severity="error",
            status="pass",
            description="SegmentTimeline t and d attributes must be non-negative integers",
        ))
    else:
        results.append(RuleResult(
            id="ST-006",
            category="SegmentTemplate",
            severity="error",
            status="fail",
            description="SegmentTimeline t and d attributes must be non-negative integers",
            detail="; ".join(st006_fail_details),
        ))

    return results
