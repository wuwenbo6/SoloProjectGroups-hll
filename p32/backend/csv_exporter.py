import csv
from pathlib import Path
from datetime import datetime


def export_tracks_to_csv(task_id: str, track_data: dict, filename: str):
    results_dir = Path("results") / task_id
    results_dir.mkdir(parents=True, exist_ok=True)
    
    csv_path = results_dir / f"{task_id}_report.csv"
    
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        
        writer.writerow(["Fish Detection and Tracking Report - 鱼类检测跟踪报告"])
        writer.writerow(["Generated At/生成时间:", datetime.now().strftime("%Y-%m-%d %H:%M:%S")])
        writer.writerow(["Source Video/源视频:", filename])
        writer.writerow(["Task ID/任务ID:", task_id])
        writer.writerow([])
        
        if not track_data or "tracks" not in track_data:
            writer.writerow(["No track data available/无轨迹数据"])
            return str(csv_path)
        
        tracks = track_data["tracks"]
        behavior_analysis = track_data.get("behavior_analysis", {})
        pixel_per_cm = track_data.get("pixel_per_cm", 10.0)
        fps = track_data.get("fps", 30.0)
        total_fish = len(tracks)
        
        writer.writerow(["Project Information/项目信息"])
        writer.writerow(["Pixel/cm ratio/像素厘米比:", f"{pixel_per_cm} px/cm"])
        writer.writerow(["Video FPS/视频帧率:", f"{fps} fps"])
        writer.writerow(["Total Unique Fish/总鱼类数:", total_fish])
        writer.writerow([])
        
        writer.writerow(["Fish Type Distribution/鱼类分布"])
        writer.writerow(["Fish Type/鱼类", "Count/数量"])
        
        type_counts = {}
        for track_id, track_info in tracks.items():
            fish_type = track_info.get("class_name", "unknown")
            type_counts[fish_type] = type_counts.get(fish_type, 0) + 1
        
        for fish_type, count in type_counts.items():
            writer.writerow([fish_type, count])
        writer.writerow([])
        
        writer.writerow(["=" * 100])
        writer.writerow(["BEHAVIOR SUMMARY / 行为分析汇总"])
        writer.writerow(["=" * 100])
        writer.writerow([])
        
        writer.writerow([
            "Track ID/轨迹ID", 
            "Fish Type/鱼类", 
            "Avg Size/平均尺寸 (cm)",
            "Max Size/最大尺寸 (cm)",
            "Avg Speed/平均速度 (cm/s)",
            "Max Speed/最大速度 (cm/s)", 
            "Avg Turn Angle/平均转向角 (°)",
            "Max Turn Angle/最大转向角 (°)",
            "Total Distance/总距离 (cm)",
            "Duration/持续时间 (s)",
            "Total Frames/总帧数"
        ])
        
        for track_id, track_info in tracks.items():
            behavior = behavior_analysis.get(str(track_id), {})
            summary = behavior.get("summary", {})
            
            writer.writerow([
                track_id,
                track_info.get("class_name", "unknown"),
                f"{summary.get('avg_size_cm', 0):.2f}",
                f"{summary.get('max_size_cm', 0):.2f}",
                f"{summary.get('avg_speed_cm_s', 0):.2f}",
                f"{summary.get('max_speed_cm_s', 0):.2f}",
                f"{summary.get('avg_turn_angle_deg', 0):.2f}",
                f"{summary.get('max_turn_angle_deg', 0):.2f}",
                f"{summary.get('total_distance_cm', 0):.2f}",
                f"{summary.get('duration_seconds', 0):.2f}",
                summary.get('total_frames', 0)
            ])
        
        writer.writerow([])
        writer.writerow(["=" * 100])
        writer.writerow(["FRAME-BY-FRAME DETAILS / 逐帧详细数据"])
        writer.writerow(["=" * 100])
        writer.writerow([])
        
        writer.writerow([
            "Track ID/轨迹ID", 
            "Frame/帧号", 
            "X Position/X坐标 (px)", 
            "Y Position/Y坐标 (px)",
            "BBox Width/框宽 (px)",
            "BBox Height/框高 (px)",
            "Size/尺寸 (cm)",
            "Area/面积 (cm²)",
            "Speed/速度 (cm/s)",
            "Turn Angle/转向角 (°)",
            "Fish Type/鱼类"
        ])
        
        for track_id, track_info in tracks.items():
            positions = track_info.get("positions", [])
            frame_ids = track_info.get("frame_ids", [])
            bboxes = track_info.get("bboxes", [])
            fish_type = track_info.get("class_name", "unknown")
            
            behavior = behavior_analysis.get(str(track_id), {})
            frame_data_list = behavior.get("frame_data", [])
            frame_data_map = {fd["frame_id"]: fd for fd in frame_data_list}
            
            for frame, pos, bbox in zip(frame_ids, positions, bboxes):
                fd = frame_data_map.get(frame, {})
                size_info = fd.get("size", {})
                
                writer.writerow([
                    track_id,
                    frame,
                    f"{pos[0]:.2f}",
                    f"{pos[1]:.2f}",
                    f"{size_info.get('width_pix', bbox[2]-bbox[0]):.2f}",
                    f"{size_info.get('height_pix', bbox[3]-bbox[1]):.2f}",
                    f"{size_info.get('diagonal_cm', 0):.2f}",
                    f"{size_info.get('area_cm2', 0):.2f}",
                    f"{fd.get('speed_cm_s', 0):.2f}",
                    f"{fd.get('turn_angle_deg', 0):.2f}",
                    fish_type
                ])
    
    return str(csv_path)
