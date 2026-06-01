import socket
import threading
from datetime import datetime
from database import add_worklist_item, search_worklist
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MLLP_START = b'\x0b'
MLLP_END = b'\x1c\x0d'

class HL7Message:
    def __init__(self, raw_message):
        self.raw = raw_message
        self.segments = {}
        self.parse()
    
    def parse(self):
        lines = self.raw.strip().split('\r')
        for line in lines:
            if not line:
                continue
            parts = line.split('|')
            seg_type = parts[0]
            if seg_type not in self.segments:
                self.segments[seg_type] = []
            self.segments[seg_type].append(parts)
    
    def get_segment(self, seg_type, index=0):
        if seg_type in self.segments and index < len(self.segments[seg_type]):
            return self.segments[seg_type][index]
        return None
    
    def get_field(self, seg_type, field_index, index=0):
        seg = self.get_segment(seg_type, index)
        if seg and field_index < len(seg):
            return seg[field_index]
        return ""
    
    def get_component(self, seg_type, field_index, comp_index, index=0):
        field = self.get_field(seg_type, field_index, index)
        parts = field.split('^')
        if comp_index < len(parts):
            return parts[comp_index]
        return ""

def parse_hl7_datetime(hl7_dt):
    if not hl7_dt:
        return ""
    try:
        if len(hl7_dt) >= 8:
            return hl7_dt[:8]
    except:
        pass
    return ""

def parse_patient_name(name_str):
    parts = name_str.split('^')
    if len(parts) >= 2:
        return parts[0] + "^" + parts[1]
    return name_str or ""

def handle_adt_a01(hl7_msg):
    msh = hl7_msg.get_segment('MSH')
    if not msh:
        return None, "MSH segment missing"
    
    pid = hl7_msg.get_segment('PID')
    if not pid:
        return None, "PID segment missing"
    
    pv1 = hl7_msg.get_segment('PV1')
    
    patient_id = hl7_msg.get_field('PID', 3)
    patient_name = parse_patient_name(hl7_msg.get_field('PID', 5))
    patient_birth_date = parse_hl7_datetime(hl7_msg.get_field('PID', 7))
    patient_sex = hl7_msg.get_field('PID', 8)
    referring_physician = hl7_msg.get_field('PV1', 8) if pv1 else ""
    
    accession_number = hl7_msg.get_field('PID', 18) or "ACC" + datetime.now().strftime('%Y%m%d%H%M%S')
    
    study_uid = None
    existing = search_worklist(patient_id=patient_id)
    if existing:
        study_uid = existing[0]['study_uid']
    
    item_id = add_worklist_item(
        patient_name=patient_name,
        study_uid=study_uid,
        patient_id=patient_id,
        patient_birth_date=patient_birth_date,
        patient_sex=patient_sex,
        accession_number=accession_number,
        referring_physician=referring_physician,
        study_description="待安排检查",
        study_date=datetime.now().strftime('%Y%m%d'),
        study_time=datetime.now().strftime('%H%M%S'),
        scheduled_date=datetime.now().strftime('%Y%m%d'),
        scheduled_proc_step_status="SCHEDULED"
    )
    
    return item_id, "Patient " + patient_name + " (" + patient_id + ") admitted and worklist item created"

def handle_orm_o01(hl7_msg):
    msh = hl7_msg.get_segment('MSH')
    if not msh:
        return None, "MSH segment missing"
    
    pid = hl7_msg.get_segment('PID')
    if not pid:
        return None, "PID segment missing"
    
    obr = hl7_msg.get_segment('OBR')
    
    patient_id = hl7_msg.get_field('PID', 3)
    patient_name = parse_patient_name(hl7_msg.get_field('PID', 5))
    patient_birth_date = parse_hl7_datetime(hl7_msg.get_field('PID', 7))
    patient_sex = hl7_msg.get_field('PID', 8)
    
    accession_number = hl7_msg.get_field('OBR', 17) if obr else "ACC" + datetime.now().strftime('%Y%m%d%H%M%S')
    study_description = hl7_msg.get_field('OBR', 44) if obr else hl7_msg.get_field('OBR', 4) if obr else "检查订单"
    modality = hl7_msg.get_field('OBR', 24) if obr else ""
    scheduled_date = parse_hl7_datetime(hl7_msg.get_field('OBR', 27)) if obr else ""
    referring_physician = hl7_msg.get_field('OBR', 16) if obr else ""
    station_name = hl7_msg.get_field('OBR', 13) if obr else ""
    study_date = parse_hl7_datetime(hl7_msg.get_field('OBR', 36)) if obr else ""
    
    item_id = add_worklist_item(
        patient_name=patient_name,
        patient_id=patient_id,
        patient_birth_date=patient_birth_date,
        patient_sex=patient_sex,
        accession_number=accession_number,
        study_description=study_description,
        study_date=study_date or datetime.now().strftime('%Y%m%d'),
        study_time=datetime.now().strftime('%H%M%S'),
        modality=modality,
        referring_physician=referring_physician,
        station_name=station_name,
        scheduled_date=scheduled_date or datetime.now().strftime('%Y%m%d'),
        scheduled_proc_step_status="SCHEDULED"
    )
    
    return item_id, "Order for " + patient_name + " received, worklist item created"

