import math
import random
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
import time


@dataclass
class Cell:
    pci: int
    earfcn: int
    pos_x: float
    pos_y: float
    tx_power: float = 43.0
    q_rxlevmin: float = -128.0
    q_rxlevminoffset: float = 0.0
    q_hyst: float = 2.0
    q_offset: float = 0.0
    p_compensation: float = 0.0
    rsrp: float = -140.0
    s_rxlev: float = 0.0
    r_value: float = 0.0
    is_serving: bool = False
    rsrp_history: List[float] = field(default_factory=list)


@dataclass
class UE:
    id: int = 1
    pos_x: float = 0.0
    pos_y: float = 0.0
    serving_pci: int = 0
    step_count: int = 0
    reselection_count: int = 0
    best_neighbor_counter: Dict[int, int] = field(default_factory=dict)


@dataclass
class ReselectionLog:
    timestamp: float
    step: int
    event_type: str
    source_pci: Optional[int]
    target_pci: Optional[int]
    details: Dict


class PathLossModel:
    @staticmethod
    def calculate_path_loss(distance_km: float, shadow_fading_std: float = 8.0) -> float:
        if distance_km < 0.001:
            distance_km = 0.001
        path_loss = 128.1 + 37.6 * math.log10(distance_km)
        shadow_fading = random.gauss(0, shadow_fading_std)
        return path_loss + shadow_fading


class SCriterion:
    @staticmethod
    def calculate_s_rxlev(rsrp: float, q_rxlevmin: float, q_rxlevminoffset: float, p_compensation: float) -> float:
        return rsrp - (q_rxlevmin + q_rxlevminoffset) - p_compensation


class RCriterion:
    @staticmethod
    def calculate_r_serving(rsrp: float, q_hyst: float) -> float:
        return rsrp + q_hyst

    @staticmethod
    def calculate_r_neighbor(rsrp: float, q_offset: float) -> float:
        return rsrp - q_offset


