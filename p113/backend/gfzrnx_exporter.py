import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional
from datetime import datetime
import io


class GfzRnxExporter:
    def __init__(
        self,
        obs_data=None,
        nav_data=None,
        quality_metrics: Dict = None,
        ionosphere_results: Dict = None,
        displacement_results: Dict = None,
        receiver_pos: Tuple[float, float, float] = None,
    ):
        self.obs_data = obs_data
        self.nav_data = nav_data
        self.quality_metrics = quality_metrics or {}
        self.ionosphere_results = ionosphere_results or {}
        self.displacement_results = displacement_results or {}
        self.receiver_pos = receiver_pos

    def export_quality_report(self, format_type: str = "gfzrnx") -> str:
        """
        导出质量报告，支持多种格式
        - gfzrnx: GFZ RNX质量报告格式
        - csv: CSV格式
        - json: JSON格式
        """
        if format_type == "gfzrnx":
            return self._export_gfzrnx_format()
        elif format_type == "csv":
            return self._export_csv_format()
        else:
            return self._export_gfzrnx_format()

    def _export_gfzrnx_format(self) -> str:
        """
        导出GFZ RNX风格的质量报告格式
        参考gfzrnx工具的输出格式
        """
        output = []

        output.extend(self._write_header())
        output.extend(self._write_summary())
        output.extend(self._write_satellite_statistics())
        output.extend(self._write_observation_statistics())
        output.extend(self._write_multipath_statistics())
        output.extend(self._write_snr_statistics())
        output.extend(self._write_cycle_slip_statistics())
        output.extend(self._write_ionosphere_statistics())

        if self.displacement_results:
            output.extend(self._write_displacement_statistics())

        output.extend(self._write_end())

        return "\n".join(output)

    def _write_header(self) -> List[str]:
        """写入文件头"""
        lines = []

        header = self.obs_data.header if self.obs_data else {}
        marker_name = header.get("marker_name", "UNKNOWN")
        observer = header.get("observer", "UNKNOWN")
        agency = header.get("agency", "UNKNOWN")
        receiver = header.get("receiver", "UNKNOWN")
        antenna = header.get("antenna", "UNKNOWN")

        start_time = (
            str(pd.Timestamp(self.obs_data.time.values[0]))[:26]
            if self.obs_data is not None
            else "UNKNOWN"
        )
        end_time = (
            str(pd.Timestamp(self.obs_data.time.values[-1]))[:26]
            if self.obs_data is not None
            else "UNKNOWN"
        )

        lines.append("=" * 100)
        lines.append("GFZ RNX QUALITY REPORT")
        lines.append("=" * 100)
        lines.append(f"FILE TYPE           : Quality Report")
        lines.append(f"MARKER NAME         : {marker_name:<40s}")
        lines.append(f"OBSERVER            : {observer:<40s}")
        lines.append(f"AGENCY              : {agency:<40s}")
        lines.append(f"RECEIVER TYPE       : {str(receiver)[:40]:<40s}")
        lines.append(f"ANTENNA TYPE        : {str(antenna)[:40]:<40s}")
        if self.receiver_pos:
            lines.append(
                f"APPROX POSITION XYZ : {self.receiver_pos[0]:12.3f} {self.receiver_pos[1]:12.3f} {self.receiver_pos[2]:12.3f}"
            )
        lines.append(f"TIME OF FIRST OBS   : {start_time}")
        lines.append(f"TIME OF LAST OBS    : {end_time}")
        lines.append(f"PROCESSING SOFTWARE : GNSS Quality Analysis System v2.0")
        lines.append(f"PROCESSING TIME     : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append("-" * 100)
        lines.append("")

        return lines

    def _write_summary(self) -> List[str]:
        """写入摘要信息"""
        lines = []
        lines.append("")
        lines.append("+" + "-" * 98 + "+")
        lines.append("|" + " " * 30 + "SUMMARY STATISTICS" + " " * 48 + "|")
        lines.append("+" + "-" * 98 + "+")

        satellites = list(self.quality_metrics.keys()) if self.quality_metrics else []

        total_epochs = len(self.obs_data.time) if self.obs_data else 0
        avg_availability = (
            np.mean([m.get("data_availability", 0) for m in self.quality_metrics.values()])
            if self.quality_metrics
            else 0
        )

        all_mp = [
            m.get("multipath", {}).get("avg_multipath", 0) for m in self.quality_metrics.values()
        ]
        all_snr = [m.get("snr", {}).get("avg_snr", 0) for m in self.quality_metrics.values()]
        all_cs = [
            m.get("cycle_slips", {}).get("cycle_slip_count", 0)
            for m in self.quality_metrics.values()
        ]

        lines.append(f"|  {'Number of Satellites':<30s}: {len(satellites):>5d}" + " " * 55 + "|")
        lines.append(f"|  {'Total Epochs':<30s}: {total_epochs:>5d}" + " " * 55 + "|")
        lines.append(f"|  {'Average Data Availability':<30s}: {avg_availability*100:>5.1f} %" + " " * 52 + "|")
        lines.append(f"|  {'Average Multipath':<30s}: {np.mean(all_mp):>6.3f} m" + " " * 51 + "|")
        lines.append(f"|  {'Average SNR':<30s}: {np.mean(all_snr):>6.1f} dBHz" + " " * 50 + "|")
        lines.append(f"|  {'Total Cycle Slips':<30s}: {sum(all_cs):>5d}" + " " * 55 + "|")

        if self.ionosphere_results and "overall" in self.ionosphere_results:
            overall = self.ionosphere_results["overall"]
            lines.append(
                f"|  {'Average Ionospheric Delay':<30s}: {overall.get('avg_delay', 0):>6.3f} m"
                + " " * 51
                + "|"
            )
            lines.append(
                f"|  {'Ionosphere Activity':<30s}: {overall.get('activity_level', 'unknown').upper():>10s}"
                + " " * 48
                + "|"
            )

        if self.displacement_results and "stats" in self.displacement_results:
            stats = self.displacement_results["stats"]
            lines.append(
                f"|  {'Site Stability':<30s}: {stats.get('stability_classification', 'unknown').upper():>10s}"
                + " " * 48
                + "|"
            )
            lines.append(
                f"|  {'Max 3D Displacement':<30s}: {stats.get('max_displacement_3d_m', 0):>6.3f} m"
                + " " * 51
                + "|"
            )

        overall_score = self._calculate_overall_score()
        score_text = self._get_score_text(overall_score)
        lines.append(f"|  {'Overall Quality Score':<30s}: {overall_score:>5.1f} / 100 ({score_text})" + " " * 33 + "|")
        lines.append("+" + "-" * 98 + "+")
        lines.append("")

        return lines

    def _write_satellite_statistics(self) -> List[str]:
        """写入卫星统计信息"""
        lines = []
        if not self.quality_metrics:
            return lines

        lines.append("")
        lines.append("+" + "-" * 98 + "+")
        lines.append("|" + " " * 30 + "SATELLITE STATISTICS" + " " * 47 + "|")
        lines.append("+" + "-" * 98 + "+")

        header = (
            f"| {'SAT':<5s} {'SYSTEM':<8s} {'EPOCHS':>7s} {'AVAIL':>7s} "
            f"{'MP1':>8s} {'MP2':>8s} {'SNR1':>7s} {'SNR2':>7s} "
            f"{'CS':>4s} {'SCORE':>7s} |"
        )
        lines.append(header)
        lines.append("+" + "-" * 98 + "+")

        systems = {"G": "GPS", "R": "GLONASS", "E": "Galileo", "C": "BeiDou", "J": "QZSS", "I": "IRNSS"}

        for sat in sorted(self.quality_metrics.keys()):
            metrics = self.quality_metrics[sat]
            system = systems.get(sat[0], "OTHER")

            mp = metrics.get("multipath", {})
            snr = metrics.get("snr", {})
            cs = metrics.get("cycle_slips", {})

            availability = metrics.get("data_availability", 0) * 100
            score = self._calculate_satellite_score(metrics)

            line = (
                f"| {sat:<5s} {system:<8s} "
                f"{int(availability * len(self.obs_data.time) / 100):>7d} "
                f"{availability:>6.1f}% "
                f"{mp.get('avg_mp1', 0):>8.3f} "
                f"{mp.get('avg_mp2', 0):>8.3f} "
                f"{snr.get('avg_snr1', 0):>7.1f} "
                f"{snr.get('avg_snr2', 0):>7.1f} "
                f"{cs.get('cycle_slip_count', 0):>4d} "
                f"{score:>6.1f} |"
            )
            lines.append(line)

        lines.append("+" + "-" * 98 + "+")
        lines.append("")

        return lines

    def _write_observation_statistics(self) -> List[str]:
        """写入观测类型统计"""
        lines = []
        if self.obs_data is None:
            return lines

        lines.append("")
        lines.append("+" + "-" * 98 + "+")
        lines.append("|" + " " * 30 + "OBSERVATION TYPE STATISTICS" + " " * 36 + "|")
        lines.append("+" + "-" * 98 + "+")

        try:
            obs_types = self.obs_data.data_vars
            header = f"| {'OBS TYPE':<12s} {'DESCRIPTION':<25s} {'MEAN':>12s} {'STD':>12s} {'MIN':>12s} {'MAX':>12s} |"
            lines.append(header)
            lines.append("+" + "-" * 98 + "+")

            descriptions = {
                "C1": "Pseudorange L1",
                "C2": "Pseudorange L2",
                "P1": "Pseudorange L1 (P)",
                "P2": "Pseudorange L2 (P)",
                "L1": "Carrier Phase L1",
                "L2": "Carrier Phase L2",
                "D1": "Doppler L1",
                "D2": "Doppler L2",
                "S1": "SNR L1",
                "S2": "SNR L2",
            }

            units = {
                "C1": "m",
                "C2": "m",
                "P1": "m",
                "P2": "m",
                "L1": "cycle",
                "L2": "cycle",
                "D1": "Hz",
                "D2": "Hz",
                "S1": "dBHz",
                "S2": "dBHz",
            }

            for obs_type in sorted(obs_types):
                try:
                    data = self.obs_data[obs_type].values.flatten()
                    data = data[~np.isnan(data)]

                    if len(data) == 0:
                        continue

                    desc = descriptions.get(obs_type, obs_type)
                    unit = units.get(obs_type, "")
                    mean_val = np.mean(data)
                    std_val = np.std(data)
                    min_val = np.min(data)
                    max_val = np.max(data)

                    line = (
                        f"| {obs_type:<12s} {desc:<25s} "
                        f"{mean_val:>12.3f} "
                        f"{std_val:>12.3f} "
                        f"{min_val:>12.3f} "
                        f"{max_val:>12.3f} |"
                    )
                    lines.append(line)
                except:
                    continue

        except Exception as e:
            lines.append(f"| Error getting observation statistics: {str(e)}")

        lines.append("+" + "-" * 98 + "+")
        lines.append("")

        return lines

    def _write_multipath_statistics(self) -> List[str]:
        """写入多路径误差统计"""
        lines = []
        if not self.quality_metrics:
            return lines

        lines.append("")
        lines.append("+" + "-" * 98 + "+")
        lines.append("|" + " " * 30 + "MULTIPATH ERROR STATISTICS" + " " * 37 + "|")
        lines.append("+" + "-" * 98 + "+")
        lines.append(f"|  NOTE: Multipath values are elevation-corrected for low elevation satellites" + " " * 21 + "|")
        lines.append("+" + "-" * 98 + "+")

        header = f"| {'SAT':<5s} {'MP1_MEAN':>10s} {'MP1_RMS':>10s} {'MP1_MAX':>10s} {'MP2_MEAN':>10s} {'MP2_RMS':>10s} {'MP2_MAX':>10s} {'CORRECTED':>10s} |"
        lines.append(header)
        lines.append("+" + "-" * 98 + "+")

        for sat in sorted(self.quality_metrics.keys()):
            mp = self.quality_metrics[sat].get("multipath", {})

            line = (
                f"| {sat:<5s} "
                f"{mp.get('avg_mp1', 0):>10.3f} "
                f"{np.sqrt(np.mean(np.square(mp.get('mp1_series', [0])))):>10.3f} "
                f"{mp.get('max_mp1', 0):>10.3f} "
                f"{mp.get('avg_mp2', 0):>10.3f} "
                f"{np.sqrt(np.mean(np.square(mp.get('mp2_series', [0])))):>10.3f} "
                f"{mp.get('max_mp2', 0):>10.3f} "
                f"{'YES' if mp.get('elevation_corrected', False) else 'NO':>10s} |"
            )
            lines.append(line)

        lines.append("+" + "-" * 98 + "+")
        lines.append("")

        return lines

    def _write_snr_statistics(self) -> List[str]:
        """写入信噪比统计"""
        lines = []
        if not self.quality_metrics:
            return lines

        lines.append("")
        lines.append("+" + "-" * 98 + "+")
        lines.append("|" + " " * 30 + "SIGNAL TO NOISE RATIO (SNR) STATISTICS" + " " * 27 + "|")
        lines.append("+" + "-" * 98 + "+")

        header = f"| {'SAT':<5s} {'SNR1_MEAN':>10s} {'SNR1_MIN':>10s} {'SNR1_MAX':>10s} {'SNR2_MEAN':>10s} {'SNR2_MIN':>10s} {'SNR2_MAX':>10s} {'QUALITY':>12s} |"
        lines.append(header)
        lines.append("+" + "-" * 98 + "+")

        for sat in sorted(self.quality_metrics.keys()):
            snr = self.quality_metrics[sat].get("snr", {})
            avg_snr = snr.get("avg_snr", 0)

            if avg_snr >= 45:
                quality = "EXCELLENT"
            elif avg_snr >= 40:
                quality = "GOOD"
            elif avg_snr >= 35:
                quality = "MODERATE"
            elif avg_snr >= 30:
                quality = "FAIR"
            else:
                quality = "POOR"

            line = (
                f"| {sat:<5s} "
                f"{snr.get('avg_snr1', 0):>10.1f} "
                f"{snr.get('min_snr1', 0):>10.1f} "
                f"{np.max(snr.get('snr1_series', [0])):>10.1f} "
                f"{snr.get('avg_snr2', 0):>10.1f} "
                f"{snr.get('min_snr2', 0):>10.1f} "
                f"{np.max(snr.get('snr2_series', [0])):>10.1f} "
                f"{quality:>12s} |"
            )
            lines.append(line)

        lines.append("+" + "-" * 98 + "+")
        lines.append("")

        return lines

    def _write_cycle_slip_statistics(self) -> List[str]:
        """写入周跳检测统计"""
        lines = []
        if not self.quality_metrics:
            return lines

        lines.append("")
        lines.append("+" + "-" * 98 + "+")
        lines.append("|" + " " * 30 + "CYCLE SLIP DETECTION STATISTICS" + " " * 32 + "|")
        lines.append("+" + "-" * 98 + "+")
        lines.append(f"|  METHOD: Multi-method fusion (GF + Phase-Code + Doppler + Polynomial)" + " " * 32 + "|")
        lines.append(f"|  NOTE: Enhanced sensitivity to small cycle slips (< 1 cycle)" + " " * 36 + "|")
        lines.append("+" + "-" * 98 + "+")

        header = f"| {'SAT':<5s} {'TOTAL_CS':>9s} {'GF':>6s} {'PC':>6s} {'DOP':>6s} {'POLY':>6s} {'RATE':>12s} {'SEVERITY':>12s} |"
        lines.append(header)
        lines.append("+" + "-" * 98 + "+")

        for sat in sorted(self.quality_metrics.keys()):
            cs = self.quality_metrics[sat].get("cycle_slips", {})
            methods = cs.get("detection_methods", {})

            total = cs.get("cycle_slip_count", 0)
            rate = total / max(len(self.obs_data.time), 1) * 100 if self.obs_data else 0

            if rate == 0:
                severity = "NONE"
            elif rate < 0.1:
                severity = "MINIMAL"
            elif rate < 1:
                severity = "LOW"
            elif rate < 5:
                severity = "MODERATE"
            else:
                severity = "HIGH"

            line = (
                f"| {sat:<5s} "
                f"{total:>9d} "
                f"{methods.get('geometry_free', 0):>6d} "
                f"{methods.get('phase_code', 0):>6d} "
                f"{methods.get('doppler', 0):>6d} "
                f"{methods.get('polynomial', 0):>6d} "
                f"{rate:>11.2f}% "
                f"{severity:>12s} |"
            )
            lines.append(line)

        lines.append("+" + "-" * 98 + "+")
        lines.append("")

        return lines

    def _write_ionosphere_statistics(self) -> List[str]:
        """写入电离层延迟统计"""
        lines = []
        if not self.ionosphere_results or "per_satellite" not in self.ionosphere_results:
            return lines

        per_sat = self.ionosphere_results["per_satellite"]

        lines.append("")
        lines.append("+" + "-" * 98 + "+")
        lines.append("|" + " " * 30 + "IONOSPHERIC DELAY STATISTICS" + " " * 34 + "|")
        lines.append("+" + "-" * 98 + "+")

        method = "dual_frequency"
        for sat in per_sat:
            if "ionospheric_delay" in per_sat[sat]:
                method = per_sat[sat]["ionospheric_delay"].get("method", method)
                break

        lines.append(f"|  METHOD: {method.upper():<86s} |")
        lines.append("+" + "-" * 98 + "+")

        header = f"| {'SAT':<5s} {'STEC_AVG':>10s} {'STEC_MAX':>10s} {'DELAY_AVG':>10s} {'DELAY_MAX':>10s} {'DELAY_STD':>10s} {'UNIT':>8s} {'METHOD':>12s} |"
        lines.append(header)
        lines.append("+" + "-" * 98 + "+")

        for sat in sorted(per_sat.keys()):
            iono = per_sat[sat].get("ionospheric_delay", {})
            stec = per_sat[sat].get("stec", {})

            line = (
                f"| {sat:<5s} "
                f"{stec.get('avg_stec', 0):>10.1f} "
                f"{stec.get('max_stec', 0):>10.1f} "
                f"{iono.get('avg_delay', 0):>10.3f} "
                f"{iono.get('max_delay', 0):>10.3f} "
                f"{iono.get('std_delay', 0):>10.3f} "
                f"{iono.get('unit', 'm'):>8s} "
                f"{iono.get('method', 'N/A'):>12s} |"
            )
            lines.append(line)

        lines.append("+" + "-" * 98 + "+")
        lines.append("")

        return lines

    def _write_displacement_statistics(self) -> List[str]:
        """写入站点位移统计"""
        lines = []
        if not self.displacement_results or "stats" not in self.displacement_results:
            return lines

        stats = self.displacement_results["stats"]

        lines.append("")
        lines.append("+" + "-" * 98 + "+")
        lines.append("|" + " " * 30 + "SITE DISPLACEMENT MONITORING" + " " * 33 + "|")
        lines.append("+" + "-" * 98 + "+")

        if "reference_position" in self.displacement_results:
            ref = self.displacement_results["reference_position"]
            lines.append(
                f"|  REFERENCE POSITION (XYZ): {ref['x_m']:>12.3f} {ref['y_m']:>12.3f} {ref['z_m']:>12.3f}  "
                + " " * 35
                + "|"
            )
        lines.append("+" + "-" * 98 + "+")

        header = f"| {'COMPONENT':<12s} {'MEAN':>10s} {'STD':>10s} {'MAX':>10s} {'MIN':>10s} {'UNIT':>8s} {'TYPE':>14s} |"
        lines.append(header)
        lines.append("+" + "-" * 98 + "+")

        components = [
            ("EAST", "mean_east_m", "std_east_m", "max_displacement_3d_m"),
            ("NORTH", "mean_north_m", "std_north_m", "max_displacement_3d_m"),
            ("UP", "mean_up_m", "std_up_m", "max_displacement_3d_m"),
        ]

        for name, mean_key, std_key, max_key in components:
            line = (
                f"| {name:<12s} "
                f"{stats.get(mean_key, 0):>10.3f} "
                f"{stats.get(std_key, 0):>10.3f} "
                f"{stats.get(max_key, 0):>10.3f} "
                f"{-stats.get(max_key, 0):>10.3f} "
                f"{'m':>8s} "
                f"{'ENU':>14s} |"
            )
            lines.append(line)

        line_3d = (
            f"| {'3D MAG':<12s} "
            f"{stats.get('mean_displacement_3d_m', 0):>10.3f} "
            f"{'N/A':>10s} "
            f"{stats.get('max_displacement_3d_m', 0):>10.3f} "
            f"{'N/A':>10s} "
            f"{'m':>8s} "
            f"{'DISPLACEMENT':>14s} |"
        )
        lines.append(line_3d)

        lines.append("+" + "-" * 98 + "+")

        lines.append(
            f"|  STABILITY CLASSIFICATION: {stats.get('stability_classification', 'unknown').upper():<20s}"
            + " " * 52
            + "|"
        )
        lines.append(
            f"|  MOVEMENT DETECTED: {'YES' if stats.get('movement_detected', False) else 'NO':<86s} |"
        )
        lines.append(
            f"|  AVERAGE HDOP: {stats.get('mean_hdop', 0):>6.2f}  AVERAGE VDOP: {stats.get('mean_vdop', 0):>6.2f}"
            + " " * 52
            + "|"
        )
        lines.append(
            f"|  AVERAGE SATELLITES: {stats.get('mean_num_sats', 0):>6.1f}" + " " * 73 + "|"
        )

        if "movement_events" in self.displacement_results and self.displacement_results["movement_events"]:
            events = self.displacement_results["movement_events"]
            lines.append("+" + "-" * 98 + "+")
            lines.append(f"|  DETECTED MOVEMENT EVENTS ({len(events)}):" + " " * 70 + "|")
            for i, event in enumerate(events[:5]):
                lines.append(
                    f"|    #{i+1}: {event['time'][:19]}  Delta: {event['incremental_displacement_m']:.3f}m  "
                    f"Cumulative: {event['cumulative_displacement_m']:.3f}m  {event['severity'].upper()}"
                    + " " * 10
                    + "|"
                )
            if len(events) > 5:
                lines.append(f"|    ... and {len(events) - 5} more events" + " " * 65 + "|")

        lines.append("+" + "-" * 98 + "+")
        lines.append("")

        return lines

    def _write_end(self) -> List[str]:
        """写入文件结束标记"""
        lines = []
        lines.append("")
        lines.append("=" * 100)
        lines.append("END OF GFZ RNX QUALITY REPORT")
        lines.append("=" * 100)
        lines.append("")
        return lines

    def _calculate_satellite_score(self, metrics: Dict) -> float:
        """计算卫星质量分数"""
        mp = metrics.get("multipath", {})
        snr = metrics.get("snr", {})
        cs = metrics.get("cycle_slips", {})

        mp_score = max(0, 100 - mp.get("avg_multipath", 0) * 25)
        snr_score = min(100, snr.get("avg_snr", 0) * 1.8)
        cs_score = max(0, 100 - cs.get("cycle_slip_count", 0) * 8)
        avail_score = metrics.get("data_availability", 0) * 100

        return 0.3 * mp_score + 0.3 * snr_score + 0.25 * cs_score + 0.15 * avail_score

    def _calculate_overall_score(self) -> float:
        """计算整体质量分数"""
        if not self.quality_metrics:
            return 0.0

        scores = [self._calculate_satellite_score(m) for m in self.quality_metrics.values()]
        return float(np.mean(scores)) if scores else 0.0

    def _get_score_text(self, score: float) -> str:
        """获取分数文字描述"""
        if score >= 90:
            return "EXCELLENT"
        elif score >= 80:
            return "GOOD"
        elif score >= 70:
            return "MODERATE"
        elif score >= 60:
            return "FAIR"
        else:
            return "POOR"

    def _export_csv_format(self) -> str:
        """导出CSV格式"""
        output = io.StringIO()

        output.write("Satellite Quality Metrics\n")
        output.write("SAT,AVAILABILITY(%),AVG_MP1(m),AVG_MP2(m),AVG_SNR1(dBHz),AVG_SNR2(dBHz),CYCLE_SLIPS,QUALITY_SCORE\n")

        for sat in sorted(self.quality_metrics.keys()):
            metrics = self.quality_metrics[sat]
            mp = metrics.get("multipath", {})
            snr = metrics.get("snr", {})
            cs = metrics.get("cycle_slips", {})
            availability = metrics.get("data_availability", 0) * 100
            score = self._calculate_satellite_score(metrics)

            output.write(
                f"{sat},{availability:.1f},{mp.get('avg_mp1', 0):.3f},{mp.get('avg_mp2', 0):.3f},"
                f"{snr.get('avg_snr1', 0):.1f},{snr.get('avg_snr2', 0):.1f},"
                f"{cs.get('cycle_slip_count', 0)},{score:.1f}\n"
            )

        output.write("\n")
        output.write("Ionospheric Delay\n")
        output.write("SAT,AVG_STEC(TECU),MAX_STEC(TECU),AVG_DELAY(m),MAX_DELAY(m),METHOD\n")

        if self.ionosphere_results and "per_satellite" in self.ionosphere_results:
            per_sat = self.ionosphere_results["per_satellite"]
            for sat in sorted(per_sat.keys()):
                iono = per_sat[sat].get("ionospheric_delay", {})
                stec = per_sat[sat].get("stec", {})
                output.write(
                    f"{sat},{stec.get('avg_stec', 0):.1f},{stec.get('max_stec', 0):.1f},"
                    f"{iono.get('avg_delay', 0):.3f},{iono.get('max_delay', 0):.3f},{iono.get('method', 'N/A')}\n"
                )

        return output.getvalue()

    def save_to_file(self, filepath: str, format_type: str = "gfzrnx") -> bool:
        """保存到文件"""
        try:
            content = self.export_quality_report(format_type)
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            return True
        except Exception as e:
            print(f"保存文件失败: {e}")
            return False
