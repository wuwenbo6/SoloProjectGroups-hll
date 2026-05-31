import numpy as np
import pandas as pd
from typing import Dict, Tuple, List
import json
import os


class RehabScorer:
    def __init__(self):
        self.weights = {
            'symmetry': 0.30,
            'consistency': 0.25,
            'stability': 0.20,
            'rhythm': 0.15,
            'endurance': 0.10
        }

    def calculate_all_scores(self, data: List[dict]) -> Dict[str, float]:
        if len(data) < 100:
            return self._get_default_scores()

        df = pd.DataFrame(data)

        symmetry_score = self._calculate_symmetry_score(df)
        consistency_score = self._calculate_consistency_score(df)
        stability_score = self._calculate_stability_score(df)
        rhythm_score = self._calculate_rhythm_score(df)
        endurance_score = self._calculate_endurance_score(df)

        overall_score = (
            symmetry_score * self.weights['symmetry'] +
            consistency_score * self.weights['consistency'] +
            stability_score * self.weights['stability'] +
            rhythm_score * self.weights['rhythm'] +
            endurance_score * self.weights['endurance']
        )

        return {
            'overall': round(overall_score, 1),
            'symmetry': round(symmetry_score, 1),
            'consistency': round(consistency_score, 1),
            'stability': round(stability_score, 1),
            'rhythm': round(rhythm_score, 1),
            'endurance': round(endurance_score, 1),
            'grade': self._get_grade(overall_score)
        }

    def _calculate_symmetry_score(self, df: pd.DataFrame) -> float:
        try:
            stance_phases = df[df['predictedPhase'] == 'STANCE'].index
            swing_phases = df[df['predictedPhase'] == 'SWING'].index

            if len(stance_phases) < 3 or len(swing_phases) < 3:
                return 70.0

            stance_durations = np.diff(stance_phases)
            swing_durations = np.diff(swing_phases)

            if len(stance_durations) < 2 or len(swing_durations) < 2:
                return 70.0

            stance_mean = np.mean(stance_durations)
            swing_mean = np.mean(swing_durations)

            duration_ratio = min(stance_mean, swing_mean) / max(stance_mean, swing_mean)

            stance_cv = np.std(stance_durations) / stance_mean if stance_mean > 0 else 1
            swing_cv = np.std(swing_durations) / swing_mean if swing_mean > 0 else 1

            cv_score = 1 - min(1, (stance_cv + swing_cv) / 2)

            symmetry_score = (duration_ratio * 0.6 + cv_score * 0.4) * 100

            return max(0, min(100, symmetry_score))

        except Exception as e:
            return 70.0

    def _calculate_consistency_score(self, df: pd.DataFrame) -> float:
        try:
            df['accel_mag'] = np.sqrt(
                df['accelX']**2 + df['accelY']**2 + df['accelZ']**2
            )

            stance_mask = df['predictedPhase'] == 'STANCE'
            swing_mask = df['predictedPhase'] == 'SWING'

            if stance_mask.sum() < 10 or swing_mask.sum() < 10:
                return 70.0

            stance_accel_mean = df[stance_mask]['accel_mag'].mean()
            stance_accel_std = df[stance_mask]['accel_mag'].std()
            swing_accel_mean = df[swing_mask]['accel_mag'].mean()
            swing_accel_std = df[swing_mask]['accel_mag'].std()

            stance_cv = stance_accel_std / stance_accel_mean if stance_accel_mean > 0 else 1
            swing_cv = swing_accel_std / swing_accel_mean if swing_accel_mean > 0 else 1

            consistency_score = (1 - min(1, (stance_cv + swing_cv) / 2)) * 100

            return max(0, min(100, consistency_score))

        except Exception as e:
            return 70.0

    def _calculate_stability_score(self, df: pd.DataFrame) -> float:
        try:
            df['accel_mag'] = np.sqrt(
                df['accelX']**2 + df['accelY']**2 + df['accelZ']**2
            )

            stance_mask = df['predictedPhase'] == 'STANCE'

            if stance_mask.sum() < 10:
                return 70.0

            stance_accel = df[stance_mask]['accel_mag']
            mean_accel = stance_accel.mean()
            std_accel = stance_accel.std()

            accel_deviation = abs(mean_accel - 1.0)
            var_score = max(0, 1 - accel_deviation * 2)

            stability_score = var_score * 100

            high_impact_count = (df['accel_mag'] > 2.5).sum()
            impact_penalty = min(30, high_impact_count * 0.5)

            return max(0, min(100, stability_score - impact_penalty))

        except Exception as e:
            return 70.0

    def _calculate_rhythm_score(self, df: pd.DataFrame) -> float:
        try:
            phases = df['predictedPhase'].values
            phase_changes = np.where(phases[:-1] != phases[1:])[0]

            if len(phase_changes) < 4:
                return 70.0

            cycle_durations = np.diff(phase_changes[::2])

            if len(cycle_durations) < 2:
                return 70.0

            mean_cycle = np.mean(cycle_durations)
            std_cycle = np.std(cycle_durations)

            cv = std_cycle / mean_cycle if mean_cycle > 0 else 1

            optimal_cycle = 50
            cycle_deviation = abs(mean_cycle - optimal_cycle) / optimal_cycle
            cycle_score = max(0, 1 - cycle_deviation)

            cv_score = max(0, 1 - cv * 2)

            rhythm_score = (cv_score * 0.7 + cycle_score * 0.3) * 100

            return max(0, min(100, rhythm_score))

        except Exception as e:
            return 70.0

    def _calculate_endurance_score(self, df: pd.DataFrame) -> float:
        try:
            total_frames = len(df)
            duration_minutes = total_frames / 50 / 60

            if duration_minutes < 1:
                return 60.0
            elif duration_minutes < 3:
                return 70.0
            elif duration_minutes < 5:
                return 80.0
            elif duration_minutes < 10:
                return 90.0
            else:
                return 100.0

        except Exception as e:
            return 70.0

    def _get_grade(self, score: float) -> str:
        if score >= 90:
            return 'A'
        elif score >= 80:
            return 'B'
        elif score >= 70:
            return 'C'
        elif score >= 60:
            return 'D'
        else:
            return 'F'

    def _get_default_scores(self) -> Dict[str, float]:
        return {
            'overall': 70.0,
            'symmetry': 70.0,
            'consistency': 70.0,
            'stability': 70.0,
            'rhythm': 70.0,
            'endurance': 70.0,
            'grade': 'C'
        }

    def get_score_interpretation(self, scores: Dict[str, float]) -> Dict[str, str]:
        interpretations = {}

        for key, score in scores.items():
            if key == 'grade':
                continue
            if score >= 85:
                interpretations[f"{key}_level"] = "优秀"
                interpretations[f"{key}_advice"] = "继续保持当前训练强度"
            elif score >= 70:
                interpretations[f"{key}_level"] = "良好"
                interpretations[f"{key}_advice"] = "略有提升空间"
            elif score >= 60:
                interpretations[f"{key}_level"] = "及格"
                interpretations[f"{key}_advice"] = "建议加强针对性训练"
            else:
                interpretations[f"{key}_level"] = "需改善"
                interpretations[f"{key}_advice"] = "建议咨询专业康复师"

        return interpretations
