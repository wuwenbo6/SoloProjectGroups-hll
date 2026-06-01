import numpy as np
from scipy.io import wavfile
from pydub import AudioSegment
from PIL import Image
import io
import os
import tempfile
from steganography import AudioSteganography


class RobustnessTest:
    def __init__(self):
        self.stego = AudioSteganography()
    
    def _wav_to_mp3(self, wav_path, mp3_path, bitrate='128k'):
        audio = AudioSegment.from_wav(wav_path)
        audio.export(mp3_path, format='mp3', bitrate=bitrate)
    
    def _mp3_to_wav(self, mp3_path, wav_path):
        audio = AudioSegment.from_mp3(mp3_path)
        audio.export(wav_path, format='wav')
    
    def _calculate_psnr(self, original_img, extracted_img):
        try:
            original = np.array(original_img.convert('L'))
            extracted = np.array(extracted_img.convert('L'))
            
            if original.shape != extracted.shape:
                extracted = np.array(extracted_img.resize(original.shape[::-1]).convert('L'))
            
            mse = np.mean((original - extracted) ** 2)
            if mse == 0:
                return float('inf')
            
            max_pixel = 255.0
            psnr = 20 * np.log10(max_pixel / np.sqrt(mse))
            return psnr
        except:
            return 0
    
    def run_test(self, audio_path, image_path):
        results = {
            'success': True,
            'tests': [],
            'original_audio': audio_path,
            'original_image': image_path
        }
        
        bitrates = ['320k', '256k', '192k', '128k', '96k', '64k']
        
        with tempfile.TemporaryDirectory() as tmpdir:
            embedded_wav = os.path.join(tmpdir, 'embedded.wav')
            
            self.stego.load_audio(audio_path)
            embed_result = self.stego.embed_image(image_path, embedded_wav)
            
            if not embed_result['success']:
                return {'success': False, 'error': 'Embedding failed'}
            
            original_img = Image.open(image_path).convert('L')
            
            for bitrate in bitrates:
                mp3_path = os.path.join(tmpdir, f'test_{bitrate}.mp3')
                extracted_wav = os.path.join(tmpdir, f'extracted_{bitrate}.wav')
                
                self._wav_to_mp3(embedded_wav, mp3_path, bitrate)
                self._mp3_to_wav(mp3_path, extracted_wav)
                
                extract_result = self.stego.extract_image(extracted_wav)
                
                if extract_result['success']:
                    extracted_img = Image.open(io.BytesIO(extract_result['image_data']))
                    psnr = self._calculate_psnr(original_img, extracted_img)
                    
                    results['tests'].append({
                        'bitrate': bitrate,
                        'extracted': True,
                        'psnr': psnr,
                        'image_size': extract_result['image_size']
                    })
                else:
                    results['tests'].append({
                        'bitrate': bitrate,
                        'extracted': False,
                        'psnr': 0,
                        'error': extract_result.get('error', 'Unknown')
                    })
        
        return results
