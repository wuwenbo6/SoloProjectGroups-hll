import struct
import zlib
import time
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
from collections import defaultdict
from enum import Enum


ATM_CELL_SIZE = 53
ATM_HEADER_SIZE = 5
ATM_PAYLOAD_SIZE = 48
IMA_FRAME_CELL_COUNT = 128

ICP_VPI = 0
ICP_VCI = 16
OAM_PT_TYPE = 4

DEFAULT_LOSS_RATE_THRESHOLD = 1.0
MISSING_FRAMES_THRESHOLD = 3

ATM_CELL_RATE_STM1 = 155520000 / 8 / 53
ATM_CELL_RATE_STM4 = 622080000 / 8 / 53
BYTES_PER_CELL_PAYLOAD = 48
BITS_PER_BYTE = 8


class LinkStatus(str, Enum):
    NORMAL = "normal"
    DEGRADED = "degraded"
    FAILED = "failed"
    UNKNOWN = "unknown"


class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class AlertType(str, Enum):
    LINK_DEGRADED = "link_degraded"
    LINK_RESTORED = "link_restored"
    LINK_FAILED = "link_failed"
    CELL_LOSS_HIGH = "cell_loss_high"
    MEMBER_MISSING = "member_missing"
    MEMBER_RESTORED = "member_restored"
    FRAME_SYNC_LOSS = "frame_sync_loss"


@dataclass
class AlertEvent:
    alert_id: str
    alert_type: AlertType
    severity: AlertSeverity
    link_id: int
    message: str
    timestamp: float
    details: Dict = field(default_factory=dict)
    acknowledged: bool = False


@dataclass
class AlertConfig:
    loss_rate_threshold: float = DEFAULT_LOSS_RATE_THRESHOLD
    missing_frames_threshold: int = MISSING_FRAMES_THRESHOLD
    consecutive_degraded_threshold: int = 3
    auto_acknowledge: bool = False


@dataclass
class ATMCellHeader:
    gfc: int
    vpi: int
    vci: int
    pt: int
    clp: int
    hec: int

    def is_valid_hec(self, header_bytes: bytes) -> bool:
        calculated_hec = calculate_hec(header_bytes[:4])
        return calculated_hec == self.hec

    def is_oam(self) -> bool:
        return self.pt == OAM_PT_TYPE


@dataclass
class ATMCell:
    header: ATMCellHeader
    payload: bytes
    raw_data: bytes
    cell_index: int

    def is_icp_cell(self) -> bool:
        return (self.header.vpi == ICP_VPI and
                self.header.vci == ICP_VCI and
                self.header.is_oam())

    def is_filler_cell(self) -> bool:
        return (self.header.vpi == 0 and
                self.header.vci == 0 and
                self.payload == b'\x00' * ATM_PAYLOAD_SIZE)


@dataclass
class ICPCell:
    link_id: int
    frame_sequence: int
    cell_offset: int
    timestamp: int
    group_id: int
    stuff_count: int


@dataclass
class ReassembledPacket:
    vpi: int
    vci: int
    data: bytes
    cell_count: int
    first_cell_index: int
    last_cell_index: int


@dataclass
class IMAFrame:
    frame_number: int
    link_id: int
    cells: List[ATMCell] = field(default_factory=list)
    icp_cell: Optional[ICPCell] = None
    is_complete: bool = False


@dataclass
class FrameStructure:
    frame_number: int = 0
    link_id: int = 0
    icp_cell_index: int = 0
    data_cell_count: int = 0
    filler_cell_count: int = 0
    total_cell_count: int = 0
    structure: List[str] = field(default_factory=list)
    start_index: int = 0
    end_index: int = 0


@dataclass
class BandwidthStats:
    link_id: int = 0
    effective_cell_rate: float = 0.0
    theoretical_max_bandwidth_mbps: float = 0.0
    actual_bandwidth_mbps: float = 0.0
    bandwidth_utilization: float = 0.0
    effective_payload_rate_mbps: float = 0.0
    total_data_bytes: int = 0
    total_overhead_bytes: int = 0
    efficiency: float = 0.0


