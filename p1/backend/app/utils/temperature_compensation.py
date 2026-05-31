from typing import Tuple


class TemperatureCompensatedUltrasonic:
    """
    超声波温度补偿计算类
    
    使用ISO标准线性公式（工业界标准，精度更高）:
    v = 331.5 + 0.607 * T
    
    其中:
    - v: 声速 (m/s)
    - T: 温度 (摄氏度)
    
    参考文献: ISO 9613-1:1993
    温度范围: -20°C ~ +50°C，精度±0.1 m/s
    """
    
    BASE_SOUND_SPEED = 331.5
    TEMPERATURE_COEFFICIENT = 0.607
    
    @staticmethod
    def calculate_sound_speed(temperature: float) -> float:
        """
        根据温度计算声速（ISO标准公式）
        
        Args:
            temperature: 环境温度(摄氏度)，建议范围 -20°C ~ +50°C
            
        Returns:
            声速(米/秒)
        """
        return TemperatureCompensatedUltrasonic.BASE_SOUND_SPEED + \
               TemperatureCompensatedUltrasonic.TEMPERATURE_COEFFICIENT * temperature
    
    @staticmethod
    def calculate_distance(echo_time: float, sound_speed: float) -> float:
        """
        根据回波时间和声速计算距离
        
        Args:
            echo_time: 回波时间(秒) - 超声波往返时间
            sound_speed: 声速(米/秒)
            
        Returns:
            距离(米) - 单程距离
        """
        return (sound_speed * echo_time) / 2.0
    
    @staticmethod
    def calculate_level(
        echo_time: float,
        temperature: float,
        sensor_height: float,
        tank_max_height: float
    ) -> Tuple[float, float, float]:
        """
        计算液位高度
        
        Args:
            echo_time: 回波时间(秒)
            temperature: 环境温度(摄氏度)
            sensor_height: 传感器安装高度(米) - 距离罐底的高度
            tank_max_height: 储罐最大高度(米)
            
        Returns:
            Tuple[声速, 距离, 液位高度]
        """
        sound_speed = TemperatureCompensatedUltrasonic.calculate_sound_speed(temperature)
        distance = TemperatureCompensatedUltrasonic.calculate_distance(echo_time, sound_speed)
        
        level = sensor_height - distance
        
        level = max(0.0, min(level, tank_max_height))
        
        return sound_speed, distance, level
    
    @staticmethod
    def calculate_percentage(level: float, max_height: float) -> float:
        """
        计算液位百分比
        
        Args:
            level: 液位高度(米)
            max_height: 储罐最大高度(米)
            
        Returns:
            液位百分比(0-100)
        """
        if max_height <= 0:
            return 0.0
        return min(100.0, max(0.0, (level / max_height) * 100))


def calculate_liquid_level(
    echo_time: float,
    temperature: float,
    sensor_height: float,
    tank_max_height: float
) -> dict:
    """
    计算液位的便捷函数
    
    Returns:
        包含声速、距离、液位、百分比的字典
    """
    sound_speed, distance, level = TemperatureCompensatedUltrasonic.calculate_level(
        echo_time, temperature, sensor_height, tank_max_height
    )
    percentage = TemperatureCompensatedUltrasonic.calculate_percentage(level, tank_max_height)
    
    return {
        "sound_speed": round(sound_speed, 2),
        "distance": round(distance, 4),
        "level": round(level, 4),
        "percentage": round(percentage, 2)
    }
