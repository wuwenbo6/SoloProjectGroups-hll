import logging
import json
import urllib.request
import urllib.error
from typing import Optional, Dict, Any

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('APIClient')


class APIClient:
    def __init__(self, api_host: str = '127.0.0.1', api_port: int = 5001):
        self.api_host = api_host
        self.api_port = api_port
        self.base_url = f'http://{api_host}:{api_port}'

    def send_event(self, event: Dict[str, Any]) -> bool:
        url = f'{self.base_url}/api/events'
        try:
            data = json.dumps(event).encode('utf-8')
            req = urllib.request.Request(
                url,
                data=data,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status == 201
        except urllib.error.URLError as e:
            logger.warning(f"Failed to send event to API server: {e}")
            return False
        except Exception as e:
            logger.warning(f"Unexpected error sending event: {e}")
            return False

    def get_stats(self) -> Optional[Dict[str, Any]]:
        url = f'{self.base_url}/api/stats'
        try:
            with urllib.request.urlopen(url, timeout=5) as response:
                if response.status == 200:
                    data = response.read().decode('utf-8')
                    return json.loads(data)
        except Exception as e:
            logger.warning(f"Failed to get stats: {e}")
            return None
        return None

    def sync_account(self, account_data: Dict[str, Any]) -> bool:
        url = f'{self.base_url}/api/accounts/sync'
        try:
            data = json.dumps(account_data).encode('utf-8')
            req = urllib.request.Request(
                url,
                data=data,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status == 200
        except urllib.error.URLError as e:
            logger.warning(f"Failed to sync account to API server: {e}")
            return False
        except Exception as e:
            logger.warning(f"Unexpected error syncing account: {e}")
            return False

    def send_cdr(self, cdr_data: Dict[str, Any]) -> bool:
        url = f'{self.base_url}/api/cdrs'
        try:
            data = json.dumps(cdr_data).encode('utf-8')
            req = urllib.request.Request(
                url,
                data=data,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status == 201
        except urllib.error.URLError as e:
            logger.warning(f"Failed to send CDR to API server: {e}")
            return False
        except Exception as e:
            logger.warning(f"Unexpected error sending CDR: {e}")
            return False
