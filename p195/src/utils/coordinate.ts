const EARTH_RADIUS = 6371000.0;

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180.0;
  const dLon = (lon2 - lon1) * Math.PI / 180.0;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180.0) * Math.cos(lat2 * Math.PI / 180.0) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

export function toDeg(rad: number): number {
  return rad * 180.0 / Math.PI;
}

export function toRad(deg: number): number {
  return deg * Math.PI / 180.0;
}

export function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

export function formatCoord(deg: number): string {
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = ((abs - d) * 60 - m) * 60;
  return `${d}°${m}'${s.toFixed(2)}"`;
}

export function formatLat(lat: number): string {
  return `${formatCoord(lat)} ${lat >= 0 ? 'N' : 'S'}`;
}

export function formatLon(lon: number): string {
  return `${formatCoord(lon)} ${lon >= 0 ? 'E' : 'W'}`;
}

export function getCovarianceEllipse(
  lat: number,
  lon: number,
  covariance: number[][]
): { latDelta: number; lonDelta: number } {
  const latStd = Math.sqrt(Math.max(0, covariance[0][0]));
  const lonStd = Math.sqrt(Math.max(0, covariance[1][1]));
  const latDelta = latStd * 180.0 / Math.PI / EARTH_RADIUS * 3;
  const lonDelta = lonStd * 180.0 / Math.PI / (EARTH_RADIUS * Math.cos(lat * Math.PI / 180.0)) * 3;
  return { latDelta, lonDelta };
}
