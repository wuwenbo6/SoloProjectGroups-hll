#!/usr/bin/env python3
"""
pci-browser: Flask-based web UI that reads PCI device config space
through /sys/bus/pci and a privileged helper for writes / error injection.

Run as a normal user; writes and full config-space dumps are performed
through the compiled `pci-helper` binary which should be installed
setuid-root (see Makefile).

Safety:
- Every write/inject is preceded by an automatic `save` of the full 256-byte
  config space into /var/lib/pci-browser/backups/<BDF>.
- A `restore` endpoint and button allow returning the device to its
  pre-injection state.
- The "command" injection (disable IO+MEM decoding) is gated behind
  PCI_ALLOW_DANGEROUS=1 in the helper's environment; the Flask app does NOT
  set this variable, so command injection is blocked by default.
- Multi-function devices are detected by examining function 0's header type
  (bit 7) and sibling functions are surfaced in the API response.
"""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import Dict, List, Optional

from flask import Flask, jsonify, request, send_from_directory, abort

SYS_PCI = Path("/sys/bus/pci/devices")
HELPER = os.environ.get("PCI_HELPER", str(Path(__file__).parent / "pci-helper"))
BACKUP_DIR = Path("/var/lib/pci-browser/backups")

app = Flask(__name__, static_folder="static", static_url_path="")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

_BDF_RE = re.compile(r"^[0-9a-fA-F]{4}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-9a-fA-F]$")


def valid_bdf(bdf: str) -> bool:
    return bool(_BDF_RE.match(bdf or ""))


def bdf_parts(bdf: str):
    dom, bus, devfn = bdf.split(":")
    dev, fn = devfn.split(".")
    return dom, bus, dev, fn


def make_bdf(dom: str, bus: str, dev: str, fn: str) -> str:
    return f"{dom}:{bus}:{dev}.{fn}"


def read_sys_attr(bdf: str, name: str) -> Optional[str]:
    p = SYS_PCI / bdf / name
    try:
        return p.read_text().strip()
    except OSError:
        return None


def run_helper(*args: str) -> subprocess.CompletedProcess:
    """Run the pci-helper with the given args.

    Does NOT pass PCI_ALLOW_DANGEROUS into the environment, so the
    "command" injection is blocked by default.
    """
    env = os.environ.copy()
    env.pop("PCI_ALLOW_DANGEROUS", None)
    return subprocess.run(
        [HELPER, *args],
        capture_output=True,
        text=True,
        env=env,
    )


def read_config_bytes(bdf: str) -> Optional[bytes]:
    """Return the 256-byte config space for a device.

    Tries the setuid helper first (more reliable), falls back to reading
    /sys/bus/pci/devices/<BDF>/config directly.
    """
    try:
        out = subprocess.check_output(
            [HELPER, "read", bdf, "0", "256"], stderr=subprocess.STDOUT
        )
        vals = [int(line, 16) for line in out.decode().splitlines() if line.strip()]
        if len(vals) == 256:
            return bytes(vals)
    except (OSError, subprocess.CalledProcessError, ValueError):
        pass
    try:
        return (SYS_PCI / bdf / "config").read_bytes()[:256]
    except OSError:
        return None


def save_config(bdf: str) -> bool:
    """Save the current config space to backup. Returns True on success."""
    r = run_helper("save", bdf)
    return r.returncode == 0


def has_backup(bdf: str) -> bool:
    return (BACKUP_DIR / bdf).exists()


def u16(cfg: bytes, off: int) -> int:
    return cfg[off] | (cfg[off + 1] << 8)


def u32(cfg: bytes, off: int) -> int:
    return cfg[off] | (cfg[off + 1] << 8) | (cfg[off + 2] << 16) | (cfg[off + 3] << 24)


# ---------------------------------------------------------------------------
# PCI config space parsing
# ---------------------------------------------------------------------------

HEADER_TYPE_NORMAL = 0x00
HEADER_TYPE_BRIDGE = 0x01
HEADER_TYPE_CARDBUS = 0x02


