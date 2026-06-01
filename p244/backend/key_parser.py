import base64
import re
from typing import Optional, Dict, Any, List
from collections import Counter


class OpenVPNKeyParser:
    BEGIN_MARKER = "-----BEGIN OpenVPN Static key V1-----"
    END_MARKER = "-----END OpenVPN Static key V1-----"

    @classmethod
    def parse_key_file(cls, file_content: str) -> Dict[str, Any]:
        lines = file_content.splitlines()
        filtered_lines = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith("#"):
                continue
            filtered_lines.append(stripped)

        content = "\n".join(filtered_lines)

        if cls.BEGIN_MARKER not in content or cls.END_MARKER not in content:
            raise ValueError("Invalid OpenVPN static key file format")

        match = re.search(
            f"{re.escape(cls.BEGIN_MARKER)}\\s*(.+?)\\s*{re.escape(cls.END_MARKER)}",
            content,
            re.DOTALL,
        )

        if not match:
            raise ValueError("Could not extract key data from file")

        base64_data = match.group(1).replace("\n", "").replace("\r", "").replace(" ", "")

        try:
            key_bytes = base64.b64decode(base64_data)
        except Exception as e:
            raise ValueError(f"Failed to decode base64 key data: {e}")

        key_info = cls._analyze_key(key_bytes)

        return {
            "key_format": "OpenVPN Static key V1",
            "key_size_bits": len(key_bytes) * 8,
            "key_size_bytes": len(key_bytes),
            "key_hex": key_bytes.hex(),
            "key_base64": base64_data,
            "key_analysis": key_info,
        }

    @classmethod
    def _analyze_key(cls, key_bytes: bytes) -> Dict[str, Any]:
        key_size = len(key_bytes)

        hmac_key = None
        cipher_key = None
        direction = None

        if key_size == 256:
            hmac_key = key_bytes[:64]
            cipher_key = key_bytes[64:128]
            direction = "bidirectional"
        elif key_size == 128:
            hmac_key = key_bytes[:64]
            cipher_key = key_bytes[64:]
            direction = "bidirectional"
        elif key_size == 64:
            hmac_key = key_bytes
            cipher_key = None
            direction = "hmac-only"

        return {
            "has_hmac_key": hmac_key is not None,
            "has_cipher_key": cipher_key is not None,
            "direction": direction,
            "hmac_key_hex": hmac_key.hex() if hmac_key else None,
            "cipher_key_hex": cipher_key.hex() if cipher_key else None,
            "hmac_key_size_bits": len(hmac_key) * 8 if hmac_key else 0,
            "cipher_key_size_bits": len(cipher_key) * 8 if cipher_key else 0,
        }

    @classmethod
    def generate_sample_key(cls) -> str:
        import os

        key_bytes = os.urandom(256)
        key_base64 = base64.b64encode(key_bytes).decode("ascii")

        lines = [cls.BEGIN_MARKER]
        for i in range(0, len(key_base64), 64):
            lines.append(key_base64[i : i + 64])
        lines.append(cls.END_MARKER)

        return "\n".join(lines)

    @classmethod
    def generate_key_health_report(cls, key_info: Dict[str, Any]) -> Dict[str, Any]:
        key_bytes = bytes.fromhex(key_info["key_hex"])
        analysis = key_info["key_analysis"]

        entropy_score = cls._calculate_entropy(key_bytes)
        randomness_tests = cls._run_randomness_tests(key_bytes)
        key_strength = cls._assess_key_strength(key_info, entropy_score, randomness_tests)

        issues = []
        warnings = []
        recommendations = []

        if analysis.get("hmac_key_size_bits", 0) < 256:
            issues.append("HMAC 密钥大小不足 256 位")
        if key_info["key_size_bytes"] not in [64, 128, 256]:
            warnings.append("密钥大小不符合标准 OpenVPN 静态密钥格式")
        if entropy_score < 7.5:
            issues.append("密钥熵值较低，可能存在弱密钥风险")
        if not randomness_tests["frequency_test_passed"]:
            issues.append("单比特频率测试失败，密钥随机性不足")
        if not randomness_tests["runs_test_passed"]:
            warnings.append("游程测试未通过，密钥可能存在模式")

        recommendations.append("建议使用 sha256 或更高强度的摘要算法")
        recommendations.append("定期轮换 tls-auth 密钥（建议每 90 天）")
        recommendations.append("确保密钥文件权限设置为 600（仅所有者可读）")
        if analysis.get("has_cipher_key"):
            recommendations.append("考虑使用 --tls-crypt 替代 --tls-auth 提供更完整的保护")

        overall_health = "healthy"
        if issues:
            overall_health = "critical"
        elif warnings:
            overall_health = "warning"

        return {
            "overall_health": overall_health,
            "health_score": cls._calculate_health_score(
                key_info, entropy_score, randomness_tests, len(issues), len(warnings)
            ),
            "entropy": {
                "score": entropy_score,
                "max_score": 8.0,
                "assessment": cls._assess_entropy(entropy_score),
            },
            "randomness_tests": randomness_tests,
            "key_size_assessment": cls._assess_key_size(key_info),
            "issues": issues,
            "warnings": warnings,
            "recommendations": recommendations,
            "byte_distribution": cls._get_byte_distribution(key_bytes),
            "summary": cls._generate_summary(key_info, overall_health),
        }

    @classmethod
    def _calculate_entropy(cls, data: bytes) -> float:
        return cls._shannon_entropy(data)

    @classmethod
    def _shannon_entropy(cls, data: bytes) -> float:
        import math

        if len(data) == 0:
            return 0.0
        counts = Counter(data)
        entropy = 0.0
        total = len(data)
        for count in counts.values():
            p = count / total
            entropy -= p * math.log2(p)
        return entropy

    @classmethod
    def _run_randomness_tests(cls, data: bytes) -> Dict[str, Any]:
        bits = []
        for byte in data:
            for i in range(7, -1, -1):
                bits.append((byte >> i) & 1)

        if len(bits) < 100:
            return {
                "frequency_test_passed": True,
                "runs_test_passed": True,
                "note": "数据量不足，跳过完整随机测试",
            }

        ones_count = sum(bits)
        zeros_count = len(bits) - ones_count
        frequency_ratio = abs(ones_count - zeros_count) / len(bits)
        frequency_test_passed = frequency_ratio < 0.1

        runs = 0
        for i in range(1, len(bits)):
            if bits[i] != bits[i - 1]:
                runs += 1
        expected_runs = (2 * ones_count * zeros_count) / len(bits) + 1
        runs_test_passed = abs(runs - expected_runs) < len(bits) * 0.15

        return {
            "frequency_test_passed": frequency_test_passed,
            "frequency_ratio": frequency_ratio,
            "ones_count": ones_count,
            "zeros_count": zeros_count,
            "runs_test_passed": runs_test_passed,
            "actual_runs": runs,
            "expected_runs": expected_runs,
        }

    @classmethod
    def _assess_key_strength(
        cls,
        key_info: Dict[str, Any],
        entropy_score: float,
        randomness_tests: Dict[str, Any],
    ) -> str:
        hmac_size = key_info["key_analysis"].get("hmac_key_size_bits", 0)

        if hmac_size >= 512 and entropy_score >= 7.8:
            return "Very Strong"
        elif hmac_size >= 256 and entropy_score >= 7.5:
            return "Strong"
        elif hmac_size >= 128 and entropy_score >= 7.0:
            return "Medium"
        else:
            return "Weak"

    @classmethod
    def _calculate_health_score(
        cls,
        key_info: Dict[str, Any],
        entropy_score: float,
        randomness_tests: Dict[str, Any],
        issue_count: int,
        warning_count: int,
    ) -> int:
        score = 100

        score -= (8.0 - entropy_score) * 10

        if not randomness_tests.get("frequency_test_passed", True):
            score -= 15
        if not randomness_tests.get("runs_test_passed", True):
            score -= 10

        score -= issue_count * 20
        score -= warning_count * 5

        return max(0, min(100, int(score)))

    @classmethod
    def _assess_entropy(cls, entropy_score: float) -> str:
        if entropy_score >= 7.8:
            return "Excellent - 接近理想随机性"
        elif entropy_score >= 7.5:
            return "Good - 随机性良好"
        elif entropy_score >= 7.0:
            return "Fair - 随机性一般"
        else:
            return "Poor - 随机性较差，可能存在弱密钥"

    @classmethod
    def _assess_key_size(cls, key_info: Dict[str, Any]) -> Dict[str, Any]:
        key_size = key_info["key_size_bits"]
        hmac_size = key_info["key_analysis"].get("hmac_key_size_bits", 0)

        assessments = []
        if hmac_size >= 512:
            assessments.append("HMAC 密钥大小 (512位) 符合最高安全标准")
        elif hmac_size >= 256:
            assessments.append("HMAC 密钥大小 (256位) 符合推荐安全标准")
        elif hmac_size >= 128:
            assessments.append("HMAC 密钥大小 (128位) 基本安全，建议升级")
        else:
            assessments.append("HMAC 密钥大小不足，存在安全风险")

        if key_info["key_analysis"].get("has_cipher_key"):
            assessments.append("密钥包含加密密钥组件")

        return {
            "key_size_bits": key_size,
            "hmac_key_size_bits": hmac_size,
            "assessments": assessments,
        }

    @classmethod
    def _get_byte_distribution(cls, data: bytes) -> Dict[str, Any]:
        counts = Counter(data)
        distribution = {}
        for i in range(256):
            distribution[str(i)] = counts.get(i, 0)

        unique_bytes = len([c for c in counts.values() if c > 0])

        return {
            "unique_bytes": unique_bytes,
            "total_bytes": len(data),
            "coverage_percent": (unique_bytes / 256) * 100,
            "distribution": distribution,
        }

    @classmethod
    def _generate_summary(cls, key_info: Dict[str, Any], overall_health: str) -> str:
        status_map = {
            "healthy": "健康",
            "warning": "存在警告",
            "critical": "存在严重问题",
        }

        summary_parts = [
            f"密钥格式: {key_info['key_format']}",
            f"密钥大小: {key_info['key_size_bits']} 位",
            f"整体状态: {status_map.get(overall_health, overall_health)}",
        ]

        if key_info["key_analysis"].get("has_hmac_key"):
            summary_parts.append(
                f"HMAC 密钥: {key_info['key_analysis']['hmac_key_size_bits']} 位"
            )

        return " | ".join(summary_parts)

    @classmethod
    def export_health_report_markdown(cls, report: Dict[str, Any]) -> str:
        status_emoji = {
            "healthy": "✅",
            "warning": "⚠️",
            "critical": "❌",
        }

        md = []
        md.append("# OpenVPN tls-auth 密钥健康报告")
        md.append("")
        md.append(f"## 整体评估 {status_emoji.get(report['overall_health'], '')}")
        md.append("")
        md.append(f"- **健康评分**: {report['health_score']}/100")
        md.append(f"- **摘要**: {report['summary']}")
        md.append("")

        md.append("## 熵值分析")
        md.append("")
        md.append(f"- **熵值分数**: {report['entropy']['score']:.4f}/8.0")
        md.append(f"- **评估**: {report['entropy']['assessment']}")
        md.append("")

        md.append("## 随机性测试")
        md.append("")
        rt = report["randomness_tests"]
        md.append(
            f"- **单比特频率测试**: {'✅ 通过' if rt.get('frequency_test_passed') else '❌ 失败'}"
        )
        md.append(
            f"- **游程测试**: {'✅ 通过' if rt.get('runs_test_passed') else '⚠️ 未通过'}"
        )
        if "note" in rt:
            md.append(f"- **备注**: {rt['note']}")
        md.append("")

        md.append("## 密钥大小评估")
        md.append("")
        for assessment in report["key_size_assessment"]["assessments"]:
            md.append(f"- {assessment}")
        md.append("")

        if report["issues"]:
            md.append("## ⚠️ 发现的问题")
            md.append("")
            for issue in report["issues"]:
                md.append(f"- ❌ {issue}")
            md.append("")

        if report["warnings"]:
            md.append("## ⚠️ 警告")
            md.append("")
            for warning in report["warnings"]:
                md.append(f"- ⚠️ {warning}")
            md.append("")

        md.append("## 💡 安全建议")
        md.append("")
        for rec in report["recommendations"]:
            md.append(f"- {rec}")
        md.append("")

        md.append("## 字节分布统计")
        md.append("")
        bd = report["byte_distribution"]
        md.append(f"- **唯一字节数**: {bd['unique_bytes']}/256")
        md.append(f"- **覆盖率**: {bd['coverage_percent']:.2f}%")
        md.append("")

        return "\n".join(md)
