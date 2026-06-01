import threading
import time
import random
from concurrent.futures import ThreadPoolExecutor


class WEPCaptureSimulator:
    def __init__(self):
        self.ivs = []
        self.weak_ivs = []
        self.is_capturing = False
        self.capture_thread = None
        self.iv_count = 0
        self.weak_iv_count = 0
        self.on_iv_captured = None
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

    def _generate_encrypted_arp(self, iv):
        full_key = list(iv) + self._secret_key
        S = self._rc4_ksa(full_key)
        keystream = self._rc4_prga(S, 20)

        arp_plaintext = [0xAA, 0xAA, 0x03, 0x00, 0x00, 0x00, 0x08, 0x06,
                         0x00, 0x01, 0x08, 0x00, 0x06, 0x04, 0x00, 0x01,
                         0x00, 0x11, 0x22, 0x33]
        encrypted = [p ^ k for p, k in zip(arp_plaintext, keystream)]
        return encrypted

    def is_weak_iv(self, iv):
        iv1, iv2, iv3 = iv
        return iv3 == 255 and iv2 >= 3 and (iv1 & 0x1F) == iv2 - 3

    def generate_iv(self):
        if random.random() < 0.1:
            A = random.randint(0, 255)
            B = (A & 0x1F) + 3
            C = 255
            return (A, B, C), True
        else:
            return (random.randint(0, 255), random.randint(0, 255), random.randint(0, 255)), False

    def start_capture(self, interface=None, bssid=None):
        if self.is_capturing:
            return

        self.is_capturing = True
        self.ivs = []
        self.weak_ivs = []
        self.iv_count = 0
        self.weak_iv_count = 0

        def capture_thread():
            with ThreadPoolExecutor(max_workers=2) as pool:
                while self.is_capturing:
                    iv, is_weak = self.generate_iv()
                    encrypted = self._generate_encrypted_arp(iv)

                    with self.lock:
                        self.iv_count += 1
                        self.ivs.append({
                            'iv': iv,
                            'keyid': 0,
                            'encrypted': encrypted,
                            'is_weak': is_weak,
                            'timestamp': time.time()
                        })

                        if is_weak:
                            self.weak_iv_count += 1
                            self.weak_ivs.append({
                                'iv': iv,
                                'keyid': 0,
                                'encrypted': encrypted,
                                'is_weak': True,
                                'timestamp': time.time()
                            })

                            if self.on_iv_captured and self.weak_iv_count % 5 == 0:
                                self.on_iv_captured(self.iv_count, self.weak_iv_count)

                    time.sleep(0.01)

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
            arp_snap = [0xAA, 0xAA, 0x03, 0x00, 0x00, 0x00, 0x08, 0x06]
            for iv_data in self.weak_ivs:
                iv = iv_data['iv']
                encrypted = iv_data['encrypted']
                min_len = min(len(encrypted), len(arp_snap))
                keystream = [e ^ p for e, p in zip(encrypted[:min_len], arp_snap[:min_len])]
                if keystream:
                    pairs.append((iv, keystream))
            return pairs