@dataclass
class LinkStatistics:
    link_id: int
    total_cells: int = 0
    data_cells: int = 0
    icp_cells: int = 0
    filler_cells: int = 0
    lost_cells: int = 0
    expected_sequence: int = -1
    last_sequence: int = -1
    status: LinkStatus = LinkStatus.UNKNOWN
    consecutive_degraded_count: int = 0
    consecutive_missing_count: int = 0
    current_loss_rate: float = 0.0
    loss_rate_history: List[float] = field(default_factory=list)
    previous_status: LinkStatus = LinkStatus.UNKNOWN
    last_frame_received: float = 0.0
    bandwidth: BandwidthStats = field(default_factory=BandwidthStats)
    frame_structures: List[FrameStructure] = field(default_factory=list)


@dataclass
class ParseResult:
    frames: List[IMAFrame] = field(default_factory=list)
    link_stats: Dict[int, LinkStatistics] = field(default_factory=dict)
    reassembled_packets: List[ReassembledPacket] = field(default_factory=list)
    alerts: List[AlertEvent] = field(default_factory=list)
    total_cells: int = 0
    total_lost_cells: int = 0
    config: AlertConfig = field(default_factory=AlertConfig)
    overall_status: LinkStatus = LinkStatus.UNKNOWN
    active_links: List[int] = field(default_factory=list)
    degraded_links: List[int] = field(default_factory=list)
    failed_links: List[int] = field(default_factory=list)


def generate_alert_id() -> str:
    """Generate unique alert ID"""
    return f"alert_{int(time.time() * 1000000)}_{abs(zlib.crc32(str(time.time()).encode())) % 10000}"


def create_alert(alert_type: AlertType, severity: AlertSeverity,
                 link_id: int, message: str, details: Optional[Dict] = None) -> AlertEvent:
    """Create an alert event"""
    return AlertEvent(
        alert_id=generate_alert_id(),
        alert_type=alert_type,
        severity=severity,
        link_id=link_id,
        message=message,
        timestamp=time.time(),
        details=details or {}
    )


def calculate_loss_rate(link_stat: LinkStatistics) -> float:
    """Calculate current cell loss rate for a link"""
    if link_stat.total_cells == 0:
        return 0.0
    return (link_stat.lost_cells / link_stat.total_cells) * 100


def check_link_degradation(link_stat: LinkStatistics, config: AlertConfig,
                           alerts: List[AlertEvent]) -> None:
    """
    Check if link should be marked as degraded based on loss rate threshold.
    Automatically adds alerts when state changes.
    """
    current_loss_rate = calculate_loss_rate(link_stat)
    link_stat.current_loss_rate = current_loss_rate
    link_stat.loss_rate_history.append(current_loss_rate)

    if len(link_stat.loss_rate_history) > 100:
        link_stat.loss_rate_history = link_stat.loss_rate_history[-100:]

    link_stat.previous_status = link_stat.status

    if current_loss_rate >= config.loss_rate_threshold:
        link_stat.consecutive_degraded_count += 1
        link_stat.consecutive_missing_count = 0

        if link_stat.consecutive_degraded_count >= config.consecutive_degraded_threshold:
            if link_stat.status != LinkStatus.DEGRADED:
                link_stat.status = LinkStatus.DEGRADED
                alert = create_alert(
                    alert_type=AlertType.LINK_DEGRADED,
                    severity=AlertSeverity.WARNING,
                    link_id=link_stat.link_id,
                    message=f"链路 {link_stat.link_id} 降级，信元丢失率: {current_loss_rate:.4f}%，阈值: {config.loss_rate_threshold}%",
                    details={
                        "loss_rate": current_loss_rate,
                        "threshold": config.loss_rate_threshold,
                        "consecutive_count": link_stat.consecutive_degraded_count,
                        "total_cells": link_stat.total_cells,
                        "lost_cells": link_stat.lost_cells
                    }
                )
                alerts.append(alert)
                alert = create_alert(
                    alert_type=AlertType.CELL_LOSS_HIGH,
                    severity=AlertSeverity.ERROR,
                    link_id=link_stat.link_id,
                    message=f"链路 {link_stat.link_id} 信元丢失率超过阈值",
                    details={
                        "loss_rate": current_loss_rate,
                        "threshold": config.loss_rate_threshold
                    }
                )
                alerts.append(alert)
    else:
        if link_stat.status == LinkStatus.DEGRADED:
            link_stat.status = LinkStatus.NORMAL
            link_stat.consecutive_degraded_count = 0
            alert = create_alert(
                alert_type=AlertType.LINK_RESTORED,
                severity=AlertSeverity.INFO,
                link_id=link_stat.link_id,
                message=f"链路 {link_stat.link_id} 恢复正常，信元丢失率: {current_loss_rate:.4f}%",
                details={
                    "loss_rate": current_loss_rate,
                    "threshold": config.loss_rate_threshold
                }
            )
            alerts.append(alert)
        elif link_stat.status == LinkStatus.UNKNOWN:
            link_stat.status = LinkStatus.NORMAL


