import hashlib
import secrets
import hmac

class CHAPAuth:
    def __init__(self, username=None, secret=None):
        self.username = username
        self.secret = secret
        self.challenge = None
        self.expected_response = None
    
    def generate_challenge(self, length=16):
        self.challenge = secrets.token_bytes(length)
        return self.challenge
    
    def compute_response(self, challenge, secret, identifier=1):
        if isinstance(secret, str):
            secret_bytes = secret.encode('utf-8')
        else:
            secret_bytes = b''
        
        message = bytes([identifier]) + secret_bytes + challenge
        response = hashlib.md5(message).digest()
        return response
    
    def verify_response(self, received_response, identifier=1):
        if self.challenge is None or self.secret is None:
            return False
        
        expected = self.compute_response(self.challenge, self.secret, identifier)
        
        if len(received_response) != len(expected):
            return False
        
        return hmac.compare_digest(expected, received_response)
    
    def reset(self):
        self.challenge = None
        self.expected_response = None

class CHAPManager:
    def __init__(self, users):
        self.users = {}
        for username, secret in users.items():
            self.users[username] = secret
    
    def get_secret(self, username):
        return self.users.get(username)
    
    def verify_user(self, username):
        return username in self.users
    
    def create_auth(self, username):
        if username not in self.users:
            return None
        return CHAPAuth(username, self.users[username])
    
    def add_user(self, username, secret):
        self.users[username] = secret
    
    def remove_user(self, username):
        if username in self.users:
            del self.users[username]
