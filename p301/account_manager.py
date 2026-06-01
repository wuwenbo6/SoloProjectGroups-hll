import threading
import time
from typing import Optional, Dict, Any
from datetime import datetime


class Account:
    def __init__(self, msisdn: str, imsi: Optional[str] = None, initial_balance: float = 100.0):
        self.msisdn = msisdn
        self.imsi = imsi
        self.balance = initial_balance
        self.credit_limit = 0.0
        self.is_active = True
        self.created_at = time.time()
        self.last_used_at = time.time()
        self.total_charged = 0.0
        self.total_recharged = initial_balance
        self.lock = threading.Lock()

    @property
    def available_balance(self) -> float:
        return self.balance + self.credit_limit

    def has_sufficient_balance(self, amount: float) -> bool:
        if not self.is_active:
            return False
        return self.available_balance >= amount

    def charge(self, amount: float) -> bool:
        with self.lock:
            if not self.is_active:
                return False
            if amount <= 0:
                return True
            if not self.has_sufficient_balance(amount):
                return False
            self.balance -= amount
            self.total_charged += amount
            self.last_used_at = time.time()
            return True

    def recharge(self, amount: float) -> bool:
        with self.lock:
            if amount <= 0:
                return False
            self.balance += amount
            self.total_recharged += amount
            self.last_used_at = time.time()
            return True

    def deactivate(self):
        with self.lock:
            self.is_active = False

    def activate(self):
        with self.lock:
            self.is_active = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            'msisdn': self.msisdn,
            'imsi': self.imsi,
            'balance': round(self.balance, 2),
            'available_balance': round(self.available_balance, 2),
            'credit_limit': round(self.credit_limit, 2),
            'is_active': self.is_active,
            'total_charged': round(self.total_charged, 2),
            'total_recharged': round(self.total_recharged, 2),
            'created_at': datetime.fromtimestamp(self.created_at).isoformat(),
            'last_used_at': datetime.fromtimestamp(self.last_used_at).isoformat()
        }


class AccountManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        self.accounts: Dict[str, Account] = {}
        self.price_per_mb = 0.1
        self.lock = threading.Lock()
        self._load_default_accounts()

    def _load_default_accounts(self):
        default_accounts = [
            {'msisdn': '13800138000', 'imsi': '460001234567890', 'balance': 500.0},
            {'msisdn': '13900139000', 'imsi': '460001234567891', 'balance': 200.0},
            {'msisdn': '15000150000', 'imsi': '460001234567892', 'balance': 100.0},
            {'msisdn': '18800188000', 'imsi': '460001234567893', 'balance': 50.0},
        ]
        for acc in default_accounts:
            account = Account(acc['msisdn'], acc['imsi'], acc['balance'])
            self.accounts[acc['msisdn']] = account

    def set_price_per_mb(self, price: float):
        with self.lock:
            self.price_per_mb = price

    def calculate_cost(self, bytes_used: int) -> float:
        mb_used = bytes_used / (1024 * 1024)
        return round(mb_used * self.price_per_mb, 2)

    def get_or_create_account(self, msisdn: str, imsi: Optional[str] = None, initial_balance: float = 100.0) -> Account:
        with self.lock:
            if msisdn not in self.accounts:
                self.accounts[msisdn] = Account(msisdn, imsi, initial_balance)
            return self.accounts[msisdn]

    def get_account(self, msisdn: str) -> Optional[Account]:
        with self.lock:
            return self.accounts.get(msisdn)

    def check_balance(self, msisdn: str, requested_bytes: int) -> Dict[str, Any]:
        account = self.get_account(msisdn)
        if not account:
            return {
                'success': False,
                'error': 'Account not found',
                'can_grant': False
            }
        if not account.is_active:
            return {
                'success': False,
                'error': 'Account deactivated',
                'can_grant': False,
                'balance': account.available_balance
            }
        cost = self.calculate_cost(requested_bytes)
        has_sufficient = account.has_sufficient_balance(cost)
        return {
            'success': True,
            'can_grant': has_sufficient,
            'balance': account.available_balance,
            'requested_bytes': requested_bytes,
            'cost': cost,
            'price_per_mb': self.price_per_mb
        }

    def charge_account(self, msisdn: str, used_bytes: int) -> Dict[str, Any]:
        account = self.get_account(msisdn)
        if not account:
            return {
                'success': False,
                'error': 'Account not found'
            }
        cost = self.calculate_cost(used_bytes)
        charged = account.charge(cost)
        return {
            'success': charged,
            'charged': cost if charged else 0.0,
            'balance': account.available_balance,
            'used_bytes': used_bytes,
            'price_per_mb': self.price_per_mb
        }

    def recharge_account(self, msisdn: str, amount: float) -> Dict[str, Any]:
        account = self.get_account(msisdn)
        if not account:
            return {
                'success': False,
                'error': 'Account not found'
            }
        recharged = account.recharge(amount)
        return {
            'success': recharged,
            'recharged': amount if recharged else 0.0,
            'balance': account.available_balance
        }

    def get_all_accounts(self) -> Dict[str, Dict[str, Any]]:
        with self.lock:
            return {msisdn: acc.to_dict() for msisdn, acc in self.accounts.items()}

    def get_accounts_stats(self) -> Dict[str, Any]:
        with self.lock:
            total_balance = sum(acc.balance for acc in self.accounts.values())
            total_charged = sum(acc.total_charged for acc in self.accounts.values())
            total_recharged = sum(acc.total_recharged for acc in self.accounts.values())
            active_count = sum(1 for acc in self.accounts.values() if acc.is_active)
            return {
                'total_accounts': len(self.accounts),
                'active_accounts': active_count,
                'total_balance': round(total_balance, 2),
                'total_charged': round(total_charged, 2),
                'total_recharged': round(total_recharged, 2),
                'price_per_mb': self.price_per_mb
            }


account_manager = AccountManager()