def check_member_failure(link_stat: LinkStatistics, config: AlertConfig,
                         alerts: List[AlertEvent], current_frame_seq: int) -> None:
    """
    Check for member link failure based on missing frames.
    """
    link_stat.last_frame_received = time.time()

    if link_stat.expected_sequence == -1:
        return

    missing_count = current_frame_seq - link_stat.expected_sequence

    if missing_count > 0:
        link_stat.consecutive_missing_count += missing_count

        if link_stat.consecutive_missing_count >= config.missing_frames_threshold:
            if link_stat.status != LinkStatus.FAILED:
                link_stat.status = LinkStatus.FAILED
                alert = create_alert(
                    alert_type=AlertType.MEMBER_MISSING,
                    severity=AlertSeverity.CRITICAL,
                    link_id=link_stat.link_id,
                    message=f"链路 {link_stat.link_id} 成员失效，连续 {link_stat.consecutive_missing_count} 帧未收到",
                    details={
                        "missing_count": link_stat.consecutive_missing_count,
                        "expected_sequence": link_stat.expected_sequence,
                        "received_sequence": current_frame_seq,
                        "threshold": config.missing_frames_threshold
                    }
                )
                alerts.append(alert)
                alert = create_alert(
                    alert_type=AlertType.LINK_FAILED,
                    severity=AlertSeverity.CRITICAL,
                    link_id=link_stat.link_id,
                    message=f"链路 {link_stat.link_id} 失效告警",
                    details={
                        "last_sequence": link_stat.last_sequence,
                        "missing_frames": link_stat.consecutive_missing_count
                    }
                )
                alerts.append(alert)
    else:
        if link_stat.status == LinkStatus.FAILED:
            link_stat.status = LinkStatus.NORMAL
            link_stat.consecutive_missing_count = 0
            alert = create_alert(
                alert_type=AlertType.MEMBER_RESTORED,
                severity=AlertSeverity.INFO,
                link_id=link_stat.link_id,
                message=f"链路 {link_stat.link_id} 成员恢复，帧序列号: {current_frame_seq}",
                details={
                    "restored_sequence": current_frame_seq,
                    "previous_missing": link_stat.consecutive_missing_count
                }
            )
            alerts.append(alert)


def update_overall_status(result: ParseResult) -> None:
    """Update overall system status based on all link statuses"""
    active_links = []
    degraded_links = []
    failed_links = []

    for link_id, stat in result.link_stats.items():
        active_links.append(link_id)
        if stat.status == LinkStatus.DEGRADED:
            degraded_links.append(link_id)
        elif stat.status == LinkStatus.FAILED:
            failed_links.append(link_id)

    result.active_links = active_links
    result.degraded_links = degraded_links
    result.failed_links = failed_links

    if failed_links:
        result.overall_status = LinkStatus.FAILED
    elif degraded_links:
        result.overall_status = LinkStatus.DEGRADED
    elif active_links:
        result.overall_status = LinkStatus.NORMAL
    else:
        result.overall_status = LinkStatus.UNKNOWN


