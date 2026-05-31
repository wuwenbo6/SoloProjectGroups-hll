import os
import tempfile
import logging
from typing import Optional
from pydantic_settings import BaseSettings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TTSSettings(BaseSettings):
    tts_provider: str = "edge"
    baidu_api_key: str = ""
    baidu_secret_key: str = ""
    
    class Config:
        env_file = ".env"

settings = TTSSettings()

class TTSService:
    def __init__(self):
        self.provider = settings.tts_provider
        self._init_provider()
    
    def _init_provider(self):
        try:
            self.engine = None
            if self.provider == "edge":
                pass
        except Exception as e:
            logger.warning(f"TTS provider init failed: {e}")
    
    def generate_speech(self, text: str, voice: str = "default", speed: float = 1.0) -> Optional[bytes]:
        try:
            return self._generate_with_pyttsx3(text, speed)
        except Exception as e:
            logger.error(f"TTS generation failed: {e}")
            return None
    
    def _generate_with_pyttsx3(self, text: str, speed: float) -> Optional[bytes]:
        try:
            import pyttsx3
            engine = pyttsx3.init()
            engine.setProperty('rate', int(200 * speed))
            
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                temp_path = f.name
            
            engine.save_to_file(text, temp_path)
            engine.runAndWait()
            engine.stop()
            
            with open(temp_path, 'rb') as f:
                audio_data = f.read()
            
            os.unlink(temp_path)
            return audio_data
            
        except ImportError:
            logger.warning("pyttsx3 not available")
            return None
        except Exception as e:
            logger.error(f"pyttsx3 error: {e}")
            return None
    
    def generate_reminder_text(self, user_name: str, medicine_name: str, dosage: str) -> str:
        return f"{user_name}您好，现在是服药时间。请服用{medicine_name}，{dosage}。祝您身体健康！"
    
    def generate_missed_reminder_text(self, user_name: str, medicine_name: str) -> str:
        return f"提醒：{user_name}尚未服用{medicine_name}，请提醒老人按时服药。"
    
    def generate_low_stock_text(self, medicine_name: str, remaining: int) -> str:
        return f"注意：{medicine_name}剩余药量不足，还剩{remaining}片，请及时补充。"

tts_service = TTSService()
