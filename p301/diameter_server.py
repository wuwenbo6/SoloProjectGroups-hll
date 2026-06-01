import logging
import threading
import time
import socket
import struct
from typing import Optional, Dict, Any, Tuple, List

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

from api_client import APIClient
from account_manager import account_manager
from cdr_manager import cdr_manager, CDR

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('DiameterOCS')

DIAMETER_PORT = 3868
CC_APPLICATION_ID = 4
CMD_CREDIT_CONTROL = 272

CC_REQUEST_TYPE_INITIAL = 1
CC_REQUEST_TYPE_UPDATE = 2
CC_REQUEST_TYPE_TERMINATION = 3

RESULT_CODE_SUCCESS = 2001
RESULT_CODE_UNKNOWN_SESSION = 5002
RESULT_CODE_RATING_FAILED = 5031
RESULT_CODE_MISSING_AVP = 5005
RESULT_CODE_QUOTA_EXHAUSTED = 5030
RESULT_CODE_CREDIT_LIMIT_REACHED = 5031
RESULT_CODE_USER_UNKNOWN = 5030
RESULT_CODE_INSUFFICIENT_BALANCE = 4012

REQUEST_TYPE_MAP = {
    CC_REQUEST_TYPE_INITIAL: 'INITIAL',
    CC_REQUEST_TYPE_UPDATE: 'UPDATE',
    CC_REQUEST_TYPE_TERMINATION: 'TERMINATION'
}

QUOTA_THRESHOLD_RATIO = 0.2  # 剩余配额低于20%时触发重授
DEFAULT_SERVICE_ID = 0  # 默认业务ID


class ServiceQuota:
    def __init__(self, service_id: int, rating_group: Optional[int] = None):
        self.service_id = service_id
        self.rating_group = rating_group
        self.granted_units = 0  # 已授予的总配额
        self.used_units = 0     # 已使用的配额
        self.upload_bytes = 0
        self.download_bytes = 0
        self.last_grant_time = time.time()
        self.validity_time = 3600  # 配额有效期(秒)
        self.reauthorization_required = False  # 是否需要重授

    @property
    def remaining_units(self) -> int:
        return max(0, self.granted_units - self.used_units)

    @property
    def is_quota_low(self) -> bool:
        if self.granted_units == 0:
            return True
        return self.remaining_units < (self.granted_units * QUOTA_THRESHOLD_RATIO)

    @property
    def is_expired(self) -> bool:
        return (time.time() - self.last_grant_time) > self.validity_time

    @property
    def needs_reauthorization(self) -> bool:
        return self.reauthorization_required or self.is_quota_low or self.is_expired

    def grant_quota(self, units: int):
        self.granted_units += units
        self.last_grant_time = time.time()
        self.reauthorization_required = False

    def report_usage(self, units: int, upload: int = 0, download: int = 0):
        self.used_units += units
        self.upload_bytes += upload
        self.download_bytes += download


class CreditControlSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.state = 'IDLE'
        self.request_number = 0
        self.service_quotas: Dict[int, ServiceQuota] = {}  # service_id -> ServiceQuota
        self.created_at = time.time()
        self.msisdn = None
        self.imsi = None

    def get_or_create_service_quota(self, service_id: int, rating_group: Optional[int] = None) -> ServiceQuota:
        if service_id not in self.service_quotas:
            self.service_quotas[service_id] = ServiceQuota(service_id, rating_group)
        return self.service_quotas[service_id]

    def get_total_upload(self) -> int:
        return sum(sq.upload_bytes for sq in self.service_quotas.values())

    def get_total_download(self) -> int:
        return sum(sq.download_bytes for sq in self.service_quotas.values())

    def get_total_used(self) -> int:
        return sum(sq.used_units for sq in self.service_quotas.values())

    def get_total_granted(self) -> int:
        return sum(sq.granted_units for sq in self.service_quotas.values())

    def get_remaining_total(self) -> int:
        return sum(sq.remaining_units for sq in self.service_quotas.values())

    def needs_reauthorization(self) -> bool:
        return any(sq.needs_reauthorization for sq in self.service_quotas.values())


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
    def find_all_avp(msg: DiaMessage, code: int, vendor: int = 0) -> List[DiaAVP]:
        results = []
        avps = msg.getAVPs()
        for avp in avps:
            if avp.getAVPCode() == code and avp.getAVPVendor() == vendor:
                results.append(avp)
            if avp.getAVPType() == 'grp':
                sub_avps = avp.getAVPValue()
                if isinstance(sub_avps, list):
                    for sub in sub_avps:
                        if sub.getAVPCode() == code and sub.getAVPVendor() == vendor:
                            results.append(sub)
        return results

    @staticmethod
    def get_avp_value(avp: Optional[DiaAVP], default=None):
        if avp is None:
            return default
        val = avp.getAVPValue()
        return val

    @staticmethod
    def find_all_mscc(msg: DiaMessage) -> List[DiaAVPGroup]:
        results = []
        avps = msg.getAVPs()
        for avp in avps:
            if avp.getAVPCode() == 456:  # Multiple-Services-Credit-Control
                results.append(avp)
        return results

    @staticmethod
    def parse_mscc(mscc_avp: DiaAVPGroup) -> Dict[str, Any]:
        result = {
            'service_id': None,
            'rating_group': None,
            'used_total': 0,
            'used_upload': 0,
            'used_download': 0,
            'requested_units': 0
        }

        sub_avps = mscc_avp.getAVPValue()
        if not isinstance(sub_avps, list):
            return result

        for sub in sub_avps:
            code = sub.getAVPCode()
            val = sub.getAVPValue()

            if code == 439:  # Service-Identifier
                result['service_id'] = int(val) if val is not None else None
            elif code == 432:  # Rating-Group
                result['rating_group'] = int(val) if val is not None else None
            elif code == 446:  # Used-Service-Unit
                result.update(DiameterAVPHelper.parse_usage_avp(sub))
            elif code == 437:  # Requested-Service-Unit
                result.update(DiameterAVPHelper.parse_requested_units(sub))

        return result

    @staticmethod
    def parse_usage_avp(usage_avp: DiaAVP) -> Dict[str, int]:
        result = {'used_total': 0, 'used_upload': 0, 'used_download': 0}
        sub_avps = usage_avp.getAVPValue()
        if isinstance(sub_avps, list):
            for sub in sub_avps:
                code = sub.getAVPCode()
                val = sub.getAVPValue()
                if code == 421:  # CC-Total-Octets
                    result['used_total'] = int(val) if val is not None else 0
                elif code == 412:  # CC-Input-Octets
                    result['used_upload'] = int(val) if val is not None else 0
                elif code == 414:  # CC-Output-Octets
                    result['used_download'] = int(val) if val is not None else 0

            if result['used_upload'] == 0 and result['used_download'] == 0 and result['used_total'] > 0:
                result['used_upload'] = result['used_total'] // 2
                result['used_download'] = result['used_total'] // 2

        return result

    @staticmethod
    def parse_requested_units(request_avp: DiaAVP) -> Dict[str, int]:
        result = {'requested_units': 0}
        sub_avps = request_avp.getAVPValue()
        if isinstance(sub_avps, list):
            for sub in sub_avps:
                code = sub.getAVPCode()
                val = sub.getAVPValue()
                if code == 421:  # CC-Total-Octets
                    result['requested_units'] = int(val) if val is not None else 0
        return result