def detect_cell_loss(link_stat: LinkStatistics, current_frame_seq: int,
                     config: AlertConfig, alerts: List[AlertEvent]) -> int:
    """
    Detect cell loss based on frame sequence numbers.
    Also checks for member failure and link degradation.
    """
    if link_stat.expected_sequence == -1:
        link_stat.expected_sequence = current_frame_seq + 1
        link_stat.last_sequence = current_frame_seq
        return 0

    if current_frame_seq != link_stat.expected_sequence:
        lost = current_frame_seq - link_stat.expected_sequence
        if lost > 0:
            link_stat.lost_cells += lost * IMA_FRAME_CELL_COUNT

    check_member_failure(link_stat, config, alerts, current_frame_seq)

    link_stat.expected_sequence = current_frame_seq + 1
    link_stat.last_sequence = current_frame_seq
    return link_stat.lost_cells


def calculate_bandwidth(link_stat: LinkStatistics, duration_seconds: float = 1.0,
                        base_cell_rate: float = ATM_CELL_RATE_STM1) -> BandwidthStats:
    """
    Calculate link bandwidth based on effective cell rate.

    Args:
        link_stat: Link statistics
        duration_seconds: Time duration for rate calculation (default: 1.0 second)
        base_cell_rate: Base ATM cell rate (default: STM-1 rate)

    Returns:
        BandwidthStats containing bandwidth metrics
    """
    bandwidth = BandwidthStats(link_id=link_stat.link_id)

    if link_stat.total_cells == 0 or duration_seconds <= 0:
        return bandwidth

    actual_cell_rate = link_stat.total_cells / duration_seconds
    data_cell_rate = link_stat.data_cells / duration_seconds

    theoretical_max_bandwidth = base_cell_rate * ATM_CELL_SIZE * BITS_PER_BYTE / 1_000_000

    actual_bandwidth = actual_cell_rate * ATM_CELL_SIZE * BITS_PER_BYTE / 1_000_000

    effective_payload_rate = data_cell_rate * BYTES_PER_CELL_PAYLOAD * BITS_PER_BYTE / 1_000_000

    if theoretical_max_bandwidth > 0:
        bandwidth_utilization = (actual_bandwidth / theoretical_max_bandwidth) * 100
    else:
        bandwidth_utilization = 0.0

    total_data_bytes = link_stat.data_cells * BYTES_PER_CELL_PAYLOAD
    total_overhead_bytes = link_stat.total_cells * ATM_HEADER_SIZE + \
                          link_stat.icp_cells * BYTES_PER_CELL_PAYLOAD + \
                          link_stat.filler_cells * BYTES_PER_CELL_PAYLOAD

    total_bytes = total_data_bytes + total_overhead_bytes
    efficiency = (total_data_bytes / total_bytes * 100) if total_bytes > 0 else 0.0

    bandwidth.effective_cell_rate = data_cell_rate
    bandwidth.theoretical_max_bandwidth_mbps = theoretical_max_bandwidth
    bandwidth.actual_bandwidth_mbps = actual_bandwidth
    bandwidth.bandwidth_utilization = bandwidth_utilization
    bandwidth.effective_payload_rate_mbps = effective_payload_rate
    bandwidth.total_data_bytes = total_data_bytes
    bandwidth.total_overhead_bytes = total_overhead_bytes
    bandwidth.efficiency = efficiency

    link_stat.bandwidth = bandwidth
    return bandwidth


