import hmac
import hashlib
from typing import Dict, Any, List, Optional


class HMACVerifier:
    SUPPORTED_DIGESTS = ["sha1", "sha256", "sha512", "md5"]

    @classmethod
    def compute_hmac(
        cls, key: bytes, message: bytes, digest_algorithm: str = "sha256"
    ) -> bytes:
        if digest_algorithm not in cls.SUPPORTED_DIGESTS:
            raise ValueError(
                f"Unsupported digest algorithm. Supported: {cls.SUPPORTED_DIGESTS}"
            )

        digest = getattr(hashlib, digest_algorithm)
        return hmac.new(key, message, digest).digest()

    @classmethod
    def verify_hmac(
        cls,
        key: bytes,
        message: bytes,
        signature: bytes,
        digest_algorithm: str = "sha256",
    ) -> bool:
        computed_hmac = cls.compute_hmac(key, message, digest_algorithm)
        return hmac.compare_digest(computed_hmac, signature)

    @classmethod
    def simulate_tls_auth_handshake(
        cls, hmac_key: bytes, digest_algorithm: str = "sha256"
    ) -> List[Dict[str, Any]]:
        steps = []

        step1_message = b"ClientHello: TLS handshake initiation"
        step1_hmac = cls.compute_hmac(hmac_key, step1_message, digest_algorithm)
        steps.append(
            {
                "step": 1,
                "name": "Client Hello with HMAC",
                "description": "客户端发送ClientHello，附带HMAC签名保护",
                "direction": "Client -> Server",
                "message": step1_message.decode("utf-8", errors="replace"),
                "message_hex": step1_message.hex(),
                "hmac_hex": step1_hmac.hex(),
                "hmac_size_bytes": len(step1_hmac),
            }
        )

        step2_message = b"ServerHello: TLS version and cipher suite selection"
        step2_hmac = cls.compute_hmac(hmac_key, step2_message, digest_algorithm)
        steps.append(
            {
                "step": 2,
                "name": "Server Hello with HMAC",
                "description": "服务器响应ServerHello，HMAC验证通过后继续",
                "direction": "Server -> Client",
                "message": step2_message.decode("utf-8", errors="replace"),
                "message_hex": step2_message.hex(),
                "hmac_hex": step2_hmac.hex(),
                "hmac_size_bytes": len(step2_hmac),
            }
        )

        step3_message = b"Certificate: Server certificate chain"
        step3_hmac = cls.compute_hmac(hmac_key, step3_message, digest_algorithm)
        steps.append(
            {
                "step": 3,
                "name": "Certificate with HMAC",
                "description": "服务器发送证书链，HMAC保护防止篡改",
                "direction": "Server -> Client",
                "message": step3_message.decode("utf-8", errors="replace"),
                "message_hex": step3_message.hex(),
                "hmac_hex": step3_hmac.hex(),
                "hmac_size_bytes": len(step3_hmac),
            }
        )

        step4_message = b"KeyExchange: Diffie-Hellman key exchange parameters"
        step4_hmac = cls.compute_hmac(hmac_key, step4_message, digest_algorithm)
        steps.append(
            {
                "step": 4,
                "name": "Key Exchange with HMAC",
                "description": "密钥交换参数受HMAC保护，防止降级攻击",
                "direction": "Server -> Client",
                "message": step4_message.decode("utf-8", errors="replace"),
                "message_hex": step4_message.hex(),
                "hmac_hex": step4_hmac.hex(),
                "hmac_size_bytes": len(step4_hmac),
            }
        )

        step5_message = b"ClientKeyExchange: Pre-master secret encrypted"
        step5_hmac = cls.compute_hmac(hmac_key, step5_message, digest_algorithm)
        steps.append(
            {
                "step": 5,
                "name": "Client Key Exchange with HMAC",
                "description": "客户端发送预主密钥，HMAC确保完整性",
                "direction": "Client -> Server",
                "message": step5_message.decode("utf-8", errors="replace"),
                "message_hex": step5_message.hex(),
                "hmac_hex": step5_hmac.hex(),
                "hmac_size_bytes": len(step5_hmac),
            }
        )

        step6_message = b"Finished: Handshake completion verification"
        step6_hmac = cls.compute_hmac(hmac_key, step6_message, digest_algorithm)
        steps.append(
            {
                "step": 6,
                "name": "Finished with HMAC",
                "description": "握手完成消息HMAC验证，双方确认握手未被篡改",
                "direction": "Both directions",
                "message": step6_message.decode("utf-8", errors="replace"),
                "message_hex": step6_message.hex(),
                "hmac_hex": step6_hmac.hex(),
                "hmac_size_bytes": len(step6_hmac),
            }
        )

        return steps

    @classmethod
    def verify_handshake_step(
        cls,
        hmac_key: bytes,
        message: bytes,
        received_hmac: bytes,
        digest_algorithm: str = "sha256",
    ) -> Dict[str, Any]:
        computed_hmac = cls.compute_hmac(hmac_key, message, digest_algorithm)
        is_valid = hmac.compare_digest(computed_hmac, received_hmac)

        return {
            "valid": is_valid,
            "computed_hmac_hex": computed_hmac.hex(),
            "received_hmac_hex": received_hmac.hex(),
            "digest_algorithm": digest_algorithm,
            "match": computed_hmac == received_hmac,
        }

    @classmethod
    def get_hmac_info(cls, digest_algorithm: str = "sha256") -> Dict[str, Any]:
        if digest_algorithm not in cls.SUPPORTED_DIGESTS:
            raise ValueError(
                f"Unsupported digest algorithm. Supported: {cls.SUPPORTED_DIGESTS}"
            )

        digest = getattr(hashlib, digest_algorithm)
        sample = digest()

        return {
            "algorithm": digest_algorithm,
            "digest_size_bytes": sample.digest_size,
            "digest_size_bits": sample.digest_size * 8,
            "block_size": sample.block_size,
            "security_level": cls._get_security_level(digest_algorithm),
        }

    @classmethod
    def _get_security_level(cls, algorithm: str) -> str:
        levels = {
            "md5": "Insecure - Cryptographically broken",
            "sha1": "Weak - Not recommended for new applications",
            "sha256": "Secure - Recommended for most applications",
            "sha512": "High Security - For sensitive applications",
        }
        return levels.get(algorithm, "Unknown")

    @classmethod
    def simulate_packet_injection_attack(
        cls, hmac_key: bytes, original_message: bytes, digest_algorithm: str = "sha256"
    ) -> Dict[str, Any]:
        original_hmac = cls.compute_hmac(hmac_key, original_message, digest_algorithm)

        attack_types = [
            {
                "name": "单字节篡改",
                "description": "修改消息中的一个字节，模拟数据包被篡改",
                "modify": lambda msg: cls._modify_single_byte(msg),
            },
            {
                "name": "多字节篡改",
                "description": "修改消息中的多个字节，模拟大规模数据篡改",
                "modify": lambda msg: cls._modify_multiple_bytes(msg),
            },
            {
                "name": "消息截断",
                "description": "截断消息，模拟数据包被截短",
                "modify": lambda msg: cls._truncate_message(msg),
            },
            {
                "name": "消息追加",
                "description": "在消息末尾追加数据，模拟注入额外数据",
                "modify": lambda msg: cls._append_data(msg),
            },
            {
                "name": "位翻转",
                "description": "翻转消息中的特定位，模拟精确位翻转攻击",
                "modify": lambda msg: cls._flip_bits(msg),
            },
        ]

        results = []
        for attack in attack_types:
            modified_message = attack["modify"](original_message)
            modified_hmac = cls.compute_hmac(hmac_key, modified_message, digest_algorithm)
            hmac_changed = not hmac.compare_digest(original_hmac, modified_hmac)

            results.append(
                {
                    "attack_name": attack["name"],
                    "description": attack["description"],
                    "original_message_hex": original_message.hex(),
                    "modified_message_hex": modified_message.hex(),
                    "original_hmac": original_hmac.hex(),
                    "modified_hmac": modified_hmac.hex(),
                    "hmac_changed": hmac_changed,
                    "detected": hmac_changed,
                }
            )

        all_detected = all(r["detected"] for r in results)

        return {
            "success": True,
            "original_message": original_message.decode("utf-8", errors="replace"),
            "original_message_hex": original_message.hex(),
            "original_hmac": original_hmac.hex(),
            "attack_results": results,
            "all_attacks_detected": all_detected,
            "detection_rate": sum(1 for r in results if r["detected"]) / len(results),
            "digest_algorithm": digest_algorithm,
        }

    @classmethod
    def _modify_single_byte(cls, message: bytes) -> bytes:
        if len(message) < 1:
            return message
        msg_list = list(message)
        pos = min(5, len(msg_list) - 1)
        msg_list[pos] = (msg_list[pos] + 1) % 256
        return bytes(msg_list)

    @classmethod
    def _modify_multiple_bytes(cls, message: bytes) -> bytes:
        if len(message) < 1:
            return message
        msg_list = list(message)
        for i in range(min(3, len(msg_list))):
            pos = i * 4
            if pos < len(msg_list):
                msg_list[pos] = (msg_list[pos] + 0xFF) % 256
        return bytes(msg_list)

    @classmethod
    def _truncate_message(cls, message: bytes) -> bytes:
        if len(message) <= 1:
            return message
        return message[: len(message) // 2]

    @classmethod
    def _append_data(cls, message: bytes) -> bytes:
        return message + b"_INJECTED_MALICIOUS_DATA"

    @classmethod
    def _flip_bits(cls, message: bytes) -> bytes:
        if len(message) < 1:
            return message
        msg_list = list(message)
        pos = min(2, len(msg_list) - 1)
        msg_list[pos] = msg_list[pos] ^ 0xFF
        return bytes(msg_list)

    @classmethod
    def verify_hmac_with_timing_analysis(
        cls,
        key: bytes,
        message: bytes,
        signature: bytes,
        digest_algorithm: str = "sha256",
    ) -> Dict[str, Any]:
        import time

        start_time = time.perf_counter_ns()
        computed_hmac = cls.compute_hmac(key, message, digest_algorithm)
        is_valid = hmac.compare_digest(computed_hmac, signature)
        end_time = time.perf_counter_ns()

        verification_time_ns = end_time - start_time

        return {
            "valid": is_valid,
            "computed_hmac_hex": computed_hmac.hex(),
            "received_hmac_hex": signature.hex(),
            "digest_algorithm": digest_algorithm,
            "match": computed_hmac == signature,
            "verification_time_ns": verification_time_ns,
            "verification_time_us": verification_time_ns / 1000,
        }
