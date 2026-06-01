import os
import threading

class LUN:
    def __init__(self, lun_id, path, size=None):
        self.lun_id = lun_id
        self.path = path
        self.size = size
        self.file = None
        self.lock = threading.Lock()
        self._open()
    
    def _open(self):
        if not os.path.exists(self.path):
            if self.size is None:
                raise ValueError("Size must be specified for new LUN")
            self._create_file()
        else:
            self.size = os.path.getsize(self.path)
        self.file = open(self.path, 'r+b')
    
    def _create_file(self):
        with open(self.path, 'wb') as f:
            f.seek(self.size - 1)
            f.write(b'\x00')
    
    def read(self, offset, length):
        with self.lock:
            self.file.seek(offset)
            return self.file.read(length)
    
    def write(self, offset, data):
        with self.lock:
            self.file.seek(offset)
            self.file.write(data)
    
    def close(self):
        if self.file:
            self.file.close()
    
    def get_size(self):
        return self.size

class LUNManager:
    def __init__(self, storage_dir):
        self.storage_dir = storage_dir
        self.luns = {}
        self._init_storage_dir()
    
    def _init_storage_dir(self):
        if not os.path.exists(self.storage_dir):
            os.makedirs(self.storage_dir)
    
    def add_lun(self, lun_id, filename, size=None):
        if lun_id in self.luns:
            raise ValueError(f"LUN {lun_id} already exists")
        
        path = os.path.join(self.storage_dir, filename)
        lun = LUN(lun_id, path, size)
        self.luns[lun_id] = lun
        return lun
    
    def remove_lun(self, lun_id):
        if lun_id in self.luns:
            self.luns[lun_id].close()
            del self.luns[lun_id]
    
    def get_lun(self, lun_id):
        return self.luns.get(lun_id)
    
    def list_luns(self):
        return list(self.luns.keys())
    
    def get_lun_info(self, lun_id):
        lun = self.get_lun(lun_id)
        if lun:
            return {
                'id': lun_id,
                'path': lun.path,
                'size': lun.size,
                'size_mb': lun.size / (1024 * 1024)
            }
        return None
    
    def get_all_luns_info(self):
        return [self.get_lun_info(lid) for lid in self.list_luns()]
    
    def close_all(self):
        for lun in self.luns.values():
            lun.close()
        self.luns.clear()
