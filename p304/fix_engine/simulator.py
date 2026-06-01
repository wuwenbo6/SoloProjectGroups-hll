import asyncio
import random
import re
from datetime import datetime, timedelta
from typing import Optional, Callable
from .detector import SeqNumDetector
from .models import (
    FixMessage, MsgDirection, Session, SessionStatus, Alert
)
from .config import SIMULATOR_TICK_INTERVAL
from .utils import append_fix_checksum


class FixSimulator:
    NORMAL_MSG_TYPES = ["NewOrderSingle", "ExecutionReport", "MarketDataSnapshot", "Heartbeat", "TestRequest"]
    ATTACK_MSG_TYPES = ["NewOrderSingle", "ExecutionReport"]

    def __init__(self, detector: SeqNumDetector):
        self._detector = detector
        self._running = False
        self._sessions: dict[str, dict] = {}
        self._tasks: list[asyncio.Task] = []
        self._on_message_callbacks: list[Callable] = []
        self._on_logout_callbacks: list[Callable] = []
        self._on_resend_request_callbacks: list[Callable] = []

    def on_message(self, callback):
        self._on_message_callbacks.append(callback)

    def on_logout(self, callback):
        self._on_logout_callbacks.append(callback)

    def on_resend_request(self, callback):
        self._on_resend_request_callbacks.append(callback)

    def _fire_message(self, session_id: str, message: FixMessage):
        for cb in self._on_message_callbacks:
            cb(session_id, message)

    def _fire_logout(self, session_id: str, message: FixMessage):
        for cb in self._on_logout_callbacks:
            cb(session_id, message)

    def _fire_resend_request(self, session_id: str, message: FixMessage):
        for cb in self._on_resend_request_callbacks:
            cb(session_id, message)

    def add_session(self, session_id: str, sender: str, target: str):
        self._sessions[session_id] = {
            "sender": sender,
            "target": target,
            "next_seq_in": 1,
            "next_seq_out": 1,
        }
        self._detector.handle_connect(session_id, sender, target)

    async def start(self):
        self._running = True
        for sid in self._sessions:
            task = asyncio.create_task(self._session_loop(sid))
            self._tasks.append(task)

    async def stop(self):
        self._running = False
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()

    async def _session_loop(self, session_id: str):
        info = self._sessions.get(session_id)
        if not info:
            return

        while self._running:
            try:
                msg = self._generate_normal_message(session_id)
                alert = self._detector.check_inbound_message(session_id, msg)
                self._fire_message(session_id, msg)

                if alert and alert.alert_type == "SEQNUM_RESET_AFTER_GAP":
                    session_obj = self._detector.get_session(session_id)
                    logout = self._detector.build_logout_message(session_id, reason="SEQNUM_RESET")
                    self._fire_logout(session_id, logout)
                    if session_obj:
                        session_obj.messages.append(logout)
                    if session_obj:
                        resend = self._detector.build_resend_request(
                            session_id,
                            begin_seq=msg.seq_num,
                            end_seq=session_obj.incoming_seq_num,
                        )
                        self._fire_resend_request(session_id, resend)
                        session_obj.messages.append(resend)
                    await asyncio.sleep(3)
                    session_obj = self._detector.get_session(session_id)
                    if session_obj:
                        session_obj.status = SessionStatus.CONNECTED
                        session_obj.log_gap_detected = False
                        info["next_seq_in"] = session_obj.incoming_seq_num + 1

                await asyncio.sleep(SIMULATOR_TICK_INTERVAL + random.uniform(-0.3, 0.3))
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(1)

    def _generate_normal_message(self, session_id: str, tamper_checksum: bool = False) -> FixMessage:
        info = self._sessions[session_id]
        msg_type = random.choice(self.NORMAL_MSG_TYPES)
        msg_type_code = 'D' if msg_type == 'NewOrderSingle' else '8' if msg_type == 'ExecutionReport' else 'W' if msg_type == 'MarketDataSnapshot' else '0' if msg_type == 'Heartbeat' else '1'
        seq_num = info["next_seq_in"]
        info["next_seq_in"] += 1
        now = datetime.now()

        raw_header = (
            f"8=FIX.4.4\x019=000\x01"
            f"35={msg_type_code}\x01"
            f"49={info['sender']}\x01"
            f"56={info['target']}\x01"
            f"34={seq_num}\x01"
            f"52={now.strftime('%Y%m%d-%H:%M:%S.%f')[:-3]}\x01"
        )

        if msg_type_code == 'D':
            body = f"11=ORD{seq_num:06d}\x0155=AAPL\x0154=1\x0144=150.00\x01"
        elif msg_type_code == '8':
            body = f"11=ORD{seq_num:06d}\x0137=EXEC{seq_num:06d}\x0155=AAPL\x01150=2\x01151=100\x0131=150.00\x01"
        elif msg_type_code == 'W':
            body = f"55=AAPL\x01269=0\x01270=150.00\x01271=1000\x01"
        else:
            body = f"112=TEST{seq_num}\x01"

        raw_body = raw_header + body
        msg_no_checksum = re.sub(r'^8=FIX.4.4\x019=000\x01', '', raw_body)
        body_length = len(msg_no_checksum)
        raw_with_length = raw_body.replace('9=000', f'9={body_length}')

        raw_final = append_fix_checksum(raw_with_length)

        if tamper_checksum:
            raw_final = re.sub(r'10=\d{3}\x01$', '10=999\x01', raw_final)

        return FixMessage(
            timestamp=now,
            msg_type=msg_type,
            seq_num=seq_num,
            sender_comp_id=info["sender"],
            target_comp_id=info["target"],
            direction=MsgDirection.INBOUND,
            raw=raw_final,
        )

    async def inject_attack_seqnum_reset(self, session_id: str):
        info = self._sessions.get(session_id)
        if not info:
            return

        session = self._detector.get_session(session_id)
        if not session or session.status != SessionStatus.CONNECTED:
            return

        session.log_gap_detected = True
        session.last_msg_time = datetime.now() - timedelta(seconds=10)

        attack_seq = random.randint(1, max(1, session.incoming_seq_num - 5))
        info["next_seq_in"] = attack_seq

        msg_type = random.choice(self.ATTACK_MSG_TYPES)
        msg_type_code = 'D' if msg_type == 'NewOrderSingle' else '8'
        now = datetime.now()

        raw_header = (
            f"8=FIX.4.4\x019=000\x01"
            f"35={msg_type_code}\x01"
            f"49={info['sender']}\x01"
            f"56={info['target']}\x01"
            f"34={attack_seq}\x01"
            f"52={now.strftime('%Y%m%d-%H:%M:%S.%f')[:-3]}\x01"
        )

        if msg_type_code == 'D':
            body = f"11=ATK{attack_seq:06d}\x0155=GOOG\x0154=2\x0144=200.00\x01"
        else:
            body = f"11=ATK{attack_seq:06d}\x0137=ATKEXEC{attack_seq:06d}\x0155=GOOG\x01150=2\x01151=100\x0131=200.00\x01"

        raw_body = raw_header + body
        msg_no_checksum = re.sub(r'^8=FIX.4.4\x019=000\x01', '', raw_body)
        body_length = len(msg_no_checksum)
        raw_with_length = raw_body.replace('9=000', f'9={body_length}')

        raw_final = append_fix_checksum(raw_with_length)

        attack_msg = FixMessage(
            timestamp=now,
            msg_type=msg_type,
            seq_num=attack_seq,
            sender_comp_id=info["sender"],
            target_comp_id=info["target"],
            direction=MsgDirection.INBOUND,
            raw=raw_final,
        )

        alert = self._detector.check_inbound_message(session_id, attack_msg)
        self._fire_message(session_id, attack_msg)

        if alert and alert.alert_type == "SEQNUM_RESET_AFTER_GAP":
            logout = self._detector.build_logout_message(session_id, reason="SEQNUM_RESET")
            self._fire_logout(session_id, logout)
            session.messages.append(logout)
            resend = self._detector.build_resend_request(
                session_id,
                begin_seq=attack_seq,
                end_seq=session.incoming_seq_num,
            )
            self._fire_resend_request(session_id, resend)
            session.messages.append(resend)
            await asyncio.sleep(3)
            session.status = SessionStatus.CONNECTED
            session.log_gap_detected = False
            info["next_seq_in"] = session.incoming_seq_num + 1

    async def inject_attack_checksum_tamper(self, session_id: str):
        info = self._sessions.get(session_id)
        if not info:
            return

        session = self._detector.get_session(session_id)
        if not session or session.status != SessionStatus.CONNECTED:
            return

        msg = self._generate_normal_message(session_id, tamper_checksum=True)

        alert = self._detector.check_inbound_message(session_id, msg)
        self._fire_message(session_id, msg)

        if alert and alert.alert_type == "CHECKSUM_INVALID":
            logout = self._detector.build_logout_message(session_id, reason="CHECKSUM_INVALID")
            self._fire_logout(session_id, logout)
            session.messages.append(logout)
            await asyncio.sleep(3)
            session.status = SessionStatus.CONNECTED
            session.log_gap_detected = False

    async def inject_attack_log_gap(self, session_id: str, gap_seconds: int = 8):
        session = self._detector.get_session(session_id)
        if not session or session.status != SessionStatus.CONNECTED:
            return

        session.last_msg_time = datetime.now() - timedelta(seconds=gap_seconds)
        session.log_gap_detected = True

    async def inject_normal_gap(self, session_id: str, gap_seconds: int = 3):
        session = self._detector.get_session(session_id)
        if not session:
            return
        session.last_msg_time = datetime.now() - timedelta(seconds=gap_seconds)

    def get_sessions_info(self) -> dict:
        result = {}
        for sid, info in self._sessions.items():
            result[sid] = {
                "sender": info["sender"],
                "target": info["target"],
                "next_seq_in": info["next_seq_in"],
            }
        return result
