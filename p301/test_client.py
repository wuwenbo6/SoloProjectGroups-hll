import logging
import random
import time
import uuid
import argparse
import socket
import struct
import threading
from typing import Optional, List, Dict, Any

try:
    from pyDiameter.pyDiaMessage import DiaMessage
    from pyDiameter.pyDiaAVPBasicTypes import (
        DiaAVPStr, DiaAVPUInt32, DiaAVPUInt64, DiaAVPInt32
    )
    from pyDiameter.pyDiaAVPTypes import DiaAVPGroup
    from pyDiameter.pyDiaAVPPath import DiaAVPPath
    from pyDiameter.pyDiaAVPBase import DiaAVP
except ImportError:
    import sys
    print("Error: pyDiameter not installed. Please run: pip install pyDiameter", file=sys.stderr)
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('TestClient')

DIAMETER_PORT = 3868
CC_APPLICATION_ID = 4
CMD_CREDIT_CONTROL = 272

CC_REQUEST_TYPE_INITIAL = 1
CC_REQUEST_TYPE_UPDATE = 2
CC_REQUEST_TYPE_TERMINATION = 3

REQUEST_TYPE_MAP = {
    CC_REQUEST_TYPE_INITIAL: 'INITIAL',
    CC_REQUEST_TYPE_UPDATE: 'UPDATE',
    CC_REQUEST_TYPE_TERMINATION: 'TERMINATION'
}

DEFAULT_SERVICES = [
    {'service_id': 1, 'name': '语音'},
    {'service_id': 2, 'name': '数据'},
    {'service_id': 3, 'name': '视频'},
    {'service_id': 4, 'name': '短信'},
]


class DiameterAVPHelper:
    @staticmethod
    def create_str_avp(code: int, value: bytes, vendor: int = 0, mandatory: bool = True) -> DiaAVPStr:
        avp = DiaAVPStr()
        avp.setAVPCode(code)
        if mandatory:
            avp.setAVPMandatoryFlag()
        if vendor != 0:
            avp.setAVPVendor(vendor)
            avp.setAVPVSFlag()
        avp.setAVPValue(value)
        return avp

    @staticmethod
    def create_uint32_avp(code: int, value: int, vendor: int = 0, mandatory: bool = True) -> DiaAVPUInt32:
        avp = DiaAVPUInt32()
        avp.setAVPCode(code)
        if mandatory:
            avp.setAVPMandatoryFlag()
        if vendor != 0:
            avp.setAVPVendor(vendor)
            avp.setAVPVSFlag()
        avp.setAVPValue(value)
        return avp

    @staticmethod
    def create_uint64_avp(code: int, value: int, vendor: int = 0, mandatory: bool = True) -> DiaAVPUInt64:
        avp = DiaAVPUInt64()
        avp.setAVPCode(code)
        if mandatory:
            avp.setAVPMandatoryFlag()
        if vendor != 0:
            avp.setAVPVendor(vendor)
            avp.setAVPVSFlag()
        avp.setAVPValue(value)
        return avp

    @staticmethod
    def create_int32_avp(code: int, value: int, vendor: int = 0, mandatory: bool = True) -> DiaAVPInt32:
        avp = DiaAVPInt32()
        avp.setAVPCode(code)
        if mandatory:
            avp.setAVPMandatoryFlag()
        if vendor != 0:
            avp.setAVPVendor(vendor)
            avp.setAVPVSFlag()
        avp.setAVPValue(value)
        return avp

    @staticmethod
    def create_used_service_unit(total: int = 0, upload: int = 0, download: int = 0) -> DiaAVPGroup:
        usu = DiaAVPGroup()
        usu.setAVPCode(446)
        usu.setAVPMandatoryFlag()
        if total > 0:
            usu.addAVP(DiameterAVPHelper.create_uint64_avp(421, total))
        if upload > 0:
            usu.addAVP(DiameterAVPHelper.create_uint64_avp(412, upload))
        if download > 0:
            usu.addAVP(DiameterAVPHelper.create_uint64_avp(414, download))
        return usu

    @staticmethod
    def create_requested_service_unit(total: int) -> DiaAVPGroup:
        rsu = DiaAVPGroup()
        rsu.setAVPCode(437)
        rsu.setAVPMandatoryFlag()
        rsu.addAVP(DiameterAVPHelper.create_uint64_avp(421, total))
        return rsu

    @staticmethod
    def create_mscc(service_id: int, rating_group: Optional[int] = None,
                    used_total: int = 0, used_upload: int = 0, used_download: int = 0,
                    requested: int = 0) -> DiaAVPGroup:
        mscc = DiaAVPGroup()
        mscc.setAVPCode(456)
        mscc.setAVPMandatoryFlag()
        mscc.addAVP(DiameterAVPHelper.create_uint32_avp(439, service_id))
        if rating_group is not None:
            mscc.addAVP(DiameterAVPHelper.create_uint32_avp(432, rating_group))
        if used_total > 0 or used_upload > 0 or used_download > 0:
            mscc.addAVP(DiameterAVPHelper.create_used_service_unit(used_total, used_upload, used_download))
        if requested > 0:
            mscc.addAVP(DiameterAVPHelper.create_requested_service_unit(requested))
        return mscc

    @staticmethod
    def find_avp(msg: DiaMessage, code: int, vendor: int = 0) -> Optional[DiaAVP]:
        avps = msg.getAVPs()
        for avp in avps:
            if avp.getAVPCode() == code and avp.getAVPVendor() == vendor:
                return avp
            if avp.getAVPType() == 'grp':
                sub_avps = avp.getAVPValue()
                if isinstance(sub_avps, list):
                    for sub in sub_avps:
                        if sub.getAVPCode() == code and sub.getAVPVendor() == vendor:
                            return sub
        return None

    @staticmethod
    def _safe_int(val):
        if val is None:
            return None
        if isinstance(val, bytes):
            return int.from_bytes(val, 'big')
        return int(val)

    @staticmethod
    def parse_mscc_response(mscc_avp: DiaAVPGroup) -> Dict[str, Any]:
        result = {
            'service_id': None,
            'rating_group': None,
            'result_code': 2001,
            'granted_units': 0,
            'reauth_required': False
        }
        sub_avps = mscc_avp.getAVPValue()
        if isinstance(sub_avps, list):
            for sub in sub_avps:
                code = sub.getAVPCode()
                val = sub.getAVPValue()
                if code == 439:
                    result['service_id'] = DiameterAVPHelper._safe_int(val)
                elif code == 432:
                    result['rating_group'] = DiameterAVPHelper._safe_int(val)
                elif code == 424:
                    result['result_code'] = DiameterAVPHelper._safe_int(val) or 2001
                elif code == 431:
                    gsu_subs = sub.getAVPValue()
                    if isinstance(gsu_subs, list):
                        for gsu_sub in gsu_subs:
                            if gsu_sub.getAVPCode() == 421:
                                result['granted_units'] = DiameterAVPHelper._safe_int(gsu_sub.getAVPValue()) or 0
                elif code == 434:
                    result['reauth_required'] = True
        return result


