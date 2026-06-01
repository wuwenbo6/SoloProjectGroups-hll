import fcntl
import os
import struct
import numpy as np
import time
import threading
from PIL import Image, ImageDraw, ImageFont

try:
    from mmap import munmap
except ImportError:
    def munmap(addr, length=None):
        pass


class V4L2Loopback:
    VIDIOC_S_FMT = 0xC0CC5605
    VIDIOC_G_FMT = 0x80CC5604
    VIDIOC_REQBUFS = 0xC0145608
    VIDIOC_QBUF = 0xC02C560F
    VIDIOC_DQBUF = 0xC02C5611
    VIDIOC_STREAMON = 0x40045612
    VIDIOC_STREAMOFF = 0x40045613
    
    V4L2_BUF_TYPE_VIDEO_OUTPUT = 2
    V4L2_MEMORY_MMAP = 1
    V4L2_PIX_FMT_RGB24 = 0x33424752
    V4L2_PIX_FMT_SBGGR10 = 0x30314742
    V4L2_PIX_FMT_SBGGR12 = 0x32314742
    
    V4L2_FIELD_NONE = 1
    
    PIXEL_FORMATS = {
        'RGB24': {'fourcc': V4L2_PIX_FMT_RGB24, 'bpp': 24, 'name': 'RGB24'},
        'RAW10': {'fourcc': V4L2_PIX_FMT_SBGGR10, 'bpp': 10, 'name': 'RAW10 (BGGR)'},
        'RAW12': {'fourcc': V4L2_PIX_FMT_SBGGR12, 'bpp': 12, 'name': 'RAW12 (BGGR)'}
    }
    
    V4L2_BUF_FLAG_MAPPED = 0x0001
    V4L2_BUF_FLAG_QUEUED = 0x0002
    V4L2_BUF_FLAG_DONE = 0x0004
    V4L2_BUF_FLAG_KEYFRAME = 0x0008
    V4L2_BUF_FLAG_PFRAME = 0x0010
    V4L2_BUF_FLAG_BFRAME = 0x0020
    V4L2_BUF_FLAG_ERROR = 0x0040
    V4L2_BUF_FLAG_IN_REQUEST = 0x0080
    V4L2_BUF_FLAG_TIMECODE = 0x0100
    V4L2_BUF_FLAG_M2M_HOLD_CAPTURE_BUF = 0x0200
    V4L2_BUF_FLAG_PREPARED = 0x0400
    V4L2_BUF_FLAG_NO_CACHE_INVALIDATE = 0x0800
    V4L2_BUF_FLAG_NO_CACHE_CLEAN = 0x1000
    V4L2_BUF_FLAG_TSTAMP_SRC_MASK = 0x6000
    V4L2_BUF_FLAG_TSTAMP_SRC_SOE = 0x2000
    V4L2_BUF_FLAG_LAST = 0x8000
    V4L2_BUF_FLAG_REQUEST_FD = 0x80000
    
    def __init__(self, device_path='/dev/video10', num_buffers=8, pixel_format='RGB24'):
        self.device_path = device_path
        self.fd = None
        self.width = 640
        self.height = 480
        self.pixel_format = pixel_format
        self.frame_size = self._calculate_frame_size(self.width, self.height, pixel_format)
        self.num_buffers = num_buffers
        self.buffers = []
        self.current_buffer_index = 0
        self.fs_marker = b'\x00\x00\x00\x01\xDA'
        self.fe_marker = b'\x00\x00\x00\x01\xB7'
    
    def _calculate_frame_size(self, width, height, pixel_format):
        fmt = self.PIXEL_FORMATS.get(pixel_format, self.PIXEL_FORMATS['RGB24'])
        bpp = fmt['bpp']
        if pixel_format == 'RGB24':
            return width * height * 3
        elif pixel_format == 'RAW10':
            return (width * height * 10 + 7) // 8
        elif pixel_format == 'RAW12':
            return (width * height * 12 + 7) // 8
        return width * height * 3
    
    def open(self):
        self.fd = os.open(self.device_path, os.O_RDWR)
        if self.fd < 0:
            raise RuntimeError(f"Failed to open {self.device_path}")
    
    def close(self):
        if self.fd:
            self._free_buffers()
            os.close(self.fd)
            self.fd = None
    
    def _free_buffers(self):
        for buf in self.buffers:
            if 'mmap' in buf and 'length' in buf:
                try:
                    munmap(buf['mmap'], buf['length'])
                except:
                    pass
        self.buffers = []
    
    def set_format(self, width, height, pixel_format=None):
        if pixel_format:
            self.pixel_format = pixel_format
        self.width = width
        self.height = height
        self.frame_size = self._calculate_frame_size(width, height, self.pixel_format)
        
        fmt_info = self.PIXEL_FORMATS.get(self.pixel_format, self.PIXEL_FORMATS['RGB24'])
        fourcc = fmt_info['fourcc']
        
        fmt = struct.pack('<IIIIHHIIIIII',
            self.V4L2_BUF_TYPE_VIDEO_OUTPUT,
            width, height,
            fourcc,
            self.V4L2_FIELD_NONE,
            self.V4L2_BUF_FLAG_MAPPED,
            self.frame_size,
            1, 0, 0, 0, 0
        )
        
        try:
            fcntl.ioctl(self.fd, self.VIDIOC_S_FMT, fmt)
        except IOError as e:
            raise RuntimeError(f"Failed to set format: {e}")
    
    @staticmethod
    def rgb_to_raw10(rgb_frame, width, height):
        r = rgb_frame[:, :, 0].astype(np.uint16)
        g = rgb_frame[:, :, 1].astype(np.uint16)
        b = rgb_frame[:, :, 2].astype(np.uint16)
        
        r10 = (r * 1023 // 255).astype(np.uint16)
        g10 = (g * 1023 // 255).astype(np.uint16)
        b10 = (b * 1023 // 255).astype(np.uint16)
        
        raw = np.zeros((height, width), dtype=np.uint16)
        raw[0::2, 0::2] = b10[0::2, 0::2]
        raw[0::2, 1::2] = g10[0::2, 1::2]
        raw[1::2, 0::2] = g10[1::2, 0::2]
        raw[1::2, 1::2] = r10[1::2, 1::2]
        
        packed = np.zeros((height, (width * 10 + 7) // 8), dtype=np.uint8)
        raw_flat = raw.flatten()
        
        for i in range(0, len(raw_flat) - 3, 4):
            p0 = raw_flat[i] & 0x3FF
            p1 = raw_flat[i+1] & 0x3FF
            p2 = raw_flat[i+2] & 0x3FF
            p3 = raw_flat[i+3] & 0x3FF
            
            byte_idx = (i // 4) * 5
            packed_flat = packed.flatten()
            packed_flat[byte_idx] = p0 & 0xFF
            packed_flat[byte_idx + 1] = ((p0 >> 8) & 0x03) | ((p1 & 0x3F) << 2)
            packed_flat[byte_idx + 2] = ((p1 >> 6) & 0x0F) | ((p2 & 0x0F) << 4)
            packed_flat[byte_idx + 3] = ((p2 >> 4) & 0x3F) | ((p3 & 0x03) << 6)
            packed_flat[byte_idx + 4] = (p3 >> 2) & 0xFF
            packed = packed_flat.reshape(packed.shape)
        
        return packed.tobytes()
    
    @staticmethod
    def rgb_to_raw12(rgb_frame, width, height):
        r = rgb_frame[:, :, 0].astype(np.uint16)
        g = rgb_frame[:, :, 1].astype(np.uint16)
        b = rgb_frame[:, :, 2].astype(np.uint16)
        
        r12 = (r * 4095 // 255).astype(np.uint16)
        g12 = (g * 4095 // 255).astype(np.uint16)
        b12 = (b * 4095 // 255).astype(np.uint16)
        
        raw = np.zeros((height, width), dtype=np.uint16)
        raw[0::2, 0::2] = b12[0::2, 0::2]
        raw[0::2, 1::2] = g12[0::2, 1::2]
        raw[1::2, 0::2] = g12[1::2, 0::2]
        raw[1::2, 1::2] = r12[1::2, 1::2]
        
        packed = np.zeros((height, (width * 12 + 7) // 8), dtype=np.uint8)
        raw_flat = raw.flatten()
        
        for i in range(0, len(raw_flat) - 1, 2):
            p0 = raw_flat[i] & 0xFFF
            p1 = raw_flat[i+1] & 0xFFF
            
            byte_idx = (i // 2) * 3
            packed_flat = packed.flatten()
            packed_flat[byte_idx] = p0 & 0xFF
            packed_flat[byte_idx + 1] = ((p0 >> 8) & 0x0F) | ((p1 & 0x0F) << 4)
            packed_flat[byte_idx + 2] = (p1 >> 4) & 0xFF
            packed = packed_flat.reshape(packed.shape)
        
        return packed.tobytes()
    
    def set_num_buffers(self, num_buffers):
        self.num_buffers = num_buffers
        if self.fd:
            try:
                self._reqbufs(num_buffers)
            except Exception as e:
                print(f"Warning: Could not reallocate buffers: {e}")
    
    def _reqbufs(self, count):
        req = struct.pack('<IIII', self.V4L2_BUF_TYPE_VIDEO_OUTPUT, self.V4L2_MEMORY_MMAP, count, 0)
        try:
            result = fcntl.ioctl(self.fd, self.VIDIOC_REQBUFS, req)
            result_unpacked = struct.unpack('<IIII', result)
            actual_count = result_unpacked[2]
            return actual_count
        except IOError as e:
            raise RuntimeError(f"Failed to request buffers: {e}")
    
    def _write_with_markers(self, frame_data, frame_sequence):
        header = struct.pack('<IIQ', self.current_buffer_index, self.frame_size, frame_sequence)
        full_data = self.fs_marker + header + frame_data + self.fe_marker
        os.write(self.fd, full_data)
    
    def write_frame(self, frame_data, frame_sequence=0):
        if len(frame_data) != self.frame_size:
            raise ValueError(f"Frame size mismatch: expected {self.frame_size}, got {len(frame_data)}")
        try:
            self._write_with_markers(frame_data, frame_sequence)
            self.current_buffer_index = (self.current_buffer_index + 1) % self.num_buffers
        except BlockingIOError:
            raise BlockingIOError("Buffer full, frame dropped")
    
    def get_buffer_stats(self):
        return {
            'total': self.num_buffers,
            'current_index': self.current_buffer_index
        }


class ImageGenerator:
    BAD_PIXEL_TYPES = ['fixed', 'random', 'hot', 'dark', 'cluster']
    
    def __init__(self, width=640, height=480):
        self.width = width
        self.height = height
        self.frame_count = 0
        self.pattern = 'gradient'
        self.pixel_format = 'RGB24'
        
        self.bad_pixel_enabled = False
        self.bad_pixel_count = 0
        self.bad_pixel_type = 'fixed'
        self.bad_pixel_value = 0
        self.bad_pixels = []
        self.bad_pixel_seed = 42
    
    def set_resolution(self, width, height):
        self.width = width
        self.height = height
        if self.bad_pixel_enabled:
            self._generate_bad_pixel_positions()
    
    def set_pattern(self, pattern):
        self.pattern = pattern
    
    def set_pixel_format(self, pixel_format):
        self.pixel_format = pixel_format
    
    def set_bad_pixels(self, enabled=False, count=0, pixel_type='fixed', value=0, seed=42):
        self.bad_pixel_enabled = enabled
        self.bad_pixel_count = count
        self.bad_pixel_type = pixel_type
        self.bad_pixel_value = value
        self.bad_pixel_seed = seed
        if enabled and count > 0:
            self._generate_bad_pixel_positions()
        else:
            self.bad_pixels = []
    
    def _generate_bad_pixel_positions(self):
        rng = np.random.RandomState(self.bad_pixel_seed)
        total_pixels = self.width * self.height
        count = min(self.bad_pixel_count, total_pixels)
        
        if self.bad_pixel_type == 'cluster':
            num_clusters = max(1, count // 10)
            pixels = []
            for _ in range(num_clusters):
                cy = rng.randint(0, self.height)
                cx = rng.randint(0, self.width)
                for _ in range(min(10, count - len(pixels))):
                    dy = rng.randint(-2, 3)
                    dx = rng.randint(-2, 3)
                    y, x = cy + dy, cx + dx
                    if 0 <= y < self.height and 0 <= x < self.width:
                        if (y, x) not in pixels:
                            pixels.append((y, x))
            self.bad_pixels = pixels
        else:
            indices = rng.choice(total_pixels, count, replace=False)
            self.bad_pixels = [(idx // self.width, idx % self.width) for idx in indices]
    
    def _apply_bad_pixels(self, frame):
        if not self.bad_pixel_enabled or len(self.bad_pixels) == 0:
            return frame
        
        rng = np.random.RandomState(self.frame_count)
        frame_copy = frame.copy()
        
        for (y, x) in self.bad_pixels:
            if self.bad_pixel_type == 'fixed':
                frame_copy[y, x] = self.bad_pixel_value
            elif self.bad_pixel_type == 'random':
                frame_copy[y, x] = [rng.randint(0, 256), rng.randint(0, 256), rng.randint(0, 256)]
            elif self.bad_pixel_type == 'hot':
                hot_val = 200 + rng.randint(0, 56)
                frame_copy[y, x] = [hot_val, hot_val, hot_val]
            elif self.bad_pixel_type == 'dark':
                dark_val = rng.randint(0, 30)
                frame_copy[y, x] = [dark_val, dark_val, dark_val]
            elif self.bad_pixel_type == 'cluster':
                frame_copy[y, x] = self.bad_pixel_value
        
        return frame_copy
    
    def generate_frame(self):
        rgb_frame = self._generate_rgb_frame()
        rgb_frame = self._apply_bad_pixels(rgb_frame)
        
        if self.pixel_format == 'RGB24':
            return rgb_frame.tobytes(), rgb_frame
        elif self.pixel_format == 'RAW10':
            return V4L2Loopback.rgb_to_raw10(rgb_frame, self.width, self.height), rgb_frame
        elif self.pixel_format == 'RAW12':
            return V4L2Loopback.rgb_to_raw12(rgb_frame, self.width, self.height), rgb_frame
        else:
            return rgb_frame.tobytes(), rgb_frame
    
    def _generate_rgb_frame(self):
        if self.pattern == 'gradient':
            return self._generate_gradient()
        elif self.pattern == 'checkerboard':
            return self._generate_checkerboard()
        elif self.pattern == 'colorbars':
            return self._generate_colorbars()
        elif self.pattern == 'moving':
            return self._generate_moving()
        else:
            return self._generate_gradient()
    
    def _generate_gradient(self):
        x = np.linspace(0, 255, self.width, dtype=np.uint8)
        y = np.linspace(0, 255, self.height, dtype=np.uint8)
        xv, yv = np.meshgrid(x, y)
        
        r = xv
        g = yv
        b = (255 - xv + 255 - yv) // 2
        
        return np.stack([b, g, r], axis=-1)
    
    def _generate_checkerboard(self):
        tile_size = 32
        frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        
        for i in range(self.height):
            for j in range(self.width):
                if ((i // tile_size) + (j // tile_size)) % 2 == 0:
                    frame[i, j] = [255, 255, 255]
                else:
                    frame[i, j] = [0, 0, 0]
        
        return frame
    
    def _generate_colorbars(self):
        bar_width = self.width // 8
        colors = [
            [255, 255, 255],
            [255, 255, 0],
            [0, 255, 255],
            [0, 255, 0],
            [255, 0, 255],
            [255, 0, 0],
            [0, 0, 255],
            [0, 0, 0]
        ]
        
        frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        
        for i, color in enumerate(colors):
            start = i * bar_width
            end = start + bar_width if i < 7 else self.width
            frame[:, start:end] = color
        
        return frame
    
    def _generate_moving(self):
        self.frame_count += 1
        frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        
        cx = (self.frame_count * 3) % self.width
        cy = self.height // 2
        radius = 50
        
        y, x = np.ogrid[:self.height, :self.width]
        dist_from_center = np.sqrt((x - cx)**2 + (y - cy)**2)
        
        mask = dist_from_center <= radius
        frame[mask] = [0, 255, 0]
        
        img = Image.fromarray(frame)
        draw = ImageDraw.Draw(img)
        try:
            font = ImageFont.load_default()
        except:
            font = None
        
        text = f"Frame: {self.frame_count}"
        draw.text((10, 10), text, fill=(255, 255, 255), font=font)
        
        return np.array(img)


class CameraSimulator:
    def __init__(self, device_path='/dev/video10', width=640, height=480, fps=30, num_buffers=8, pixel_format='RGB24'):
        self.v4l2 = V4L2Loopback(device_path, num_buffers, pixel_format)
        self.image_generator = ImageGenerator(width, height)
        self.image_generator.set_pixel_format(pixel_format)
        self.width = width
        self.height = height
        self.fps = fps
        self.num_buffers = num_buffers
        self.pixel_format = pixel_format
        self.running = False
        self.thread = None
        self.lock = threading.Lock()
        
        self.total_frames = 0
        self.dropped_frames = 0
        self.sent_frames = 0
        self.frame_sequence = 0
        
        self.last_stats_time = time.time()
        self.last_sent_frames = 0
        self.current_output_fps = 0.0
        
        self.frame_generate_times = []
        self.frame_write_times = []
        self.max_stats_history = 100
    
    def start(self):
        if self.running:
            return
        
        self._reset_stats()
        
        try:
            self.v4l2.open()
            self.v4l2.set_format(self.width, self.height, self.pixel_format)
        except Exception as e:
            print(f"Warning: Could not open V4L2 device: {e}")
            print("Running in test mode only (no V4L2 output)")
        
        self.running = True
        self.thread = threading.Thread(target=self._run_loop)
        self.thread.daemon = True
        self.thread.start()
    
    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=2.0)
            self.thread = None
        self.v4l2.close()
    
    def _reset_stats(self):
        self.total_frames = 0
        self.dropped_frames = 0
        self.sent_frames = 0
        self.frame_sequence = 0
        self.last_stats_time = time.time()
        self.last_sent_frames = 0
        self.current_output_fps = 0.0
        self.frame_generate_times = []
        self.frame_write_times = []
    
    def _update_fps_stats(self):
        current_time = time.time()
        elapsed = current_time - self.last_stats_time
        
        if elapsed >= 1.0:
            frames_sent = self.sent_frames - self.last_sent_frames
            self.current_output_fps = frames_sent / elapsed
            self.last_sent_frames = self.sent_frames
            self.last_stats_time = current_time
    
    def _record_time(self, times_list, value):
        times_list.append(value)
        if len(times_list) > self.max_stats_history:
            times_list.pop(0)
    
    def _get_avg_time(self, times_list):
        if not times_list:
            return 0.0
        return sum(times_list) / len(times_list)
    
    def _run_loop(self):
        while self.running:
            frame_interval = 1.0 / self.fps
            loop_start = time.time()
            
            gen_start = time.time()
            with self.lock:
                frame_data, rgb_frame = self.image_generator.generate_frame()
            gen_time = time.time() - gen_start
            self._record_time(self.frame_generate_times, gen_time)
            
            self.total_frames += 1
            self.frame_sequence += 1
            
            write_success = False
            write_start = time.time()
            try:
                if self.v4l2.fd:
                    with self.lock:
                        self.v4l2.write_frame(frame_data, self.frame_sequence)
                    self.sent_frames += 1
                    write_success = True
            except BlockingIOError:
                self.dropped_frames += 1
            except Exception as e:
                self.dropped_frames += 1
            
            write_time = time.time() - write_start
            self._record_time(self.frame_write_times, write_time)
            
            self._update_fps_stats()
            
            elapsed = time.time() - loop_start
            sleep_time = max(0, frame_interval - elapsed)
            if sleep_time > 0:
                time.sleep(sleep_time)
    
    def set_resolution(self, width, height):
        with self.lock:
            self.width = width
            self.height = height
            self.image_generator.set_resolution(width, height)
            try:
                if self.v4l2.fd:
                    self.v4l2.set_format(width, height)
            except:
                pass
    
    def set_fps(self, fps):
        with self.lock:
            self.fps = fps
    
    def set_pattern(self, pattern):
        with self.lock:
            self.image_generator.set_pattern(pattern)
    
    def set_pixel_format(self, pixel_format):
        with self.lock:
            self.pixel_format = pixel_format
            self.image_generator.set_pixel_format(pixel_format)
            try:
                if self.v4l2.fd:
                    self.v4l2.set_format(self.width, self.height, pixel_format)
            except:
                pass
    
    def set_bad_pixels(self, enabled=False, count=0, pixel_type='fixed', value=0, seed=42):
        with self.lock:
            self.image_generator.set_bad_pixels(enabled, count, pixel_type, value, seed)
    
    def set_num_buffers(self, num_buffers):
        with self.lock:
            self.num_buffers = num_buffers
            self.v4l2.set_num_buffers(num_buffers)
    
    def _calculate_drop_rate(self):
        if self.total_frames == 0:
            return 0.0
        return (self.dropped_frames / self.total_frames) * 100.0
    
    def get_status(self):
        buffer_stats = self.v4l2.get_buffer_stats()
        
        return {
            'width': self.width,
            'height': self.height,
            'fps': self.fps,
            'running': self.running,
            'pattern': self.image_generator.pattern,
            'pixel_format': self.pixel_format,
            'device': self.v4l2.device_path,
            'num_buffers': self.num_buffers,
            'bad_pixels': {
                'enabled': self.image_generator.bad_pixel_enabled,
                'count': self.image_generator.bad_pixel_count,
                'type': self.image_generator.bad_pixel_type,
                'value': self.image_generator.bad_pixel_value
            },
            'stats': {
                'total_frames': self.total_frames,
                'sent_frames': self.sent_frames,
                'dropped_frames': self.dropped_frames,
                'drop_rate_percent': round(self._calculate_drop_rate(), 2),
                'current_output_fps': round(self.current_output_fps, 2),
                'avg_generate_time_ms': round(self._get_avg_time(self.frame_generate_times) * 1000, 3),
                'avg_write_time_ms': round(self._get_avg_time(self.frame_write_times) * 1000, 3),
                'frame_sequence': self.frame_sequence
            },
            'buffer': buffer_stats
        }