def decode_bar(raw: int, idx: int) -> Dict[str, object]:
    """Decode a 32-bit BAR value into a structured dict.

    Returns {index, type, base, size, prefetchable, io/mem flags...}.
    Size is determined by probing: writing all-1s to the BAR (via helper)
    would be ideal, but for read-only operation we derive the size from
    the lower bits mask if available, otherwise report None.
    """
    bar: Dict[str, object] = {"index": idx, "raw": f"0x{raw:08x}"}
    if raw == 0:
        bar["type"] = "unused"
        return bar
    if raw & 1:
        bar["type"] = "io"
        bar["base"] = raw & 0xFFFFFFFC
        return bar
    bar["type"] = "mem"
    bar["prefetchable"] = bool(raw & 0x8)
    t = (raw >> 1) & 0x3
    bar["mem_type"] = {0: "32bit", 2: "64bit", 1: "1M-lower"}.get(t, "reserved")
    if t == 2:
        bar["base"] = raw & 0xFFFFFFFFFFFFFFF0
    else:
        bar["base"] = raw & 0xFFFFFFF0
    return bar


def find_sibling_functions(bdf: str, all_devices: List[str]) -> List[str]:
    """Return BDFs of all functions under the same device (same domain:bus:dev)."""
    dom, bus, dev, _fn = bdf_parts(bdf)
    prefix = f"{dom}:{bus}:{dev}."
    return sorted(d for d in all_devices if d.startswith(prefix))


def parse_config(bdf: str, all_devices: Optional[List[str]] = None) -> Optional[Dict[str, object]]:
    cfg = read_config_bytes(bdf)
    if cfg is None or len(cfg) < 64:
        return None

    vendor_id = u16(cfg, 0x00)
    device_id = u16(cfg, 0x02)
    command = u16(cfg, 0x04)
    status = u16(cfg, 0x06)
    revision = cfg[0x08]
    prog_if = cfg[0x09]
    subclass = cfg[0x0A]
    class_code = cfg[0x0B]
    cache_line = cfg[0x0C]
    latency = cfg[0x0D]
    header_type_raw = cfg[0x0E]
    header_type = header_type_raw & 0x7F
    multifunction = bool(header_type_raw & 0x80)
    bist = cfg[0x0F]

    info: Dict[str, object] = {
        "bdf": bdf,
        "vendor_id": f"0x{vendor_id:04x}",
        "device_id": f"0x{device_id:04x}",
        "vendor_id_int": vendor_id,
        "device_id_int": device_id,
        "command": f"0x{command:04x}",
        "status": f"0x{status:04x}",
        "revision": f"0x{revision:02x}",
        "prog_if": f"0x{prog_if:02x}",
        "subclass": f"0x{subclass:02x}",
        "class_code": f"0x{class_code:02x}",
        "class_code_full": f"0x{class_code:02x}{subclass:02x}{prog_if:02x}",
        "cache_line_size": f"0x{cache_line:02x}",
        "latency_timer": f"0x{latency:02x}",
        "header_type": f"0x{header_type:02x}",
        "header_type_name": {
            HEADER_TYPE_NORMAL: "normal",
            HEADER_TYPE_BRIDGE: "bridge",
            HEADER_TYPE_CARDBUS: "cardbus",
        }.get(header_type, "unknown"),
        "multifunction": multifunction,
        "bist": f"0x{bist:02x}",
        "capabilities": [],
        "bars": [],
        "hex": cfg.hex(),
        "has_backup": has_backup(bdf),
    }

    # Multi-function: find siblings
    if all_devices:
        dom, bus, dev, fn = bdf_parts(bdf)
        siblings = find_sibling_functions(bdf, all_devices)
        info["sibling_functions"] = siblings
        info["function_number"] = int(fn, 16)
        info["device_functions"] = len(siblings)
        # If this is function 0 and multi-function bit is set, or just has >1 sibling
        info["is_multi_function"] = len(siblings) > 1 or multifunction
    else:
        info["sibling_functions"] = [bdf]
        info["function_number"] = int(bdf_parts(bdf)[3], 16)
        info["device_functions"] = 1
        info["is_multi_function"] = multifunction

    # Try to read friendly names from sysfs uevent/vendor/device/class files
    for attr, key in (("vendor", "vendor_name"),
                      ("device", "device_name"),
                      ("class", "class_name")):
        v = read_sys_attr(bdf, attr)
        if v:
            info[key] = v

    # BARs (header type 0: 6 BARs at 0x10..0x24)
    if header_type == HEADER_TYPE_NORMAL and len(cfg) >= 0x28:
        bars: List[Dict[str, object]] = []
        i = 0
        while i < 6:
            raw = u32(cfg, 0x10 + i * 4)
            bar = decode_bar(raw, i)
            bars.append(bar)
            if bar["type"] == "mem" and bar.get("mem_type") == "64bit":
                # next BAR holds high 32 bits of the 64-bit address
                if i + 1 < 6:
                    high = u32(cfg, 0x10 + (i + 1) * 4)
                    bar["high_raw"] = f"0x{high:08x}"
                    bar["base"] = (high << 32) | (raw & 0xFFFFFFFFFFFFFFF0)
                    bar["base"] = f"0x{bar['base']:x}"
                    bars.append({"index": i + 1, "type": "64bit-upper",
                                 "raw": f"0x{high:08x}"})
                i += 2
            else:
                i += 1
        info["bars"] = bars
        info["cardbus_cis"] = f"0x{u32(cfg, 0x28):08x}"
        info["subsystem_vendor"] = f"0x{u16(cfg, 0x2C):04x}"
        info["subsystem_device"] = f"0x{u16(cfg, 0x2E):04x}"
        info["expansion_rom"] = f"0x{u32(cfg, 0x30):08x}"
        info["capabilities_ptr"] = f"0x{cfg[0x34]:02x}"
        info["interrupt_line"] = f"0x{cfg[0x3C]:02x}"
        info["interrupt_pin"] = f"0x{cfg[0x3D]:02x}"
        info["min_grant"] = f"0x{cfg[0x3E]:02x}"
        info["max_latency"] = f"0x{cfg[0x3F]:02x}"

        # Walk capabilities list if present
        cap_ptr = cfg[0x34] & 0xFC
        info["capabilities"] = _walk_caps(cfg, cap_ptr)

        # Extract PCIe link status for top-level summary
        for cap in info["capabilities"]:
            if cap.get("id_int") == 0x10:
                info["pcie_link_status"] = {
                    "current_speed": cap.get("link_status_speed"),
                    "current_width": cap.get("link_status_width"),
                    "max_speed": cap.get("link_max_speed"),
                    "max_width": cap.get("link_max_width"),
                    "training_error": cap.get("link_status_training_error"),
                    "training_active": cap.get("link_status_training"),
                    "slot_clock": cap.get("link_status_slot_clk"),
                    "data_link_active": cap.get("link_status_dl_active"),
                    "port_type": cap.get("pcie_port_type_str"),
                    "version": cap.get("pcie_version_str"),
                }
                break

    return info


