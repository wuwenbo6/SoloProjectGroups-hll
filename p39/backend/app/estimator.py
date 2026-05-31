import numpy as np
from scipy import stats
from datetime import datetime, timedelta
from typing import Dict, Set, Tuple, List, Optional
from collections import defaultdict
import hashlib
from sklearn.cluster import DBSCAN
from .config import settings


class AdvancedMACResolver:
    def __init__(self):
        self.mac_signatures: Dict[str, Dict] = {}
        self.device_clusters: Dict[str, List[str]] = {}
        self.rssi_history: Dict[str, List[Tuple[datetime, int]]] = defaultdict(list)

    def extract_signature(self, mac: str, rssi: int, timestamp: datetime) -> str:
        oui = mac[:8].upper()
        rssi_bucket = (rssi // 5) * 5
        time_bucket = timestamp.replace(
            minute=timestamp.minute // 10 * 10,
            second=0,
            microsecond=0
        )
        return f"{oui}_{rssi_bucket}_{time_bucket.isoformat()}"

    def resolve_duplicates(
        self,
        mac_addresses: List[Tuple[str, datetime, int]],
        window_seconds: int
    ) -> Set[str]:
        if len(mac_addresses) < 2:
            return set(m for m, _, _ in mac_addresses)

        features = []
        macs = []

        for mac, ts, rssi in mac_addresses:
            hour = ts.hour + ts.minute / 60
            is_random = self._is_randomized_mac(mac)
            oui_hash = hash(mac[:8]) % 1000 / 1000.0

            features.append([hour, rssi, 1.0 if is_random else 0.0, oui_hash])
            macs.append(mac)

        if len(features) < 3:
            return set(macs)

        try:
            X = np.array(features)
            clustering = DBSCAN(eps=8.0, min_samples=2).fit(X)

            resolved = set()
            cluster_map: Dict[int, List[str]] = defaultdict(list)

            for i, label in enumerate(clustering.labels_):
                if label == -1:
                    resolved.add(macs[i])
                else:
                    cluster_map[label].append(macs[i])

            for cluster_macs in cluster_map.values():
                if len(cluster_macs) <= 1:
                    resolved.update(cluster_macs)
                    continue

                random_macs = [m for m in cluster_macs if self._is_randomized_mac(m)]
                fixed_macs = [m for m in cluster_macs if not self._is_randomized_mac(m)]

                if fixed_macs:
                    resolved.add(fixed_macs[0])
                elif random_macs:
                    resolved.add(random_macs[0])
                else:
                    resolved.update(cluster_macs)

            return resolved

        except Exception:
            return set(macs)

    @staticmethod
    def _is_randomized_mac(mac: str) -> bool:
        if len(mac) < 2:
            return False
        second_char = mac[1].upper()
        return second_char in {"2", "6", "A", "E"}


class BayesianEstimator:
    def __init__(self, alpha: float = None, beta: float = None):
        self.alpha = alpha or settings.bayesian_prior_alpha
        self.beta = beta or settings.bayesian_prior_beta

    def estimate(
        self,
        observed_devices: int,
        total_probes: int,
        detection_probability: float = 0.85
    ) -> Tuple[float, float, float, float]:
        if observed_devices == 0:
            return 0.0, 0.0, 0.0, 1.0

        alpha_posterior = self.alpha + observed_devices
        avg_probes = max(1, total_probes / observed_devices)
        beta_posterior = self.beta + (1.0 / avg_probes * 5.0)

        mean_estimate = (alpha_posterior / beta_posterior) * (1 / detection_probability)

        lower_bound = stats.gamma.ppf(0.025, alpha_posterior, scale=1 / beta_posterior)
        upper_bound = stats.gamma.ppf(0.975, alpha_posterior, scale=1 / beta_posterior)

        lower_bound = lower_bound * (1 / detection_probability)
        upper_bound = upper_bound * (1 / detection_probability)

        ci_width = upper_bound - lower_bound
        confidence = max(0.0, 1.0 - (ci_width / max(1.0, mean_estimate)) * 0.4)
        confidence = min(1.0, confidence)

        return mean_estimate, lower_bound, upper_bound, confidence


class MACDeduplicator:
    def __init__(self, window_seconds: int = None):
        self.window_seconds = window_seconds or settings.deduplication_window_seconds
        self.randomized_mac_patterns = {"2", "6", "A", "E", "a", "e"}
        self.advanced_resolver = AdvancedMACResolver()
        self.device_fingerprints: Dict[str, Dict] = {}

    def is_randomized_mac(self, mac: str) -> bool:
        if len(mac) < 2:
            return False
        second_char = mac[1]
        return second_char in self.randomized_mac_patterns

    def hash_mac(self, mac: str, salt: str = "") -> str:
        return hashlib.sha256(f"{mac}_{salt}".encode()).hexdigest()[:12]

    def _group_by_ap_zone(
        self,
        mac_addresses: List[Tuple[str, datetime, int, Optional[str]]]
    ) -> Dict[str, List[Tuple[str, datetime, int]]]:
        groups = defaultdict(list)
        for mac, ts, rssi, zone in mac_addresses:
            zone_key = zone or "global"
            groups[zone_key].append((mac, ts, rssi))
        return groups

    def deduplicate(
        self,
        mac_addresses: List[Tuple[str, datetime, int, Optional[str]]],
        current_time: datetime = None
    ) -> Tuple[Set[str], int]:
        if current_time is None:
            current_time = datetime.utcnow()

        window_start = current_time - timedelta(seconds=self.window_seconds)

        filtered_probes = []
        for mac, timestamp, rssi, zone in mac_addresses:
            if timestamp < window_start:
                continue
            if rssi < settings.rssi_threshold:
                continue
            filtered_probes.append((mac, timestamp, rssi, zone))

        probe_count = len(filtered_probes)
        if probe_count == 0:
            return set(), 0

        groups = self._group_by_ap_zone(filtered_probes)
        all_unique = set()

        for zone, probes in groups.items():
            if len(probes) <= 3:
                simple_unique = set(m for m, _, _ in probes)
                all_unique.update(simple_unique)
                continue

            basic_unique = self._basic_deduplicate(probes)

            if len(basic_unique) >= 5:
                resolved = self.advanced_resolver.resolve_duplicates(
                    list(probes),
                    self.window_seconds
                )
                all_unique.update(resolved)
            else:
                all_unique.update(basic_unique)

        return all_unique, probe_count

    def _basic_deduplicate(
        self,
        probes: List[Tuple[str, datetime, int]]
    ) -> Set[str]:
        time_groups: Dict[str, List[Tuple[str, int]]] = defaultdict(list)

        for mac, ts, rssi in probes:
            time_key = ts.replace(
                minute=ts.minute // 10 * 10,
                second=0,
                microsecond=0
            ).isoformat()

            if self.is_randomized_mac(mac):
                key = f"rand_{time_key}_{abs(rssi) // 10}"
                time_groups[key].append((mac, rssi))
            else:
                time_groups[f"fixed_{mac}"].append((mac, rssi))

        unique = set()
        for group in time_groups.values():
            if group:
                unique.add(group[0][0])

        return unique


class PassengerEstimator:
    def __init__(self):
        self.bayesian = BayesianEstimator()
        self.deduplicator = MACDeduplicator()
        self.zone_probes: Dict[str, List[Tuple[str, datetime, int, str]]] = defaultdict(list)
        self.random_mac_adjustment_factor = 0.75

    def add_probe(self, mac: str, timestamp: datetime, rssi: int, zone: str = "default"):
        self.zone_probes[zone].append((mac, timestamp, rssi, zone))

    def estimate_zone(self, zone: str, current_time: datetime = None) -> Dict:
        if current_time is None:
            current_time = datetime.utcnow()

        probes = self.zone_probes.get(zone, [])
        unique_devices, total_probes = self.deduplicator.deduplicate(probes, current_time)

        raw_count = len(unique_devices)

        random_mac_ratio = sum(
            1 for m in unique_devices
            if self.deduplicator.is_randomized_mac(m)
        ) / max(1, raw_count)

        adjustment = 1.0 - (random_mac_ratio * (1.0 - self.random_mac_adjustment_factor))
        adjusted_count = int(raw_count * adjustment)

        detection_prob = self._calculate_detection_probability(total_probes, raw_count)
        estimated, lower, upper, confidence = self.bayesian.estimate(
            adjusted_count, total_probes, detection_prob
        )

        self._cleanup_old_data(zone, current_time)

        return {
            "zone": zone,
            "timestamp": current_time,
            "raw_count": raw_count,
            "adjusted_count": adjusted_count,
            "estimated_count": round(estimated, 2),
            "lower_bound": round(lower, 2),
            "upper_bound": round(upper, 2),
            "confidence": round(confidence, 2),
            "total_probes": total_probes,
            "random_mac_ratio": round(random_mac_ratio, 2)
        }

    def _calculate_detection_probability(self, total_probes: int, unique_count: int) -> float:
        if unique_count == 0:
            return 0.5

        avg_probes_per_device = total_probes / unique_count

        if avg_probes_per_device >= 8:
            return 0.98
        elif avg_probes_per_device >= 5:
            return 0.95
        elif avg_probes_per_device >= 3:
            return 0.88
        elif avg_probes_per_device >= 2:
            return 0.78
        else:
            return 0.65

    def _cleanup_old_data(self, zone: str, current_time: datetime):
        cutoff = current_time - timedelta(seconds=self.deduplicator.window_seconds * 2)
        self.zone_probes[zone] = [
            p for p in self.zone_probes[zone] if p[1] >= cutoff
        ]


global_estimator = PassengerEstimator()
