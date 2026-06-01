import os
import hashlib
import hmac
import struct
import time
from typing import Literal, Optional

from cryptography.hazmat.primitives.asymmetric.dh import DHParameterNumbers, DHPublicNumbers
from cryptography.hazmat.primitives.asymmetric.ec import ECDH, generate_private_key as ec_generate_private_key, SECP256R1
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.backends import default_backend

AlgorithmType = Literal["DH2048", "ECDH_P256"]
MessageType = Literal[
    "Hello", "HelloACK", "Commit", "DHPart1", "DHPart2",
    "Confirm1", "Confirm2", "Error", "SASRelay", "GoClear", "GoClearACK"
]

DH2048_P = int(
    "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1"
    "29024E088A67CC74020BBEA63B139B22514A08798E3404DD"
    "EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245"
    "E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED"
    "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D"
    "C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F"
    "83655D23DCA3AD961C62F356208552BB9ED529077096966D"
    "670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B"
    "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9"
    "DE2BCBF6955817183995497CEA956AE515D2261898FA0510"
    "15728E5A8AACAA68FFFFFFFFFFFFFFFF", 16
)
DH2048_G = 2

ZRTP_KDF_COUNTER = 0x00000001


def _generate_zid() -> bytes:
    return os.urandom(12)


def _bytes_to_hex(data: bytes) -> str:
    return data.hex()


def _zrtp_kdf(key: bytes, label: bytes, context: bytes, length: int) -> bytes:
    """
    RFC 6189 Section 4.5.2 - ZRTP Key Derivation Function
    KDF(K, Label, Context, L) = HMAC-SHA256(K, counter || Label || 0x00 || Context || L)
    其中 counter = 0x00000001, L 以位为单位，大端序 32 位整数

    如果需要更长的输出，可以将 counter 递增进行多次 HMAC 计算并拼接结果。
    """
    output = b""
    counter = ZRTP_KDF_COUNTER
    bytes_needed = length // 8
    hash_len = 32  # SHA-256 output is 32 bytes

    while len(output) < bytes_needed:
        counter_bytes = struct.pack(">I", counter)
        length_bytes = struct.pack(">I", length)
        data = counter_bytes + label + b"\x00" + context + length_bytes
        hmac_result = hmac.new(key, data, hashlib.sha256).digest()
        output += hmac_result
        counter += 1

    return output[:bytes_needed]


def _hmac_sha256(key: bytes, data: bytes) -> bytes:
    return hmac.new(key, data, hashlib.sha256).digest()