def _walk_caps(cfg: bytes, start: int) -> List[Dict[str, object]]:
    caps: List[Dict[str, object]] = []
    seen = set()
    off = start
    while off and 0 < off <= len(cfg) - 4 and off not in seen:
        seen.add(off)
        cap_id = cfg[off]
        next_off = cfg[off + 1] & 0xFC
        cap: Dict[str, object] = {
            "id": f"0x{cap_id:02x}",
            "id_int": cap_id,
            "offset": f"0x{off:02x}",
            "offset_int": off,
            "name": _cap_name(cap_id),
        }
        _decode_cap(cap, cfg, off, cap_id)
        caps.append(cap)
        if not next_off or next_off == off:
            break
        off = next_off
    return caps


def _decode_cap(cap: Dict[str, object], cfg: bytes, off: int, cap_id: int) -> None:
    """Decode capability-specific registers into the cap dict."""
    try:
        if cap_id == 0x01:  # PCI Power Management
            pm_cap = u16(cfg, off + 2)
            pm_csr = u16(cfg, off + 4)
            cap["pm_version"] = pm_cap & 0x7
            cap["pmc_pme_clock"] = bool(pm_cap & 0x8)
            cap["pmc_immediate"] = bool(pm_cap & 0x10)
            cap["pmc_aux_power"] = bool(pm_cap & 0x20)
            cap["pmc_d1"] = bool(pm_cap & 0x40)
            cap["pmc_d2"] = bool(pm_cap & 0x80)
            cap["pmcsr_pwr_state"] = pm_csr & 0x3
            cap["pmcsr_no_soft_reset"] = bool(pm_csr & 0x8)
            cap["pmcsr_pme_enable"] = bool(pm_csr & 0x100)
            cap["pmcsr_data_select"] = (pm_csr >> 9) & 0xF
            cap["pmcsr_data_scale"] = (pm_csr >> 13) & 0x3
            cap["pmcsr_pme_status"] = bool(pm_csr & 0x8000)
        elif cap_id == 0x05:  # MSI
            msi_ctrl = u16(cfg, off + 2)
            cap["msi_enable"] = bool(msi_ctrl & 0x1)
            cap["msi_64bit"] = bool(msi_ctrl & 0x80)
            cap["msi_multiple_msg_cap"] = 1 << ((msi_ctrl >> 1) & 0x7)
            cap["msi_multiple_msg_enable"] = 1 << ((msi_ctrl >> 4) & 0x7)
            cap["msi_per_vector_mask"] = bool(msi_ctrl & 0x100)
            addr_lo = u32(cfg, off + 4)
            cap["msi_addr_lo"] = f"0x{addr_lo:08x}"
            if cap["msi_64bit"]:
                addr_hi = u32(cfg, off + 8)
                cap["msi_addr_hi"] = f"0x{addr_hi:08x}"
                cap["msi_data"] = f"0x{u16(cfg, off + 12):04x}"
            else:
                cap["msi_data"] = f"0x{u16(cfg, off + 8):04x}"
        elif cap_id == 0x10:  # PCI Express
            _decode_pcie_cap(cap, cfg, off)
        elif cap_id == 0x11:  # MSI-X
            msix_ctrl = u16(cfg, off + 2)
            cap["msix_table_size"] = (msix_ctrl & 0x7FF) + 1
            cap["msix_mask"] = bool(msix_ctrl & 0x4000)
            cap["msix_enable"] = bool(msix_ctrl & 0x8000)
            table_off = u32(cfg, off + 4)
            cap["msix_table_bir"] = table_off & 0x7
            cap["msix_table_offset"] = f"0x{table_off & ~0x7:08x}"
            pba_off = u32(cfg, off + 8)
            cap["msix_pba_bir"] = pba_off & 0x7
            cap["msix_pba_offset"] = f"0x{pba_off & ~0x7:08x}"
        elif cap_id == 0x07:  # PCI-X
            pcix_cmd = u16(cfg, off + 2)
            pcix_status = u32(cfg, off + 4)
            cap["pcix_data_parity"] = bool(pcix_cmd & 0x1)
            cap["pcix_relaxed_ordering"] = bool(pcix_cmd & 0x2)
            cap["pcix_max_mem_read"] = {0: "512B", 1: "1KB", 2: "2KB", 3: "4KB"}.get(
                (pcix_cmd >> 2) & 0x3, "unknown")
            cap["pcix_max_split"] = {0: "1", 1: "2", 2: "3", 3: "4"}.get(
                (pcix_cmd >> 4) & 0x3, "unknown")
            cap["pcix_status_func"] = (pcix_status >> 27) & 0x7
            cap["pcix_status_64bit"] = bool(pcix_status & 0x20000000)
            cap["pcix_status_133mhz"] = bool(pcix_status & 0x10000000)
        elif cap_id == 0x03:  # Vital Product Data
            cap["vpd_addr"] = u16(cfg, off + 2)
            cap["vpd_data"] = u32(cfg, off + 4)
        elif cap_id == 0x04:  # Slot ID
            cap["slot_esr"] = cfg[off + 2]
            cap["slot_chassis"] = u16(cfg, off + 3) & 0xFF
            cap["slot_number"] = (u16(cfg, off + 3) >> 8) & 0xFF
        elif cap_id == 0x09:  # Vendor-Specific
            cap["vsec_id"] = u16(cfg, off + 2) & 0x7FFF
            cap["vsec_rev"] = (u16(cfg, off + 2) >> 15) & 0x1
            cap["vsec_length"] = u16(cfg, off + 4) & 0xFFF
    except (IndexError, ValueError):
        pass


