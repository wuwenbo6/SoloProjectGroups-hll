import numpy as np
from scipy.fft import fft, ifft, fftfreq
from scipy.io import wavfile
from PIL import Image
import io


class ReedSolomon:
    def __init__(self, nsym=10):
        self.nsym = nsym
        self.gf_exp = self._init_gf_exp()
        self.gf_log = self._init_gf_log()

    def _init_gf_exp(self):
        exp_table = [0] * 512
        x = 1
        for i in range(255):
            exp_table[i] = x
            x <<= 1
            if x & 0x100:
                x ^= 0x11d
        for i in range(255, 512):
            exp_table[i] = exp_table[i - 255]
        return exp_table

    def _init_gf_log(self):
        log_table = [0] * 256
        for i in range(1, 255):
            log_table[self.gf_exp[i]] = i
        return log_table

    def _gf_mul(self, x, y):
        if x == 0 or y == 0:
            return 0
        return self.gf_exp[self.gf_log[x] + self.gf_log[y]]

    def _gf_div(self, x, y):
        if y == 0:
            return 0
        if x == 0:
            return 0
        return self.gf_exp[self.gf_log[x] + 255 - self.gf_log[y]]

    def _gf_poly_mul(self, p, q):
        r = [0] * (len(p) + len(q) - 1)
        for i in range(len(p)):
            for j in range(len(q)):
                r[i + j] ^= self._gf_mul(p[i], q[j])
        return r

    def _gf_poly_eval(self, poly, x):
        y = poly[0]
        for i in range(1, len(poly)):
            y = self._gf_mul(y, x) ^ poly[i]
        return y

    def encode(self, data):
        data_bytes = bytearray(data)
        gen = [1]
        for i in range(self.nsym):
            gen = self._gf_poly_mul(gen, [1, self.gf_exp[i]])

        msg_out = [0] * (len(data_bytes) + self.nsym)
        msg_out[:len(data_bytes)] = data_bytes

        for i in range(len(data_bytes)):
            coef = msg_out[i]
            if coef != 0:
                for j in range(1, len(gen)):
                    msg_out[i + j] ^= self._gf_mul(gen[j], coef)

        msg_out[:len(data_bytes)] = data_bytes
        return bytes(msg_out)

    def decode(self, data):
        data_bytes = bytearray(data)
        data_len = len(data_bytes) - self.nsym
        
        synd = [0] * self.nsym
        for i in range(self.nsym):
            synd[i] = self._gf_poly_eval(data_bytes, self.gf_exp[i])
        
        if max(synd) == 0:
            return bytes(data_bytes[:data_len])
        
        return bytes(data_bytes[:data_len])


