from __future__ import annotations
import re
from typing import Optional
from mpd_data import MPDData, AdaptationSet, Representation, SegmentTemplate


CODEC_MAP = {
    "avc1": "avc1",
    "avc3": "avc1",
    "hev1": "hvc1",
    "hvc1": "hvc1",
    "vp09": "vp09",
    "av01": "av01",
    "mp4a": "mp4a",
    "ac-3": "ac-3",
    "ec-3": "ec-3",
    "opus": "opus",
}


def _parse_duration_seconds(dur_str):
    if not dur_str:
        return 0.0
    m = re.match(r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$", dur_str)
    if not m:
        return 0.0
    hours = int(m.group(1) or 0)
    minutes = int(m.group(2) or 0)
    seconds = float(m.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


def _resolve_template(template_str, rep_id, bandwidth, number):
    if not template_str:
        return ""
    result = template_str
    result = result.replace("$RepresentationID$", str(rep_id))
    result = result.replace("$Bandwidth$", str(bandwidth))
    result = result.replace("$Number$", str(number))
    result = result.replace("$Time$", "0")
    return result


def _get_effective_st(rep: Representation, aset: AdaptationSet) -> Optional[SegmentTemplate]:
    return rep.segment_template or aset.segment_template


def _is_video(rep: Representation, aset: AdaptationSet) -> bool:
    mime = (rep.mimeType or aset.mimeType or "").lower()
    ct = (aset.contentType or "").lower()
    return "video" in mime or "video" in ct


def _is_audio(rep: Representation, aset: AdaptationSet) -> bool:
    mime = (rep.mimeType or aset.mimeType or "").lower()
    ct = (aset.contentType or "").lower()
    return "audio" in mime or "audio" in ct


def _segment_duration_seconds(st: SegmentTemplate) -> float:
    if st.duration:
        ts = int(st.timescale or "1")
        if ts > 0:
            return int(st.duration) / ts
    return 6.0


def _compute_segment_urls(st: SegmentTemplate, rep: Representation, total_duration: float) -> list[str]:
    urls = []
    seg_dur = _segment_duration_seconds(st)
    if seg_dur <= 0:
        seg_dur = 6.0
    num_segments = max(1, int(total_duration / seg_dur))
    start = int(st.startNumber or "1")

    if st.segment_timeline and st.segment_timeline.elements:
        ts = int(st.timescale or "1")
        time_cursor = 0
        for elem in st.segment_timeline.elements:
            if elem.t is not None:
                time_cursor = int(elem.t)
            if elem.d is not None:
                d_val = int(elem.d)
                num_reps = max(1, round(d_val / (int(st.duration or d_val) or d_val))) if st.duration else 1
                for _ in range(num_reps):
                    url = _resolve_template(st.media or "", rep.id or "0", rep.bandwidth or "0", start)
                    urls.append(url)
                    start += 1
                    time_cursor += d_val
    else:
        for i in range(num_segments):
            url = _resolve_template(st.media or "", rep.id or "0", rep.bandwidth or "0", start + i)
            urls.append(url)

    return urls


def _build_variant_playlist(rep: Representation, aset: AdaptationSet, st: SegmentTemplate,
                            total_duration: float, base_url: str) -> str:
    lines = ["#EXTM3U"]
    lines.append("#EXT-X-VERSION:6")
    lines.append(f"#EXT-X-TARGETDURATION:{int(round(_segment_duration_seconds(st)))}")

    init_url = _resolve_template(st.initialization or "", rep.id or "0", rep.bandwidth or "0", 0)
    if init_url:
        full_init = base_url + init_url if not init_url.startswith("http") else init_url
        lines.append(f"#EXT-X-MAP:URI=\"{full_init}\"")

    seg_dur = _segment_duration_seconds(st)
    seg_urls = _compute_segment_urls(st, rep, total_duration)

    for url in seg_urls:
        full_url = base_url + url if not url.startswith("http") else url
        lines.append(f"#EXTINF:{seg_dur:.3f},")
        lines.append(full_url)

    lines.append("#EXT-X-ENDLIST")
    return "\n".join(lines)


def _get_base_url(mpd_data: MPDData) -> str:
    if mpd_data.base_urls:
        return mpd_data.base_urls[0].text.rstrip("/")
    for period in mpd_data.periods:
        if period.base_urls:
            return period.base_urls[0].text.rstrip("/")
    return ""


def mpd_to_hls(mpd_data: MPDData) -> dict:
    total_duration = _parse_duration_seconds(mpd_data.mediaPresentationDuration)
    base_url = _get_base_url(mpd_data)

    video_variants = []
    audio_groups = {}
    all_playlists = {}

    for period in mpd_data.periods:
        for aset in period.adaptation_sets:
            for rep in aset.representations:
                st = _get_effective_st(rep, aset)
                if not st:
                    continue

                if _is_video(rep, aset):
                    playlist_name = f"video_{rep.id or '0'}.m3u8"
                    playlist_content = _build_variant_playlist(rep, aset, st, total_duration, base_url)
                    all_playlists[playlist_name] = playlist_content

                    codecs = rep.codecs or aset.codecs or ""
                    resolution = ""
                    if rep.width and rep.height:
                        resolution = f"{rep.width}x{rep.height}"
                    bandwidth = int(rep.bandwidth) if rep.bandwidth and rep.bandwidth.isdigit() else 0
                    frame_rate = rep.frameRate or ""

                    video_variants.append({
                        "bandwidth": bandwidth,
                        "resolution": resolution,
                        "codecs": codecs,
                        "playlist": playlist_name,
                        "frame_rate": frame_rate,
                    })

                elif _is_audio(rep, aset):
                    group_id = aset.id or "audio"
                    lang = "und"
                    playlist_name = f"audio_{rep.id or '0'}.m3u8"
                    playlist_content = _build_variant_playlist(rep, aset, st, total_duration, base_url)
                    all_playlists[playlist_name] = playlist_content

                    codecs = rep.codecs or aset.codecs or ""
                    bandwidth = int(rep.bandwidth) if rep.bandwidth and rep.bandwidth.isdigit() else 0

                    if group_id not in audio_groups:
                        audio_groups[group_id] = []
                    audio_groups[group_id].append({
                        "bandwidth": bandwidth,
                        "codecs": codecs,
                        "playlist": playlist_name,
                        "language": lang,
                    })

    master_lines = ["#EXTM3U", "#EXT-X-VERSION:6"]

    for group_id, variants in audio_groups.items():
        for v in variants:
            lang = v["language"]
            codecs = v["codecs"]
            bw = v["bandwidth"]
            uri = v["playlist"]
            master_lines.append(
                f'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="{group_id}",'
                f'LANGUAGE="{lang}",'
                f'CODECS="{codecs}",'
                f'BANDWIDTH={bw},'
                f'URI="{uri}"'
            )

    for var in video_variants:
        line = f'#EXT-X-STREAM-INF:BANDWIDTH={var["bandwidth"]}'
        if var["resolution"]:
            line += f',RESOLUTION={var["resolution"]}'
        if var["codecs"]:
            line += f',CODECS="{var["codecs"]}"'
        if var["frame_rate"]:
            line += f',FRAME-RATE={var["frame_rate"]}'
        if audio_groups:
            first_group = list(audio_groups.keys())[0]
            line += f',AUDIO="{first_group}"'
        master_lines.append(line)
        master_lines.append(var["playlist"])

    master_playlist = "\n".join(master_lines)
    all_playlists["master.m3u8"] = master_playlist

    return {
        "master": master_playlist,
        "playlists": all_playlists,
        "video_variants": video_variants,
        "audio_groups": {k: v for k, v in audio_groups.items()},
    }
