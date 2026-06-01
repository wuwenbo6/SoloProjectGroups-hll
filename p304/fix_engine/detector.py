import re
from datetime import datetime, timedelta
from typing import Optional
from .models import Alert, AlertSeverity, FixMessage, MsgDirection, Session, SessionStatus
from .config import LOG_GAP_THRESHOLD_SECONDS
from .utils import verify_fix_checksum


class SeqNumDetector:
    def __init__(self):
        self._sessions: dict[str, Session] = {}
        self._gap_threshold = timedelta(seconds=LOG_GAP_THRESHOLD_SECONDS)
        self._on_attack_callbacks = []

    def on_attack(self, callback):
        self._on_attack_callbacks.append(callback)

    def _fire_attack(self, session: Session, alert: Alert):
        for cb in self._on_attack_callbacks:
            cb(session, alert)

    def get_or_create_session(self, session_id: str, sender: str, target: str) -> Session:
        if session_id not in self._sessions:
            self._sessions[session_id] = Session(
                session_id=session_id,
                sender_comp_id=sender,
                target_comp_id=target,
            )
        return self._sessions[session_id]

    def get_session(self, session_id: str) -> Optional[Session]:
        return self._sessions.get(session_id)

    def get_all_sessions(self) -> dict[str, Session]:
        return dict(self._sessions)

    def handle_connect(self, session_id: str, sender: str, target: str):
        session = self.get_or_create_session(session_id, sender, target)
        session.status = SessionStatus.CONNECTED
        session.last_msg_time = datetime.now()

    def handle_disconnect(self, session_id: str):
        session = self._sessions.get(session_id)
        if session:
            session.status = SessionStatus.DISCONNECTED
            session.log_gap_detected = False

    def check_inbound_message(self, session_id: str, message: FixMessage) -> Optional[Alert]:
        session = self.get_or_create_session(session_id, message.sender_comp_id, message.target_comp_id)
        now = datetime.now()
        alert = None

        checksum_valid, calculated_checksum = verify_fix_checksum(message.raw)
        message.checksum_valid = checksum_valid
        message.checksum_value = calculated_checksum

        if not checksum_valid:
            alert = Alert(
                timestamp=now,
                session_id=session_id,
                alert_type="CHECKSUM_INVALID",
                description=(
                    f"Message CheckSum invalid: "
                    f"received={message.raw[-7:-4] if len(message.raw) > 7 else 'N/A'}, "
                    f"calculated={calculated_checksum}"
                ),
                severity=AlertSeverity.CRITICAL,
                seq_num_at_event=message.seq_num,
                previous_seq_num=session.incoming_seq_num,
            )
            message.is_attack = True
            session.attack_count += 1
            if session.status != SessionStatus.UNDER_ATTACK:
                session.status = SessionStatus.UNDER_ATTACK
            self._fire_attack(session, alert)
            session.alerts.append(alert)

        if session.last_msg_time is not None:
            time_since_last = now - session.last_msg_time
            if time_since_last > self._gap_threshold:
                session.log_gap_detected = True

        prev_seq = session.incoming_seq_num

        if prev_seq > 0 and message.seq_num <= prev_seq:
            if session.log_gap_detected and checksum_valid:
                reset_alert = Alert(
                    timestamp=now,
                    session_id=session_id,
                    alert_type="SEQNUM_RESET_AFTER_GAP",
                    description=(
                        f"SeqNum reset after log gap detected: "
                        f"prev={prev_seq}, current={message.seq_num}, "
                        f"gap duration={now - session.last_msg_time if session.last_msg_time else 'N/A'}"
                    ),
                    severity=AlertSeverity.CRITICAL,
                    seq_num_at_event=message.seq_num,
                    previous_seq_num=prev_seq,
                )
                message.is_attack = True
                session.attack_count += 1
                session.status = SessionStatus.UNDER_ATTACK
                self._fire_attack(session, reset_alert)
                session.alerts.append(reset_alert)
            elif message.seq_num == prev_seq:
                dup_alert = Alert(
                    timestamp=now,
                    session_id=session_id,
                    alert_type="SEQNUM_DUPLICATE",
                    description=f"Duplicate SeqNum detected: seq={message.seq_num}",
                    severity=AlertSeverity.WARNING,
                    seq_num_at_event=message.seq_num,
                    previous_seq_num=prev_seq,
                )
                if not alert:
                    alert = dup_alert
            else:
                reset_no_gap_alert = Alert(
                    timestamp=now,
                    session_id=session_id,
                    alert_type="SEQNUM_RESET",
                    description=(
                        f"SeqNum reset without log gap: "
                        f"prev={prev_seq}, current={message.seq_num}"
                    ),
                    severity=AlertSeverity.WARNING,
                    seq_num_at_event=message.seq_num,
                    previous_seq_num=prev_seq,
                )
                if not alert:
                    alert = reset_no_gap_alert
        elif prev_seq > 0 and message.seq_num > prev_seq + 1:
            gap_alert = Alert(
                timestamp=now,
                session_id=session_id,
                alert_type="SEQNUM_GAP",
                description=(
                    f"SeqNum gap detected: "
                    f"expected={prev_seq + 1}, got={message.seq_num}, "
                    f"missed={message.seq_num - prev_seq - 1} messages"
                ),
                severity=AlertSeverity.WARNING,
                seq_num_at_event=message.seq_num,
                previous_seq_num=prev_seq,
            )
            if not alert:
                alert = gap_alert

        session.incoming_seq_num = message.seq_num
        session.last_msg_time = now
        session.messages.append(message)
        session.seq_num_history.append({
            "timestamp": now.isoformat(),
            "seq_num": message.seq_num,
            "is_attack": message.is_attack,
            "msg_type": message.msg_type,
            "checksum_valid": message.checksum_valid,
        })

        if alert and alert.alert_type != "CHECKSUM_INVALID":
            session.alerts.append(alert)

        if not message.is_attack:
            session.log_gap_detected = False

        return alert

    def build_logout_message(self, session_id: str, reason: str = "SEQNUM_RESET") -> FixMessage:
        session = self._sessions.get(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        session.outgoing_seq_num += 1
        session.status = SessionStatus.LOGGING_OUT
        now = datetime.now()

        raw_header = (
            f"8=FIX.4.4\x019=000\x01"
            f"35=5\x0149={session.sender_comp_id}\x01"
            f"56={session.target_comp_id}\x01"
            f"34={session.outgoing_seq_num}\x01"
            f"52={now.strftime('%Y%m%d-%H:%M:%S.%f')[:-3]}\x01"
            f"58={reason}\x01"
        )

        msg_no_checksum = re.sub(r'^8=FIX.4.4\x019=000\x01', '', raw_header)
        body_length = len(msg_no_checksum)
        raw_with_length = raw_header.replace('9=000', f'9={body_length}')

        from .utils import append_fix_checksum
        raw_final = append_fix_checksum(raw_with_length)

        return FixMessage(
            timestamp=now,
            msg_type="Logout",
            seq_num=session.outgoing_seq_num,
            sender_comp_id=session.sender_comp_id,
            target_comp_id=session.target_comp_id,
            direction=MsgDirection.OUTBOUND,
            raw=raw_final,
        )

    def build_resend_request(self, session_id: str, begin_seq: int, end_seq: int = 0) -> FixMessage:
        session = self._sessions.get(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        session.outgoing_seq_num += 1
        now = datetime.now()

        raw_header = (
            f"8=FIX.4.4\x019=000\x01"
            f"35=2\x0149={session.sender_comp_id}\x01"
            f"56={session.target_comp_id}\x01"
            f"34={session.outgoing_seq_num}\x01"
            f"52={now.strftime('%Y%m%d-%H:%M:%S.%f')[:-3]}\x01"
            f"7={begin_seq}\x01"
            f"16={end_seq if end_seq > 0 else 999999}\x01"
        )

        msg_no_checksum = re.sub(r'^8=FIX.4.4\x019=000\x01', '', raw_header)
        body_length = len(msg_no_checksum)
        raw_with_length = raw_header.replace('9=000', f'9={body_length}')

        from .utils import append_fix_checksum
        raw_final = append_fix_checksum(raw_with_length)

        return FixMessage(
            timestamp=now,
            msg_type="ResendRequest",
            seq_num=session.outgoing_seq_num,
            sender_comp_id=session.sender_comp_id,
            target_comp_id=session.target_comp_id,
            direction=MsgDirection.OUTBOUND,
            raw=raw_final,
        )