def analyze_frame_structure(frame: IMAFrame, cells: List[ATMCell],
                            start_index: int = 0) -> FrameStructure:
    """
    Analyze the structure of an IMA frame.

    Args:
        frame: IMA frame to analyze
        cells: List of ATM cells in the frame
        start_index: Starting index of the frame in the cell stream

    Returns:
        FrameStructure containing detailed frame structure information
    """
    structure = FrameStructure(
        frame_number=frame.frame_number,
        link_id=frame.link_id,
        start_index=start_index,
        end_index=start_index + len(cells) - 1
    )

    structure.icp_cell_index = 0

    for i, cell in enumerate(cells):
        if cell.is_icp_cell():
            structure.structure.append('ICP')
            structure.icp_cell_index = i
        elif cell.is_filler_cell():
            structure.structure.append('FILL')
            structure.filler_cell_count += 1
        else:
            structure.structure.append('DATA')
            structure.data_cell_count += 1
        structure.total_cell_count += 1

    return structure


def calculate_bandwidth_for_all_links(result: ParseResult,
                                      duration_seconds: float = 1.0) -> Dict[int, BandwidthStats]:
    """
    Calculate bandwidth for all links in the parse result.

    Args:
        result: Parse result containing link statistics
        duration_seconds: Time duration for rate calculation

    Returns:
        Dictionary mapping link_id to BandwidthStats
    """
    bandwidth_map = {}
    for link_id, stat in result.link_stats.items():
        bandwidth_map[link_id] = calculate_bandwidth(stat, duration_seconds)
    return bandwidth_map


def generate_frame_structure_diagram(frame_structure: FrameStructure) -> str:
    """
    Generate a text-based diagram of the frame structure.

    Args:
        frame_structure: Frame structure to visualize

    Returns:
        String containing ASCII art diagram
    """
    diagram = []
    diagram.append(f"Frame {frame_structure.frame_number} (Link {frame_structure.link_id})")
    diagram.append(f"Total cells: {frame_structure.total_cell_count}")
    diagram.append(f"Data cells: {frame_structure.data_cell_count}, Filler cells: {frame_structure.filler_cell_count}")
    diagram.append("")

    structure_str = ' '.join(frame_structure.structure[:64])
    if len(frame_structure.structure) > 64:
        structure_str += " ..."
    diagram.append(structure_str)
    diagram.append("")

    legend = "ICP: Control Cell | DATA: Data Cell | FILL: Filler Cell"
    diagram.append(legend)

    return '\n'.join(diagram)


def generate_frame_structure_json(frame_structure: FrameStructure) -> Dict:
    """
    Generate JSON representation of frame structure.

    Args:
        frame_structure: Frame structure to convert

    Returns:
        Dictionary containing frame structure data
    """
    return {
        "frame_number": frame_structure.frame_number,
        "link_id": frame_structure.link_id,
        "icp_cell_index": frame_structure.icp_cell_index,
        "data_cell_count": frame_structure.data_cell_count,
        "filler_cell_count": frame_structure.filler_cell_count,
        "total_cell_count": frame_structure.total_cell_count,
        "structure": frame_structure.structure,
        "start_index": frame_structure.start_index,
        "end_index": frame_structure.end_index,
        "data_ratio": (frame_structure.data_cell_count / frame_structure.total_cell_count * 100)
        if frame_structure.total_cell_count > 0 else 0,
        "filler_ratio": (frame_structure.filler_cell_count / frame_structure.total_cell_count * 100)
        if frame_structure.total_cell_count > 0 else 0
    }


def calculate_hec(header_4bytes: bytes) -> int:
    """Calculate HEC (Header Error Control) for ATM header"""
    crc = 0
    for byte in header_4bytes:
        crc ^= byte
        for _ in range(8):
            if crc & 0x80:
                crc = ((crc << 1) ^ 0x07) & 0xFF
            else:
                crc = (crc << 1) & 0xFF
    return crc


def parse_atm_header(header_bytes: bytes) -> ATMCellHeader:
    """Parse 5-byte ATM cell header"""
    if len(header_bytes) != ATM_HEADER_SIZE:
        raise ValueError(f"Header must be {ATM_HEADER_SIZE} bytes")

    gfc = (header_bytes[0] >> 4) & 0x0F
    vpi = ((header_bytes[0] & 0x0F) << 4) | ((header_bytes[1] >> 4) & 0x0F)
    vci = ((header_bytes[1] & 0x0F) << 12) | (header_bytes[2] << 4) | ((header_bytes[3] >> 4) & 0x0F)
    pt = (header_bytes[3] >> 1) & 0x07
    clp = header_bytes[3] & 0x01
    hec = header_bytes[4]

    return ATMCellHeader(gfc=gfc, vpi=vpi, vci=vci, pt=pt, clp=clp, hec=hec)