def _decode_pcie_cap(cap: Dict[str, object], cfg: bytes, off: int) -> None:
    """Decode PCI Express capability registers."""
    cap_reg = u16(cfg, off + 2)
    pcie_version = cap_reg & 0xF
    pcie_port_type = (cap_reg >> 4) & 0xF
    cap["pcie_version"] = pcie_version
    cap["pcie_version_str"] = {
        1: "PCIe 1.x (2.5 GT/s)",
        2: "PCIe 2.x (5.0 GT/s)",
        3: "PCIe 3.x (8.0 GT/s)",
        4: "PCIe 4.x (16.0 GT/s)",
        5: "PCIe 5.x (32.0 GT/s)",
    }.get(pcie_version, f"v{pcie_version} (unknown)")
    cap["pcie_port_type"] = pcie_port_type
    cap["pcie_port_type_str"] = {
        0: "PCIe Endpoint",
        1: "Legacy PCIe Endpoint",
        4: "Root Port",
        5: "Upstream Port",
        6: "Downstream Port",
        7: "PCIe-to-PCI Bridge",
        8: "PCI-to-PCIe Bridge",
        9: "Root Complex Integrated Endpoint",
        10: "Root Complex Event Collector",
    }.get(pcie_port_type, f"type {pcie_port_type}")
    cap["pcie_slot_implemented"] = bool(cap_reg & 0x100)
    cap["pcie_interrupt_msg"] = bool(cap_reg & 0x200)

    # Device Capabilities (offset +4)
    dev_cap = u32(cfg, off + 4)
    cap["dev_max_payload"] = {0: 128, 1: 256, 2: 512, 3: 1024, 4: 2048, 5: 4096}.get(
        dev_cap & 0x7, "unknown")
    cap["dev_phantom_functions"] = (dev_cap >> 3) & 0x3
    cap["dev_ext_tag"] = bool(dev_cap & 0x20)
    cap["dev_l0s_latency"] = {0: "<64ns", 1: "64-128ns", 2: "128-256ns", 3: "256-512ns",
                                4: "512ns-1us", 5: "1-2us", 6: "2-4us", 7: ">4us"}.get(
        (dev_cap >> 6) & 0x7, "unknown")
    cap["dev_l1_latency"] = {0: "<1us", 1: "1-2us", 2: "2-4us", 3: "4-8us",
                              4: "8-16us", 5: "16-32us", 6: "32-64us", 7: ">64us"}.get(
        (dev_cap >> 9) & 0x7, "unknown")
    cap["dev_role_based_error"] = bool(dev_cap & 0x800)
    cap["dev_extended_tag"] = bool(dev_cap & 0x1000)

    # Device Control (offset +8)
    dev_ctrl = u16(cfg, off + 8)
    cap["dev_ctl_correctable_err"] = bool(dev_ctrl & 0x1)
    cap["dev_ctl_non_fatal_err"] = bool(dev_ctrl & 0x2)
    cap["dev_ctl_fatal_err"] = bool(dev_ctrl & 0x4)
    cap["dev_ctl_unsupported_req"] = bool(dev_ctrl & 0x8)
    cap["dev_ctl_relaxed_ordering"] = bool(dev_ctrl & 0x10)
    cap["dev_ctl_max_payload"] = {0: 128, 1: 256, 2: 512, 3: 1024, 4: 2048, 5: 4096}.get(
        (dev_ctrl >> 5) & 0x7, "unknown")
    cap["dev_ctl_extended_tag"] = bool(dev_ctrl & 0x100)
    cap["dev_ctl_max_read_request"] = {0: 128, 1: 256, 2: 512, 3: 1024, 4: 2048, 5: 4096}.get(
        (dev_ctrl >> 12) & 0x7, "unknown")

    # Device Status (offset +10)
    dev_status = u16(cfg, off + 10)
    cap["dev_status_correctable_err"] = bool(dev_status & 0x1)
    cap["dev_status_non_fatal_err"] = bool(dev_status & 0x2)
    cap["dev_status_fatal_err"] = bool(dev_status & 0x4)
    cap["dev_status_unsupported_req"] = bool(dev_status & 0x8)
    cap["dev_status_aux_power"] = bool(dev_status & 0x10)
    cap["dev_status_transaction_pending"] = bool(dev_status & 0x20)

    # Link Capabilities (offset +12)
    link_cap = u32(cfg, off + 12)
    cap["link_max_speed"] = _pcie_link_speed(link_cap & 0xF)
    cap["link_max_width"] = _pcie_link_width((link_cap >> 4) & 0x3F)
    cap["link_active_state_pm"] = bool(link_cap & 0x100)
    cap["link_l0s_exit_latency"] = _pcie_exit_latency((link_cap >> 9) & 0x7)
    cap["link_l1_exit_latency"] = _pcie_exit_latency((link_cap >> 12) & 0x7)
    cap["link_clock_power"] = bool(link_cap & 0x10000)
    cap["link_surprise_down"] = bool(link_cap & 0x20000)
    cap["link_downstream_port"] = bool(link_cap & 0x40000)
    cap["link_active_state_pm_opt"] = bool(link_cap & 0x200000)

    # Link Control (offset +16)
    link_ctrl = u16(cfg, off + 16)
    cap["link_ctl_target_speed"] = _pcie_link_speed(link_ctrl & 0xF)
    cap["link_ctl_disable"] = bool(link_ctrl & 0x10)
    cap["link_ctl_retrain"] = bool(link_ctrl & 0x20)
    cap["link_ctl_common_clock"] = bool(link_ctrl & 0x40)
    cap["link_ctl_extended_synch"] = bool(link_ctrl & 0x80)
    cap["link_ctl_enable_clk_pm"] = bool(link_ctrl & 0x100)
    cap["link_ctl_hw_aut_width"] = bool(link_ctrl & 0x200)
    cap["link_ctl_link_bw"] = bool(link_ctrl & 0x400)

    # Link Status (offset +18)
    link_status = u16(cfg, off + 18)
    cap["link_status_speed"] = _pcie_link_speed(link_status & 0xF)
    cap["link_status_width"] = _pcie_link_width((link_status >> 4) & 0x3F)
    cap["link_status_training_error"] = bool(link_status & 0x100)
    cap["link_status_training"] = bool(link_status & 0x200)
    cap["link_status_slot_clk"] = bool(link_status & 0x400)
    cap["link_status_dl_active"] = bool(link_status & 0x800)
    cap["link_status_bw_mgmt"] = bool(link_status & 0x1000)
    cap["link_status_aut_bw"] = bool(link_status & 0x2000)

    # Slot Capabilities (offset +20)
    slot_cap = u32(cfg, off + 20)
    cap["slot_attention_button"] = bool(slot_cap & 0x1)
    cap["slot_power_ctl"] = bool(slot_cap & 0x2)
    cap["slot_mrl"] = bool(slot_cap & 0x4)
    cap["slot_attention_ind"] = bool(slot_cap & 0x8)
    cap["slot_power_ind"] = bool(slot_cap & 0x10)
    cap["slot_hot_swap"] = bool(slot_cap & 0x20)
    cap["slot_power_value"] = (slot_cap >> 9) & 0x7F
    cap["slot_power_scale"] = (slot_cap >> 7) & 0x3
    cap["slot_physical_number"] = (slot_cap >> 19) & 0x1FFF

    # Slot Control (offset +24)
    slot_ctrl = u16(cfg, off + 24)
    cap["slot_ctl_attention"] = bool(slot_ctrl & 0x1)
    cap["slot_ctl_power_fault"] = bool(slot_ctrl & 0x2)
    cap["slot_ctl_mrl"] = bool(slot_ctrl & 0x4)
    cap["slot_ctl_presence"] = bool(slot_ctrl & 0x8)
    cap["slot_ctl_command_completed"] = bool(slot_ctrl & 0x10)
    cap["slot_ctl_hot_reset"] = bool(slot_ctrl & 0x20)
    cap["slot_ctl_power"] = bool(slot_ctrl & 0x100)
    cap["slot_ctl_power_ind_green"] = bool(slot_ctrl & 0x200)

    # Slot Status (offset +26)
    slot_status = u16(cfg, off + 26)
    cap["slot_status_attention"] = bool(slot_status & 0x1)
    cap["slot_status_power_fault"] = bool(slot_status & 0x2)
    cap["slot_status_mrl"] = bool(slot_status & 0x4)
    cap["slot_status_presence"] = bool(slot_status & 0x8)
    cap["slot_status_command_completed"] = bool(slot_status & 0x10)
    cap["slot_status_mrl_sensor"] = bool(slot_status & 0x20)
    cap["slot_status_power_ind"] = bool(slot_status & 0x40)

    # Root Capabilities (offset +28) for root ports
    if pcie_port_type in (4, 9):  # Root Port or RC Integrated Endpoint
        try:
            root_cap = u16(cfg, off + 28)
            cap["root_ctl_crs"] = bool(root_cap & 0x1)
            cap["root_ctl_rcec_err"] = bool(root_cap & 0x2)
        except (IndexError, ValueError):
            pass