class ZRTPParty:
    def __init__(self, name: str, zid: Optional[bytes] = None):
        self.name = name
        self.zid = zid or _generate_zid()
        self._private_key = None
        self._public_key = None
        self._public_key_int = None
        self.dh_shared_secret: Optional[bytes] = None
        self.s0: Optional[bytes] = None
        self.srtp_master_key: Optional[bytes] = None
        self.srtp_master_salt: Optional[bytes] = None
        self.sas: Optional[str] = None
        self.total_hash: Optional[bytes] = None
        self.sas_verified: bool = False
        self.media_connection_established: bool = False
        self.is_encrypted: bool = False
        self._goclear_key: Optional[bytes] = None

    def generate_dh_keypair(self, algorithm: AlgorithmType):
        if algorithm == "DH2048":
            param_numbers = DHParameterNumbers(DH2048_P, DH2048_G)
            parameters = param_numbers.parameters(default_backend())
            self._private_key = parameters.generate_private_key()
            self._public_key = self._private_key.public_key()
            self._public_key_int = self._public_key.public_numbers().y
        elif algorithm == "ECDH_P256":
            self._private_key = ec_generate_private_key(SECP256R1(), default_backend())
            self._public_key = self._private_key.public_key()

    def get_public_key_bytes(self) -> bytes:
        if self._public_key is None:
            raise ValueError("Public key not generated yet")
        raw = self._public_key.public_bytes(
            serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo
        )
        return raw

    def get_public_key_hex(self) -> str:
        return _bytes_to_hex(self.get_public_key_bytes())

    def compute_shared_secret(self, peer_party: "ZRTPParty", algorithm: AlgorithmType):
        if algorithm == "DH2048":
            self.dh_shared_secret = self._private_key.exchange(peer_party._public_key)
        elif algorithm == "ECDH_P256":
            self.dh_shared_secret = self._private_key.exchange(ECDH(), peer_party._public_key)

    def derive_keys(self, initiator_zid: bytes, responder_zid: bytes):
        if self.dh_shared_secret is None:
            raise ValueError("Shared secret not computed yet")

        context = initiator_zid + responder_zid

        self.s0 = _zrtp_kdf(
            self.dh_shared_secret,
            b"ZRTP-HMAC-KDF",
            context,
            256
        )

        self.total_hash = hashlib.sha256(self.s0 + context).digest()

        self.srtp_master_key = _zrtp_kdf(
            self.s0,
            b"SRTP Master Key",
            context,
            256
        )

        self.srtp_master_salt = _zrtp_kdf(
            self.s0,
            b"SRTP Master Salt",
            context,
            128
        )

        sas_bytes = _zrtp_kdf(
            self.s0,
            b"SAS",
            context,
            32
        )

        sas_int = int.from_bytes(sas_bytes, byteorder='big')
        sas_value = sas_int % 10000
        self.sas = f"{sas_value:04d}"

        self._goclear_key = _zrtp_kdf(
            self.s0,
            b"GoClear HMAC Key",
            context,
            256
        )

    def verify_sas(self, peer_sas: str) -> bool:
        """
        验证对方的 SAS 是否匹配。
        如果不匹配，媒体连接将被拒绝建立。
        """
        if self.sas is None:
            raise ValueError("SAS not computed yet")

        self.sas_verified = self.sas == peer_sas
        self.media_connection_established = self.sas_verified
        self.is_encrypted = self.sas_verified
        return self.sas_verified

    def send_goclear(self, reason: str = "User requested") -> dict:
        """
        RFC 6189 Section 5.12 - 发送 GoClear 请求回退到明文模式。
        返回包含 HMAC 认证的 GoClear 消息。
        """
        if self._goclear_key is None:
            raise ValueError("GoClear key not derived yet")
        if not self.is_encrypted:
            raise ValueError("Not in encrypted mode")

        ts = int(time.time())
        clear_packet = struct.pack(">I", ts) + self.zid + reason.encode("utf-8")
        mac = _hmac_sha256(self._goclear_key, clear_packet)

        return {
            "timestamp": ts,
            "zid": _bytes_to_hex(self.zid),
            "reason": reason,
            "hmac": _bytes_to_hex(mac),
        }

    def verify_goclear(self, goclear_msg: dict, peer_zid: bytes) -> bool:
        """
        验证收到的 GoClear 消息的 HMAC。
        返回 True 表示验证通过，可以回退到明文。
        """
        if self._goclear_key is None:
            raise ValueError("GoClear key not derived yet")

        ts = goclear_msg["timestamp"]
        zid_bytes = bytes.fromhex(goclear_msg["zid"])
        reason = goclear_msg["reason"]
        received_mac = bytes.fromhex(goclear_msg["hmac"])

        clear_packet = struct.pack(">I", ts) + zid_bytes + reason.encode("utf-8")
        expected_mac = _hmac_sha256(self._goclear_key, clear_packet)

        if zid_bytes != peer_zid:
            return False

        return hmac.compare_digest(received_mac, expected_mac)

    def clear_encryption(self):
        """清除加密状态，回退到明文模式。"""
        self.is_encrypted = False
        self.srtp_master_key = None
        self.srtp_master_salt = None

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "zid": _bytes_to_hex(self.zid),
            "dh_public_key": self.get_public_key_hex() if self._public_key else "",
            "dh_shared_secret": _bytes_to_hex(self.dh_shared_secret) if self.dh_shared_secret else "",
            "s0": _bytes_to_hex(self.s0) if self.s0 else "",
            "srtp_master_key": _bytes_to_hex(self.srtp_master_key) if self.srtp_master_key else "",
            "srtp_master_salt": _bytes_to_hex(self.srtp_master_salt) if self.srtp_master_salt else "",
            "sas": self.sas or "",
            "sas_verified": self.sas_verified,
            "media_connection_established": self.media_connection_established,
            "is_encrypted": self.is_encrypted,
        }


