import socket
import threading
import time
from collections import deque, defaultdict
from datetime import datetime
from ipfix_parser import IPFIXParser, Template, IPAnonymizer, DEFAULT_TEMPLATE_LIFETIME


class IPFIXCollector:
    def __init__(self, host="0.0.0.0", port=4739, max_records=10000,
                 template_lifetime=DEFAULT_TEMPLATE_LIFETIME,
                 anonymize=False, anonymize_key="ipfix-anonymizer-default-key",
                 anonymize_prefix_len=24):
        self.host = host
        self.port = port
        self.template_lifetime = template_lifetime
        self.parser = IPFIXParser(default_template_lifetime=template_lifetime)
        self.records = deque(maxlen=max_records)
        self.max_records = max_records
        self.running = False
        self.socket = None
        self.thread = None
        self.lock = threading.Lock()
        self.anonymize = anonymize
        self.anonymizer = IPAnonymizer(secret_key=anonymize_key, prefix_len=anonymize_prefix_len)
        self.stats = {
            "packets_received": 0,
            "records_received": 0,
            "templates_received": 0,
            "templates_expired": 0,
            "templates_withdrawn": 0,
            "template_refresh_requests": 0,
            "errors": 0,
            "start_time": None
        }

        self._register_callbacks()

    def _register_callbacks(self):
        self.parser.on_template_expired(self._on_template_expired)
        self.parser.on_missing_template(self._on_missing_template)

    def _on_template_expired(self, template: Template):
        with self.lock:
            self.stats["templates_expired"] += 1
        print(f"[INFO] Template expired: {template}")

    def _on_missing_template(self, domain_id: int, template_id: int):
        with self.lock:
            self.stats["template_refresh_requests"] += 1
        print(f"[INFO] Missing template - requesting refresh: "
              f"domain={domain_id}, template_id={template_id}")

    def start(self):
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 1048576)
        self.socket.bind((self.host, self.port))
        self.running = True
        self.stats["start_time"] = datetime.now()

        self.parser.start_cleanup_thread()

        self.thread = threading.Thread(target=self._receive_loop, daemon=True)
        self.thread.start()

        print(f"IPFIX Collector started on {self.host}:{self.port}")
        print(f"  - Template lifetime: {self.template_lifetime} seconds")
        print(f"  - Max records: {self.max_records}")

    def stop(self):
        self.running = False
        self.parser.stop_cleanup_thread()
        if self.socket:
            self.socket.close()
        if self.thread:
            self.thread.join(timeout=2)
        print("IPFIX Collector stopped")

    def _receive_loop(self):
        while self.running:
            try:
                data, addr = self.socket.recvfrom(65535)
                self._process_packet(data, addr)
            except socket.error:
                if not self.running:
                    break
            except Exception as e:
                self.stats["errors"] += 1
                print(f"Error processing packet: {e}")

    def _process_packet(self, data, addr):
        self.stats["packets_received"] += 1

        try:
            result = self.parser.parse_packet(data)

            self.stats["templates_received"] += len(result["templates"])
            self.stats["records_received"] += len(result["records"])

            if "withdrawn" in result:
                self.stats["templates_withdrawn"] += len(result["withdrawn"])

            for template in result["templates"]:
                print(f"[INFO] Template received: {template}")

            for record in result["records"]:
                with self.lock:
                    self.records.append(record)

        except ValueError as e:
            self.stats["errors"] += 1
            print(f"Parse error from {addr[0]}: {e}")

    def get_records(self, limit=None, offset=0):
        with self.lock:
            records_list = list(self.records)

        if offset:
            records_list = records_list[offset:]
        if limit:
            records_list = records_list[:limit]

        return records_list

    def get_records_as_dict(self, limit=None, offset=0):
        records = self.get_records(limit, offset)
        anonymizer = self.anonymizer if self.anonymize else None
        return [r.to_dict(anonymizer=anonymizer) for r in records]

    def get_stats(self):
        with self.lock:
            stats_copy = dict(self.stats)

        if stats_copy["start_time"]:
            uptime = (datetime.now() - stats_copy["start_time"]).total_seconds()
            stats_copy["uptime_seconds"] = uptime
            stats_copy["uptime"] = self._format_uptime(uptime)

        stats_copy["current_records"] = len(self.records)
        stats_copy["active_templates"] = self.parser.get_template_count()
        return stats_copy

    def _format_uptime(self, seconds):
        days = int(seconds // 86400)
        hours = int((seconds % 86400) // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)

        parts = []
        if days > 0:
            parts.append(f"{days}d")
        if hours > 0 or days > 0:
            parts.append(f"{hours}h")
        if minutes > 0 or hours > 0 or days > 0:
            parts.append(f"{minutes}m")
        parts.append(f"{secs}s")

        return " ".join(parts)

    def get_templates(self):
        with self.parser.lock:
            templates = list(self.parser.templates.values())
        return templates

    def get_templates_as_dict(self):
        templates = self.get_templates()
        result = []
        for t in templates:
            result.append({
                "template_id": t.template_id,
                "domain_id": t.domain_id,
                "is_options": t.is_options,
                "is_withdrawn": t.is_withdrawn,
                "is_expired": t.is_expired,
                "has_variable_length": t.has_variable_length,
                "lifetime": t.lifetime,
                "remaining_lifetime": t.remaining_lifetime,
                "created_at": t.created_at.isoformat(),
                "last_used": t.last_used.isoformat(),
                "expires_at": t.expires_at.isoformat(),
                "total_length": t.total_length,
                "ies": [{"id": ie.ie_id, "name": ie.name, "length": ie.length,
                        "is_variable": ie.is_variable_length} for ie in t.ies],
                "scope_ies": [{"id": ie.ie_id, "name": ie.name, "length": ie.length,
                              "is_variable": ie.is_variable_length} for ie in t.scope_ies]
            })
        return result

    def search_records(self, source_ip=None, destination_ip=None, protocol=None,
                       source_port=None, destination_port=None, limit=100):
        results = []
        with self.lock:
            for record in self.records:
                match = True

                if source_ip and record.source_ip != source_ip:
                    match = False
                if destination_ip and record.destination_ip != destination_ip:
                    match = False
                if protocol and record.protocol != protocol:
                    match = False
                if source_port and str(record.source_port) != str(source_port):
                    match = False
                if destination_port and str(record.destination_port) != str(destination_port):
                    match = False

                if match:
                    results.append(record)
                    if len(results) >= limit:
                        break

        anonymizer = self.anonymizer if self.anonymize else None
        return [r.to_dict(anonymizer=anonymizer) for r in results]

    def get_top_talkers(self, by_source=True, limit=10):
        talkers = {}
        with self.lock:
            for record in self.records:
                if by_source:
                    ip = record.source_ip
                else:
                    ip = record.destination_ip

                if self.anonymize:
                    if "." in ip and ip.replace(".", "").isdigit():
                        ip = self.anonymizer.anonymize_ipv4(ip)
                    elif ip != "N/A":
                        ip = self.anonymizer.anonymize_ipv6(ip)

                if ip not in talkers:
                    talkers[ip] = {
                        "ip": ip,
                        "flows": 0,
                        "packets": 0,
                        "octets": 0
                    }

                talkers[ip]["flows"] += 1
                talkers[ip]["packets"] += record.get("packetDeltaCount", record.get("packetTotalCount", 0))
                talkers[ip]["octets"] += record.get("octetDeltaCount", record.get("octetTotalCount", 0))

        sorted_talkers = sorted(talkers.values(), key=lambda x: x["flows"], reverse=True)
        return sorted_talkers[:limit]

    def set_anonymize(self, enabled: bool, key: str = None, prefix_len: int = None):
        self.anonymize = enabled
        if key is not None:
            self.anonymizer = IPAnonymizer(secret_key=key, prefix_len=prefix_len or self.anonymizer.prefix_len)
        if prefix_len is not None:
            self.anonymizer.prefix_len = prefix_len

    def get_anonymize_config(self):
        return {
            "enabled": self.anonymize,
            "prefix_len": self.anonymizer.prefix_len,
        }

    def export_records_flat(self, limit=None, offset=0):
        records = self.get_records(limit, offset)
        anonymizer = self.anonymizer if self.anonymize else None
        flat_records = []
        for r in records:
            d = r.to_dict(anonymizer=anonymizer)
            flat = {
                "template_id": d["template_id"],
                "domain_id": d["domain_id"],
                "timestamp": d["timestamp"],
                "source_ip": d["source_ip"],
                "destination_ip": d["destination_ip"],
                "source_port": d["source_port"],
                "destination_port": d["destination_port"],
                "protocol": d["protocol"],
                "octets": d["octets"],
                "packets": d["packets"],
            }
            flat_records.append(flat)
        return flat_records

    def cleanup_expired_templates(self):
        return self.parser.cleanup_expired_templates()

    def set_template_lifetime(self, lifetime: int):
        self.template_lifetime = lifetime
        self.parser.default_template_lifetime = lifetime

    def clear_records(self):
        with self.lock:
            self.records.clear()
            self.stats["current_records"] = 0

    def clear_all(self):
        self.clear_records()
        with self.parser.lock:
            self.parser.templates.clear()
        with self.lock:
            self.stats["templates_received"] = 0
            self.stats["templates_expired"] = 0
            self.stats["templates_withdrawn"] = 0
            self.stats["template_refresh_requests"] = 0
            self.stats["records_received"] = 0
            self.stats["packets_received"] = 0
            self.stats["errors"] = 0
