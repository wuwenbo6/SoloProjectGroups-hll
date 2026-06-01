import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

ISCSI_TARGET_NAME = 'iqn.2024-01.example:storage:target1'
ISCSI_HOST = '0.0.0.0'
ISCSI_PORT = 3260

STORAGE_DIR = os.path.join(BASE_DIR, 'storage')

WEB_HOST = '0.0.0.0'
WEB_PORT = 5000

USE_CHAP = False
CHAP_USERS = {
    'initiator1': 'secret123',
    'admin': 'password456'
}

LUNS = [
    {
        'id': 0,
        'filename': 'lun0.img',
        'size_mb': 100
    },
    {
        'id': 1,
        'filename': 'lun1.img',
        'size_mb': 50
    }
]