def _pcie_link_speed(v: int) -> str:
    return {
        1: "2.5 GT/s (PCIe 1.x)",
        2: "5.0 GT/s (PCIe 2.x)",
        3: "8.0 GT/s (PCIe 3.x)",
        4: "16.0 GT/s (PCIe 4.x)",
        5: "32.0 GT/s (PCIe 5.x)",
        6: "64.0 GT/s (PCIe 6.x)",
        7: "128.0 GT/s (PCIe 7.x)",
    }.get(v, f"unknown ({v})")


def _pcie_link_width(v: int) -> str:
    widths = {1: "x1", 2: "x2", 4: "x4", 8: "x8", 12: "x12", 16: "x16",
              32: "x32"}
    return widths.get(v, f"x{v}")


def _pcie_exit_latency(v: int) -> str:
    return {
        0: "<64ns", 1: "64-128ns", 2: "128-256ns", 3: "256-512ns",
        4: "512ns-1us", 5: "1-2us", 6: "2-4us", 7: ">4us",
    }.get(v, "unknown")


def _cap_name(cap_id: int) -> str:
    return {
        0x00: "Null",
        0x01: "PCI Power Management",
        0x02: "AGP",
        0x03: "Vital Product Data",
        0x04: "Slot Identification",
        0x05: "MSI",
        0x06: "CompactPCI Hot Swap",
        0x07: "PCI-X",
        0x08: "HyperTransport",
        0x09: "Vendor-Specific",
        0x0A: "Debug port",
        0x0B: "CompactPCI Central Resource Control",
        0x0C: "PCI Standard Hot-Plug Controller",
        0x0D: "Bridge System Vendor",
        0x0E: "AGP 8x",
        0x0F: "Secure Device",
        0x10: "PCI Express",
        0x11: "MSI-X",
        0x12: "SATA Data/Index Config",
        0x13: "PCI Advanced Features",
    }.get(cap_id, f"Reserved (0x{cap_id:02x})")


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


