import socket
import struct
import time
import random
import sys


IPFIX_VERSION = 10
SET_TEMPLATE = 2
SET_OPTIONS_TEMPLATE = 3
SET_DATA_MIN = 256


def build_ipfix_header(length, seq_num=0, domain_id=0):
    export_time = int(time.time())
    return struct.pack("!HHIII", IPFIX_VERSION, length, export_time, seq_num, domain_id)


def build_ie(ie_id, length, enterprise=False, enterprise_number=0):
    if enterprise:
        ie_id = ie_id | 0x8000
        return struct.pack("!HHI", ie_id, length, enterprise_number)
    return struct.pack("!HH", ie_id, length)


def build_template_set(template_id, ies, domain_id=0):
    template_record = struct.pack("!HH", template_id, len(ies))
    for ie_id, length in ies:
        template_record += build_ie(ie_id, length)

    set_length = 4 + len(template_record)
    set_header = struct.pack("!HH", SET_TEMPLATE, set_length)

    total_packet = build_ipfix_header(16 + set_length, seq_num=1, domain_id=domain_id)
    total_packet += set_header + template_record

    return total_packet


def build_options_template_set(template_id, scope_ies, ies, domain_id=0):
    scope_field_count = len(scope_ies)
    field_count = scope_field_count + len(ies)

    template_record = struct.pack("!HHH", template_id, field_count, scope_field_count)
    for ie_id, length in scope_ies:
        template_record += build_ie(ie_id, length)
    for ie_id, length in ies:
        template_record += build_ie(ie_id, length)

    set_length = 4 + len(template_record)
    set_header = struct.pack("!HH", SET_OPTIONS_TEMPLATE, set_length)

    total_packet = build_ipfix_header(16 + set_length, seq_num=2, domain_id=domain_id)
    total_packet += set_header + template_record

    return total_packet


def build_data_record(fields):
    record = b""
    for value, length in fields:
        if length == 1:
            record += struct.pack("!B", value)
        elif length == 2:
            record += struct.pack("!H", value)
        elif length == 4:
            if isinstance(value, str) and length == 4:
                record += socket.inet_aton(value)
            else:
                record += struct.pack("!I", value)
        elif length == 8:
            record += struct.pack("!Q", value)
        elif length == 16:
            record += socket.inet_pton(socket.AF_INET6, value)
        else:
            if isinstance(value, bytes):
                record += value.ljust(length, b'\x00')
            else:
                record += struct.pack(f"!{length}s", str(value).encode())

    return record


def build_data_set(template_id, records_data, domain_id=0, seq_num=0):
    set_length = 4
    records_bytes = b""
    for record_fields in records_data:
        record = build_data_record(record_fields)
        records_bytes += record
        set_length += len(record)

    set_header = struct.pack("!HH", template_id, set_length)
    total_length = 16 + set_length
    total_packet = build_ipfix_header(total_length, seq_num=seq_num, domain_id=domain_id)
    total_packet += set_header + records_bytes

    return total_packet


def send_udp_packet(data, host="127.0.0.1", port=4739):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.sendto(data, (host, port))
    sock.close()


def generate_random_ip():
    return f"{random.randint(1, 223)}.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(1, 254)}"


def generate_random_ipv6():
    parts = [format(random.randint(0, 0xFFFF), 'x') for _ in range(8)]
    return ":".join(parts)


def main():
    host = "127.0.0.1"
    port = 4739
    domain_id = 12345
    template_id = 256
    options_template_id = 257

    print("IPFIX Test Sender")
    print(f"Sending to {host}:{port}")
    print("=" * 50)

    standard_ies = [
        (8, 4),
        (12, 4),
        (7, 2),
        (11, 2),
        (4, 1),
        (1, 8),
        (2, 8),
        (58, 4),
        (59, 4),
    ]

    print("\n1. Sending Template Set...")
    template_packet = build_template_set(template_id, standard_ies, domain_id)
    send_udp_packet(template_packet, host, port)
    print(f"   Template ID: {template_id}, IEs: {len(standard_ies)}")
    time.sleep(0.5)

    print("\n2. Sending Options Template Set...")
    scope_ies = [(140, 4)]
    option_ies = [(139, 4), (144, 4), (141, 4)]
    options_packet = build_options_template_set(options_template_id, scope_ies, option_ies, domain_id)
    send_udp_packet(options_packet, host, port)
    print(f"   Options Template ID: {options_template_id}")
    time.sleep(0.5)

    print("\n3. Sending Data Records (continuous)...")
    print("   Press Ctrl+C to stop")

    seq_num = 10
    try:
        while True:
            records = []
            num_records = random.randint(1, 5)

            for _ in range(num_records):
                src_ip = generate_random_ip()
                dst_ip = generate_random_ip()
                src_port = random.randint(1024, 65535)
                dst_port = random.choice([80, 443, 22, 53, 3306, 6379, 8080, 0])
                protocol = random.choice([6, 17, 1, 6, 17, 6])
                octets = random.randint(64, 10000000)
                packets = random.randint(1, 10000)
                start_time = int(time.time()) - random.randint(0, 3600)
                end_time = start_time + random.randint(1, 300)

                record_fields = [
                    (src_ip, 4),
                    (dst_ip, 4),
                    (src_port, 2),
                    (dst_port, 2),
                    (protocol, 1),
                    (octets, 8),
                    (packets, 8),
                    (start_time, 4),
                    (end_time, 4),
                ]
                records.append(record_fields)

            data_packet = build_data_set(template_id, records, domain_id, seq_num)
            send_udp_packet(data_packet, host, port)

            seq_num += 1
            proto_map = {1: "ICMP", 6: "TCP", 17: "UDP"}
            for rec in records:
                proto = proto_map.get(rec[4][0], str(rec[4][0]))
                print(f"   Sent: {rec[0][0]}:{rec[2][0]} -> {rec[1][0]}:{rec[3][0]} "
                      f"{proto} {rec[5][0]} bytes")

            time.sleep(random.uniform(0.5, 2))

    except KeyboardInterrupt:
        print("\n\nStopped.")
        sys.exit(0)


if __name__ == "__main__":
    main()