class OCSDiameterServer:
    def __init__(self, host: str = '0.0.0.0', port: int = DIAMETER_PORT,
                 origin_host: str = 'ocs.example.com',
                 origin_realm: str = 'example.com',
                 default_quota: int = 104857600,
                 api_host: str = '127.0.0.1',
                 api_port: int = 5001):
        self.host = host
        self.port = port
        self.origin_host = origin_host
        self.origin_realm = origin_realm
        self.default_quota = default_quota
        self.sessions: Dict[str, CreditControlSession] = {}
        self.sessions_lock = threading.Lock()
        self.server_socket = None
        self._running = False
        self.clients = []
        self.helper = DiameterAVPHelper()
        self.api_client = APIClient(api_host=api_host, api_port=api_port)

    def _get_or_create_session(self, session_id: str) -> CreditControlSession:
        with self.sessions_lock:
            if session_id not in self.sessions:
                self.sessions[session_id] = CreditControlSession(session_id)
            return self.sessions[session_id]

    def _remove_session(self, session_id: str):
        with self.sessions_lock:
            if session_id in self.sessions:
                del self.sessions[session_id]

    def _extract_subscription_ids(self, request: DiaMessage) -> Tuple[Optional[str], Optional[str]]:
        msisdn = None
        imsi = None
        try:
            subs = self.helper.find_all_avp(request, 443)
            for sub in subs:
                sub_avps = sub.getAVPValue()
                if isinstance(sub_avps, list):
                    sub_type = None
                    sub_data = None
                    for sub_avp in sub_avps:
                        code = sub_avp.getAVPCode()
                        if code == 450:
                            sub_type = int(sub_avp.getAVPValue())
                        elif code == 444:
                            sub_data = sub_avp.getAVPValue()
                            if isinstance(sub_data, bytes):
                                sub_data = sub_data.decode('utf-8', errors='replace')
                            else:
                                sub_data = str(sub_data)

                    if sub_type is not None and sub_data is not None:
                        if sub_type == 0:
                            imsi = sub_data
                        elif sub_type == 1:
                            msisdn = sub_data
        except Exception as e:
            logger.warning(f"Error extracting subscription IDs: {e}")
        return msisdn, imsi

    def _sync_account_to_api(self, msisdn: str):
        account = account_manager.get_account(msisdn)
        if account and self.api_client:
            self.api_client.sync_account(account.to_dict())

    def _grant_quota_for_service(self, msisdn: Optional[str], service_quota: ServiceQuota, requested: int = 0) -> Tuple[int, Dict[str, Any]]:
        requested_units = requested if requested > 0 else self.default_quota

        balance_info = {
            'can_grant': True,
            'balance_before': 0.0,
            'balance_after': 0.0,
            'charged_amount': 0.0,
            'cost': 0.0,
            'error': None
        }

        if not msisdn:
            return requested_units, balance_info

        account = account_manager.get_or_create_account(msisdn)
        balance_info['balance_before'] = account.available_balance
        cost = account_manager.calculate_cost(requested_units)
        balance_info['cost'] = cost

        if not account.has_sufficient_balance(cost):
            balance_info['can_grant'] = False
            balance_info['error'] = 'Insufficient balance'
            logger.warning(f"  Service {service_quota.service_id}: insufficient balance for {requested_units} bytes, "
                          f"cost={cost:.2f} yuan, balance={account.available_balance:.2f} yuan")
            max_affordable_mb = account.available_balance / account_manager.price_per_mb
            max_affordable_bytes = int(max_affordable_mb * 1024 * 1024)
            if max_affordable_bytes > 0:
                actual_cost = account_manager.calculate_cost(max_affordable_bytes)
                if account.charge(actual_cost):
                    balance_info['charged_amount'] = actual_cost
                    balance_info['balance_after'] = account.available_balance
                    logger.info(f"  Service {service_quota.service_id}: granting partial quota {max_affordable_bytes} bytes, "
                               f"charged {actual_cost:.2f} yuan")
                    self._sync_account_to_api(msisdn)
                    return max_affordable_bytes, balance_info
            return 0, balance_info

        if account.charge(cost):
            balance_info['charged_amount'] = cost
            balance_info['balance_after'] = account.available_balance
            logger.info(f"  Service {service_quota.service_id}: charged {cost:.2f} yuan, "
                       f"balance before={balance_info['balance_before']:.2f} yuan, "
                       f"after={balance_info['balance_after']:.2f} yuan")
            self._sync_account_to_api(msisdn)
            return requested_units, balance_info

        return 0, balance_info

    def _build_gsu_avp(self, units: int, validity: int = 3600) -> DiaAVPGroup:
        gsu_avp = DiaAVPGroup()
        gsu_avp.setAVPCode(431)  # Granted-Service-Unit
        gsu_avp.setAVPMandatoryFlag()

        gsu_avp.addAVP(self.helper.create_uint64_avp(421, units))
        gsu_avp.addAVP(self.helper.create_uint64_avp(412, units // 2))
        gsu_avp.addAVP(self.helper.create_uint64_avp(414, units // 2))
        gsu_avp.addAVP(self.helper.create_uint32_avp(448, validity))

        return gsu_avp

    def _create_cdr(self, session: CreditControlSession, service_quota: ServiceQuota,
                    request_type: int, request_number: int, result_code: int,
                    balance_info: Dict[str, Any]) -> CDR:
        cdr = cdr_manager.create_cdr(session.session_id, session.msisdn or '', session.imsi)
        cdr.service_id = service_quota.service_id
        cdr.rating_group = service_quota.rating_group
        cdr.request_number = request_number
        cdr.result_code = result_code
        cdr.upload_bytes = service_quota.upload_bytes
        cdr.download_bytes = service_quota.download_bytes
        cdr.total_bytes = service_quota.used_units
        cdr.charged_amount = balance_info.get('charged_amount', 0.0)
        cdr.balance_before = balance_info.get('balance_before', 0.0)
        cdr.balance_after = balance_info.get('balance_after', 0.0)
        cdr.price_per_mb = account_manager.price_per_mb
        cdr.reauth_required = service_quota.reauthorization_required

        if request_type == CC_REQUEST_TYPE_INITIAL:
            cdr.cdr_type = CDR.CDR_TYPE_INITIAL
            cdr.credits_granted = service_quota.granted_units
        elif request_type == CC_REQUEST_TYPE_UPDATE:
            cdr.cdr_type = CDR.CDR_TYPE_UPDATE
            cdr.credits_granted = service_quota.granted_units
        elif request_type == CC_REQUEST_TYPE_TERMINATION:
            cdr.cdr_type = CDR.CDR_TYPE_TERMINATION
            cdr.credits_granted = 0

        if self.api_client:
            cdr_dict = cdr.to_dict()
            self.api_client.send_cdr(cdr_dict)

        return cdr

    def _build_mscc_avp(self, service_quota: ServiceQuota, granted_units: int, result_code: int) -> DiaAVPGroup:
        mscc_avp = DiaAVPGroup()
        mscc_avp.setAVPCode(456)  # Multiple-Services-Credit-Control
        mscc_avp.setAVPMandatoryFlag()

        if service_quota.service_id is not None:
            mscc_avp.addAVP(self.helper.create_uint32_avp(439, service_quota.service_id))

        if service_quota.rating_group is not None:
            mscc_avp.addAVP(self.helper.create_uint32_avp(432, service_quota.rating_group))

        if result_code != RESULT_CODE_SUCCESS:
            mscc_avp.addAVP(self.helper.create_uint32_avp(424, result_code))

        if granted_units > 0:
            mscc_avp.addAVP(self._build_gsu_avp(granted_units))

        if service_quota.needs_reauthorization:
            mscc_avp.addAVP(self.helper.create_uint32_avp(434, 1))

        return mscc_avp

    def _build_cca(self, request: DiaMessage, result_code: int, session: CreditControlSession,
                   service_results: List[Dict[str, Any]]) -> DiaMessage:
        cca = DiaMessage()
        cca.setCommandCode(CMD_CREDIT_CONTROL)
        cca.setApplicationID(CC_APPLICATION_ID)
        cca.setHBHID(request.getHBHID())
        cca.setE2EID(request.getE2EID())
        cca.clearRequestFlag()
        cca.setProxyableFlag()

        path = DiaAVPPath()
        path.setPath('')

        cca.addAVPByPath(path, self.helper.create_str_avp(263, session.session_id.encode()))
        cca.addAVPByPath(path, self.helper.create_str_avp(264, self.origin_host.encode()))
        cca.addAVPByPath(path, self.helper.create_str_avp(296, self.origin_realm.encode()))
        cca.addAVPByPath(path, self.helper.create_uint32_avp(268, result_code))

        cc_request_type = self.helper.find_avp(request, 416)
        if cc_request_type:
            cca.addAVPByPath(path, self.helper.create_uint32_avp(416, int(cc_request_type.getAVPValue())))

        cc_request_num = self.helper.find_avp(request, 415)
        if cc_request_num:
            cca.addAVPByPath(path, self.helper.create_uint32_avp(415, int(cc_request_num.getAVPValue())))

        for sr in service_results:
            service_quota = sr['service_quota']
            granted = sr.get('granted_units', 0)
            sr_result = sr.get('result_code', RESULT_CODE_SUCCESS)
            mscc_avp = self._build_mscc_avp(service_quota, granted, sr_result)
            cca.addAVPByPath(path, mscc_avp)

        return cca

    def handle_ccr(self, request: DiaMessage) -> Optional[DiaMessage]:
        try:
            session_id_avp = self.helper.find_avp(request, 263)
            if not session_id_avp:
                logger.error("CCR without Session-Id")
                return None

            session_id_val = session_id_avp.getAVPValue()
            if isinstance(session_id_val, bytes):
                session_id = session_id_val.decode('utf-8', errors='replace')
            else:
                session_id = str(session_id_val)

            cc_request_type_avp = self.helper.find_avp(request, 416)
            cc_request_num_avp = self.helper.find_avp(request, 415)

            if not cc_request_type_avp or not cc_request_num_avp:
                logger.error(f"CCR {session_id} missing CC-Request-Type or CC-Request-Number")
                return None

            request_type = int(cc_request_type_avp.getAVPValue())
            request_number = int(cc_request_num_avp.getAVPValue())

            logger.info(f"Received CCR: session={session_id}, type={REQUEST_TYPE_MAP.get(request_type, request_type)}, "
                       f"number={request_number}")

            msisdn, imsi = self._extract_subscription_ids(request)

            session = self._get_or_create_session(session_id)
            session.msisdn = msisdn or session.msisdn
            session.imsi = imsi or session.imsi
            session.request_number = request_number

            result_code = RESULT_CODE_SUCCESS
            service_results = []

            mscc_avps = self.helper.find_all_mscc(request)

            if not mscc_avps:
                mscc_data = {'service_id': DEFAULT_SERVICE_ID, 'rating_group': None,
                            'used_total': 0, 'used_upload': 0, 'used_download': 0,
                            'requested_units': 0}
                usage_avp = self.helper.find_avp(request, 446)
                if usage_avp:
                    parsed = self.helper.parse_usage_avp(usage_avp)
                    mscc_data['used_total'] = parsed['used_total']
                    mscc_data['used_upload'] = parsed['used_upload']
                    mscc_data['used_download'] = parsed['used_download']
                requested_avp = self.helper.find_avp(request, 437)
                if requested_avp:
                    parsed = self.helper.parse_requested_units(requested_avp)
                    mscc_data['requested_units'] = parsed['requested_units']

                service_quota = session.get_or_create_service_quota(
                    mscc_data['service_id'], mscc_data['rating_group']
                )
                service_results.append({
                    'service_quota': service_quota,
                    'mscc_data': mscc_data
                })
            else:
                for mscc_avp in mscc_avps:
                    mscc_data = self.helper.parse_mscc(mscc_avp)
                    service_id = mscc_data.get('service_id') or DEFAULT_SERVICE_ID
                    service_quota = session.get_or_create_service_quota(
                        service_id, mscc_data.get('rating_group')
                    )
                    service_results.append({
                        'service_quota': service_quota,
                        'mscc_data': mscc_data
                    })

            if request_type == CC_REQUEST_TYPE_INITIAL:
                session.state = 'ACTIVE'
                for sr in service_results:
                    sq = sr['service_quota']
                    md = sr['mscc_data']
                    requested = md.get('requested_units', 0)
                    granted, balance_info = self._grant_quota_for_service(msisdn, sq, requested)
                    sr['balance_info'] = balance_info

                    if granted > 0:
                        sq.grant_quota(granted)
                        sr['granted_units'] = granted
                        sr['result_code'] = RESULT_CODE_SUCCESS
                        logger.info(f"  Service {sq.service_id}: granted {granted} bytes")
                    else:
                        sr['granted_units'] = 0
                        sr['result_code'] = RESULT_CODE_INSUFFICIENT_BALANCE
                        logger.warning(f"  Service {sq.service_id}: insufficient balance, grant denied")

                    cdr = self._create_cdr(session, sq, request_type, request_number, sr['result_code'], balance_info)
                    cdr_manager.add_cdr(cdr)

            elif request_type == CC_REQUEST_TYPE_UPDATE:
                if session.state != 'ACTIVE':
                    result_code = RESULT_CODE_UNKNOWN_SESSION
                    logger.warning(f"UPDATE for inactive session: {session_id}")
                else:
                    for sr in service_results:
                        sq = sr['service_quota']
                        md = sr['mscc_data']
                        used = md.get('used_total', 0)
                        upload = md.get('used_upload', 0)
                        download = md.get('used_download', 0)
                        sq.report_usage(used, upload, download)

                        balance_info = {'balance_before': 0.0, 'balance_after': 0.0, 'charged_amount': 0.0}
                        if msisdn:
                            account = account_manager.get_account(msisdn)
                            if account:
                                balance_info['balance_before'] = account.available_balance
                                balance_info['balance_after'] = account.available_balance

                        if sq.remaining_units <= 0:
                            sr['result_code'] = RESULT_CODE_QUOTA_EXHAUSTED
                            sq.reauthorization_required = True
                            logger.warning(f"  Service {sq.service_id}: quota exhausted, used {used} bytes")
                            granted, grant_balance = self._grant_quota_for_service(msisdn, sq, md.get('requested_units', 0))
                            if granted > 0:
                                sq.grant_quota(granted)
                                sr['granted_units'] = granted
                                balance_info.update(grant_balance)
                                logger.info(f"  Service {sq.service_id}: re-granted {granted} bytes")
                            else:
                                sr['granted_units'] = 0
                                sr['result_code'] = RESULT_CODE_INSUFFICIENT_BALANCE
                                balance_info.update(grant_balance)
                                logger.warning(f"  Service {sq.service_id}: re-grant failed, insufficient balance")
                        else:
                            sr['result_code'] = RESULT_CODE_SUCCESS
                            if sq.needs_reauthorization or md.get('requested_units', 0) > 0:
                                requested = md.get('requested_units', 0)
                                granted, grant_balance = self._grant_quota_for_service(msisdn, sq, requested)
                                if granted > 0:
                                    sq.grant_quota(granted)
                                    sr['granted_units'] = granted
                                    balance_info.update(grant_balance)
                                    logger.info(f"  Service {sq.service_id}: used {used} bytes, granted additional {granted} bytes")
                                else:
                                    sr['granted_units'] = 0
                                    sr['result_code'] = RESULT_CODE_INSUFFICIENT_BALANCE
                                    balance_info.update(grant_balance)
                                    logger.warning(f"  Service {sq.service_id}: grant failed, insufficient balance")
                            else:
                                sr['granted_units'] = 0
                                logger.info(f"  Service {sq.service_id}: used {used} bytes, remaining {sq.remaining_units} bytes")

                        sr['balance_info'] = balance_info
                        cdr = self._create_cdr(session, sq, request_type, request_number, sr['result_code'], balance_info)
                        cdr_manager.add_cdr(cdr)

            elif request_type == CC_REQUEST_TYPE_TERMINATION:
                for sr in service_results:
                    sq = sr['service_quota']
                    md = sr['mscc_data']
                    used = md.get('used_total', 0)
                    upload = md.get('used_upload', 0)
                    download = md.get('used_download', 0)
                    sq.report_usage(used, upload, download)
                    sr['granted_units'] = 0
                    sr['result_code'] = RESULT_CODE_SUCCESS
                    logger.info(f"  Service {sq.service_id}: final usage {used} bytes")

                    balance_info = {'balance_before': 0.0, 'balance_after': 0.0, 'charged_amount': 0.0}
                    if msisdn:
                        account = account_manager.get_account(msisdn)
                        if account:
                            balance_info['balance_before'] = account.available_balance
                            balance_info['balance_after'] = account.available_balance
                    sr['balance_info'] = balance_info

                    cdr = self._create_cdr(session, sq, request_type, request_number, sr['result_code'], balance_info)
                    cdr_manager.add_cdr(cdr)

                session.state = 'TERMINATED'
                logger.info(f"Session terminated: {session_id}, "
                           f"total_upload={session.get_total_upload()}, "
                           f"total_download={session.get_total_download()}")
                self._remove_session(session_id)

            else:
                result_code = RESULT_CODE_RATING_FAILED
                logger.error(f"Unknown CC-Request-Type: {request_type}")

            for sr in service_results:
                sq = sr['service_quota']
                balance_info = sr.get('balance_info', {})
                event = {
                    'session_id': session_id,
                    'request_type': REQUEST_TYPE_MAP.get(request_type, str(request_type)),
                    'request_number': request_number,
                    'result_code': sr.get('result_code', result_code),
                    'service_id': sq.service_id,
                    'rating_group': sq.rating_group,
                    'upload_bytes': sq.upload_bytes,
                    'download_bytes': sq.download_bytes,
                    'total_bytes': sq.used_units,
                    'credits_granted': sr.get('granted_units', 0),
                    'remaining_units': sq.remaining_units,
                    'msisdn': msisdn,
                    'imsi': imsi,
                    'balance_before': balance_info.get('balance_before', 0.0),
                    'balance_after': balance_info.get('balance_after', 0.0),
                    'charged_amount': balance_info.get('charged_amount', 0.0),
                    'session_total_upload': session.get_total_upload(),
                    'session_total_download': session.get_total_download(),
                    'session_total_credits': session.get_total_granted()
                }
                self.api_client.send_event(event)

            total_granted = sum(sr.get('granted_units', 0) for sr in service_results)
            cca = self._build_cca(request, result_code, session, service_results)
            logger.info(f"Sent CCA: session={session_id}, result={result_code}, total_credits={total_granted}")
            return cca

        except Exception as e:
            logger.error(f"Error handling CCR: {e}", exc_info=True)
            return None

    def _handle_client(self, client_socket: socket.socket, client_address: Tuple[str, int]):
        logger.info(f"New client connected from {client_address}")
        self.clients.append(client_socket)

        try:
            while self._running:
                header_data = self._recv_all(client_socket, 20)
                if not header_data or len(header_data) < 20:
                    break

                version = header_data[0]
                msg_length = struct.unpack('>I', b'\x00' + header_data[1:4])[0]
                remaining = msg_length - 20

                body_data = b''
                if remaining > 0:
                    body_data = self._recv_all(client_socket, remaining)

                if not body_data and remaining > 0:
                    break

                full_message = header_data + body_data

                try:
                    request = DiaMessage()
                    request.decode(full_message)

                    if request.getCommandCode() == CMD_CREDIT_CONTROL and request.getFlags() & 0x80:
                        response = self.handle_ccr(request)
                        if response:
                            response_bytes = response.encode()
                            client_socket.sendall(response_bytes)
                except Exception as e:
                    logger.error(f"Error processing message: {e}", exc_info=True)

        except Exception as e:
            logger.error(f"Client handler error: {e}", exc_info=True)
        finally:
            logger.info(f"Client disconnected: {client_address}")
            if client_socket in self.clients:
                self.clients.remove(client_socket)
            client_socket.close()

    def _recv_all(self, sock: socket.socket, size: int) -> bytes:
        data = b''
        while len(data) < size:
            try:
                chunk = sock.recv(size - len(data))
                if not chunk:
                    return data
                data += chunk
            except socket.timeout:
                return data
            except Exception:
                return data
        return data

    def start(self):
        logger.info(f"Starting Diameter OCS Server on {self.host}:{self.port}")
        logger.info(f"Origin-Host: {self.origin_host}, Origin-Realm: {self.origin_realm}")
        logger.info(f"Default quota per request: {self.default_quota} bytes ({self.default_quota / 1024 / 1024:.2f} MB)")
        logger.info(f"Quota threshold: {QUOTA_THRESHOLD_RATIO * 100:.0f}%, reauthorization when below threshold")

        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind((self.host, self.port))
        self.server_socket.listen(5)
        self.server_socket.settimeout(1.0)

        self._running = True

        try:
            logger.info("Diameter OCS Server started successfully")
            while self._running:
                try:
                    client_socket, client_address = self.server_socket.accept()
                    client_thread = threading.Thread(
                        target=self._handle_client,
                        args=(client_socket, client_address),
                        daemon=True
                    )
                    client_thread.start()
                except socket.timeout:
                    continue
                except Exception as e:
                    logger.error(f"Accept error: {e}", exc_info=True)
        except KeyboardInterrupt:
            logger.info("Received shutdown signal")
        finally:
            self.stop()

    def stop(self):
        logger.info("Stopping Diameter OCS Server...")
        self._running = False
        for client in self.clients:
            try:
                client.close()
            except Exception:
                pass
        self.clients.clear()
        if self.server_socket:
            try:
                self.server_socket.close()
            except Exception as e:
                logger.error(f"Error closing server socket: {e}")
        logger.info("Diameter OCS Server stopped")


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Diameter OCS Server')
    parser.add_argument('--host', default='0.0.0.0', help='Listen host')
    parser.add_argument('--port', type=int, default=DIAMETER_PORT, help='Listen port')
    parser.add_argument('--origin-host', default='ocs.example.com', help='Origin-Host')
    parser.add_argument('--origin-realm', default='example.com', help='Origin-Realm')
    parser.add_argument('--default-quota', type=int, default=104857600, help='Default quota in bytes (default: 100MB)')
    parser.add_argument('--api-host', default='127.0.0.1', help='API server host')
    parser.add_argument('--api-port', type=int, default=5001, help='API server port')

    args = parser.parse_args()

    server = OCSDiameterServer(
        host=args.host,
        port=args.port,
        origin_host=args.origin_host,
        origin_realm=args.origin_realm,
        default_quota=args.default_quota,
        api_host=args.api_host,
        api_port=args.api_port
    )
    server.start()


if __name__ == '__main__':
    main()