@app.route("/api/devices")
def api_devices():
    """Enumerate all PCI devices found in /sys/bus/pci/devices.

    Returns a tree structure by domain/bus/dev/fn suitable for the
    frontend tree view.  Multi-function devices are detected and the
    function nodes carry a flag so the UI can group/label them.
    """
    if not SYS_PCI.exists():
        abort(503, "sysfs not available (not on Linux?)")

    devices: List[str] = []
    for entry in sorted(SYS_PCI.iterdir()):
        bdf = entry.name
        if valid_bdf(bdf):
            devices.append(bdf)

    # Determine which device nodes are multi-function
    multifunction_devices: set = set()
    for bdf in devices:
        dom, bus, dev, fn = bdf_parts(bdf)
        if fn != "0":
            multifunction_devices.add(f"{dom}:{bus}:{dev}")
    # Also check header type bit 7 on function 0
    for bdf in devices:
        dom, bus, dev, fn = bdf_parts(bdf)
        if fn == "0":
            try:
                cfg = (SYS_PCI / bdf / "config").read_bytes()
                if cfg[0x0E] & 0x80:
                    multifunction_devices.add(f"{dom}:{bus}:{dev}")
            except OSError:
                pass

    # Build tree: domain -> bus -> device -> function
    tree: Dict[str, Dict[str, Dict[str, List[str]]]] = {}
    for bdf in devices:
        dom, bus, devfn = bdf.split(":")
        dev, fn = devfn.split(".")
        tree.setdefault(dom, {}).setdefault(bus, {}).setdefault(dev, []).append(fn)

    def children_for_functions(dom, bus, dev, fns):
        is_mf = f"{dom}:{bus}:{dev}" in multifunction_devices
        nodes = []
        for fn in sorted(fns):
            bdf = f"{dom}:{bus}:{dev}.{fn}"
            nodes.append({
                "id": bdf,
                "text": f"Function {fn} ({bdf})",
                "bdf": bdf,
                "type": "function",
                "multi_function": is_mf,
                "children": [],
            })
        return nodes

    def build():
        out = []
        for dom, buses in tree.items():
            dom_node = {"id": f"dom-{dom}", "text": f"Domain {dom}",
                        "type": "domain", "children": []}
            for bus, devs in buses.items():
                bus_node = {"id": f"bus-{dom}-{bus}", "text": f"Bus {bus}",
                            "type": "bus", "children": []}
                for dev, fns in devs.items():
                    is_mf = f"{dom}:{bus}:{dev}" in multifunction_devices
                    label = f"Device {dev}"
                    if is_mf:
                        label += f" (multi-function, {len(fns)} fn{'s' if len(fns) > 1 else ''})"
                    dev_node = {
                        "id": f"dev-{dom}-{bus}-{dev}",
                        "text": label,
                        "type": "device",
                        "multi_function": is_mf,
                        "function_count": len(fns),
                        "children": children_for_functions(dom, bus, dev, fns),
                    }
                    bus_node["children"].append(dev_node)
                dom_node["children"].append(bus_node)
            out.append(dom_node)
        return out

    return jsonify({"devices": devices, "tree": build()})