def parse_atm_cell(cell_bytes: bytes, cell_index: int) -> Optional[ATMCell]:
    """Parse a 53-byte ATM cell"""
    if len(cell_bytes) != ATM_CELL_SIZE:
        return None

    header = parse_atm_header(cell_bytes[:ATM_HEADER_SIZE])
    payload = cell_bytes[ATM_HEADER_SIZE:]

    return ATMCell(header=header, payload=payload, raw_data=cell_bytes, cell_index=cell_index)


def parse_icp_payload(payload: bytes) -> Optional[ICPCell]:
    """Parse ICP cell payload to extract IMA control information"""
    if len(payload) < 48:
        return None

    try:
        link_id = payload[0]
        frame_sequence = struct.unpack('>H', payload[1:3])[0]
        cell_offset = payload[3]
        timestamp = struct.unpack('>I', payload[4:8])[0]
        group_id = struct.unpack('>H', payload[8:10])[0]
        stuff_count = payload[10]

        return ICPCell(
            link_id=link_id,
            frame_sequence=frame_sequence,
            cell_offset=cell_offset,
            timestamp=timestamp,
            group_id=group_id,
            stuff_count=stuff_count
        )
    except (IndexError, struct.error):
        return None


def reassemble_packets(cells: List[ATMCell]) -> List[ReassembledPacket]:
    """Reassemble original packets from ATM cells based on VPI/VCI"""
    packet_buffers: Dict[Tuple[int, int], List[ATMCell]] = defaultdict(list)
    packets: List[ReassembledPacket] = []

    for cell in cells:
        if cell.is_icp_cell() or cell.is_filler_cell():
            continue

        if cell.header.pt & 0x04:
            continue

        key = (cell.header.vpi, cell.header.vci)
        packet_buffers[key].append(cell)

        if cell.header.pt & 0x01:
            packet_cells = packet_buffers[key]
            data = b''.join(c.payload for c in packet_cells)

            for i in range(len(data) - 1, -1, -1):
                if data[i] == 0x00:
                    continue
                if data[i] == 0xAA:
                    data = data[:i]
                    break

            packets.append(ReassembledPacket(
                vpi=cell.header.vpi,
                vci=cell.header.vci,
                data=data,
                cell_count=len(packet_cells),
                first_cell_index=packet_cells[0].cell_index,
                last_cell_index=cell.cell_index
            ))
            del packet_buffers[key]

    for key, remaining_cells in packet_buffers.items():
        if remaining_cells:
            data = b''.join(c.payload for c in remaining_cells)
            packets.append(ReassembledPacket(
                vpi=key[0],
                vci=key[1],
                data=data,
                cell_count=len(remaining_cells),
                first_cell_index=remaining_cells[0].cell_index,
                last_cell_index=remaining_cells[-1].cell_index
            ))

    return packets


