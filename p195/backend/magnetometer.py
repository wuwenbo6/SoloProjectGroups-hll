import numpy as np


class MagnetometerCalibrator:
    def __init__(self, expected_field_strength=50.0):
        self.expected_strength = expected_field_strength
        self.samples = []
        self.max_samples = 500
        self.hard_iron = np.zeros(3)
        self.soft_iron = np.eye(3)
        self.is_calibrated = False
        self.calibration_count = 0

    def add_sample(self, mag_data):
        self.samples.append(np.array(mag_data))
        if len(self.samples) > self.max_samples:
            self.samples.pop(0)

    def calibrate(self):
        if len(self.samples) < 20:
            return False

        data = np.array(self.samples)
        success = self._ellipsoid_fit(data)
        if success:
            self.is_calibrated = True
            self.calibration_count += 1
        return success

    def _ellipsoid_fit(self, data):
        n = data.shape[0]
        D = np.zeros((n, 9))
        for i in range(n):
            x, y, z = data[i]
            D[i] = [x * x, y * y, z * z, 2 * x * y, 2 * x * z, 2 * y * z, 2 * x, 2 * y, 2 * z]

        DT = D.T
        try:
            v = np.linalg.solve(DT @ D, DT @ np.ones(n))
        except np.linalg.LinAlgError:
            return False

        A = np.array([
            [v[0], v[3], v[4]],
            [v[3], v[1], v[5]],
            [v[4], v[5], v[2]],
        ])
        b = np.array([v[6], v[7], v[8]])

        try:
            A_inv = np.linalg.inv(A)
        except np.linalg.LinAlgError:
            return False

        center = -A_inv @ b

        evals, evecs = np.linalg.eigh(A)

        if np.any(evals <= 0):
            return False

        radii = 1.0 / np.sqrt(evals)
        scale = self.expected_strength / np.mean(radii)
        radii_scaled = radii * scale
        evals_scaled = 1.0 / (radii_scaled ** 2)

        self.hard_iron = center
        self.soft_iron = evecs @ np.diag(np.sqrt(evals_scaled)) @ evecs.T

        return True

    def correct(self, mag_data):
        if not self.is_calibrated:
            return np.array(mag_data)
        raw = np.array(mag_data) - self.hard_iron
        corrected = self.soft_iron @ raw
        return corrected

    def get_calibration_params(self):
        return {
            "hard_iron": self.hard_iron.tolist(),
            "soft_iron": self.soft_iron.tolist(),
            "is_calibrated": self.is_calibrated,
            "sample_count": len(self.samples),
            "calibration_count": self.calibration_count,
        }

    def reset(self):
        self.samples = []
        self.hard_iron = np.zeros(3)
        self.soft_iron = np.eye(3)
        self.is_calibrated = False
        self.calibration_count = 0