class ZRTPEngine:
    def __init__(self):
        self.sessions: list[dict] = []
        self._session_store: dict[str, dict] = {}

    def negotiate(
        self,
        algorithm: AlgorithmType = "DH2048",
        simulate_mitm: bool = False
    ) -> dict:
        """
        模拟 ZRTP 完整协商过程。

        Args:
            algorithm: DH 算法 (DH2048 或 ECDH_P256)
            simulate_mitm: 是否模拟中间人攻击（用于测试 SAS 不匹配场景）
                         当为 True 时，Bob 会使用不同的 DH 私钥，导致 SAS 不匹配
        """
        session_id = os.urandom(8).hex()
        alice = ZRTPParty("Alice")
        bob = ZRTPParty("Bob")

        messages = []
        t0 = time.time()

        def _ts(step: float) -> float:
            return round(t0 + step * 0.1, 3)

        messages.append({
            "step": 1,
            "from": "alice",
            "to": "bob",
            "type": "Hello",
            "description": f"Alice 发送 Hello，ZID={_bytes_to_hex(alice.zid)}，支持 DH2048/ECDH-P256",
            "timestamp": _ts(1)
        })

        messages.append({
            "step": 2,
            "from": "bob",
            "to": "alice",
            "type": "HelloACK",
            "description": f"Bob 确认收到 Hello，ZID={_bytes_to_hex(bob.zid)}",
            "timestamp": _ts(2)
        })

        messages.append({
            "step": 3,
            "from": "bob",
            "to": "alice",
            "type": "Commit",
            "description": f"Bob 发送 Commit，选择算法 {algorithm}，发送 hvi(hash of DH part + Hello)",
            "timestamp": _ts(3)
        })

        alice.generate_dh_keypair(algorithm)
        bob.generate_dh_keypair(algorithm)

        alice_pub = alice.get_public_key_bytes()
        bob_pub = bob.get_public_key_bytes()

        messages.append({
            "step": 4,
            "from": "alice",
            "to": "bob",
            "type": "DHPart1",
            "description": f"Alice 发送 DH 公钥 pvr ({len(alice_pub)*8} bits)",
            "timestamp": _ts(4)
        })

        messages.append({
            "step": 5,
            "from": "bob",
            "to": "alice",
            "type": "DHPart2",
            "description": f"Bob 发送 DH 公钥 pvi ({len(bob_pub)*8} bits)",
            "timestamp": _ts(5)
        })

        if simulate_mitm:
            mitm = ZRTPParty("Mallory")
            mitm.generate_dh_keypair(algorithm)
            alice.compute_shared_secret(mitm, algorithm)
            bob.compute_shared_secret(mitm, algorithm)
            messages.append({
                "step": 5.5,
                "from": "mitm",
                "to": "alice_bob",
                "type": "DHPart2",
                "description": "⚠️ 中间人攻击模拟：Mallory 拦截并替换了 DH 公钥，双方将计算出不同的共享密钥",
                "timestamp": _ts(5.5)
            })
        else:
            alice.compute_shared_secret(bob, algorithm)
            bob.compute_shared_secret(alice, algorithm)

        alice.derive_keys(alice.zid, bob.zid)
        bob.derive_keys(alice.zid, bob.zid)

        sas_match = alice.sas == bob.sas

        messages.append({
            "step": 6,
            "from": "alice",
            "to": "bob",
            "type": "Confirm1",
            "description": f"Alice 发送 Confirm1，SAS={alice.sas}，SRTP 密钥已生成",
            "timestamp": _ts(6)
        })

        messages.append({
            "step": 7,
            "from": "bob",
            "to": "alice",
            "type": "Confirm2",
            "description": f"Bob 发送 Confirm2，SAS={bob.sas}，SRTP 密钥已生成",
            "timestamp": _ts(7)
        })

        messages.append({
            "step": 8,
            "from": "alice",
            "to": "bob",
            "type": "SASRelay",
            "description": f"Alice 向 Bob 发送自己的 SAS={alice.sas} 用于验证",
            "timestamp": _ts(8)
        })

        messages.append({
            "step": 9,
            "from": "bob",
            "to": "alice",
            "type": "SASRelay",
            "description": f"Bob 向 Alice 发送自己的 SAS={bob.sas} 用于验证",
            "timestamp": _ts(9)
        })

        alice.verify_sas(bob.sas)
        bob.verify_sas(alice.sas)

        if not sas_match:
            messages.append({
                "step": 10,
                "from": "alice",
                "to": "bob",
                "type": "Error",
                "description": f"❌ Alice 检测到 SAS 不匹配 (期望 {alice.sas}, 收到 {bob.sas})，拒绝建立媒体连接！",
                "timestamp": _ts(10)
            })
            messages.append({
                "step": 11,
                "from": "bob",
                "to": "alice",
                "type": "Error",
                "description": f"❌ Bob 检测到 SAS 不匹配 (期望 {bob.sas}, 收到 {alice.sas})，拒绝建立媒体连接！",
                "timestamp": _ts(11)
            })
        else:
            messages.append({
                "step": 10,
                "from": "alice",
                "to": "bob",
                "type": "Confirm1",
                "description": f"✅ SAS 验证通过，Alice 确认建立安全媒体连接 (SRTP 加密)",
                "timestamp": _ts(10)
            })
            messages.append({
                "step": 11,
                "from": "bob",
                "to": "alice",
                "type": "Confirm2",
                "description": f"✅ SAS 验证通过，Bob 确认建立安全媒体连接 (SRTP 加密)",
                "timestamp": _ts(11)
            })

        result = {
            "session_id": session_id,
            "alice": alice.to_dict(),
            "bob": bob.to_dict(),
            "sas": alice.sas,
            "sas_match": sas_match,
            "algorithm": algorithm,
            "simulate_mitm": simulate_mitm,
            "media_connection_established": sas_match,
            "is_encrypted": sas_match,
            "messages": messages,
            "created_at": round(time.time(), 3),
        }

        self._session_store[session_id] = {
            "alice": alice,
            "bob": bob,
            "result": result,
        }
        self.sessions.append(result)
        return result

    def goclear(
        self,
        session_id: str,
        sender: Literal["alice", "bob"],
        user_confirmed: bool = False,
        reason: str = "User requested"
    ) -> dict:
        """
        RFC 6189 Section 5.12 - GoClear 处理流程。
        1. 发送方发送 GoClear 请求（带 HMAC 认证）
        2. 接收方验证 HMAC
        3. 必须向用户显示警告并等待确认
        4. 用户确认后回退到明文模式

        Args:
            session_id: 会话 ID
            sender: 发起 GoClear 的一方
            user_confirmed: 用户是否已确认回退到明文
            reason: GoClear 原因
        """
        if session_id not in self._session_store:
            raise ValueError("Session not found")

        store = self._session_store[session_id]
        alice: ZRTPParty = store["alice"]
        bob: ZRTPParty = store["bob"]
        result = store["result"]

        messages = result["messages"]
        base_step = max(m["step"] for m in messages) + 1

        if not result["is_encrypted"]:
            messages.append({
                "step": base_step,
                "from": "system",
                "to": "all",
                "type": "Error",
                "description": "⚠️ 当前未处于加密模式，无需 GoClear",
                "timestamp": round(time.time(), 3),
            })
            result["messages"] = messages
            return result

        sender_party = alice if sender == "alice" else bob
        receiver_party = bob if sender == "alice" else alice
        receiver_name = "bob" if sender == "alice" else "alice"

        goclear_msg = sender_party.send_goclear(reason)
        messages.append({
            "step": base_step,
            "from": sender,
            "to": receiver_name,
            "type": "GoClear",
            "description": f"⚠️ {sender_party.name} 请求回退到明文模式，原因：{reason}",
            "timestamp": round(time.time(), 3),
            "data": goclear_msg,
        })

        hmac_valid = receiver_party.verify_goclear(goclear_msg, sender_party.zid)
        if not hmac_valid:
            messages.append({
                "step": base_step + 1,
                "from": receiver_name,
                "to": sender,
                "type": "Error",
                "description": f"❌ {receiver_party.name} 验证 GoClear HMAC 失败，拒绝请求！",
                "timestamp": round(time.time(), 3),
            })
            result["messages"] = messages
            return result

        messages.append({
            "step": base_step + 1,
            "from": receiver_name,
            "to": sender,
            "type": "GoClearACK",
            "description": f"✅ {receiver_party.name} 验证 HMAC 通过，等待用户确认...",
            "timestamp": round(time.time(), 3),
        })

        if not user_confirmed:
            messages.append({
                "step": base_step + 2,
                "from": "system",
                "to": "all",
                "type": "Error",
                "description": "⚠️ 安全警告：即将从加密模式回退到明文模式！通话内容将不再加密。请确认是否继续。",
                "timestamp": round(time.time(), 3),
                "requires_confirmation": True,
            })
            result["messages"] = messages
            result["pending_goclear"] = {
                "sender": sender,
                "reason": reason,
                "requires_confirmation": True,
            }
            return result

        messages.append({
            "step": base_step + 2,
            "from": "system",
            "to": "all",
            "type": "GoClearACK",
            "description": "✅ 用户已确认回退到明文模式",
            "timestamp": round(time.time(), 3),
        })

        alice.clear_encryption()
        bob.clear_encryption()
        result["alice"] = alice.to_dict()
        result["bob"] = bob.to_dict()
        result["is_encrypted"] = False
        result["pending_goclear"] = None

        messages.append({
            "step": base_step + 3,
            "from": "system",
            "to": "all",
            "type": "GoClearACK",
            "description": "🔓 已回退到明文模式，媒体流不再加密！",
            "timestamp": round(time.time(), 3),
        })

        result["messages"] = messages
        return result

    def get_session(self, session_id: str) -> dict:
        """获取指定会话的完整数据。"""
        if session_id not in self._session_store:
            raise ValueError("Session not found")
        return self._session_store[session_id]["result"]

    def export_session(self, session_id: str, include_keys: bool = False) -> dict:
        """
        导出协商日志为 JSON 格式。

        Args:
            session_id: 会话 ID
            include_keys: 是否包含敏感密钥材料（默认 False，保护隐私）
        """
        if session_id not in self._session_store:
            raise ValueError("Session not found")

        session = self._session_store[session_id]["result"].copy()

        if not include_keys:
            for party in ["alice", "bob"]:
                if party in session:
                    session[party] = {
                        k: v for k, v in session[party].items()
                        if k not in [
                            "dh_shared_secret", "s0", "srtp_master_key", "srtp_master_salt"
                        ]
                    }

        session["exported_at"] = round(time.time(), 3)
        session["export_version"] = "1.0"
        session["exported_with_keys"] = include_keys

        return session

    def get_history(self) -> list:
        return self.sessions