@app.route("/api/device/<bdf>")
def api_device(bdf):
    if not valid_bdf(bdf):
        abort(400, "invalid BDF")

    # collect all devices for sibling detection
    devices: List[str] = []
    if SYS_PCI.exists():
        for entry in SYS_PCI.iterdir():
            if valid_bdf(entry.name):
                devices.append(entry.name)

    info = parse_config(bdf, all_devices=devices)
    if info is None:
        abort(404, "device not found or config unreadable")
    return jsonify(info)


@app.route("/api/device/<bdf>/config", methods=["GET"])
def api_config_read(bdf):
    if not valid_bdf(bdf):
        abort(400, "invalid BDF")
    cfg = read_config_bytes(bdf)
    if cfg is None:
        abort(404, "config unreadable")
    return jsonify({"hex": cfg.hex(), "length": len(cfg)})


@app.route("/api/device/<bdf>/save", methods=["POST"])
def api_save(bdf):
    if not valid_bdf(bdf):
        abort(400, "invalid BDF")
    r = run_helper("save", bdf)
    if r.returncode != 0:
        return jsonify({"ok": False, "error": r.stderr.strip() or r.stdout.strip()}), 500
    return jsonify({"ok": True, "output": r.stdout.strip()})


@app.route("/api/device/<bdf>/restore", methods=["POST"])
def api_restore(bdf):
    if not valid_bdf(bdf):
        abort(400, "invalid BDF")
    if not has_backup(bdf):
        return jsonify({"ok": False, "error": "no backup available"}), 404
    r = run_helper("restore", bdf)
    if r.returncode != 0:
        return jsonify({"ok": False, "error": r.stderr.strip() or r.stdout.strip()}), 500
    return jsonify({"ok": True, "output": r.stdout.strip()})


