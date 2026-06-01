import cv2
import numpy as np
import os
from typing import List, Dict, Tuple


class SummaryGenerator:
    def __init__(self, min_segment_duration=1.0, merge_gap=2.0):
        self.min_segment_duration = min_segment_duration
        self.merge_gap = merge_gap

    def merge_intervals(self, intervals: List[Dict]) -> List[Dict]:
        if not intervals:
            return []

        filtered = [
            iv for iv in intervals
            if iv['duration'] >= self.min_segment_duration
        ]

        if not filtered:
            return []

        sorted_intervals = sorted(filtered, key=lambda x: x['start'])
        merged = [sorted_intervals[0]]

        for current in sorted_intervals[1:]:
            last = merged[-1]
            if current['start'] - last['end'] <= self.merge_gap:
                last['end'] = max(last['end'], current['end'])
                last['duration'] = last['end'] - last['start']
            else:
                merged.append(current)

        return merged

    def time_to_frame(self, time_sec: float, fps: float) -> int:
        return int(time_sec * fps)

    def generate_summary(
        self,
        video_path: str,
        analysis_result: Dict,
        output_path: str,
        progress_callback=None
    ) -> Dict:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise Exception(f"Cannot open video file: {video_path}")

        video_info = analysis_result['video_info']
        fps = video_info['fps']
        width = video_info['width']
        height = video_info['height']
        total_frames = video_info['total_frames']

        intervals = self.merge_intervals(analysis_result['motion_intervals'])

        if not intervals:
            cap.release()
            return {
                'success': False,
                'message': 'No valid motion intervals found',
                'output_path': None
            }

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        frames_processed = 0
        total_output_frames = sum(
            self.time_to_frame(iv['end'], fps) - self.time_to_frame(iv['start'], fps)
            for iv in intervals
        )

        for interval in intervals:
            start_frame = self.time_to_frame(interval['start'], fps)
            end_frame = self.time_to_frame(interval['end'], fps)

            start_frame = max(0, start_frame)
            end_frame = min(total_frames - 1, end_frame)

            cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

            for frame_num in range(start_frame, end_frame + 1):
                ret, frame = cap.read()
                if not ret:
                    break

                out.write(frame)
                frames_processed += 1

                if progress_callback and frames_processed % 10 == 0:
                    progress = (frames_processed / total_output_frames) * 100
                    progress_callback(progress)

        cap.release()
        out.release()

        summary_duration = sum(iv['duration'] for iv in intervals)

        return {
            'success': True,
            'output_path': output_path,
            'original_duration': video_info['duration'],
            'summary_duration': summary_duration,
            'compression_ratio': summary_duration / video_info['duration'] if video_info['duration'] > 0 else 0,
            'segments_count': len(intervals),
            'segments': intervals
        }

    def generate_preview_frames(
        self,
        video_path: str,
        analysis_result: Dict,
        num_frames: int = 6
    ) -> List[np.ndarray]:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise Exception(f"Cannot open video file: {video_path}")

        video_info = analysis_result['video_info']
        intervals = self.merge_intervals(analysis_result['motion_intervals'])

        preview_frames = []

        if intervals:
            total_duration = sum(iv['duration'] for iv in intervals)
            sample_times = []

            if total_duration > 0:
                for i in range(num_frames):
                    target_time = (i / (num_frames - 1)) * total_duration if num_frames > 1 else 0
                    accumulated = 0
                    for iv in intervals:
                        if accumulated + iv['duration'] >= target_time:
                            sample_times.append(iv['start'] + (target_time - accumulated))
                            break
                        accumulated += iv['duration']

            for sample_time in sample_times:
                frame_num = self.time_to_frame(sample_time, video_info['fps'])
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
                ret, frame = cap.read()
                if ret:
                    preview_frames.append(frame)

        cap.release()
        return preview_frames


def generate_summary_video(
    video_path: str,
    analysis_result: Dict,
    output_path: str,
    progress_callback=None
) -> Dict:
    generator = SummaryGenerator()
    return generator.generate_summary(video_path, analysis_result, output_path, progress_callback)


def get_preview_frames(
    video_path: str,
    analysis_result: Dict,
    num_frames: int = 6
) -> List[np.ndarray]:
    generator = SummaryGenerator()
    return generator.generate_preview_frames(video_path, analysis_result, num_frames)
