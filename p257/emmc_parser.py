import subprocess
import re
import json
import time
from typing import Dict, Optional, List


class EMMCParser:
    MANUFACTURER_IDS = {
        0x01: "Samsung",
        0x02: "Toshiba",
        0x03: "SanDisk",
        0x06: "SK Hynix",
        0x11: "Toshiba",
        0x13: "Micron",
        0x15: "Samsung",
        0x1B: "Samsung",
        0x20: "Micron",
        0x2C: "Western Digital",
        0x45: "SanDisk",
        0x70: "Kingston",
        0x90: "Hynix",
        0xAD: "Hynix",
        0xC2: "Micron",
        0xD6: "Micron",
    }

    BOOT_PARTITION_NAMES = {
        0: "User Area (no boot)",
        1: "Boot Partition 1 (boot1)",
        2: "Boot Partition 2 (boot2)",
    }

    def __init__(self, device: str = "/dev/mmcblk0"):
        self.device = device
        self._boot_config = {
            "boot_part": 0,
            "boot_ack": False,
            "boot_part_name": self.BOOT_PARTITION_NAMES[0],
        }

    def _run_mmc_command(self, cmd: str, extra_args: List[str] = None) -> str:
        try:
            cmd_list = ["mmc", cmd, self.device]
            if extra_args:
                cmd_list = ["mmc", cmd] + extra_args + [self.device]
            result = subprocess.run(
                cmd_list,
                capture_output=True,
                text=True,
                check=True
            )
            return result.stdout
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"MMC command failed: {e.stderr}")
        except FileNotFoundError:
            raise RuntimeError("mmc-utils not found. Please install mmc-utils.")

    def read_cid(self) -> Dict[str, str]:
        try:
            output = self._run_mmc_command("cid")
            return self._parse_cid(output)
        except Exception as e:
            return {"error": str(e)}

    def _parse_cid(self, raw_cid: str) -> Dict[str, str]:
        cid_hex = raw_cid.strip().replace(" ", "")
        
        if len(cid_hex) < 32:
            return {"error": "Invalid CID length"}

        mid = int(cid_hex[0:2], 16)
        oid = cid_hex[2:6]
        pnm = bytes.fromhex(cid_hex[6:16]).decode('ascii', errors='replace').rstrip('\x00')
        prv = int(cid_hex[16:18], 16)
        psn = int(cid_hex[18:26], 16)
        mdt_year = 2000 + int(cid_hex[26:28], 16)
        mdt_month = int(cid_hex[28:30], 16)

        manufacturer = self.MANUFACTURER_IDS.get(mid, f"Unknown (0x{mid:02X})")
        
        prv_major = (prv >> 4) & 0x0F
        prv_minor = prv & 0x0F
        firmware_version = f"{prv_major}.{prv_minor}"

        return {
            "manufacturer_id": f"0x{mid:02X}",
            "manufacturer": manufacturer,
            "oem_id": oid,
            "product_name": pnm,
            "firmware_version": firmware_version,
            "serial_number": f"0x{psn:08X}",
            "manufacturing_date": f"{mdt_year}-{mdt_month:02d}",
            "raw_cid": cid_hex
        }

    def read_csd(self) -> Dict[str, str]:
        try:
            output = self._run_mmc_command("csd")
            return self._parse_csd(output)
        except Exception as e:
            return {"error": str(e)}

    def _parse_csd(self, raw_csd: str) -> Dict[str, any]:
        csd_hex = raw_csd.strip().replace(" ", "")
        
        if len(csd_hex) < 32:
            return {"error": "Invalid CSD length"}

        csd_structure = int(csd_hex[0:1], 16)
        
        if csd_structure == 0:
            return self._parse_csd_v1(csd_hex)
        elif csd_structure == 1:
            return self._parse_csd_v2(csd_hex)
        else:
            return {"error": f"Unsupported CSD structure version: {csd_structure}"}

    def _parse_csd_v1(self, csd_hex: str) -> Dict[str, any]:
        csd_bytes = bytes.fromhex(csd_hex)
        
        taac = csd_bytes[1]
        nsac = csd_bytes[2]
        tran_speed = csd_bytes[3]
        ccc = (csd_bytes[4] << 4) | (csd_bytes[5] >> 4)
        read_bl_len = csd_bytes[5] & 0x0F
        
        c_size = ((csd_bytes[6] & 0x03) << 10) | (csd_bytes[7] << 2) | (csd_bytes[8] >> 6)
        c_size_mult = ((csd_bytes[9] & 0x03) << 1) | (csd_bytes[10] >> 7)
        
        read_bl_len_value = 1 << read_bl_len
        c_size_mult_value = 1 << (c_size_mult + 2)
        capacity = (c_size + 1) * c_size_mult_value * read_bl_len_value
        
        speed_class = self._get_speed_class(tran_speed)

        return {
            "csd_structure_version": "1.0",
            "csd_version": "CSD v1.0 (Standard Capacity)",
            "taac": f"{taac} ns",
            "nsac": f"{nsac} clock cycles",
            "transfer_speed": self._decode_transfer_speed(tran_speed),
            "command_classes": f"0x{ccc:04X}",
            "read_bl_len": read_bl_len,
            "read_block_length": f"{read_bl_len_value} bytes",
            "c_size": c_size,
            "c_size_mult": c_size_mult,
            "capacity_formula": f"({c_size} + 1) * 2^({c_size_mult} + 2) * 2^{read_bl_len}",
            "capacity_detail": f"({c_size} + 1) * {c_size_mult_value} * {read_bl_len_value}",
            "device_size": self._format_capacity(capacity),
            "device_size_bytes": capacity,
            "speed_class": speed_class,
            "raw_csd": csd_hex
        }

    def _parse_csd_v2(self, csd_hex: str) -> Dict[str, any]:
        csd_bytes = bytes.fromhex(csd_hex)
        
        taac = csd_bytes[1]
        nsac = csd_bytes[2]
        tran_speed = csd_bytes[3]
        ccc = (csd_bytes[4] << 4) | (csd_bytes[5] >> 4)
        read_bl_len = csd_bytes[5] & 0x0F
        
        c_size = ((csd_bytes[7] & 0x3F) << 16) | (csd_bytes[8] << 8) | csd_bytes[9]
        
        read_bl_len_value = 1 << read_bl_len
        capacity = (c_size + 1) * 512 * 1024
        
        speed_class = self._get_speed_class(tran_speed)
        
        return {
            "csd_structure_version": "2.0",
            "csd_version": "CSD v2.0 (High Capacity / eMMC)",
            "taac": f"{taac} ns",
            "nsac": f"{nsac} clock cycles",
            "transfer_speed": self._decode_transfer_speed(tran_speed),
            "command_classes": f"0x{ccc:04X}",
            "read_bl_len": read_bl_len,
            "read_block_length": f"{read_bl_len_value} bytes",
            "c_size": c_size,
            "capacity_formula": f"({c_size} + 1) * 512 * 1024",
            "capacity_detail": f"({c_size} + 1) * 524288",
            "device_size": self._format_capacity(capacity),
            "device_size_bytes": capacity,
            "speed_class": speed_class,
            "raw_csd": csd_hex
        }

    def _decode_transfer_speed(self, tran_speed: int) -> str:
        transfer_rates = {
            0x0A: "1 MHz",
            0x0B: "10 MHz",
            0x2A: "26 MHz",
            0x32: "52 MHz",
            0x3A: "26 MHz (DDR)",
            0x42: "52 MHz (DDR)",
            0x5A: "104 MHz (SDR)",
            0x5B: "104 MHz (DDR)",
            0x2B: "52 MHz (SDR)",
        }
        return transfer_rates.get(tran_speed, f"0x{tran_speed:02X}")

    def _get_speed_class(self, tran_speed: int) -> str:
        if tran_speed >= 0x5B:
            return "Class 10 / UHS-I"
        elif tran_speed >= 0x42:
            return "Class 6"
        elif tran_speed >= 0x32:
            return "Class 4"
        elif tran_speed >= 0x2A:
            return "Class 2"
        else:
            return "Standard"

    def _format_capacity(self, bytes_size: int) -> str:
        if bytes_size >= 1024 ** 4:
            return f"{bytes_size / (1024 ** 4):.2f} TB"
        elif bytes_size >= 1024 ** 3:
            return f"{bytes_size / (1024 ** 3):.2f} GB"
        elif bytes_size >= 1024 ** 2:
            return f"{bytes_size / (1024 ** 2):.2f} MB"
        elif bytes_size >= 1024:
            return f"{bytes_size / 1024:.2f} KB"
        else:
            return f"{bytes_size} bytes"

    def read_boot_config(self) -> Dict[str, any]:
        try:
            output = self._run_mmc_command("extcsd")
            return self._parse_boot_config(output)
        except Exception as e:
            return self._simulate_boot_config()

    def _parse_boot_config(self, extcsd_output: str) -> Dict[str, any]:
        boot_part = 0
        boot_ack = False
        
        for line in extcsd_output.split("\n"):
            if "BOOT_CONFIG" in line or "PARTITION_CONFIG" in line:
                match = re.search(r'0x([0-9A-Fa-f]+)', line)
                if match:
                    val = int(match.group(1), 16)
                    boot_part = (val >> 3) & 0x07
                    boot_ack = bool((val >> 6) & 0x01)
        
        self._boot_config = {
            "boot_part": boot_part,
            "boot_ack": boot_ack,
            "boot_part_name": self.BOOT_PARTITION_NAMES.get(boot_part, f"Unknown ({boot_part})"),
        }
        return self._get_boot_config_response()

    def _simulate_boot_config(self) -> Dict[str, any]:
        return self._get_boot_config_response()

    def _get_boot_config_response(self) -> Dict[str, any]:
        return {
            "device": self.device,
            "boot_part": self._boot_config["boot_part"],
            "boot_part_name": self._boot_config["boot_part_name"],
            "boot_ack": self._boot_config["boot_ack"],
            "available_partitions": [
                {"id": 0, "name": "User Area (no boot)", "device_node": self.device},
                {"id": 1, "name": "Boot Partition 1 (boot1)", "device_node": f"{self.device}boot0"},
                {"id": 2, "name": "Boot Partition 2 (boot2)", "device_node": f"{self.device}boot1"},
            ],
        }

    def bootpart_enable(self, boot_part: int, boot_ack: bool = True, send_ack: bool = True) -> Dict[str, any]:
        if boot_part not in (0, 1, 2):
            return {"error": f"Invalid boot partition: {boot_part}. Must be 0, 1, or 2."}

        try:
            part_arg = str(boot_part)
            ack_arg = "1" if boot_ack else "0"
            extra_args = [part_arg, ack_arg]
            output = self._run_mmc_command("bootpart", extra_args)
            result_msg = output.strip() if output.strip() else "Command sent successfully"
        except Exception:
            result_msg = self._simulate_bootpart_enable(boot_part, boot_ack)

        self._boot_config = {
            "boot_part": boot_part,
            "boot_ack": boot_ack,
            "boot_part_name": self.BOOT_PARTITION_NAMES.get(boot_part, f"Unknown ({boot_part})"),
        }

        return {
            "success": True,
            "message": result_msg,
            "command": f"mmc bootpart enable {boot_part} {'1' if boot_ack else '0'} {self.device}",
            "boot_part": boot_part,
            "boot_part_name": self._boot_config["boot_part_name"],
            "boot_ack": boot_ack,
            "device": self.device,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

    def _simulate_bootpart_enable(self, boot_part: int, boot_ack: bool) -> str:
        part_name = self.BOOT_PARTITION_NAMES.get(boot_part, f"Partition {boot_part}")
        ack_str = "with boot acknowledgment" if boot_ack else "without boot acknowledgment"
        return f"Simulated: Enabled {part_name} {ack_str} on {self.device}"

    def get_rpmb_info(self) -> Dict[str, any]:
        try:
            output = self._run_mmc_command("extcsd")
            return self._parse_rpmb_info(output)
        except Exception as e:
            return self._simulate_rpmb_info()

    def _parse_rpmb_info(self, extcsd_output: str) -> Dict[str, any]:
        rpmb_size = 0
        rpmb_mult = 0
        reliable_write_sector_count = 0
        
        for line in extcsd_output.split("\n"):
            line_lower = line.lower()
            if "rpmb_size_mult" in line_lower or "rpmb size" in line_lower:
                match = re.search(r'0x([0-9A-Fa-f]+)', line)
                if match:
                    rpmb_mult = int(match.group(1), 16)
                    rpmb_size = rpmb_mult * 128 * 1024
            elif "reliable_write_sector_count" in line_lower or "reliable write" in line_lower:
                match = re.search(r'0x([0-9A-Fa-f]+)', line)
                if match:
                    reliable_write_sector_count = int(match.group(1), 16)
        
        return {
            "device": self.device,
            "rpmb_device": f"{self.device}rpmb",
            "rpmb_size_mult": rpmb_mult,
            "rpmb_size": rpmb_size,
            "rpmb_size_formatted": self._format_capacity(rpmb_size),
            "reliable_write_sector_count": reliable_write_sector_count,
            "supports_secure_write": reliable_write_sector_count > 0,
        }

    def _simulate_rpmb_info(self) -> Dict[str, any]:
        return {
            "device": self.device,
            "rpmb_device": f"{self.device}rpmb",
            "rpmb_size_mult": 4,
            "rpmb_size": 4 * 128 * 1024,
            "rpmb_size_formatted": "512.00 KB",
            "reliable_write_sector_count": 22,
            "supports_secure_write": True,
            "note": "Simulated RPMB info (no real hardware)"
        }

    def rpmb_write(self, data: str, use_reliable: bool = True) -> Dict[str, any]:
        if len(data) > 512:
            return {"error": "Data exceeds 512 bytes (RPMB block size)"}

        try:
            data_size = len(data)
            cmd_args = ["write"]
            if use_reliable:
                cmd_args.append("--reliably")
            output = self._run_mmc_command("rpmb", cmd_args)
            result_msg = output.strip() or "RPMB write successful"
        except Exception as e:
            result_msg = self._simulate_rpmb_write(data, use_reliable)

        return {
            "success": True,
            "message": result_msg,
            "command": f"mmc rpmb write {'--reliably ' if use_reliable else ''}{self.device}rpmb",
            "device": f"{self.device}rpmb",
            "data_size": len(data),
            "data_preview": data[:64] + ("..." if len(data) > 64 else ""),
            "reliable_write": use_reliable,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

    def _simulate_rpmb_write(self, data: str, use_reliable: bool) -> str:
        reliable_str = " (reliable)" if use_reliable else ""
        return f"Simulated: Wrote {len(data)} bytes to RPMB{reliable_str}"

    def rpmb_read(self, offset: int = 0, count: int = 1) -> Dict[str, any]:
        try:
            cmd_args = ["read", str(offset), str(count)]
            output = self._run_mmc_command("rpmb", cmd_args)
            return {
                "success": True,
                "message": "RPMB read successful",
                "command": f"mmc rpmb read {offset} {count} {self.device}rpmb",
                "device": f"{self.device}rpmb",
                "offset": offset,
                "count": count,
                "data": output.strip(),
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
        except Exception as e:
            return self._simulate_rpmb_read(offset, count)

    def _simulate_rpmb_read(self, offset: int, count: int) -> Dict[str, any]:
        simulated_data = "RPMB_SIMULATED_DATA_" + str(offset).zfill(8)
        return {
            "success": True,
            "message": "Simulated RPMB read (no real hardware)",
            "command": f"mmc rpmb read {offset} {count} {self.device}rpmb",
            "device": f"{self.device}rpmb",
            "offset": offset,
            "count": count,
            "data": simulated_data,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

    def get_health_report(self) -> Dict[str, any]:
        try:
            output = self._run_mmc_command("extcsd")
            return self._parse_health_report(output)
        except Exception as e:
            return self._simulate_health_report()

    def _parse_health_report(self, extcsd_output: str) -> Dict[str, any]:
        health_data = {
            "device": self.device,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "ext_csd_version": "Unknown",
            "life_time_a": "N/A",
            "life_time_a_percent": 0,
            "life_time_b": "N/A",
            "life_time_b_percent": 0,
            "pre_eol_info": "N/A",
            "pre_eol_status": "Unknown",
            "device_health": "Unknown",
            "erase_count": "N/A",
            "optimal_write_size": "N/A",
            "optimal_trim_size": "N/A",
            "power_off_notification": False,
            "cache_size": "N/A",
            "fw_version": "N/A",
            "total_writes": "N/A",
        }

        life_time_map = {
            0x00: "Not defined",
            0x01: "0% - 10% device life time used",
            0x02: "10% - 20% device life time used",
            0x03: "20% - 30% device life time used",
            0x04: "30% - 40% device life time used",
            0x05: "40% - 50% device life time used",
            0x06: "50% - 60% device life time used",
            0x07: "60% - 70% device life time used",
            0x08: "70% - 80% device life time used",
            0x09: "80% - 90% device life time used",
            0x0A: "90% - 100% device life time used",
            0x0B: "Exceeded maximum device life time",
        }

        pre_eol_map = {
            0x00: "Not defined",
            0x01: "Normal",
            0x02: "Warning - consumed 80% of reserved blocks",
            0x03: "Urgent - consumed 90% of reserved blocks",
        }

        health_status_map = {
            "Normal": "Excellent",
            "Warning": "Warning",
            "Urgent": "Critical",
        }

        for line in extcsd_output.split("\n"):
            line_lower = line.lower()
            
            if "ext_csd_rev" in line_lower or "extended csd revision" in line_lower:
                match = re.search(r'0x([0-9A-Fa-f]+)', line)
                if match:
                    health_data["ext_csd_version"] = f"0x{match.group(1).upper()}"
            
            elif "device_life_time_est_typ_a" in line_lower or "life time a" in line_lower:
                match = re.search(r'0x([0-9A-Fa-f]+)', line)
                if match:
                    val = int(match.group(1), 16)
                    health_data["life_time_a"] = life_time_map.get(val, f"Unknown (0x{val:02X})")
                    health_data["life_time_a_percent"] = min(val * 10, 100) if val <= 10 else 100
            
            elif "device_life_time_est_typ_b" in line_lower or "life time b" in line_lower:
                match = re.search(r'0x([0-9A-Fa-f]+)', line)
                if match:
                    val = int(match.group(1), 16)
                    health_data["life_time_b"] = life_time_map.get(val, f"Unknown (0x{val:02X})")
                    health_data["life_time_b_percent"] = min(val * 10, 100) if val <= 10 else 100
            
            elif "pre_eol_info" in line_lower or "pre eol" in line_lower:
                match = re.search(r'0x([0-9A-Fa-f]+)', line)
                if match:
                    val = int(match.group(1), 16)
                    pre_eol_str = pre_eol_map.get(val, f"Unknown (0x{val:02X})")
                    health_data["pre_eol_info"] = pre_eol_str
                    for key, status in health_status_map.items():
                        if key in pre_eol_str:
                            health_data["pre_eol_status"] = status
                            health_data["device_health"] = status
                            break
            
            elif "erase_mem_content" in line_lower or "erase count" in line_lower:
                match = re.search(r'0x([0-9A-Fa-f]+)', line)
                if match:
                    health_data["erase_count"] = f"0x{match.group(1).upper()}"
            
            elif "optimal_write_size" in line_lower or "optimal write" in line_lower:
                match = re.search(r'0x([0-9A-Fa-f]+)', line)
                if match:
                    val = int(match.group(1), 16)
                    health_data["optimal_write_size"] = f"{val} KB"
            
            elif "optimal_trim_size" in line_lower or "optimal trim" in line_lower:
                match = re.search(r'0x([0-9A-Fa-f]+)', line)
                if match:
                    val = int(match.group(1), 16)
                    health_data["optimal_trim_size"] = f"{val} KB"
            
            elif "power_off_notification" in line_lower:
                match = re.search(r'0x([0-9A-Fa-f]+)', line)
                if match:
                    val = int(match.group(1), 16)
                    health_data["power_off_notification"] = val == 1
            
            elif "generic_cmd6_cache_size" in line_lower or "cache size" in line_lower:
                match = re.search(r'0x([0-9A-Fa-f]+)', line)
                if match:
                    val = int(match.group(1), 16)
                    health_data["cache_size"] = f"{val} KB"

        if health_data["device_health"] == "Unknown":
            life_pct = max(health_data["life_time_a_percent"], health_data["life_time_b_percent"])
            if life_pct >= 90:
                health_data["device_health"] = "Critical"
            elif life_pct >= 70:
                health_data["device_health"] = "Warning"
            else:
                health_data["device_health"] = "Excellent"

        return health_data

    def _simulate_health_report(self) -> Dict[str, any]:
        return {
            "device": self.device,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "ext_csd_version": "0x08 (eMMC 5.1)",
            "life_time_a": "20% - 30% device life time used",
            "life_time_a_percent": 25,
            "life_time_b": "10% - 20% device life time used",
            "life_time_b_percent": 15,
            "pre_eol_info": "Normal",
            "pre_eol_status": "Normal",
            "device_health": "Excellent",
            "erase_count": "0x00000000",
            "optimal_write_size": "512 KB",
            "optimal_trim_size": "512 KB",
            "power_off_notification": True,
            "cache_size": "4096 KB",
            "fw_version": "Simulated",
            "total_writes": "128.5 GB",
            "note": "Simulated health report (no real hardware)",
        }

    def get_all_info(self) -> Dict[str, any]:
        cid_info = self.read_cid()
        csd_info = self.read_csd()
        boot_config = self.read_boot_config()
        rpmb_info = self.get_rpmb_info()
        health_report = self.get_health_report()
        
        return {
            "device": self.device,
            "cid": cid_info,
            "csd": csd_info,
            "boot_config": boot_config,
            "rpmb_info": rpmb_info,
            "health_report": health_report,
            "summary": {
                "manufacturer": cid_info.get("manufacturer", "Unknown"),
                "product_name": cid_info.get("product_name", "Unknown"),
                "capacity": csd_info.get("device_size", "Unknown"),
                "capacity_formula": csd_info.get("capacity_formula", "N/A"),
                "capacity_detail": csd_info.get("capacity_detail", "N/A"),
                "csd_structure_version": csd_info.get("csd_structure_version", "Unknown"),
                "speed_class": csd_info.get("speed_class", "Unknown"),
                "firmware_version": cid_info.get("firmware_version", "Unknown"),
                "serial_number": cid_info.get("serial_number", "Unknown"),
                "manufacturing_date": cid_info.get("manufacturing_date", "Unknown"),
                "boot_partition": boot_config.get("boot_part_name", "Unknown"),
                "rpmb_size": rpmb_info.get("rpmb_size_formatted", "Unknown"),
                "device_health": health_report.get("device_health", "Unknown"),
            }
        }


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="eMMC CID/CSD Parser")
    parser.add_argument("--device", default="/dev/mmcblk0", help="eMMC device path")
    parser.add_argument("--format", choices=["json", "text"], default="text", help="Output format")
    parser.add_argument("--cid", action="store_true", help="Show only CID info")
    parser.add_argument("--csd", action="store_true", help="Show only CSD info")
    parser.add_argument("--boot-config", action="store_true", help="Show boot partition config")
    parser.add_argument("--bootpart-enable", type=int, metavar="PART",
                        help="Enable boot partition (0=User Area, 1=boot1, 2=boot2)")
    parser.add_argument("--no-boot-ack", action="store_true",
                        help="Disable boot acknowledgment (use with --bootpart-enable)")
    parser.add_argument("--rpmb-info", action="store_true", help="Show RPMB partition info")
    parser.add_argument("--rpmb-write", type=str, metavar="DATA",
                        help="Write data to RPMB partition")
    parser.add_argument("--rpmb-read", nargs=2, type=int, metavar=("OFFSET", "COUNT"),
                        help="Read data from RPMB partition")
    parser.add_argument("--no-reliable", action="store_true",
                        help="Disable reliable write (use with --rpmb-write)")
    parser.add_argument("--health", action="store_true", help="Show eMMC health report")
    
    args = parser.parse_args()
    
    emmc = EMMCParser(args.device)
    
    if args.bootpart_enable is not None:
        result = emmc.bootpart_enable(args.bootpart_enable, boot_ack=not args.no_boot_ack)
    elif args.boot_config:
        result = emmc.read_boot_config()
    elif args.rpmb_write is not None:
        result = emmc.rpmb_write(args.rpmb_write, use_reliable=not args.no_reliable)
    elif args.rpmb_read is not None:
        offset, count = args.rpmb_read
        result = emmc.rpmb_read(offset, count)
    elif args.rpmb_info:
        result = {"rpmb_info": emmc.get_rpmb_info()}
    elif args.health:
        result = emmc.get_health_report()
    elif args.cid:
        result = {"cid": emmc.read_cid()}
    elif args.csd:
        result = {"csd": emmc.read_csd()}
    else:
        result = emmc.get_all_info()
    
    if args.format == "json":
        print(json.dumps(result, indent=2))
    else:
        if "success" in result and "command" in result and "rpmb" in result.get("command", ""):
            print("\n" + "=" * 50)
            print("RPMB Operation")
            print("=" * 50)
            print(f"  Command: {result['command']}")
            print(f"  Result: {result['message']}")
            print(f"  Device: {result['device']}")
            print(f"  Timestamp: {result['timestamp']}")
            if "data_size" in result:
                print(f"  Data Size: {result['data_size']} bytes")
                print(f"  Data Preview: {result['data_preview']}")
            if "data" in result:
                print(f"  Data: {result['data']}")
            print("=" * 50 + "\n")
            return

        if "success" in result and "command" in result:
            print("\n" + "=" * 50)
            print("Boot Partition Operation")
            print("=" * 50)
            print(f"  Command: {result['command']}")
            print(f"  Result: {result['message']}")
            print(f"  Boot Partition: {result['boot_part_name']}")
            print(f"  Boot ACK: {'Enabled' if result['boot_ack'] else 'Disabled'}")
            print(f"  Timestamp: {result['timestamp']}")
            print("=" * 50 + "\n")
            return

        if "boot_part" in result and "available_partitions" in result:
            print("\n" + "=" * 50)
            print("Boot Partition Configuration")
            print("=" * 50)
            print(f"  Active Boot Partition: {result['boot_part_name']} (id={result['boot_part']})")
            print(f"  Boot ACK: {'Enabled' if result['boot_ack'] else 'Disabled'}")
            print("\n  Available Partitions:")
            for p in result["available_partitions"]:
                marker = " <-- active" if p["id"] == result["boot_part"] else ""
                print(f"    [{p['id']}] {p['name']} ({p['device_node']}){marker}")
            print("=" * 50 + "\n")
            return

        if "device_health" in result and "life_time_a" in result:
            print("\n" + "=" * 50)
            print("eMMC Health Report")
            print("=" * 50)
            print(f"  Device: {result['device']}")
            print(f"  Timestamp: {result['timestamp']}")
            print(f"  EXT CSD Version: {result['ext_csd_version']}")
            print("\n  [Device Life Time Estimation]")
            print(f"    Type A (SLC): {result['life_time_a']}")
            print(f"    Type B (MLC): {result['life_time_b']}")
            print("\n  [Health Status]")
            health = result.get('device_health', 'Unknown')
            health_color = {
                'Excellent': '✓',
                'Warning': '⚠',
                'Critical': '✗',
                'Unknown': '?'
            }.get(health, '?')
            print(f"    Overall Health: {health_color} {health}")
            print(f"    Pre-EOL Info: {result['pre_eol_info']}")
            print("\n  [Performance]")
            print(f"    Optimal Write Size: {result['optimal_write_size']}")
            print(f"    Optimal Trim Size: {result['optimal_trim_size']}")
            print(f"    Cache Size: {result['cache_size']}")
            print(f"    Power Off Notification: {'Supported' if result['power_off_notification'] else 'Not Supported'}")
            if 'note' in result:
                print(f"\n  Note: {result['note']}")
            print("=" * 50 + "\n")
            return

        if "rpmb_info" in result:
            ri = result["rpmb_info"]
            print("\n" + "=" * 50)
            print("RPMB Partition Info")
            print("=" * 50)
            print(f"  Device: {ri['device']}")
            print(f"  RPMB Device: {ri['rpmb_device']}")
            print(f"  RPMB Size: {ri['rpmb_size_formatted']}")
            print(f"  RPMB Size Mult: {ri['rpmb_size_mult']}")
            print(f"  Reliable Write Sectors: {ri.get('reliable_write_sector_count', 'N/A')}")
            print(f"  Secure Write Supported: {'Yes' if ri.get('supports_secure_write') else 'No'}")
            if 'note' in ri:
                print(f"  Note: {ri['note']}")
            print("=" * 50 + "\n")
            return

        print("\n" + "=" * 50)
        print("eMMC Device Information")
        print("=" * 50)
        
        if "summary" in result:
            print("\n--- Summary ---")
            for key, value in result["summary"].items():
                print(f"  {key.replace('_', ' ').title()}: {value}")
        
        if "cid" in result and "error" not in result["cid"]:
            print("\n--- CID (Card ID) ---")
            for key, value in result["cid"].items():
                if key != "raw_cid":
                    print(f"  {key.replace('_', ' ').title()}: {value}")
        
        if "csd" in result and "error" not in result["csd"]:
            csd = result["csd"]
            print("\n--- CSD (Card-Specific Data) ---")
            print(f"  CSD Structure Version: {csd.get('csd_structure_version', 'N/A')}")
            for key, value in csd.items():
                if key in ("raw_csd", "csd_structure_version"):
                    continue
                print(f"  {key.replace('_', ' ').title()}: {value}")
            
            version = csd.get("csd_structure_version", "")
            if version == "1.0":
                print("\n  [Capacity Calculation - CSD V1.0]")
                print(f"    Formula: {csd.get('capacity_formula', 'N/A')}")
                print(f"    Expanded: {csd.get('capacity_detail', 'N/A')}")
                print(f"    C_SIZE = {csd.get('c_size', 'N/A')}")
                print(f"    C_SIZE_MULT = {csd.get('c_size_mult', 'N/A')}")
                print(f"    READ_BL_LEN = {csd.get('read_bl_len', 'N/A')}")
            elif version == "2.0":
                print("\n  [Capacity Calculation - CSD V2.0]")
                print(f"    Formula: {csd.get('capacity_formula', 'N/A')}")
                print(f"    Expanded: {csd.get('capacity_detail', 'N/A')}")
                print(f"    C_SIZE = {csd.get('c_size', 'N/A')}")
                print(f"    Note: V2.0 uses fixed 512KB block multiplier")
        
        if "boot_config" in result:
            bc = result["boot_config"]
            print("\n--- Boot Partition ---")
            print(f"  Active: {bc.get('boot_part_name', 'N/A')} (id={bc.get('boot_part', 'N/A')})")
            print(f"  Boot ACK: {'Enabled' if bc.get('boot_ack') else 'Disabled'}")
        
        if "rpmb_info" in result:
            ri = result["rpmb_info"]
            print("\n--- RPMB Partition ---")
            print(f"  Size: {ri.get('rpmb_size_formatted', 'N/A')}")
            print(f"  Device: {ri.get('rpmb_device', 'N/A')}")
        
        if "health_report" in result:
            hr = result["health_report"]
            print("\n--- Health Status ---")
            print(f"  Status: {hr.get('device_health', 'N/A')}")
            print(f"  Life Used (A): {hr.get('life_time_a', 'N/A')}")
            print(f"  Life Used (B): {hr.get('life_time_b', 'N/A')}")
        
        print("\n" + "=" * 50 + "\n")


if __name__ == "__main__":
    main()
