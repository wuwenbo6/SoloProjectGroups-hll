import requests
import logging
from typing import Optional
from pydantic_settings import BaseSettings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WechatSettings(BaseSettings):
    wechat_appid: str = ""
    wechat_appsecret: str = ""
    wechat_template_id: str = ""
    
    class Config:
        env_file = ".env"

settings = WechatSettings()

class WechatNotifier:
    def __init__(self):
        self.appid = settings.wechat_appid
        self.appsecret = settings.wechat_appsecret
        self.template_id = settings.wechat_template_id
        self.access_token: Optional[str] = None
        self.token_expires_at = 0
        
    def _get_access_token(self) -> Optional[str]:
        if not self.appid or not self.appsecret:
            logger.warning("WeChat credentials not configured")
            return None
            
        try:
            url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={self.appid}&secret={self.appsecret}"
            response = requests.get(url, timeout=10)
            data = response.json()
            
            if "access_token" in data:
                self.access_token = data["access_token"]
                return self.access_token
            else:
                logger.error(f"Failed to get access token: {data}")
                return None
        except Exception as e:
            logger.error(f"Error getting access token: {e}")
            return None
            
    def send_reminder(self, openid: str, user_name: str, medicine_name: str, take_time: str) -> bool:
        if not openid:
            logger.warning("No openid provided")
            return False
            
        access_token = self._get_access_token()
        if not access_token:
            return False
            
        try:
            url = f"https://api.weixin.qq.com/cgi-bin/message/template/send?access_token={access_token}"
            
            data = {
                "touser": openid,
                "template_id": self.template_id,
                "data": {
                    "first": {
                        "value": f"您好，{user_name}",
                        "color": "#173177"
                    },
                    "keyword1": {
                        "value": medicine_name,
                        "color": "#173177"
                    },
                    "keyword2": {
                        "value": take_time,
                        "color": "#173177"
                    },
                    "remark": {
                        "value": "请记得按时服药，祝您身体健康！",
                        "color": "#173177"
                    }
                }
            }
            
            response = requests.post(url, json=data, timeout=10)
            result = response.json()
            
            if result.get("errcode") == 0:
                logger.info(f"WeChat reminder sent to {openid}")
                return True
            else:
                logger.error(f"Failed to send WeChat message: {result}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending WeChat message: {e}")
            return False
            
    def send_missed_reminder(self, openid: str, user_name: str, medicine_name: str, take_time: str) -> bool:
        if not openid:
            logger.warning("No openid provided")
            return False
            
        access_token = self._get_access_token()
        if not access_token:
            return False
            
        try:
            url = f"https://api.weixin.qq.com/cgi-bin/message/template/send?access_token={access_token}"
            
            data = {
                "touser": openid,
                "template_id": self.template_id,
                "data": {
                    "first": {
                        "value": f"提醒：{user_name}未按时服药",
                        "color": "#FF0000"
                    },
                    "keyword1": {
                        "value": medicine_name,
                        "color": "#FF0000"
                    },
                    "keyword2": {
                        "value": take_time,
                        "color": "#FF0000"
                    },
                    "remark": {
                        "value": "请提醒老人服药！",
                        "color": "#FF0000"
                    }
                }
            }
            
            response = requests.post(url, json=data, timeout=10)
            result = response.json()
            
            if result.get("errcode") == 0:
                logger.info(f"WeChat missed reminder sent to {openid}")
                return True
            else:
                logger.error(f"Failed to send WeChat message: {result}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending WeChat message: {e}")
            return False
    
    def send_low_stock_reminder(self, openid: str, user_name: str, medicine_name: str, remaining_pills: int) -> bool:
        if not openid:
            logger.warning("No openid provided")
            return False
            
        access_token = self._get_access_token()
        if not access_token:
            return False
            
        try:
            url = f"https://api.weixin.qq.com/cgi-bin/message/template/send?access_token={access_token}"
            
            data = {
                "touser": openid,
                "template_id": self.template_id,
                "data": {
                    "first": {
                        "value": f"药量不足提醒：{user_name}",
                        "color": "#FFA500"
                    },
                    "keyword1": {
                        "value": medicine_name,
                        "color": "#FFA500"
                    },
                    "keyword2": {
                        "value": f"剩余 {remaining_pills} 片",
                        "color": "#FFA500"
                    },
                    "remark": {
                        "value": "请及时补充药品！",
                        "color": "#FFA500"
                    }
                }
            }
            
            response = requests.post(url, json=data, timeout=10)
            result = response.json()
            
            if result.get("errcode") == 0:
                logger.info(f"WeChat low stock reminder sent to {openid}")
                return True
            else:
                logger.error(f"Failed to send WeChat message: {result}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending WeChat message: {e}")
            return False

wechat_notifier = WechatNotifier()
