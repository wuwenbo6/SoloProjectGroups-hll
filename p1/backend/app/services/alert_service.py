import httpx
import asyncio
from typing import Optional
from datetime import datetime
from enum import Enum

from app.config import settings
from app.models.tank import TankStatus


class AlertType(str, Enum):
    WECHAT = "wechat"
    DINGTALK = "dingtalk"
    NONE = "none"


class AlertService:
    def __init__(self):
        self.webhook_url = settings.alert_webhook_url
        self.alert_type = settings.alert_type
        self._last_alert_time: dict = {}
        self._alert_cooldown = 300

    def _should_alert(self, tank_id: str) -> bool:
        if not self.webhook_url:
            return False
        
        last_time = self._last_alert_time.get(tank_id)
        if last_time:
            elapsed = (datetime.utcnow() - last_time).total_seconds()
            if elapsed < self._alert_cooldown:
                return False
        
        return True

    def _update_alert_time(self, tank_id: str):
        self._last_alert_time[tank_id] = datetime.utcnow()

    async def send_wechat_alert(self, tank_name: str, level: float, status: TankStatus, temperature: float):
        if not self.webhook_url:
            return
        
        status_text = "液位过高报警" if status == TankStatus.ALARM and level > 5 else "液位过低报警"
        message = {
            "msgtype": "markdown",
            "markdown": {
                "content": f"""⚠️ **液位异常报警**

**储罐名称**: {tank_name}
**报警类型**: {status_text}
**当前液位**: {level:.2f} m
**当前温度**: {temperature:.1f} °C
**报警时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

请及时检查储罐状态！"""
            }
        }
        
        try:
            async with httpx.AsyncClient() as client:
                await client.post(self.webhook_url, json=message, timeout=10)
        except Exception as e:
            print(f"发送微信报警失败: {e}")

    async def send_dingtalk_alert(self, tank_name: str, level: float, status: TankStatus, temperature: float):
        if not self.webhook_url:
            return
        
        status_text = "液位过高报警" if status == TankStatus.ALARM and level > 5 else "液位过低报警"
        message = {
            "msgtype": "markdown",
            "markdown": {
                "title": "液位异常报警",
                "text": f"""### ⚠️ 液位异常报警

**储罐名称**: {tank_name}
**报警类型**: {status_text}
**当前液位**: {level:.2f} m
**当前温度**: {temperature:.1f} °C
**报警时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

> 请及时检查储罐状态！"""
            },
            "at": {
                "isAtAll": True
            }
        }
        
        try:
            async with httpx.AsyncClient() as client:
                await client.post(self.webhook_url, json=message, timeout=10)
        except Exception as e:
            print(f"发送钉钉报警失败: {e}")

    async def send_alert(self, tank_name: str, tank_id: str, level: float, status: TankStatus, temperature: float):
        if not self._should_alert(tank_id):
            return
        
        self._update_alert_time(tank_id)
        
        if self.alert_type == AlertType.WECHAT:
            await self.send_wechat_alert(tank_name, level, status, temperature)
        elif self.alert_type == AlertType.DINGTALK:
            await self.send_dingtalk_alert(tank_name, level, status, temperature)


alert_service = AlertService()


def get_alert_service():
    return alert_service