class SimulationEngine:
    def __init__(self):
        self.cells: List[Cell] = []
        self.ue: UE = UE()
        self.logs: List[ReselectionLog] = []
        self.running: bool = False
        self.config = {
            'speed': 1000,
            'q_rxlevmin': -128.0,
            'q_hyst': 2.0,
            'treselection': 3,
            'path_loss_exponent': 37.6,
            'shadow_fading_std': 8.0,
            'ue_movement_speed': 10.0
        }
        self.map_size = 500
        self._initialize_cells()

    def _initialize_cells(self):
        self.cells = [
            Cell(pci=0, earfcn=3700, pos_x=0, pos_y=0, q_rxlevmin=-128.0, q_hyst=2.0),
            Cell(pci=1, earfcn=3700, pos_x=250, pos_y=100, q_rxlevmin=-128.0, q_offset=2.0),
            Cell(pci=2, earfcn=3700, pos_x=-200, pos_y=180, q_rxlevmin=-128.0, q_offset=3.0),
            Cell(pci=3, earfcn=3700, pos_x=100, pos_y=-220, q_rxlevmin=-128.0, q_offset=1.0),
            Cell(pci=4, earfcn=3700, pos_x=-180, pos_y=-150, q_rxlevmin=-128.0, q_offset=2.0),
        ]
        self.ue.pos_x = 0
        self.ue.pos_y = 0
        self.ue.serving_pci = 0
        self.cells[0].is_serving = True
        self._measure_rsrp()
        self._calculate_s_r_values()

    def _get_distance_km(self, ue_x: float, ue_y: float, cell_x: float, cell_y: float) -> float:
        dx = ue_x - cell_x
        dy = ue_y - cell_y
        distance_m = math.sqrt(dx * dx + dy * dy)
        return distance_m / 1000.0

    def _measure_rsrp(self):
        for cell in self.cells:
            distance_km = self._get_distance_km(self.ue.pos_x, self.ue.pos_y, cell.pos_x, cell.pos_y)
            path_loss = PathLossModel.calculate_path_loss(distance_km, self.config['shadow_fading_std'])
            cell.rsrp = cell.tx_power - path_loss
            if cell.rsrp > -44:
                cell.rsrp = -44
            if cell.rsrp < -140:
                cell.rsrp = -140
            cell.rsrp_history.append(cell.rsrp)
            if len(cell.rsrp_history) > 10:
                cell.rsrp_history.pop(0)

    def _calculate_s_r_values(self):
        serving_cell = self._get_serving_cell()
        if serving_cell:
            for cell in self.cells:
                cell.s_rxlev = SCriterion.calculate_s_rxlev(
                    cell.rsrp,
                    cell.q_rxlevmin,
                    cell.q_rxlevminoffset,
                    cell.p_compensation
                )
                if cell.is_serving:
                    cell.r_value = RCriterion.calculate_r_serving(cell.rsrp, cell.q_hyst)
                else:
                    cell.r_value = RCriterion.calculate_r_neighbor(cell.rsrp, cell.q_offset)

    def _get_serving_cell(self) -> Optional[Cell]:
        for cell in self.cells:
            if cell.is_serving:
                return cell
        return None

    def _move_ue(self):
        angle = random.uniform(0, 2 * math.pi)
        dx = math.cos(angle) * self.config['ue_movement_speed']
        dy = math.sin(angle) * self.config['ue_movement_speed']
        self.ue.pos_x += dx
        self.ue.pos_y += dy
        half_size = self.map_size / 2
        self.ue.pos_x = max(-half_size, min(half_size, self.ue.pos_x))
        self.ue.pos_y = max(-half_size, min(half_size, self.ue.pos_y))

    def _evaluate_reselection(self):
        serving_cell = self._get_serving_cell()
        if not serving_cell:
            return

        self.logs.append(ReselectionLog(
            timestamp=time.time(),
            step=self.ue.step_count,
            event_type="measurement",
            source_pci=serving_cell.pci,
            target_pci=None,
            details={
                "rsrp_source": serving_cell.rsrp,
                "s_rxlev_source": serving_cell.s_rxlev,
                "r_s": serving_cell.r_value
            }
        ))

        eligible_neighbors = []
        for cell in self.cells:
            if not cell.is_serving and cell.s_rxlev > 0:
                eligible_neighbors.append(cell)
                self.logs.append(ReselectionLog(
                    timestamp=time.time(),
                    step=self.ue.step_count,
                    event_type="s_criterion",
                    source_pci=serving_cell.pci,
                    target_pci=cell.pci,
                    details={
                        "rsrp_source": serving_cell.rsrp,
                        "rsrp_target": cell.rsrp,
                        "s_rxlev_target": cell.s_rxlev,
                        "r_s": serving_cell.r_value,
                        "r_n": cell.r_value
                    }
                ))

        best_neighbor = None
        if eligible_neighbors:
            best_neighbor = max(eligible_neighbors, key=lambda c: c.r_value)
            for pci in list(self.ue.best_neighbor_counter.keys()):
                if pci != best_neighbor.pci:
                    self.ue.best_neighbor_counter[pci] = 0
            if best_neighbor.r_value > serving_cell.r_value:
                self.ue.best_neighbor_counter[best_neighbor.pci] = self.ue.best_neighbor_counter.get(best_neighbor.pci, 0) + 1
            else:
                self.ue.best_neighbor_counter[best_neighbor.pci] = 0
        else:
            self.ue.best_neighbor_counter.clear()

        if best_neighbor and self.ue.best_neighbor_counter.get(best_neighbor.pci, 0) >= self.config['treselection']:
            self._perform_reselection(serving_cell, best_neighbor)

    def _perform_reselection(self, source_cell: Cell, target_cell: Cell):
        source_cell.is_serving = False
        target_cell.is_serving = True
        self.ue.serving_pci = target_cell.pci
        self.ue.reselection_count += 1
        self.ue.best_neighbor_counter.clear()
        self.logs.append(ReselectionLog(
            timestamp=time.time(),
            step=self.ue.step_count,
            event_type="reselection",
            source_pci=source_cell.pci,
            target_pci=target_cell.pci,
            details={
                "rsrp_source": source_cell.rsrp,
                "rsrp_target": target_cell.rsrp,
                "s_rxlev_target": target_cell.s_rxlev,
                "r_s": source_cell.r_value,
                "r_n": target_cell.r_value
            }
        ))

    def step(self):
        self.ue.step_count += 1
        self._move_ue()
        self._measure_rsrp()
        self._calculate_s_r_values()
        self._evaluate_reselection()

    def reset(self):
        self.ue = UE()
        self.logs = []
        self.running = False
        self._initialize_cells()

    def get_cells_response(self) -> Dict:
        return {
            "cells": [
                {
                    "pci": cell.pci,
                    "earfcn": cell.earfcn,
                    "position": {"x": cell.pos_x, "y": cell.pos_y},
                    "rsrp": round(cell.rsrp, 2),
                    "q_rxlevmin": cell.q_rxlevmin,
                    "q_rxlevminoffset": cell.q_rxlevminoffset,
                    "q_hyst": cell.q_hyst,
                    "q_offset": cell.q_offset,
                    "p_compensation": cell.p_compensation,
                    "s_rxlev": round(cell.s_rxlev, 2),
                    "r_value": round(cell.r_value, 2),
                    "is_serving": cell.is_serving
                }
                for cell in self.cells
            ],
            "serving_pci": self.ue.serving_pci,
            "map_size": self.map_size
        }

    def get_status(self) -> Dict:
        return {
            "running": self.running,
            "step_count": self.ue.step_count,
            "ue_position": {"x": round(self.ue.pos_x, 2), "y": round(self.ue.pos_y, 2)},
            "serving_pci": self.ue.serving_pci,
            "reselection_count": self.ue.reselection_count,
            "config": self.config,
            "treselection_counters": dict(self.ue.best_neighbor_counter)
        }

    def get_logs(self) -> Dict:
        return {
            "logs": [
                {
                    "timestamp": log.timestamp,
                    "step": log.step,
                    "event_type": log.event_type,
                    "source_pci": log.source_pci,
                    "target_pci": log.target_pci,
                    "details": log.details
                }
                for log in self.logs
            ]
        }

    def update_config(self, new_config: Dict):
        for key, value in new_config.items():
            if key in self.config:
                self.config[key] = value

    def export_logs_csv(self) -> str:
        import io
        import csv

        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow([
            'Timestamp', 'Step', 'Event Type', 'Source PCI', 'Target PCI',
            'RSRP Source (dBm)', 'RSRP Target (dBm)', 'S_rxlev Target (dB)',
            'R_s (dB)', 'R_n (dB)', 'S_rxlev Source (dB)'
        ])

        for log in self.logs:
            details = log.details
            writer.writerow([
                time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(log.timestamp)),
                log.step,
                log.event_type,
                log.source_pci if log.source_pci is not None else 'N/A',
                log.target_pci if log.target_pci is not None else 'N/A',
                f"{details.get('rsrp_source', 'N/A')}",
                f"{details.get('rsrp_target', 'N/A')}",
                f"{details.get('s_rxlev_target', 'N/A')}",
                f"{details.get('r_s', 'N/A')}",
                f"{details.get('r_n', 'N/A')}",
                f"{details.get('s_rxlev_source', 'N/A')}"
            ])

        return output.getvalue()

    def export_logs_json(self) -> str:
        import json

        export_data = {
            'export_time': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(time.time())),
            'total_events': len(self.logs),
            'total_steps': self.ue.step_count,
            'total_reselections': self.ue.reselection_count,
            'config': self.config,
            'events': [
                {
                    'timestamp': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(log.timestamp)),
                    'step': log.step,
                    'event_type': log.event_type,
                    'source_pci': log.source_pci,
                    'target_pci': log.target_pci,
                    'details': log.details
                }
                for log in self.logs
            ]
        }
        return json.dumps(export_data, indent=2)

    def export_measurements_csv(self) -> str:
        import io
        import csv

        output = io.StringIO()
        writer = csv.writer(output)

        header = ['Step', 'Timestamp', 'UE_X', 'UE_Y', 'Serving_PCI']
        for cell in self.cells:
            header.extend([
                f'PCI{cell.pci}_RSRP',
                f'PCI{cell.pci}_Srxlev',
                f'PCI{cell.pci}_Rvalue',
                f'PCI{cell.pci}_IsServing'
            ])
        writer.writerow(header)

        return output.getvalue()