def parse_ima_data(data: bytes, config: Optional[AlertConfig] = None) -> ParseResult:
    """
    Parse raw binary IMA frame data, extract cells, link IDs, and reassemble packets.
    Also performs link degradation detection and generates alerts.

    Args:
        data: Raw binary data containing IMA frames
        config: Alert configuration (thresholds, etc.)

    Returns:
        ParseResult containing frames, statistics, alerts, and reassembled packets
    """
    if config is None:
        config = AlertConfig()

    result = ParseResult(config=config)

    total_cells = len(data) // ATM_CELL_SIZE
    result.total_cells = total_cells

    current_frames: Dict[int, IMAFrame] = {}
    all_cells: List[ATMCell] = []

    for i in range(total_cells):
        offset = i * ATM_CELL_SIZE
        cell_bytes = data[offset:offset + ATM_CELL_SIZE]
        cell = parse_atm_cell(cell_bytes, i)

        if cell is None:
            continue

        all_cells.append(cell)

        if cell.is_icp_cell():
            icp = parse_icp_payload(cell.payload)
            if icp:
                link_id = icp.link_id
                if link_id not in result.link_stats:
                    result.link_stats[link_id] = LinkStatistics(link_id=link_id)

                result.link_stats[link_id].icp_cells += 1
                detect_cell_loss(
                    result.link_stats[link_id],
                    icp.frame_sequence,
                    config,
                    result.alerts
                )

                frame = IMAFrame(
                    frame_number=icp.frame_sequence,
                    link_id=link_id,
                    icp_cell=icp
                )
                current_frames[link_id] = frame
                result.frames.append(frame)
        else:
            if cell.is_filler_cell():
                for link_stat in result.link_stats.values():
                    link_stat.filler_cells += 1
            else:
                for link_stat in result.link_stats.values():
                    link_stat.data_cells += 1

        for link_stat in result.link_stats.values():
            link_stat.total_cells += 1

    for link_stat in result.link_stats.values():
        check_link_degradation(link_stat, config, result.alerts)

    result.reassembled_packets = reassemble_packets(all_cells)

    result.total_lost_cells = sum(stat.lost_cells for stat in result.link_stats.values())

    for frame in result.frames:
        if frame.icp_cell:
            frame.is_complete = True

    update_overall_status(result)

    for link_stat in result.link_stats.values():
        calculate_bandwidth(link_stat)

    return result


def build_atm_header(gfc: int, vpi: int, vci: int, pt: int, clp: int) -> bytes:
    """Build ATM header bytes with correct bit layout"""
    header = bytearray(5)
    header[0] = ((gfc & 0x0F) << 4) | ((vpi >> 4) & 0x0F)
    header[1] = ((vpi & 0x0F) << 4) | ((vci >> 12) & 0x0F)
    header[2] = (vci >> 4) & 0xFF
    header[3] = ((vci & 0x0F) << 4) | ((pt & 0x07) << 1) | (clp & 0x01)
    header[4] = calculate_hec(header[:4])
    return bytes(header)


def generate_test_ima_data(num_frames: int = 5, num_links: int = 2,
                           simulate_loss: bool = False) -> bytes:
    """Generate test IMA frame data for testing purposes"""
    data = bytearray()
    cell_index = 0

    for frame_seq in range(num_frames):
        for link_id in range(num_links):
            if simulate_loss and frame_seq == 2 and link_id == 0:
                continue

            icp_payload = bytearray(48)
            icp_payload[0] = link_id
            struct.pack_into('>H', icp_payload, 1, frame_seq)
            icp_payload[3] = 0
            struct.pack_into('>I', icp_payload, 4, int(frame_seq * 125))
            struct.pack_into('>H', icp_payload, 8, 0x0101)
            icp_payload[10] = 0

            icp_header = build_atm_header(gfc=0, vpi=0, vci=16, pt=4, clp=0)
            icp_cell = icp_header + icp_payload
            data.extend(icp_cell)
            cell_index += 1

            for i in range(127):
                if i % 10 == 0:
                    filler_header = build_atm_header(gfc=0, vpi=0, vci=0, pt=0, clp=0)
                    filler_payload = b'\x00' * 48
                    data.extend(filler_header + filler_payload)
                else:
                    vpi = 0x10 + link_id
                    vci = 0x0064 + link_id
                    is_last_cell = (i == 126 or i == 125)
                    pt = 1 if is_last_cell else 0
                    data_header = build_atm_header(gfc=0, vpi=vpi, vci=vci, pt=pt, clp=0)

                    test_payload = bytearray(48)
                    for j in range(48):
                        test_payload[j] = (cell_index + j) & 0xFF
                    if is_last_cell:
                        test_payload[47] = 0xAA
                    data.extend(data_header + test_payload)
                cell_index += 1

    return bytes(data)
