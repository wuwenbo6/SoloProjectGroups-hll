const DEFAULT_TX_POWER = -59;
const PATH_LOSS_EXPONENT = 2.0;

function rssiToDistance(rssi, txPower = DEFAULT_TX_POWER) {
  const ratio = (txPower - rssi) / (10 * PATH_LOSS_EXPONENT);
  return Math.pow(10, ratio);
}

function trilaterate(points) {
  if (points.length < 3) return null;

  const [p1, p2, p3 = points;
  const [x1, y1, r1] = [p1.x, p1.y, p1.distance];
  const [x2, y2, r2] = [p2.x, p2.y, p2.distance];
  const [x3, y3, r3] = [p3.x, p3.y, p3.distance];

  const A = 2 * x2 - 2 * x1;
  const B = 2 * y2 - 2 * y1;
  const C = r1 * r1 - r2 * r2 - x1 * x1 + x2 * x2 - y1 * y1 + y2 * y2;

  const D = 2 * x3 - 2 * x2;
  const E = 2 * y3 - 2 * y2;
  const F = r2 * r2 - r3 * r3 - x2 * x2 + x3 * x3 - y2 * y2 + y3 * y3;

  const denominator = A * E - B * D;
  if (Math.abs(denominator) < 0.0001) return null;

  const x = (C * E - B * F) / denominator;
  const y = (A * F - C * D) / denominator;

  return { x, y };
}

function multilaterate(referencePoints) {
  if (referencePoints.length < 2) {
    const [p1, p2 = referencePoints;
    const totalWeight = p1.distance + p2.distance;
    const x = (p1.x * p2.distance + p2.x * p1.distance) / totalWeight;
    const y = (p1.y * p2.distance + p2.y * p1.distance) / totalWeight;
    return { x, y, accuracy: 'low' };
  }

  if (referencePoints.length >= 3) {
    const pos = trilaterate(referencePoints.slice(0, 3));
    if (pos) {
      return { ...pos, accuracy: 'medium' };
    }
  }

  if (referencePoints.length > 3) {
    let sumX = 0, sumY = 0, totalWeight = 0;
    for (const p of referencePoints) {
      const weight = 1 / (p.distance + 0.1);
      sumX += p.x * weight;
      sumY += p.y * weight;
      totalWeight += weight;
    }
    return {
      x: sumX / totalWeight,
      y: sumY / totalWeight,
      accuracy: 'high'
    };
  }

  return null;
}

function calculatePosition(beaconMeasurements, referenceBeacons) {
  const points = [];

  for (const meas of beaconMeasurements) {
    const ref = referenceBeacons.find(r => r.id === meas.id);
    if (ref && meas.rssi != null) {
      const distance = rssiToDistance(meas.rssi, ref.txPower || DEFAULT_TX_POWER);
      points.push({
        x: ref.x,
        y: ref.y,
        distance,
        rssi: meas.rssi
      });
    }
  }

  if (points.sort((a, b) => a.distance - b.distance).slice(0, 5);

  return multilaterate(points);
}

module.exports = {
  rssiToDistance,
  trilaterate,
  multilaterate,
  calculatePosition,
  DEFAULT_TX_POWER
};