class DiameterTestClient:
    def __init__(self, host='127.0.0.1', port=DIAMETER_PORT,
                 origin_host='client.example.com', origin_realm='example.com',
                 use_mscc=True, services=None):
        self.host = host
        self.port = port
        self.origin_host = origin_host
        self.origin_realm = origin_realm
        self.socket = None
        self.helper = DiameterAVPHelper()
        self.use_mscc = use_mscc
        self.services = services or DEFAULT_SERVICES
        self._hbh_id = random.randint(1, 0xFFFFFFFF)
        self._e2e_id = random.randint(1, 0xFFFFFFFF)

    def _next_hbh(self):
        self._hbh_id += 1
        return self._hbh_id

    def _next_e2e(self):
        self._e2e_id += 1
        return self._e2e_id

    def connect(self):
        logger.info(f"Connecting to Diameter server at {self.host}:{self.port}")
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.settimeout(30)
        self.socket.connect((self.host, self.port))
        logger.info("Successfully connected to Diameter server")

    def _recv_all(self, size):
        data = b''
        while len(data) < size:
            chunk = self.socket.recv(size - len(data))
            if not chunk:
                return data
            data += chunk
        return data

    def send_ccr(self, session_id: str, request_type: int, request_number: int,
                  msisdn=None, imsi=None,
                  service_usage: Optional[List[Dict[str, Any]]] = None,
                  requested_units: int = 0) -> Optional[DiaMessage]:
        ccr = DiaMessage()
        ccr.setCommandCode(CMD_CREDIT_CONTROL)
        ccr.setApplicationID(CC_APPLICATION_ID)
        ccr.setHBHID(self._next_hbh())
        ccr.setE2EID(self._next_e2e())
        ccr.setRequestFlag()
        ccr.setProxyableFlag()

        path = DiaAVPPath()
        path.setPath('')

        ccr.addAVPByPath(path, self.helper.create_str_avp(263, session_id.encode()))
        ccr.addAVPByPath(path, self.helper.create_str_avp(264, self.origin_host.encode()))
        ccr.addAVPByPath(path, self.helper.create_str_avp(296, self.origin_realm.encode()))
        ccr.addAVPByPath(path, self.helper.create_int32_avp(258, CC_APPLICATION_ID))
        ccr.addAVPByPath(path, self.helper.create_uint32_avp(416, request_type))
        ccr.addAVPByPath(path, self.helper.create_uint32_avp(415, request_number))

        if msisdn:
            sub_msisdn = DiaAVPGroup()
            sub_msisdn.setAVPCode(443)
            sub_msisdn.setAVPMandatoryFlag()
            sub_msisdn.addAVP(self.helper.create_uint32_avp(450, 1))
            sub_msisdn.addAVP(self.helper.create_str_avp(444, msisdn.encode()))
            ccr.addAVPByPath(path, sub_msisdn)

        if imsi:
            sub_imsi = DiaAVPGroup()
            sub_imsi.setAVPCode(443)
            sub_imsi.setAVPMandatoryFlag()
            sub_imsi.addAVP(self.helper.create_uint32_avp(450, 0))
            sub_imsi.addAVP(self.helper.create_str_avp(444, imsi.encode()))
            ccr.addAVPByPath(path, sub_imsi)

        if self.use_mscc and service_usage:
            for usage in service_usage:
                mscc = self.helper.create_mscc(
                    service_id=usage.get('service_id', 0),
                    rating_group=usage.get('rating_group'),
                    used_total=usage.get('used_total', 0),
                    used_upload=usage.get('used_upload', 0),
                    used_download=usage.get('used_download', 0),
                    requested=usage.get('requested', 0)
                )
                ccr.addAVPByPath(path, mscc)
        else:
            if service_usage and len(service_usage) > 0:
                usage = service_usage[0]
                used_total = usage.get('used_total', 0)
                used_upload = usage.get('used_upload', 0)
                used_download = usage.get('used_download', 0)
                if used_total > 0 or used_upload > 0 or used_download > 0:
                    ccr.addAVPByPath(path, self.helper.create_used_service_unit(used_total, used_upload, used_download))
            if requested_units > 0:
                ccr.addAVPByPath(path, self.helper.create_requested_service_unit(requested_units))

        logger.info(f"Sending CCR: session={session_id}, type={REQUEST_TYPE_MAP.get(request_type, request_type)}, "
                   f"number={request_number}, mscc={self.use_mscc}, services={len(service_usage) if service_usage else 0}")

        try:
            request_bytes = ccr.encode()
            self.socket.sendall(request_bytes)

            header_data = self._recv_all(20)
            if not header_data or len(header_data) < 20:
                logger.error("No response header received")
                return None

            version = header_data[0]
            msg_length = struct.unpack('>I', b'\x00' + header_data[1:4])[0]
            remaining = msg_length - 20

            body_data = b''
            if remaining > 0:
                body_data = self._recv_all(remaining)

            if not body_data and remaining > 0:
                logger.error("Incomplete response body")
                return None

            full_response = header_data + body_data
            response = DiaMessage()
            response.decode(full_response)

            result_code_avp = self.helper.find_avp(response, 268)
            result_code = int(result_code_avp.getAVPValue()) if result_code_avp else 0

            granted_units = 0
            mscc_results = []

            avps = response.getAVPs()
            for avp in avps:
                if avp.getAVPCode() == 456:
                    parsed = self.helper.parse_mscc_response(avp)
                    mscc_results.append(parsed)
                    granted_units += parsed.get('granted_units', 0)
                elif avp.getAVPCode() == 431:
                    sub_avps = avp.getAVPValue()
                    if isinstance(sub_avps, list):
                        for sub in sub_avps:
                            if sub.getAVPCode() == 421:
                                granted_units = int(sub.getAVPValue()) if sub.getAVPValue() else 0

            logger.info(f"Received CCA: session={session_id}, result={result_code}, "
                       f"granted={granted_units}, services={len(mscc_results)}")

            for mr in mscc_results:
                logger.info(f"  Service {mr.get('service_id')}: granted={mr.get('granted_units')}, "
                           f"result={mr.get('result_code')}, reauth={mr.get('reauth_required')}")

            return response

        except Exception as e:
            logger.error(f"Error sending CCR: {e}", exc_info=True)
            return None

    def run_session(self, msisdn=None, imsi=None, update_count=3,
                    base_upload=5*1024*1024, base_download=10*1024*1024,
                    trigger_quota_exhaustion=False):
        session_id = f"{self.origin_host};{uuid.uuid4().hex}"
        logger.info(f"Starting new session: {session_id}")

        request_number = 0

        try:
            service_usage_initial = []
            for svc in self.services:
                service_usage_initial.append({
                    'service_id': svc['service_id'],
                    'used_total': 0,
                    'used_upload': 0,
                    'used_download': 0,
                    'requested': 0
                })

            response = self.send_ccr(session_id, CC_REQUEST_TYPE_INITIAL, request_number,
                                     msisdn, imsi, service_usage_initial)
            if not response:
                logger.error("INITIAL request failed")
                return

            request_number += 1

            for i in range(update_count):
                time.sleep(random.uniform(0.5, 2.0))

                service_usage_update = []
                for svc in self.services:
                    if trigger_quota_exhaustion and i == update_count - 1:
                        used = 150 * 1024 * 1024
                    else:
                        used = random.randint(int(base_upload * 0.5), int(base_upload * 1.5))
                    download = used * 2

                    service_usage_update.append({
                        'service_id': svc['service_id'],
                        'used_total': used + download,
                        'used_upload': used,
                        'used_download': download,
                        'requested': 0
                    })

                response = self.send_ccr(session_id, CC_REQUEST_TYPE_UPDATE, request_number,
                                         msisdn, imsi, service_usage_update)
                if not response:
                    logger.error(f"UPDATE {i+1} request failed")

                request_number += 1

            time.sleep(random.uniform(1, 3))

            service_usage_term = []
            for svc in self.services:
                service_usage_term.append({
                    'service_id': svc['service_id'],
                    'used_total': random.randint(1024*1024, 10*1024*1024),
                    'used_upload': random.randint(512*1024, 5*1024*1024),
                    'used_download': random.randint(512*1024, 5*1024*1024),
                    'requested': 0
                })

            self.send_ccr(session_id, CC_REQUEST_TYPE_TERMINATION, request_number,
                         msisdn, imsi, service_usage_term)

            logger.info(f"Session completed: {session_id}")

        except Exception as e:
            logger.error(f"Session error: {e}", exc_info=True)

    def disconnect(self):
        if self.socket:
            self.socket.close()
            self.socket = None
            logger.info("Disconnected from Diameter server")