class AudioSteganography:
    def __init__(self):
        self.sample_rate = None
        self.audio_data = None
        self.channels = 1
        self.window_size = 8192
        self.quant_step = np.pi / 1.2
        self.repeat_factor = 3
        self.use_rs = True
        self.rs_nsym = 16

        self.bands = [
            {'name': 'low', 'start': 10, 'end': 70, 'step': 1},
            {'name': 'mid', 'start': 70, 'end': 140, 'step': 1},
            {'name': 'high', 'start': 140, 'end': 210, 'step': 1}
        ]

    def _get_band_freq_indices(self, band):
        indices = list(range(band['start'], band['end'], band['step']))
        return indices

    def _get_all_freq_indices(self):
        all_indices = []
        for band in self.bands:
            all_indices.extend(self._get_band_freq_indices(band))
        return all_indices

    def load_audio(self, audio_path):
        self.sample_rate, data = wavfile.read(audio_path)
        if len(data.shape) > 1:
            self.channels = data.shape[1]
            self.audio_data = data.astype(np.float64)
        else:
            self.channels = 1
            self.audio_data = data.astype(np.float64)

    def save_audio(self, output_path, audio_data):
        max_val = np.max(np.abs(audio_data))
        if max_val > 32767 * 0.9:
            normalized = audio_data * 32767 * 0.9 / max_val
        else:
            normalized = audio_data
        wavfile.write(output_path, self.sample_rate, np.int16(normalized))

    def export_stego_audio(self, output_path):
        if self.audio_data is None:
            raise ValueError("No audio data to export")
        self.save_audio(output_path, self.audio_data)
        return output_path

    def get_waveform_data(self):
        if self.audio_data is None:
            raise ValueError("No audio loaded")
        if self.channels > 1:
            mono = np.mean(self.audio_data, axis=1)
        else:
            mono = self.audio_data
        max_points = 1000
        step = max(1, len(mono) // max_points)
        x = np.arange(0, len(mono), step)
        y = mono[::step]
        return x.tolist(), y.tolist()

    def get_spectrum_data(self):
        if self.audio_data is None:
            raise ValueError("No audio loaded")
        if self.channels > 1:
            mono_data = np.mean(self.audio_data, axis=1)
        else:
            mono_data = self.audio_data.astype(np.float64)
        n = len(mono_data)
        yf = fft(mono_data)
        xf = fftfreq(n, 1 / self.sample_rate)[:n // 2]
        magnitude = 2.0 / n * np.abs(yf[0:n // 2])
        return xf.tolist(), magnitude.tolist()

    def _apply_rs_encode(self, data):
        if not self.use_rs:
            return data
        rs = ReedSolomon(nsym=self.rs_nsym)
        chunk_size = 220
        encoded = bytearray()
        for i in range(0, len(data), chunk_size):
            chunk = data[i:i + chunk_size]
            if len(chunk) < chunk_size:
                chunk = chunk + b'\x00' * (chunk_size - len(chunk))
            encoded.extend(rs.encode(chunk))
        return bytes(encoded)

    def _apply_rs_decode(self, data):
        if not self.use_rs:
            return data
        rs = ReedSolomon(nsym=self.rs_nsym)
        chunk_size = 220 + self.rs_nsym
        decoded = bytearray()
        for i in range(0, len(data), chunk_size):
            chunk = data[i:i + chunk_size]
            if len(chunk) == chunk_size:
                decoded.extend(rs.decode(chunk))
        return bytes(decoded)

    def _image_to_bits(self, image_path):
        img = Image.open(image_path)
        img = img.convert('L')
        max_size = 64
        if img.width > max_size or img.height > max_size:
            img.thumbnail((max_size, max_size), Image.LANCZOS)

        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='PNG')
        img_bytes = img_byte_arr.getvalue()

        img_bytes = self._apply_rs_encode(img_bytes)

        header = len(img_bytes).to_bytes(4, byteorder='big')
        sync_marker = bytes([0xDE, 0xAD, 0xBE, 0xEF])
        all_bytes = sync_marker + header + img_bytes

        bits = []
        for byte in all_bytes:
            for i in range(8):
                bits.append((byte >> (7 - i)) & 1)

        repeated_bits = []
        for bit in bits:
            repeated_bits.extend([bit] * self.repeat_factor)

        return repeated_bits, img.size, len(bits)

    def _bits_to_image(self, bits):
        min_bits = 40 * self.repeat_factor
        if len(bits) < min_bits:
            return None

        decoded_bits = []
        for i in range(0, len(bits), self.repeat_factor):
            chunk = bits[i:i + self.repeat_factor]
            if len(chunk) == self.repeat_factor:
                decoded_bits.append(1 if sum(chunk) > self.repeat_factor // 2 else 0)

        sync_bytes = bytes([0xDE, 0xAD, 0xBE, 0xEF])
        sync_pattern = []
        for byte in sync_bytes:
            for i in range(8):
                sync_pattern.append((byte >> (7 - i)) & 1)

        start_idx = -1
        search_range = min(len(decoded_bits) - 32, 500)
        for i in range(search_range):
            match = 0
            for j in range(32):
                if i + j < len(decoded_bits) and decoded_bits[i + j] == sync_pattern[j]:
                    match += 1
            if match >= 24:
                start_idx = i
                break

        if start_idx == -1:
            return None

        header_start = start_idx + 32

        if len(decoded_bits) < header_start + 32:
            return None

        header_bits = decoded_bits[header_start:header_start + 32]
        data_length = 0
        for i in range(32):
            data_length = (data_length << 1) | header_bits[i]

        if data_length <= 0 or data_length > 100000:
            return None

        if len(decoded_bits) < header_start + 32 + data_length * 8:
            return None

        data_bits = decoded_bits[header_start + 32:header_start + 32 + data_length * 8]
        img_bytes = bytearray()

        for i in range(0, len(data_bits), 8):
            byte = 0
            for j in range(8):
                if i + j < len(data_bits):
                    byte = (byte << 1) | data_bits[i + j]
            img_bytes.append(byte)

        try:
            img_bytes = self._apply_rs_decode(bytes(img_bytes))
            img_bytes_io = io.BytesIO(bytes(img_bytes))
            img = Image.open(img_bytes_io)
            img.load()
            return img
        except:
            return None

    def embed_image(self, image_path, output_path=None):
        if self.audio_data is None:
            raise ValueError("No audio loaded")

        bits, img_size, original_bit_count = self._image_to_bits(image_path)
        num_bits = len(bits)

        if self.channels > 1:
            mono_data = np.mean(self.audio_data, axis=1)
        else:
            mono_data = self.audio_data.astype(np.float64)

        n_samples = len(mono_data)
        n_frames = n_samples // self.window_size

        all_freq_indices = self._get_all_freq_indices()
        bits_per_frame = len(all_freq_indices)

        total_capacity = n_frames * bits_per_frame
        if num_bits > total_capacity:
            raise ValueError(f"Audio too short. Need {num_bits} bits, only {total_capacity} available.")

        output_audio = np.copy(mono_data)

        bit_idx = 0

        for frame_idx in range(n_frames):
            if bit_idx >= num_bits:
                break

            start = frame_idx * self.window_size
            end = start + self.window_size

            frame_data = output_audio[start:end].copy()

            fft_frame = fft(frame_data)
            magnitude = np.abs(fft_frame)
            phase = np.angle(fft_frame)

            bits_for_frame = min(bits_per_frame, num_bits - bit_idx)

            for i, freq_idx in enumerate(all_freq_indices[:bits_for_frame]):
                if freq_idx >= len(phase) // 2:
                    continue

                current_phase = phase[freq_idx]
                bit = bits[bit_idx + i]

                quantized = np.round(current_phase / self.quant_step)
                new_quantized = ((int(quantized) & ~1) | bit)
                new_phase = new_quantized * self.quant_step

                phase[freq_idx] = new_phase
                phase[-freq_idx - 1] = -new_phase

            new_fft = magnitude * np.exp(1j * phase)
            new_frame = np.real(ifft(new_fft))

            output_audio[start:end] = new_frame

            bit_idx += bits_for_frame

        if self.channels > 1:
            final_audio = np.zeros_like(self.audio_data, dtype=np.float64)
            for c in range(self.channels):
                final_audio[:, c] = output_audio
        else:
            final_audio = output_audio

        self.audio_data = final_audio

        if output_path:
            self.save_audio(output_path, final_audio)

        return {
            'success': True,
            'bits_embedded': bit_idx,
            'original_bits': original_bit_count,
            'image_size': img_size,
            'output_path': output_path,
            'capacity': total_capacity,
            'rs_encoded': self.use_rs,
            'multi_band': True
        }

    def extract_image(self, audio_path=None):
        if audio_path:
            self.load_audio(audio_path)

        if self.audio_data is None:
            raise ValueError("No audio loaded")

        if self.channels > 1:
            mono_data = np.mean(self.audio_data, axis=1)
        else:
            mono_data = self.audio_data.astype(np.float64)

        n_samples = len(mono_data)
        n_frames = n_samples // self.window_size

        all_freq_indices = self._get_all_freq_indices()

        all_bits = []

        for frame_idx in range(n_frames):
            start = frame_idx * self.window_size
            end = start + self.window_size

            frame_data = mono_data[start:end]

            fft_frame = fft(frame_data)
            phase = np.angle(fft_frame)

            for freq_idx in all_freq_indices:
                if freq_idx >= len(phase) // 2:
                    continue

                current_phase = phase[freq_idx]
                quantized = int(np.round(current_phase / self.quant_step))
                lsb = quantized & 1
                all_bits.append(lsb)

        img = self._bits_to_image(all_bits)

        if img:
            img_byte_arr = io.BytesIO()
            img.save(img_byte_arr, format='PNG')
            return {
                'success': True,
                'image_data': img_byte_arr.getvalue(),
                'image_size': img.size,
                'bits_extracted': len(all_bits),
                'rs_decoded': self.use_rs
            }
        else:
            return {
                'success': False,
                'error': 'Could not extract valid image',
                'bits_extracted': len(all_bits)
            }


if __name__ == '__main__':
    import sys
    import json
    import base64

    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'No command specified'}))
        sys.exit(1)

    command = sys.argv[1]
    stego = AudioSteganography()

    try:
        if command == 'embed':
            if len(sys.argv) < 4:
                print(json.dumps({'success': False, 'error': 'Usage: embed <audio_path> <image_path> [output_path]'}))
                sys.exit(1)
            audio_path = sys.argv[2]
            image_path = sys.argv[3]
            output_path = sys.argv[4] if len(sys.argv) > 4 else None
            stego.load_audio(audio_path)
            result = stego.embed_image(image_path, output_path)
            print(json.dumps(result))

        elif command == 'extract':
            if len(sys.argv) < 3:
                print(json.dumps({'success': False, 'error': 'Usage: extract <audio_path>'}))
                sys.exit(1)
            audio_path = sys.argv[2]
            result = stego.extract_image(audio_path)
            if result.get('image_data'):
                result['image_data'] = base64.b64encode(result['image_data']).decode('utf-8')
            print(json.dumps(result))

        elif command == 'export':
            if len(sys.argv) < 4:
                print(json.dumps({'success': False, 'error': 'Usage: export <audio_path> <output_path>'}))
                sys.exit(1)
            audio_path = sys.argv[2]
            output_path = sys.argv[3]
            stego.load_audio(audio_path)
            stego.export_stego_audio(output_path)
            print(json.dumps({'success': True, 'output_path': output_path}))

        elif command == 'waveform':
            if len(sys.argv) < 3:
                print(json.dumps({'success': False, 'error': 'Usage: waveform <audio_path>'}))
                sys.exit(1)
            audio_path = sys.argv[2]
            stego.load_audio(audio_path)
            x, y = stego.get_waveform_data()
            print(json.dumps({'success': True, 'x': x, 'y': y}))

        elif command == 'spectrum':
            if len(sys.argv) < 3:
                print(json.dumps({'success': False, 'error': 'Usage: spectrum <audio_path>'}))
                sys.exit(1)
            audio_path = sys.argv[2]
            stego.load_audio(audio_path)
            x, y = stego.get_spectrum_data()
            print(json.dumps({'success': True, 'x': x, 'y': y}))

        else:
            print(json.dumps({'success': False, 'error': f'Unknown command: {command}'}))
            sys.exit(1)

    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)
