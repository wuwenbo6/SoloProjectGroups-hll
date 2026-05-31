import gi
import cv2
import numpy as np
import os
import threading
import time
from datetime import datetime

gi.require_version('Gtk', '4.0')
gi.require_version('Gdk', '4.0')
gi.require_version('Gst', '1.0')

from gi.repository import Gtk, Gdk, Gst, GLib, GdkPixbuf

from video_stabilizer import VideoStabilizer
from super_resolution import ESPCNSuperResolution
from motion_detector import MotionDetector


class VideoProcessorApp(Gtk.ApplicationWindow):
    def __init__(self, app):
        super().__init__(application=app, title="视频增强处理器")
        self.set_default_size(1280, 800)
        
        Gst.init(None)
        
        self.pipeline = None
        self.cap = None
        self.is_running = False
        self.is_recording = False
        self.video_writer = None
        
        self.stabilizer = VideoStabilizer(smooth_radius=10, zoom=1.0)
        self.super_res = ESPCNSuperResolution(scale=2, mode="fast")
        self.motion_detector = MotionDetector(threshold=25.0, min_area=500, enable_skip=False)
        
        self.enable_stabilization = True
        self.enable_super_res = True
        self.enable_roi_sr = False
        self.enable_motion_detect = False
        self.enable_motion_skip = False
        self.smooth_radius = 10
        self.roi_ratio = 0.5
        self.frame_width = 640
        self.frame_height = 480
        
        self.current_frame = None
        self.processed_frame = None
        self.frame_lock = threading.Lock()
        
        self._create_ui()
        
    def _create_ui(self):
        main_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        main_box.set_margin_top(10)
        main_box.set_margin_bottom(10)
        main_box.set_margin_start(10)
        main_box.set_margin_end(10)
        self.set_child(main_box)
        
        left_panel = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        left_panel.set_size_request(250, -1)
        main_box.append(left_panel)
        
        right_panel = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        right_panel.set_hexpand(True)
        right_panel.set_vexpand(True)
        main_box.append(right_panel)
        
        self._create_controls(left_panel)
        self._create_video_display(right_panel)
        
    def _create_controls(self, parent):
        camera_group = Gtk.Frame(label="摄像头控制")
        camera_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        camera_box.set_margin_top(10)
        camera_box.set_margin_bottom(10)
        camera_box.set_margin_start(10)
        camera_box.set_margin_end(10)
        camera_group.set_child(camera_box)
        parent.append(camera_group)
        
        self.camera_combo = Gtk.ComboBoxText()
        self.camera_combo.append_text("摄像头 0")
        self.camera_combo.append_text("摄像头 1")
        self.camera_combo.set_active(0)
        camera_box.append(self.camera_combo)
        
        self.start_btn = Gtk.Button(label="开始")
        self.start_btn.connect("clicked", self._on_start_stop)
        camera_box.append(self.start_btn)
        
        process_group = Gtk.Frame(label="处理选项")
        process_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        process_box.set_margin_top(10)
        process_box.set_margin_bottom(10)
        process_box.set_margin_start(10)
        process_box.set_margin_end(10)
        process_group.set_child(process_box)
        parent.append(process_group)
        
        self.stabilize_switch = Gtk.Switch()
        self.stabilize_switch.set_active(True)
        self.stabilize_switch.connect("state-set", self._on_stabilize_toggle)
        stabilize_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        stabilize_box.append(Gtk.Label(label="视频去抖动"))
        stabilize_box.append(self.stabilize_switch)
        process_box.append(stabilize_box)
        
        smooth_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=5)
        self.smooth_label = Gtk.Label(label=f"平滑强度: {self.smooth_radius}")
        self.smooth_label.set_halign(Gtk.Align.START)
        smooth_box.append(self.smooth_label)
        
        self.smooth_scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 1, 50, 1)
        self.smooth_scale.set_value(self.smooth_radius)
        self.smooth_scale.connect("value-changed", self._on_smooth_changed)
        smooth_box.append(self.smooth_scale)
        process_box.append(smooth_box)
        
        zoom_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=5)
        self.zoom_label = Gtk.Label(label="边缘裁剪补偿: 1.00x")
        self.zoom_label.set_halign(Gtk.Align.START)
        zoom_box.append(self.zoom_label)
        
        self.zoom_scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 1.0, 1.1, 0.01)
        self.zoom_scale.set_value(1.0)
        self.zoom_scale.connect("value-changed", self._on_zoom_changed)
        zoom_box.append(self.zoom_scale)
        process_box.append(zoom_box)
        
        self.sr_switch = Gtk.Switch()
        self.sr_switch.set_active(True)
        self.sr_switch.connect("state-set", self._on_sr_toggle)
        sr_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        sr_box.append(Gtk.Label(label="超分辨率 (2x)"))
        sr_box.append(self.sr_switch)
        process_box.append(sr_box)
        
        sr_mode_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=5)
        sr_mode_label = Gtk.Label(label="超分模式:")
        sr_mode_label.set_halign(Gtk.Align.START)
        sr_mode_box.append(sr_mode_label)
        
        self.sr_mode_combo = Gtk.ComboBoxText()
        self.sr_mode_combo.append_text("超快 (双线性)")
        self.sr_mode_combo.append_text("快速 (YCrCb)")
        self.sr_mode_combo.append_text("平衡 (锐化)")
        self.sr_mode_combo.append_text("高质量 (ESPCN)")
        self.sr_mode_combo.set_active(1)
        self.sr_mode_combo.connect("changed", self._on_sr_mode_changed)
        sr_mode_box.append(self.sr_mode_combo)
        process_box.append(sr_mode_box)
        
        self.roi_switch = Gtk.Switch()
        self.roi_switch.set_active(False)
        self.roi_switch.connect("state-set", self._on_roi_toggle)
        roi_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        roi_box.append(Gtk.Label(label="仅中心区域超分"))
        roi_box.append(self.roi_switch)
        process_box.append(roi_box)
        
        roi_ratio_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=5)
        self.roi_ratio_label = Gtk.Label(label="ROI区域比例: 50%")
        self.roi_ratio_label.set_halign(Gtk.Align.START)
        roi_ratio_box.append(self.roi_ratio_label)
        
        self.roi_ratio_scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0.1, 1.0, 0.05)
        self.roi_ratio_scale.set_value(0.5)
        self.roi_ratio_scale.connect("value-changed", self._on_roi_ratio_changed)
        roi_ratio_box.append(self.roi_ratio_scale)
        process_box.append(roi_ratio_box)
        
        self.motion_switch = Gtk.Switch()
        self.motion_switch.set_active(False)
        self.motion_switch.connect("state-set", self._on_motion_toggle)
        motion_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        motion_box.append(Gtk.Label(label="运动检测加速"))
        motion_box.append(self.motion_switch)
        process_box.append(motion_box)
        
        self.motion_skip_switch = Gtk.Switch()
        self.motion_skip_switch.set_active(False)
        self.motion_skip_switch.connect("state-set", self._on_motion_skip_toggle)
        motion_skip_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        motion_skip_box.append(Gtk.Label(label="无运动跳帧"))
        motion_skip_box.append(self.motion_skip_switch)
        process_box.append(motion_skip_box)
        
        record_group = Gtk.Frame(label="录制")
        record_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        record_box.set_margin_top(10)
        record_box.set_margin_bottom(10)
        record_box.set_margin_start(10)
        record_box.set_margin_end(10)
        record_group.set_child(record_box)
        parent.append(record_group)
        
        self.record_btn = Gtk.Button(label="开始录制")
        self.record_btn.connect("clicked", self._on_record_toggle)
        self.record_btn.set_sensitive(False)
        record_box.append(self.record_btn)
        
        self.export_pipeline_btn = Gtk.Button(label="导出GStreamer Pipeline")
        self.export_pipeline_btn.connect("clicked", self._on_export_pipeline)
        record_box.append(self.export_pipeline_btn)
        
        self.status_label = Gtk.Label(label="状态: 就绪")
        self.status_label.set_halign(Gtk.Align.START)
        self.status_label.add_css_class("dim-label")
        parent.append(self.status_label)
        
    def _create_video_display(self, parent):
        self.video_area = Gtk.DrawingArea()
        self.video_area.set_vexpand(True)
        self.video_area.set_hexpand(True)
        self.video_area.set_draw_func(self._on_draw)
        parent.append(self.video_area)
        
        self.fps_label = Gtk.Label(label="FPS: 0")
        self.fps_label.set_halign(Gtk.Align.START)
        parent.append(self.fps_label)
        
    def _on_stabilize_toggle(self, switch, state):
        self.enable_stabilization = state
        if not state:
            self.stabilizer.reset()
            
    def _on_sr_toggle(self, switch, state):
        self.enable_super_res = state
        
    def _on_sr_mode_changed(self, combo):
        mode_idx = combo.get_active()
        mode_map = {
            0: "ultra_fast",
            1: "fast",
            2: "balanced",
            3: "high_quality"
        }
        self.super_res.set_mode(mode_map.get(mode_idx, "fast"))
        
    def _on_smooth_changed(self, scale):
        self.smooth_radius = int(scale.get_value())
        self.stabilizer.set_smooth_radius(self.smooth_radius)
        self.smooth_label.set_text(f"平滑强度: {self.smooth_radius}")
        
    def _on_zoom_changed(self, scale):
        zoom = scale.get_value()
        self.stabilizer.set_zoom(zoom)
        self.zoom_label.set_text(f"边缘裁剪补偿: {zoom:.2f}x")
        
    def _on_roi_toggle(self, switch, state):
        self.enable_roi_sr = state
        self.super_res.set_roi_mode(state, self.roi_ratio)
        
    def _on_roi_ratio_changed(self, scale):
        self.roi_ratio = scale.get_value()
        self.roi_ratio_label.set_text(f"ROI区域比例: {int(self.roi_ratio * 100)}%")
        self.super_res.set_roi_mode(self.enable_roi_sr, self.roi_ratio)
        
    def _on_motion_toggle(self, switch, state):
        self.enable_motion_detect = state
        if not state:
            self.motion_detector.reset()
            
    def _on_motion_skip_toggle(self, switch, state):
        self.enable_motion_skip = state
        self.motion_detector.set_enable_skip(state, skip_frames=3)
        
    def _on_export_pipeline(self, button):
        self._export_gstreamer_pipeline()
        
    def _export_gstreamer_pipeline(self):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"pipeline_{timestamp}.txt"
        
        pipeline_desc = self._generate_gstreamer_pipeline()
        
        with open(filename, 'w') as f:
            f.write("# GStreamer Pipeline for Video Enhancement\n")
            f.write("# ==========================================\n\n")
            f.write("# Camera source -> Video Stabilization + Super Resolution\n\n")
            f.write(pipeline_desc)
            f.write("\n")
        
        self._update_status(f"Pipeline已导出: {filename}")
        
        dialog = Gtk.MessageDialog(
            transient_for=self,
            modal=True,
            buttons=Gtk.ButtonsType.OK,
            message_type=Gtk.MessageType.INFO,
            text=f"GStreamer Pipeline 已导出到:\n{filename}"
        )
        dialog.connect("response", lambda d, r: d.destroy())
        dialog.present()
        
    def _generate_gstreamer_pipeline(self):
        camera_idx = self.camera_combo.get_active()
        
        sr_mode_text = self.sr_mode_combo.get_active_text()
        roi_enabled = self.enable_roi_sr
        roi_pct = int(self.roi_ratio * 100) if roi_enabled else 100
        
        pipeline = []
        
        pipeline.append("# Source: USB Camera")
        pipeline.append(f"v4l2src device=/dev/video{camera_idx} ! \\")
        pipeline.append(f"    video/x-raw,width={self.frame_width},height={self.frame_height},framerate=30/1 ! \\")
        pipeline.append("    videoconvert ! \\")
        
        if self.enable_stabilization:
            pipeline.append("")
            pipeline.append("# Video Stabilization (using videostab element)")
            pipeline.append("    videostab ! \\")
            pipeline.append("    videoconvert ! \\")
        
        if self.enable_super_res:
            pipeline.append("")
            pipeline.append(f"# Super Resolution Mode: {sr_mode_text}")
            if roi_enabled:
                pipeline.append(f"# ROI Center Region: {roi_pct}%")
                pipeline.append("    videobox crop-to-center ! \\")
                pipeline.append(f"    videoscale ! \\")
            pipeline.append("    # Note: Replace with custom SR element or OpenCV filter")
            pipeline.append("    videoscale method=2 ! \\")
        
        pipeline.append("")
        pipeline.append("# Display")
        pipeline.append("    videoconvert ! \\")
        pipeline.append("    autovideosink")
        
        pipeline.append("")
        pipeline.append("")
        pipeline.append("# Alternative: Full pipeline with OpenCV processing")
        pipeline.append("# ===============================================")
        pipeline.append("# v4l2src device=/dev/video0 ! video/x-raw,width=640,height=480 ! \\")
        pipeline.append("#     videoconvert ! video/x-raw,format=BGR ! \\")
        pipeline.append("#     opencv_video ! \\")
        pipeline.append("#     opencv_video_filter ! \\")  # Placeholder for custom OpenCV processing
        pipeline.append("#     videoconvert ! autovideosink")
        
        pipeline.append("")
        pipeline.append("# Recording Pipeline")
        pipeline.append("# ===============================================")
        pipeline.append("# v4l2src ! videoconvert ! x264enc ! mp4mux ! filesink location=output.mp4")
        
        return "\n".join(pipeline)
        
    def _on_start_stop(self, button):
        if self.is_running:
            self._stop_camera()
            button.set_label("开始")
            self.record_btn.set_sensitive(False)
        else:
            self._start_camera()
            button.set_label("停止")
            self.record_btn.set_sensitive(True)
            
    def _start_camera(self):
        camera_idx = self.camera_combo.get_active()
        self.cap = cv2.VideoCapture(camera_idx)
        
        if not self.cap.isOpened():
            self._update_status("错误: 无法打开摄像头")
            return
            
        self.is_running = True
        self.stabilizer.reset()
        self.frame_count = 0
        self.last_fps_time = time.time()
        
        self._update_status("正在运行")
        
        self.capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.capture_thread.start()
        
        GLib.timeout_add(33, self._update_display)
        
    def _stop_camera(self):
        self.is_running = False
        if self.is_recording:
            self._stop_recording()
        if self.cap:
            self.cap.release()
            self.cap = None
        self.stabilizer.reset()
        self._update_status("已停止")
        
    def _capture_loop(self):
        last_processed_frame = None
        no_motion_count = 0
        
        while self.is_running and self.cap:
            ret, frame = self.cap.read()
            if not ret:
                break
                
            if self.frame_width == 640 and self.frame_height == 480:
                h, w = frame.shape[:2]
                self.frame_width, self.frame_height = w, h
                
            with self.frame_lock:
                self.current_frame = frame.copy()
                
            need_process = True
            has_motion = True
            
            if self.enable_motion_detect:
                _, has_motion, _ = self.motion_detector.detect(frame)
                if self.enable_motion_skip and not has_motion and last_processed_frame is not None:
                    no_motion_count += 1
                    if no_motion_count < 10:
                        need_process = False
                    else:
                        no_motion_count = 0
                else:
                    no_motion_count = 0
            
            if need_process:
                processed = frame.copy()
                
                if self.enable_stabilization:
                    processed = self.stabilizer.stabilize(processed)
                    
                if self.enable_super_res:
                    processed = self.super_res.upscale(processed)
                    
                last_processed_frame = processed
            else:
                processed = last_processed_frame
                
            with self.frame_lock:
                self.processed_frame = processed
                
            if self.is_recording and self.video_writer:
                self.video_writer.write(processed)
                
            self.frame_count += 1
            current_time = time.time()
            if current_time - self.last_fps_time >= 1.0:
                fps = self.frame_count / (current_time - self.last_fps_time)
                motion_str = " (运动检测)" if self.enable_motion_detect else ""
                GLib.idle_add(lambda f=fps, m=motion_str: self.fps_label.set_text(f"FPS: {f:.1f}{m}"))
                self.frame_count = 0
                self.last_fps_time = current_time
                
            time.sleep(0.001)
            
    def _update_display(self):
        if not self.is_running:
            return False
            
        self.video_area.queue_draw()
        return True
        
    def _on_draw(self, area, cr, width, height):
        with self.frame_lock:
            frame = self.processed_frame if self.processed_frame is not None else self.current_frame
            
        if frame is None:
            return
            
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w = frame_rgb.shape[:2]
        
        scale = min(width / w, height / h)
        new_w, new_h = int(w * scale), int(h * scale)
        
        frame_resized = cv2.resize(frame_rgb, (new_w, new_h))
        
        offset_x = (width - new_w) // 2
        offset_y = (height - new_h) // 2
        
        pixbuf = GdkPixbuf.Pixbuf.new_from_data(
            frame_resized.tobytes(),
            GdkPixbuf.Colorspace.RGB,
            False,
            8,
            new_w,
            new_h,
            new_w * 3
        )
        
        Gdk.cairo_set_source_pixbuf(cr, pixbuf, offset_x, offset_y)
        cr.paint()
        
    def _on_record_toggle(self, button):
        if self.is_recording:
            self._stop_recording()
            button.set_label("开始录制")
        else:
            self._start_recording()
            button.set_label("停止录制")
            
    def _start_recording(self):
        if not self.processed_frame is None:
            h, w = self.processed_frame.shape[:2]
        else:
            self._update_status("等待视频帧...")
            return
            
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"output_{timestamp}.mp4"
        
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        self.video_writer = cv2.VideoWriter(filename, fourcc, 15.0, (w, h))
        
        if self.video_writer.isOpened():
            self.is_recording = True
            self.record_filename = filename
            self._update_status(f"正在录制: {filename}")
            self.record_btn.add_css_class("destructive-action")
        else:
            self._update_status("无法创建视频文件")
            
    def _stop_recording(self):
        self.is_recording = False
        if self.video_writer:
            self.video_writer.release()
            self.video_writer = None
        self._update_status(f"录制完成: {self.record_filename}")
        self.record_btn.remove_css_class("destructive-action")
        
    def _update_status(self, message):
        GLib.idle_add(lambda: self.status_label.set_text(f"状态: {message}"))
        
    def do_close_request(self):
        self._stop_camera()
        return False


class VideoProcessorApplication(Gtk.Application):
    def __init__(self):
        super().__init__(application_id='com.example.videoprocessor')
        
    def do_activate(self):
        win = self.props.active_window
        if not win:
            win = VideoProcessorApp(self)
        win.present()


def main():
    app = VideoProcessorApplication()
    app.run(None)


if __name__ == "__main__":
    main()