def generate_msisdn():
    return f"1{random.choice(['3', '5', '7', '8', '9'])}{''.join(random.choices('0123456789', k=9))}"


def generate_imsi():
    return f"46000{''.join(random.choices('0123456789', k=10))}"


def main():
    parser = argparse.ArgumentParser(description='Diameter Test Client')
    parser.add_argument('--host', default='127.0.0.1', help='Diameter server host')
    parser.add_argument('--port', type=int, default=DIAMETER_PORT, help='Diameter server port')
    parser.add_argument('--sessions', type=int, default=1, help='Number of sessions to run')
    parser.add_argument('--updates', type=int, default=3, help='Number of UPDATE requests per session')
    parser.add_argument('--concurrent', action='store_true', help='Run sessions concurrently')
    parser.add_argument('--no-mscc', action='store_true', help='Disable MSCC (use single service mode)')
    parser.add_argument('--quota-test', action='store_true', help='Trigger quota exhaustion test')
    parser.add_argument('--msisdn', type=str, help='Use specific MSISDN for testing (e.g., 13800138000)')
    parser.add_argument('--imsi', type=str, help='Use specific IMSI for testing')

    args = parser.parse_args()

    client = DiameterTestClient(
        host=args.host,
        port=args.port,
        use_mscc=not args.no_mscc
    )

    try:
        client.connect()

        if args.concurrent:
            threads = []
            for i in range(args.sessions):
                msisdn = args.msisdn if args.msisdn else generate_msisdn()
                imsi = args.imsi if args.imsi else generate_imsi()
                logger.info(f"Starting session {i+1}/{args.sessions} for MSISDN={msisdn}, IMSI={imsi}")
                t = threading.Thread(
                    target=client.run_session,
                    args=(msisdn, imsi, args.updates),
                    kwargs={'trigger_quota_exhaustion': args.quota_test}
                )
                threads.append(t)
                t.start()

            logger.info("All sessions started, waiting for completion...")
            for t in threads:
                t.join()
        else:
            for i in range(args.sessions):
                msisdn = args.msisdn if args.msisdn else generate_msisdn()
                imsi = args.imsi if args.imsi else generate_imsi()
                logger.info(f"Starting session {i+1}/{args.sessions} for MSISDN={msisdn}, IMSI={imsi}")
                client.run_session(
                    msisdn, imsi, args.updates,
                    trigger_quota_exhaustion=args.quota_test
                )
                if i < args.sessions - 1:
                    time.sleep(1)

    except KeyboardInterrupt:
        logger.info("Test interrupted by user")
    finally:
        client.disconnect()
        logger.info("Test completed")


if __name__ == '__main__':
    main()
