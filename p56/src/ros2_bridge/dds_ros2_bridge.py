import asyncio
import json
from typing import Callable, Dict

class DDSROS2Bridge:
    def __init__(self):
        self.dds_to_ros2_callbacks: Dict[str, list] = {}
        self.ros2_to_dds_callbacks: Dict[str, list] = {}
        self.enabled = False

    def enable(self):
        self.enabled = True
        print("DDS-ROS2 Bridge enabled")

    def disable(self):
        self.enabled = False
        print("DDS-ROS2 Bridge disabled")

    def register_dds_to_ros2_callback(self, topic: str, callback: Callable):
        if topic not in self.dds_to_ros2_callbacks:
            self.dds_to_ros2_callbacks[topic] = []
        self.dds_to_ros2_callbacks[topic].append(callback)

    def register_ros2_to_dds_callback(self, topic: str, callback: Callable):
        if topic not in self.ros2_to_dds_callbacks:
            self.ros2_to_dds_callbacks[topic] = []
        self.ros2_to_dds_callbacks[topic].append(callback)

    async def publish_from_dds(self, topic: str, data: dict):
        if not self.enabled:
            return
        
        if topic in self.dds_to_ros2_callbacks:
            ros2_msg = self._convert_to_ros2_format(topic, data)
            for callback in self.dds_to_ros2_callbacks[topic]:
                await callback(ros2_msg)

    async def publish_from_ros2(self, topic: str, data: dict):
        if not self.enabled:
            return
        
        if topic in self.ros2_to_dds_callbacks:
            dds_msg = self._convert_to_dds_format(topic, data)
            for callback in self.ros2_to_dds_callbacks[topic]:
                await callback(dds_msg)

    def _convert_to_ros2_format(self, topic: str, data: dict) -> dict:
        if topic == 'vehicle_state':
            return {
                'header': {
                    'stamp': {'sec': int(data['timestamp']), 'nanosec': int((data['timestamp'] % 1) * 1e9)},
                    'frame_id': data['vehicle_id']
                },
                'pose': {
                    'position': {
                        'x': data['position']['x'],
                        'y': data['position']['y'],
                        'z': data['position']['z']
                    },
                    'orientation': self._yaw_to_quaternion(data['orientation']['yaw'])
                },
                'twist': {
                    'linear': {'x': data['velocity'], 'y': 0, 'z': 0},
                    'angular': {'x': 0, 'y': 0, 'z': 0}
                }
            }
        elif topic == 'vehicle_path':
            return {
                'header': {'frame_id': data['vehicle_id']},
                'waypoints': [
                    {
                        'pose': {'position': wp['position']},
                        'velocity': wp['target_velocity']
                    }
                    for wp in data['waypoints']
                ]
            }
        return data

    def _convert_to_dds_format(self, topic: str, data: dict) -> dict:
        return data

    def _yaw_to_quaternion(self, yaw: float) -> dict:
        import math
        return {
            'x': 0.0,
            'y': 0.0,
            'z': math.sin(yaw / 2.0),
            'w': math.cos(yaw / 2.0)
        }

    async def simulate_ros2_subscriber(self, topic: str):
        while True:
            if self.enabled:
                print(f"[ROS2 Bridge] Simulating subscription on topic: {topic}")
            await asyncio.sleep(5.0)
