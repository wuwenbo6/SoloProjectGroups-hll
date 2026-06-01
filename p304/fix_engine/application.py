import quickfix as fix
from datetime import datetime
from .detector import SeqNumDetector
from .models import FixMessage, MsgDirection, Alert


class QuickfixApplication(fix.Application):
    def __init__(self, detector: SeqNumDetector):
        super().__init__()
        self._detector = detector

    def onCreate(self, session_id):
        sender = session_id.getSenderCompID().getString()
        target = session_id.getTargetCompID().getString()
        sid = f"{sender}->{target}"
        self._detector.get_or_create_session(sid, sender, target)

    def onLogon(self, session_id):
        sender = session_id.getSenderCompID().getString()
        target = session_id.getTargetCompID().getString()
        sid = f"{sender}->{target}"
        self._detector.handle_connect(sid, sender, target)

    def onLogout(self, session_id):
        sender = session_id.getSenderCompID().getString()
        target = session_id.getTargetCompID().getString()
        sid = f"{sender}->{target}"
        self._detector.handle_disconnect(sid)

    def toAdmin(self, message, session_id):
        pass

    def fromAdmin(self, message, session_id):
        self._process_inbound(message, session_id)

    def toApp(self, message, session_id):
        pass

    def fromApp(self, message, session_id):
        self._process_inbound(message, session_id)

    def _process_inbound(self, message, session_id):
        sender = session_id.getSenderCompID().getString()
        target = session_id.getTargetCompID().getString()
        sid = f"{sender}->{target}"

        header = message.getHeader()
        msg_type = header.getField(fix.MsgType().getField()).getString()
        seq_num = int(header.getField(fix.MsgSeqNum().getField()).getString())

        fix_msg = FixMessage(
            timestamp=datetime.now(),
            msg_type=self._msg_type_name(msg_type),
            seq_num=seq_num,
            sender_comp_id=sender,
            target_comp_id=target,
            direction=MsgDirection.INBOUND,
            raw=str(message),
        )

        alert = self._detector.check_inbound_message(sid, fix_msg)
        if alert and alert.alert_type == "SEQNUM_RESET_AFTER_GAP":
            logout = self._detector.build_logout_message(sid, reason="SEQNUM_RESET")
            self._send_logout(session_id, logout)
            resend = self._detector.build_resend_request(
                sid,
                begin_seq=fix_msg.seq_num,
                end_seq=seq_num,
            )
            self._send_resend_request(session_id, resend)

    def _send_logout(self, session_id, logout_msg: FixMessage):
        try:
            logout = fix.Message()
            header = logout.getHeader()
            header.setField(fix.MsgType("5"))
            header.setField(fix.MsgSeqNum(logout_msg.seq_num))
            logout.setField(fix.Text(logout_msg.raw))
            fix.Session.sendToTarget(logout, session_id)
        except Exception:
            pass

    def _send_resend_request(self, session_id, resend_msg: FixMessage):
        try:
            resend = fix.Message()
            header = resend.getHeader()
            header.setField(fix.MsgType("2"))
            header.setField(fix.MsgSeqNum(resend_msg.seq_num))
            fix.Session.sendToTarget(resend, session_id)
        except Exception:
            pass

    @staticmethod
    def _msg_type_name(msg_type: str) -> str:
        mapping = {
            "0": "Heartbeat", "1": "TestRequest", "2": "ResendRequest",
            "3": "Reject", "4": "SequenceReset", "5": "Logout",
            "A": "Logon", "D": "NewOrderSingle", "8": "ExecutionReport",
            "W": "MarketDataSnapshot", "V": "MarketDataRequest",
        }
        return mapping.get(msg_type, f"Unknown({msg_type})")