def process_hl7_message(raw_message):
    try:
        hl7_msg = HL7Message(raw_message)
        msh = hl7_msg.get_segment('MSH')
        if not msh:
            return False, "Invalid HL7 message: MSH segment missing"
        
        msg_type = hl7_msg.get_field('MSH', 9)
        logger.info("Processing HL7 message type: " + msg_type)
        
        if 'ADT^A01' in msg_type or 'ADT^A04' in msg_type:
            return handle_adt_a01(hl7_msg)
        elif 'ORM^O01' in msg_type:
            return handle_orm_o01(hl7_msg)
        else:
            return None, "Unsupported message type: " + msg_type
    
    except Exception as e:
        logger.error("Error processing HL7 message: " + str(e), exc_info=True)
        return None, "Error processing message: " + str(e)

def create_ack_hl7(original_msg, ack_code="AA", error_msg=""):
    msh = original_msg.get_segment('MSH')
    if not msh:
        return "MSH|^~\\&|||||||ACK^A01|||2.5\rMSA|AA||"
    
    sending_app = original_msg.get_field('MSH', 5)
    sending_facility = original_msg.get_field('MSH', 6)
    receiving_app = original_msg.get_field('MSH', 3)
    receiving_facility = original_msg.get_field('MSH', 4)
    msg_control_id = original_msg.get_field('MSH', 10)
    
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    
    msh_ack = "MSH|^~\\&|" + receiving_app + "|" + receiving_facility + "|" + sending_app + "|" + sending_facility + "|" + timestamp + "||ACK^A01|" + msg_control_id + "|P|2.5"
    msa = "MSA|" + ack_code + "|" + msg_control_id + "|" + error_msg
    
    return msh_ack + "\r" + msa + "\r"

class MLLPServer:
    def __init__(self, host='0.0.0.0', port=2575):
        self.host = host
        self.port = port
        self.running = False
        self.server_socket = None
    
    def handle_client(self, client_socket, address):
        logger.info("Connection from " + str(address))
        buffer = b''
        try:
            while self.running:
                data = client_socket.recv(4096)
                if not data:
                    break
                
                buffer += data
                
                while MLLP_START in buffer and MLLP_END in buffer:
                    start_idx = buffer.index(MLLP_START) + len(MLLP_START)
                    end_idx = buffer.index(MLLP_END)
                    
                    hl7_data = buffer[start_idx:end_idx]
                    buffer = buffer[end_idx + len(MLLP_END):]
                    
                    raw_message = hl7_data.decode('utf-8', errors='replace')
                    logger.info("Received HL7 message:\n" + raw_message)
                    
                    hl7_msg = HL7Message(raw_message)
                    result, message = process_hl7_message(raw_message)
                    
                    if result:
                        ack_code = "AA"
                        logger.info("HL7 message processed successfully: " + message)
                    else:
                        ack_code = "AE"
                        logger.warning("HL7 message processing issue: " + message)
                    
                    ack_msg = create_ack_hl7(hl7_msg, ack_code, message)
                    logger.info("Sending ACK:\n" + ack_msg)
                    
                    client_socket.sendall(MLLP_START + ack_msg.encode('utf-8') + MLLP_END)
        
        except Exception as e:
            logger.error("Error handling client " + str(address) + ": " + str(e))
        finally:
            client_socket.close()
            logger.info("Connection closed from " + str(address))
    
    def start(self):
        self.running = True
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind((self.host, self.port))
        self.server_socket.listen(5)
        logger.info("MLLP Server listening on " + self.host + ":" + str(self.port))
        
        try:
            while self.running:
                client_socket, address = self.server_socket.accept()
                thread = threading.Thread(target=self.handle_client, args=(client_socket, address))
                thread.daemon = True
                thread.start()
        except KeyboardInterrupt:
            logger.info("Server stopped by user")
        finally:
            self.stop()
    
    def stop(self):
        self.running = False
        if self.server_socket:
            self.server_socket.close()
        logger.info("MLLP Server stopped")

def send_hl7_message(host, port, hl7_message):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((host, port))
        sock.sendall(MLLP_START + hl7_message.encode('utf-8') + MLLP_END)
        
        response = b''
        buffer = b''
        sock.settimeout(10)
        while True:
            data = sock.recv(4096)
            if not data:
                break
            buffer += data
            if MLLP_END in buffer:
                end_idx = buffer.index(MLLP_END)
                response = buffer[:end_idx]
                break
        
        sock.close()
        
        if MLLP_START in response:
            response = response[response.index(MLLP_START) + len(MLLP_START):]
        
        return True, response.decode('utf-8', errors='replace')
    except Exception as e:
        return False, str(e)

if __name__ == "__main__":
    server = MLLPServer(port=2575)
    server.start()
