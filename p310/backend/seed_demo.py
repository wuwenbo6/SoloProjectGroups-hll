import random
import struct
from datetime import datetime, timedelta, timezone
from typing import Optional

import database
import mos_estimator


def generate_demo_packet(
    ssrc: Optional[int] = None,
    loss_rate_pct: Optional[float] = None,
    discard_rate_pct: Optional[float] = None,
    r_factor: Optional[int] = None,
    mos_lq: Optional[float] = None,
    mos_cq: Optional[float] = None,
    jb_nominal: Optional[int] = None,
    jb_maximum: Optional[int] = None,
    jb_abs_max: Optional[int] = None,
    plc_type: int = 0,
) -> bytes:
    """
    Generate a demo RTCP XR packet with VoIP Metrics Block per RFC 3611 Section 4.7
    
    Args:
        ssrc: SSRC identifier
        loss_rate_pct: Packet loss rate percentage (0-100)
        discard_rate_pct: Discard rate percentage (0-100)
        r_factor: R factor value (0-100)
        mos_lq: MOS Listening Quality (1.0-4.5)
        mos_cq: MOS Conversational Quality (1.0-4.5)
        jb_nominal: Jitter buffer nominal delay (ms)
        jb_maximum: Jitter buffer maximum delay (ms)
        jb_abs_max: Jitter buffer absolute maximum delay (ms)
        plc_type: Packet Loss Concealment type (0-31)
    """
    if ssrc is None:
        ssrc = random.randint(1, 0xFFFFFFFF)

    if loss_rate_pct is None:
        loss_rate_pct = random.uniform(0, 15)
    if discard_rate_pct is None:
        discard_rate_pct = random.uniform(0, 5)

    loss_rate_byte = min(255, max(0, round(loss_rate_pct / 100.0 * 256)))
    discard_rate_byte = min(255, max(0, round(discard_rate_pct / 100.0 * 256)))

    if r_factor is None:
        r_factor = max(0, min(100, round(93.2 - loss_rate_pct * 0.95)))
    if mos_lq is None:
        r = r_factor
        if r > 0:
            mos_lq = min(4.5, max(1.0, 1 + 0.035 * r + 7e-6 * r * (r - 60) * (100 - r)))
        else:
            mos_lq = 1.0
    if mos_cq is None:
        mos_cq = max(1.0, mos_lq - random.uniform(0, 0.3))

    mos_lq_byte = min(45, max(10, round(mos_lq * 10)))
    mos_cq_byte = min(45, max(10, round(mos_cq * 10)))

    if jb_nominal is None:
        jb_nominal = random.randint(20, 120)
    if jb_maximum is None:
        jb_maximum = jb_nominal + random.randint(10, 60)
    if jb_abs_max is None:
        jb_abs_max = jb_maximum + random.randint(10, 80)

    burst_density = random.randint(0, 10)
    gap_density = random.randint(0, 5)
    burst_duration = random.randint(0, 200)
    gap_duration = random.randint(0, 500)
    round_trip_delay = random.randint(5, 300)
    end_system_delay = random.randint(5, 150)
    signal_level = random.randint(-60, -10)
    noise_level = random.randint(-80, -30)
    rerl = random.randint(10, 55)
    gmin = 16
    ext_r_factor = 0
    rx_config = 0

    voip_metrics = struct.pack(
        ">I BB BB HH HH bb BB BB BB BB HHH",
        ssrc,
        loss_rate_byte,
        discard_rate_byte,
        burst_density,
        gap_density,
        burst_duration,
        gap_duration,
        round_trip_delay,
        end_system_delay,
        signal_level,
        noise_level,
        rerl,
        gmin,
        r_factor,
        ext_r_factor,
        mos_lq_byte,
        mos_cq_byte,
        rx_config,
        0,
        jb_nominal,
        jb_maximum,
        jb_abs_max,
    )

    type_specific = (plc_type & 0x1F) | 0

    block_header = struct.pack(">BBH", 7, type_specific, 8)

    rtcp_payload = block_header + voip_metrics
    block_words = len(rtcp_payload) // 4
    total_length = 1 + block_words
    rtcp_header = struct.pack(">BBH I", 0x80, 207, total_length, ssrc)

    return rtcp_header + rtcp_payload


def seed_demo_data():
    database.init_db()
    now = datetime.now(timezone.utc)

    codecs = ["G.711", "G.729A", "G.723.1", "G.726", "G.722", "EVS"]

    for i in range(50):
        quality = random.choice(["good", "medium", "poor"])
        if quality == "good":
            loss_rate = random.uniform(0, 2)
            jb_nominal = random.randint(20, 40)
            mos_range = (4.0, 4.5)
        elif quality == "medium":
            loss_rate = random.uniform(2, 7)
            jb_nominal = random.randint(40, 80)
            mos_range = (3.2, 4.0)
        else:
            loss_rate = random.uniform(7, 15)
            jb_nominal = random.randint(60, 120)
            mos_range = (2.0, 3.2)

        discard_rate = loss_rate * random.uniform(0.2, 0.8)
        mos_lq = random.uniform(*mos_range)
        mos_cq = max(1.0, mos_lq - random.uniform(0, 0.3))
        r_factor = max(0, min(100, round(93.2 - loss_rate * 0.95 - jb_nominal * 0.02)))

        ssrc = random.randint(0x10000000, 0xFFFFFFFF)
        plc_type = random.randint(0, 6)
        codec = random.choice(codecs)

        packet = generate_demo_packet(
            ssrc=ssrc,
            loss_rate_pct=loss_rate,
            discard_rate_pct=discard_rate,
            r_factor=r_factor,
            mos_lq=mos_lq,
            mos_cq=mos_cq,
            jb_nominal=jb_nominal,
            jb_maximum=jb_nominal + random.randint(10, 60),
            jb_abs_max=jb_nominal + random.randint(40, 120),
            plc_type=plc_type,
        )

        import rtcp_xr_parser
        parsed = rtcp_xr_parser.parse_rtcp_xr(packet)

        if "error" in parsed:
            continue

        p564_result = mos_estimator.estimate_mos_p564(
            parsed["loss_rate"],
            parsed["jitter_buffer_delay"],
            codec,
        )
        mos_p564 = p564_result["mos"]

        ts = now - timedelta(minutes=random.randint(0, 1440))
        ts_str = ts.strftime("%Y-%m-%d %H:%M:%S")

        database.insert_report(
            ssrc=parsed["ssrc"],
            loss_rate=parsed["loss_rate"],
            discard_rate=parsed["discard_rate"],
            jitter_buffer_delay=parsed["jitter_buffer_delay"],
            mos_cq=parsed["mos_cq"],
            mos_lq=parsed["mos_lq"],
            r_factor=parsed["r_factor"],
            raw_hex=packet.hex(),
            blocks=parsed.get("report_blocks", []),
            timestamp=ts_str,
            mos_p564=mos_p564,
            codec=codec,
        )


if __name__ == "__main__":
    seed_demo_data()
    print("Demo data seeded successfully")
