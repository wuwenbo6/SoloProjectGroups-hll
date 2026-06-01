import socket
import struct
import threading
import uuid
from .iscsi_pdu import (
    ISCSIPDU, OPCODE_LOGIN_REQ, OPCODE_SCSI_CMD, OPCODE_LOGOUT_REQ,
    OPCODE_NOP_OUT, OPCODE_SCSI_DATA_OUT,
    build_login_response, build_scsi_response, build_data_in,
    build_nop_in, build_logout_response,
    LOGIN_FLAG_TRANSIT, LOGIN_STG_FULL_FEATURE
)
from .scsi_handler import SCSIHandler
from .lun import LUNManager
from .session import SessionManager
from .chap import CHAPManager, CHAPAuth

SCSI_OP_WRITE_10 = 0x2a
SCSI_OP_READ_10 = 0x28

class ISCSITarget:
    def __init__(self, host='0.0.0.0', port=3260, 
                 target_name='iqn.2024-01.example:storage:target1',
                 storage_dir='./storage',
                 chap_users=None,
                 use_chap=False):
        self.host = host
        self.port = port
        self.target_name = target_name
        self.storage_dir = storage_dir
        self.use_chap = use_chap
        self.chap_manager = CHAPManager(chap_users or {})
        
        self.lun_manager = LUNManager(storage_dir)
        self.scsi_handler = SCSIHandler(self.lun_manager, target_name)
        self.session_manager = SessionManager()
        
        self.server_socket = None
        self.running = False
        self.connections = []
        self.lock = threading.Lock()
        
        self.on_session_change = None
        self._pending_writes = {}
        self._chap_states = {}
    
    def add_lun(self, lun_id, filename, size=None):
        return self.lun_manager.add_lun(lun_id, filename, size)
    
    def remove_lun(self, lun_id):
        self.lun_manager.remove_lun(lun_id)
    
    def get_sessions(self):
        return self.session_manager.get_sessions_info()
    
    def get_luns(self):
        return self.lun_manager.get_all_luns_info()
    
    def _parse_login_params(self, data):
        params = {}
        text = data.decode('utf-8', errors='ignore')
        for line in text.split('\x00'):
            if '=' in line:
                key, value = line.split('=', 1)
                params[key.strip()] = value.strip()
        return params
    
    def _build_login_params(self, params):
        text = '\x00'.join(f'{k}={v}' for k, v in params.items())
        if text:
            text += '\x00'
        return text.encode('utf-8')
    
    def _handle_login(self, conn, addr, pdu, chap_state=None):
        flags = pdu.flags
        data = pdu.data
        
        params = self._parse_login_params(data)
        
        initiator_name = params.get('InitiatorName', 'unknown')
        target_name = params.get('TargetName', self.target_name)
        
        response_params = {
            'TargetName': self.target_name,
            'InitiatorName': initiator_name,
            'TargetPortalGroupTag': 1,
            'MaxConnections': 1,
            'MaxRecvDataSegmentLength': 8192,
            'DefaultTime2Wait': 2,
            'DefaultTime2Retain': 0,
            'ErrorRecoveryLevel': 0,
            'HeaderDigest': 'None',
            'DataDigest': 'None',
        }
        
        if self.use_chap:
            response_params['AuthMethod'] = 'CHAP'
            
            if 'CHAP_A' in params:
                chap_username = params.get('CHAP_N', '')
                chap_response = params.get('CHAP_R', '')
                chap_identifier = int(params.get('CHAP_I', '1'))
                
                if chap_state and chap_state.challenge:
                    if chap_username and self.chap_manager.verify_user(chap_username):
                        chap_state.username = chap_username
                        chap_state.secret = self.chap_manager.get_secret(chap_username)
                        
                        if chap_response:
                            response_bytes = bytes.fromhex(chap_response) if chap_response else b''
                            if chap_state.verify_response(response_bytes, chap_identifier):
                                chap_state.authenticated = True
                            else:
                                return None, False
                    else:
                        return None, False
                
                if not chap_state or not chap_state.authenticated:
                    if not chap_state:
                        chap_state = CHAPAuth()
                    chap_challenge = chap_state.generate_challenge()
                    response_params['CHAP_A'] = '5'
                    response_params['CHAP_I'] = '1'
                    response_params['CHAP_C'] = chap_challenge.hex()
                    
                    response_data = self._build_login_params(response_params)
                    response = build_login_response(
                        pdu.initiator_task_tag, 0, flags, response_data
                    )
                    conn.sendall(response)
                    return chap_state, False
                
                response_params.pop('AuthMethod', None)
                response_params.pop('CHAP_A', None)
                response_params.pop('CHAP_I', None)
                response_params.pop('CHAP_C', None)
        
        if flags & LOGIN_FLAG_TRANSIT:
            session_id = str(uuid.uuid4())
            session = self.session_manager.create_session(
                session_id, initiator_name, addr, target_name
            )
            
            response_data = self._build_login_params(response_params)
            stage_flags = LOGIN_FLAG_TRANSIT | (LOGIN_STG_FULL_FEATURE << 2) | LOGIN_STG_FULL_FEATURE
            
            response = build_login_response(
                pdu.initiator_task_tag,
                session.tsih,
                stage_flags,
                response_data
            )
            conn.sendall(response)
            
            if self.on_session_change:
                self.on_session_change()
            
            return session_id, True
        
        response_data = self._build_login_params(response_params)
        response = build_login_response(
            pdu.initiator_task_tag, 0, flags, response_data
        )
        conn.sendall(response)
        
        return None, False
    
    def _handle_scsi_command(self, conn, session_id, pdu):
        cdb = pdu.data[:16]
        lun_id = pdu.lun & 0xffff
        opcode = cdb[0]
        
        if opcode == SCSI_OP_WRITE_10:
            lba = struct.unpack('>I', cdb[2:6])[0]
            transfer_length = struct.unpack('>H', cdb[7:9])[0]
            if transfer_length == 0:
                transfer_length = 0x10000
            
            block_size = 512
            expected_length = transfer_length * block_size
            itt = pdu.initiator_task_tag
            
            self._pending_writes[itt] = {
                'lun_id': lun_id,
                'lba': lba,
                'transfer_length': transfer_length,
                'expected_length': expected_length,
                'received_data': b'',
                'offset': 0,
                'session_id': session_id
            }
            
            r2t = build_r2t(itt, itt, 0, expected_length)
            conn.sendall(r2t)
            return
        
        status, data = self.scsi_handler.handle_command(lun_id, cdb)
        
        is_read = opcode == SCSI_OP_READ_10
        
        self.session_manager.update_session_activity(
            session_id, bytes_read=len(data), is_read=is_read
        )
        
        if data:
            max_data_length = struct.unpack('>I', pdu.data[20:24])[0] if len(pdu.data) >= 24 else 8192
            offset = 0
            remaining = len(data)
            
            while remaining > 0:
                chunk_size = min(remaining, max_data_length)
                chunk = data[offset:offset + chunk_size]
                flags = 0
                if offset + chunk_size >= len(data):
                    flags = 1
                
                data_pdu = build_data_in(pdu.initiator_task_tag, chunk, offset, flags)
                conn.sendall(data_pdu)
                
                offset += chunk_size
                remaining -= chunk_size
        
        response = build_scsi_response(pdu.initiator_task_tag, status)
        conn.sendall(response)
    
    def _handle_nop_out(self, conn, pdu):
        response = build_nop_in(pdu.initiator_task_tag, pdu.data)
        conn.sendall(response)
    
    def _handle_logout(self, conn, session_id, pdu):
        response = build_logout_response(pdu.initiator_task_tag, 0)
        conn.sendall(response)
        
        if session_id:
            self.session_manager.remove_session(session_id)
            if self.on_session_change:
                self.on_session_change()
    
    def _handle_data_out(self, conn, session_id, pdu):
        itt = pdu.initiator_task_tag
        write_info = self._pending_writes.get(itt)
        
        if not write_info:
            return
        
        write_info['received_data'] += pdu.data
        
        if len(write_info['received_data']) >= write_info['expected_length']:
            data = write_info['received_data'][:write_info['expected_length']]
            lun_id = write_info['lun_id']
            lba = write_info['lba']
            block_size = 512
            offset = lba * block_size
            
            lun = self.lun_manager.get_lun(lun_id)
            if lun:
                try:
                    lun.write(offset, data)
                    status = 0
                    self.session_manager.update_session_activity(
                        session_id, bytes_written=len(data), is_write=True
                    )
                except Exception:
                    status = 2
            else:
                status = 2
            
            response = build_scsi_response(itt, status)
            conn.sendall(response)
            del self._pending_writes[itt]
    
    def _handle_connection(self, conn, addr):
        session_id = None
        logged_in = False
        chap_state = None
        
        try:
            conn.settimeout(30.0)
            
            while self.running:
                header = conn.recv(48)
                if not header:
                    break
                
                data_len = struct.unpack('>I', header[4:8])[0] & 0x00ffffff
                
                data = b''
                while len(data) < data_len:
                    chunk = conn.recv(data_len - len(data))
                    if not chunk:
                        break
                    data += chunk
                
                full_pdu = header + data
                pdu = ISCSIPDU(full_pdu)
                
                if pdu.opcode == OPCODE_LOGIN_REQ:
                    result = self._handle_login(conn, addr, pdu, chap_state)
                    if result is not None:
                        login_result, is_logged_in = result
                        if isinstance(login_result, CHAPAuth):
                            chap_state = login_result
                        elif login_result:
                            session_id = login_result
                        if is_logged_in:
                            logged_in = True
                
                elif pdu.opcode == OPCODE_SCSI_CMD:
                    if logged_in and session_id:
                        self._handle_scsi_command(conn, session_id, pdu)
                
                elif pdu.opcode == OPCODE_NOP_OUT:
                    self._handle_nop_out(conn, pdu)
                
                elif pdu.opcode == OPCODE_LOGOUT_REQ:
                    self._handle_logout(conn, session_id, pdu)
                    break
                
                elif pdu.opcode == OPCODE_SCSI_DATA_OUT:
                    if logged_in and session_id:
                        self._handle_data_out(conn, session_id, pdu)
        
        except socket.timeout:
            pass
        except Exception as e:
            pass
        finally:
            if session_id:
                self.session_manager.remove_session(session_id)
                if self.on_session_change:
                    self.on_session_change()
            
            conn.close()
            with self.lock:
                if conn in self.connections:
                    self.connections.remove(conn)
    
    def start(self):
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind((self.host, self.port))
        self.server_socket.listen(5)
        self.running = True
        
        accept_thread = threading.Thread(target=self._accept_loop, daemon=True)
        accept_thread.start()
    
    def _accept_loop(self):
        while self.running:
            try:
                self.server_socket.settimeout(1.0)
                conn, addr = self.server_socket.accept()
                
                with self.lock:
                    self.connections.append(conn)
                
                client_thread = threading.Thread(
                    target=self._handle_connection,
                    args=(conn, addr),
                    daemon=True
                )
                client_thread.start()
            
            except socket.timeout:
                continue
            except Exception:
                if self.running:
                    break
    
    def stop(self):
        self.running = False
        if self.server_socket:
            self.server_socket.close()
        
        with self.lock:
            for conn in self.connections:
                try:
                    conn.close()
                except:
                    pass
            self.connections.clear()
        
        self.lun_manager.close_all()
