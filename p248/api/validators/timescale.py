from __future__ import annotations
import re
from models import RuleResult
from mpd_data import MPDData, SegmentTemplate

DURATION_RE = re.compile(r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$")


def _parse_duration_seconds(dur_str):
    if not dur_str:
        return None
    m = re.match(r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$", dur_str)
    if not m:
        return None
    hours = int(m.group(1) or 0)
    minutes = int(m.group(2) or 0)
    seconds = float(m.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


def _collect_templates(mpd_data: MPDData) -> list[tuple[SegmentTemplate, str, int]]:
    templates = []
    for period_idx, period in enumerate(mpd_data.periods):
        for aset in period.adaptation_sets:
            if aset.segment_template:
                templates.append((aset.segment_template, "AdaptationSet", period_idx))
            for rep in aset.representations:
                if rep.segment_template:
                    templates.append((rep.segment_template, "Representation", period_idx))
    return templates


def validate_timescale(mpd_data: MPDData) -> list[RuleResult]:
    results = []
    is_static = mpd_data.type != "dynamic"

    if is_static:
        if mpd_data.mediaPresentationDuration:
            results.append(RuleResult(
                id="TS-001",
                category="Timing/Timescale",
                severity="error",
                status="pass",
                description="MPD@mediaPresentationDuration must exist in static MPD",
            ))
        else:
            results.append(RuleResult(
                id="TS-001",
                category="Timing/Timescale",
                severity="error",
                status="fail",
                description="MPD@mediaPresentationDuration must exist in static MPD",
                suggestion="Add mediaPresentationDuration attribute to the MPD element",
            ))
    else:
        results.append(RuleResult(
            id="TS-001",
            category="Timing/Timescale",
            severity="error",
            status="not_applicable",
            description="MPD@mediaPresentationDuration must exist in static MPD",
            detail="MPD is dynamic, this rule does not apply",
        ))

    periods = mpd_data.periods
    ts002_pass = True
    ts002_fail_details = []
    for i, period in enumerate(periods):
        if period.duration:
            if not DURATION_RE.match(period.duration):
                ts002_pass = False
                ts002_fail_details.append(f"Period[{i}] duration '{period.duration}' is not valid ISO 8601 duration")
        if period.start:
            if not DURATION_RE.match(period.start):
                ts002_pass = False
                ts002_fail_details.append(f"Period[{i}] start '{period.start}' is not valid ISO 8601 duration")

    if ts002_pass:
        results.append(RuleResult(
            id="TS-002",
            category="Timing/Timescale",
            severity="error",
            status="pass",
            description="Period duration or start must be valid ISO 8601 duration format",
        ))
    else:
        results.append(RuleResult(
            id="TS-002",
            category="Timing/Timescale",
            severity="error",
            status="fail",
            description="Period duration or start must be valid ISO 8601 duration format",
            detail="; ".join(ts002_fail_details),
        ))

    ts003_pass = True
    ts003_fail_details = []
    templates = _collect_templates(mpd_data)
    for i, period in enumerate(periods):
        period_dur_s = None
        if period.duration:
            period_dur_s = _parse_duration_seconds(period.duration)
        elif period.start and i + 1 < len(periods):
            next_period = periods[i + 1]
            if next_period.start:
                ps = _parse_duration_seconds(period.start)
                ns = _parse_duration_seconds(next_period.start)
                if ps is not None and ns is not None:
                    period_dur_s = ns - ps

        period_templates = [(st, level) for st, level, pidx in templates if pidx == i]
        for st, level in period_templates:
            if st.duration and period_dur_s is not None:
                ts = st.timescale or "1"
                try:
                    ts_int = int(ts)
                    st_dur_int = int(st.duration)
                    if ts_int > 0:
                        segment_total = st_dur_int / ts_int
                        if period_dur_s > 0 and abs(segment_total - period_dur_s) / period_dur_s > 0.5:
                            ts003_pass = False
                            ts003_fail_details.append(
                                f"Period[{i}] {level} SegmentTemplate duration/timescale={segment_total:.2f}s "
                                f"differs significantly from Period duration={period_dur_s:.2f}s"
                            )
                except (ValueError, ZeroDivisionError):
                    pass

    if ts003_pass:
        results.append(RuleResult(
            id="TS-003",
            category="Timing/Timescale",
            severity="warning",
            status="pass",
            description="SegmentTemplate duration/timescale should roughly match Period duration",
        ))
    else:
        results.append(RuleResult(
            id="TS-003",
            category="Timing/Timescale",
            severity="warning",
            status="fail",
            description="SegmentTemplate duration/timescale should roughly match Period duration",
            detail="; ".join(ts003_fail_details),
            suggestion="Verify SegmentTemplate duration and timescale are consistent with Period duration",
        ))

    if not is_static:
        if mpd_data.minimumUpdatePeriod:
            results.append(RuleResult(
                id="TS-004",
                category="Timing/Timescale",
                severity="error",
                status="pass",
                description="minimumUpdatePeriod must exist in dynamic MPD",
            ))
        else:
            results.append(RuleResult(
                id="TS-004",
                category="Timing/Timescale",
                severity="error",
                status="fail",
                description="minimumUpdatePeriod must exist in dynamic MPD",
                suggestion="Add minimumUpdatePeriod attribute to the MPD element",
            ))
    else:
        results.append(RuleResult(
            id="TS-004",
            category="Timing/Timescale",
            severity="error",
            status="not_applicable",
            description="minimumUpdatePeriod must exist in dynamic MPD",
            detail="MPD is static, this rule does not apply",
        ))

    ts005_pass = True
    ts005_fail_details = []
    for st, level, period_idx in templates:
        if st.duration:
            ts = st.timescale or "1"
            try:
                ts_int = int(ts)
                st_dur_int = int(st.duration)
                if ts_int > 0:
                    ms = (st_dur_int * 1000) / ts_int
                    if ms != int(ms):
                        ts005_pass = False
                        ts005_fail_details.append(
                            f"Period[{period_idx}] {level} SegmentTemplate duration={st.duration}, timescale={ts} "
                            f"yields {ms:.3f}ms (not integer milliseconds)"
                        )
            except ValueError:
                pass
        if st.segment_timeline:
            for s in st.segment_timeline.elements:
                if s.d:
                    ts = st.timescale or "1"
                    try:
                        ts_int = int(ts)
                        s_d_int = int(s.d)
                        if ts_int > 0:
                            ms = (s_d_int * 1000) / ts_int
                            if ms != int(ms):
                                ts005_pass = False
                                ts005_fail_details.append(
                                    f"Period[{period_idx}] {level} SegmentTimeline S@d={s.d}, timescale={ts} "
                                    f"yields {ms:.3f}ms (not integer milliseconds)"
                                )
                    except ValueError:
                        pass

    if ts005_pass:
        results.append(RuleResult(
            id="TS-005",
            category="Timing/Timescale",
            severity="warning",
            status="pass",
            description="Segment duration should yield integer milliseconds",
        ))
    else:
        results.append(RuleResult(
            id="TS-005",
            category="Timing/Timescale",
            severity="warning",
            status="fail",
            description="Segment duration should yield integer milliseconds",
            detail="; ".join(ts005_fail_details),
            suggestion="Round duration or adjust timescale to ensure (duration * 1000) / timescale yields an integer value for accurate millisecond alignment",
        ))

    return results