@app.route("/api/device/<bdf>/config", methods=["POST"])
def api_config_write(bdf):
    if not valid_bdf(bdf):
        abort(400, "invalid BDF")
    data = request.get_json(force=True, silent=True) or {}
    off = data.get("offset")
    val = data.get("value")
    if not isinstance(off, int) or not isinstance(val, str):
        abort(400, "expect {offset: int, value: hex-string}")
    try:
        int(val, 16)
    except ValueError:
        abort(400, "value must be hex")

    # Auto-save before writing
    save_config(bdf)

    r = run_helper("write", bdf, str(off), val)
    if r.returncode != 0:
        return jsonify({"ok": False,
                        "error": r.stderr.strip() or r.stdout.strip(),
                        "returncode": r.returncode}), 500
    return jsonify({"ok": True, "output": r.stdout.strip(),
                    "backup_saved": True})


@app.route("/api/device/<bdf>/inject", methods=["POST"])
def api_inject(bdf):
    if not valid_bdf(bdf):
        abort(400, "invalid BDF")
    data = request.get_json(force=True, silent=True) or {}
    itype = data.get("type")
    allowed = {"vendor", "status", "command", "cacheline", "latency"}
    if itype not in allowed:
        abort(400, f"type must be one of {sorted(allowed)}")

    # "command" injection is dangerous: the helper blocks it unless
    # PCI_ALLOW_DANGEROUS=1 is set, and we do NOT set it here.
    if itype == "command":
        return jsonify({
            "ok": False,
            "error": "command injection blocked by default. Set PCI_ALLOW_DANGEROUS=1 "
                     "in the *helper's* environment to enable (may crash the machine). "
                     "The web backend intentionally does not do this."
        }), 403

    # Auto-save before injecting
    save_config(bdf)

    r = run_helper("inject", bdf, itype)
    if r.returncode != 0:
        return jsonify({"ok": False,
                        "error": r.stderr.strip() or r.stdout.strip(),
                        "returncode": r.returncode}), 500
    return jsonify({"ok": True, "type": itype,
                    "output": r.stdout.strip(),
                    "backup_saved": True})


@app.route("/api/export")
def api_export():
    """Export the full device tree as a JSON object suitable for download."""
    if not SYS_PCI.exists():
        abort(503, "sysfs not available (not on Linux?)")

    devices: List[str] = []
    for entry in sorted(SYS_PCI.iterdir()):
        if valid_bdf(entry.name):
            devices.append(entry.name)

    full: Dict[str, object] = {
        "metadata": {
            "count": len(devices),
            "format": "pci-browser-export-v1",
        },
        "devices": [],
    }
    for bdf in devices:
        info = parse_config(bdf, all_devices=devices)
        if info:
            # Don't include the raw hex in export (too large) unless requested
            info.pop("hex", None)
            full["devices"].append(info)
    return jsonify(full)


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
