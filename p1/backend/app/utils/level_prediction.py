import numpy as np
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass
class PredictionResult:
    predicted_level: float
    confidence: float
    trend_slope: float
    trend_direction: str
    prediction_time: datetime
    time_to_threshold: Optional[float]
    threshold_type: Optional[str]


class LevelPredictor:
    """
    液位预测器 - 基于线性回归的趋势预测
    
    使用最小二乘法进行线性回归，预测未来液位趋势
    """
    
    def __init__(self):
        pass
    
    def _prepare_data(self, level_data: List[Dict]) -> Tuple[np.ndarray, np.ndarray]:
        """
        准备回归数据
        
        Args:
            level_data: 液位数据列表，包含 time 和 level 字段
            
        Returns:
            (x, y) 时间和液位数组
        """
        if len(level_data) < 2:
            return np.array([]), np.array([])
        
        times = []
        levels = []
        
        base_time = datetime.fromisoformat(level_data[0]['time'].replace('Z', '+00:00'))
        
        for point in level_data:
            try:
                t = datetime.fromisoformat(point['time'].replace('Z', '+00:00'))
                delta_seconds = (t - base_time).total_seconds() / 60.0
                times.append(delta_seconds)
                levels.append(point['level'])
            except (ValueError, KeyError):
                continue
        
        return np.array(times), np.array(levels)
    
    def linear_regression(self, x: np.ndarray, y: np.ndarray) -> Tuple[float, float, float]:
        """
        最小二乘法线性回归
        
        Args:
            x: 自变量（时间，分钟）
            y: 因变量（液位，米）
            
        Returns:
            (slope, intercept, r_squared) 斜率、截距、决定系数
        """
        if len(x) < 2:
            return 0.0, np.mean(y) if len(y) > 0 else 0.0, 0.0
        
        n = len(x)
        sum_x = np.sum(x)
        sum_y = np.sum(y)
        sum_xy = np.sum(x * y)
        sum_x2 = np.sum(x ** 2)
        
        denominator = n * sum_x2 - sum_x ** 2
        if denominator == 0:
            return 0.0, np.mean(y), 0.0
        
        slope = (n * sum_xy - sum_x * sum_y) / denominator
        intercept = (sum_y - slope * sum_x) / n
        
        y_pred = intercept + slope * x
        ss_total = np.sum((y - np.mean(y)) ** 2)
        ss_residual = np.sum((y - y_pred) ** 2)
        
        r_squared = 1 - (ss_residual / ss_total) if ss_total != 0 else 0.0
        
        return slope, intercept, r_squared
    
    def predict(
        self,
        level_data: List[Dict],
        predict_minutes_ahead: float = 30.0,
        max_level: float = 10.0,
        min_threshold: float = 1.0,
        max_threshold: float = 9.0
    ) -> PredictionResult:
        """
        预测未来液位
        
        Args:
            level_data: 历史液位数据
            predict_minutes_ahead: 预测多少分钟后
            max_level: 储罐最大高度
            min_threshold: 最低报警阈值
            max_threshold: 最高报警阈值
            
        Returns:
            预测结果
        """
        x, y = self._prepare_data(level_data)
        
        if len(x) < 3:
            current_level = y[-1] if len(y) > 0 else 0.0
            return PredictionResult(
                predicted_level=current_level,
                confidence=0.0,
                trend_slope=0.0,
                trend_direction="stable",
                prediction_time=datetime.utcnow(),
                time_to_threshold=None,
                threshold_type=None
            )
        
        slope, intercept, r_squared = self.linear_regression(x, y)
        
        last_x = x[-1] if len(x) > 0 else 0
        predict_x = last_x + predict_minutes_ahead
        predicted_level = intercept + slope * predict_x
        
        predicted_level = max(0.0, min(predicted_level, max_level))
        
        if slope > 0.001:
            trend_direction = "rising"
        elif slope < -0.001:
            trend_direction = "falling"
        else:
            trend_direction = "stable"
        
        confidence = max(0.0, min(1.0, r_squared))
        
        time_to_threshold = None
        threshold_type = None
        
        current_level = y[-1] if len(y) > 0 else 0.0
        
        if slope > 0 and predicted_level > max_threshold:
            time_to_max = (max_threshold - current_level) / slope if slope != 0 else None
            if time_to_max is not None and time_to_max > 0:
                time_to_threshold = time_to_max
                threshold_type = "high"
        elif slope < 0 and predicted_level < min_threshold:
            time_to_min = (min_threshold - current_level) / slope if slope != 0 else None
            if time_to_min is not None and time_to_min > 0:
                time_to_threshold = abs(time_to_min)
                threshold_type = "low"
        
        return PredictionResult(
            predicted_level=round(predicted_level, 4),
            confidence=round(confidence, 4),
            trend_slope=round(slope, 6),
            trend_direction=trend_direction,
            prediction_time=datetime.utcnow(),
            time_to_threshold=round(time_to_threshold, 1) if time_to_threshold else None,
            threshold_type=threshold_type
        )
    
    def predict_multiple_points(
        self,
        level_data: List[Dict],
        points: int = 10,
        interval_minutes: float = 5.0,
        max_level: float = 10.0
    ) -> List[Dict]:
        """
        预测多个时间点的液位
        
        Args:
            level_data: 历史液位数据
            points: 预测点数量
            interval_minutes: 间隔分钟数
            max_level: 储罐最大高度
            
        Returns:
            预测点列表
        """
        x, y = self._prepare_data(level_data)
        
        if len(x) < 3:
            return []
        
        slope, intercept, _ = self.linear_regression(x, y)
        
        predictions = []
        last_x = x[-1] if len(x) > 0 else 0
        
        for i in range(1, points + 1):
            predict_x = last_x + i * interval_minutes
            level = intercept + slope * predict_x
            level = max(0.0, min(level, max_level))
            
            minutes_ahead = i * interval_minutes
            pred_time = datetime.utcnow() + timedelta(minutes=minutes_ahead)
            
            predictions.append({
                "time": pred_time.isoformat(),
                "level": round(level, 4),
                "minutes_ahead": minutes_ahead
            })
        
        return predictions


level_predictor = LevelPredictor()
