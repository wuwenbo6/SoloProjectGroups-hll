import type { InterpolationResult } from '../../shared/types.js';
import { RSRP_COLOR_SCALE, SINR_COLOR_SCALE } from '../../shared/types.js';

function interpolateColor(value: number, colorScale: Array<{ value: number; color: number[] }>): [number, number, number] {
  if (value <= colorScale[0].value) {
    return colorScale[0].color as [number, number, number];
  }
  if (value >= colorScale[colorScale.length - 1].value) {
    return colorScale[colorScale.length - 1].color as [number, number, number];
  }

  for (let i = 0; i < colorScale.length - 1; i++) {
    const lower = colorScale[i];
    const upper = colorScale[i + 1];
    
    if (value >= lower.value && value <= upper.value) {
      const t = (value - lower.value) / (upper.value - lower.value);
      return [
        Math.round(lower.color[0] + t * (upper.color[0] - lower.color[0])),
        Math.round(lower.color[1] + t * (upper.color[1] - lower.color[1])),
        Math.round(lower.color[2] + t * (upper.color[2] - lower.color[2])),
      ];
    }
  }
  
  return colorScale[colorScale.length - 1].color as [number, number, number];
}

function tileToLatLon(x: number, y: number, z: number): { lat: number; lon: number } {
  const n = Math.pow(2, z);
  const lon = x / n * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  const lat = latRad * 180 / Math.PI;
  return { lat, lon };
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPNG(width: number, height: number, rgbaData: Buffer): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  
  const ihdrChunk = Buffer.concat([
    Buffer.from([0, 0, 0, 13]),
    Buffer.from('IHDR'),
    ihdr,
    Buffer.alloc(4),
  ]);
  ihdrChunk.writeUInt32BE(crc32(ihdrChunk.slice(4, 8 + 13)), 8 + 13);
  
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0;
    rgbaData.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawData, { level: 9 });
  
  const idatChunk = Buffer.concat([
    Buffer.alloc(4),
    Buffer.from('IDAT'),
    compressed,
    Buffer.alloc(4),
  ]);
  idatChunk.writeUInt32BE(compressed.length, 0);
  idatChunk.writeUInt32BE(crc32(idatChunk.slice(4, 8 + compressed.length)), 8 + compressed.length);
  
  const iendChunk = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0]);
  iendChunk.writeUInt32BE(crc32(Buffer.from('IEND')), 8);
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

export function generateTile(
  grid: Float64Array,
  interpInfo: InterpolationResult,
  metric: 'rsrp' | 'sinr',
  z: number,
  x: number,
  y: number
): Buffer {
  const colorScale = metric === 'rsrp' ? RSRP_COLOR_SCALE : SINR_COLOR_SCALE;
  const tileSize = 256;
  
  const rgbaData = Buffer.alloc(tileSize * tileSize * 4);
  
  const { paddedBounds, gridWidth, gridHeight } = interpInfo;
  const bounds = paddedBounds;
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const latToMeters = 111139;
  const lonToMeters = Math.cos(centerLat * Math.PI / 180) * 111139;
  
  const tileBounds = {
    min: tileToLatLon(x, y + 1, z),
    max: tileToLatLon(x + 1, y, z),
  };
  
  for (let py = 0; py < tileSize; py++) {
    for (let px = 0; px < tileSize; px++) {
      const tileX = px / tileSize;
      const tileY = py / tileSize;
      
      const lon = tileBounds.min.lon + tileX * (tileBounds.max.lon - tileBounds.min.lon);
      const lat = tileBounds.min.lat + tileY * (tileBounds.max.lat - tileBounds.min.lat);
      
      const pixelIdx = (py * tileSize + px) * 4;
      
      if (lon < bounds.minLon || lon > bounds.maxLon || lat < bounds.minLat || lat > bounds.maxLat) {
        rgbaData[pixelIdx] = 0;
        rgbaData[pixelIdx + 1] = 0;
        rgbaData[pixelIdx + 2] = 0;
        rgbaData[pixelIdx + 3] = 0;
        continue;
      }
      
      const xMeters = (lon - bounds.minLon) * lonToMeters;
      const yMeters = (lat - bounds.minLat) * latToMeters;
      
      const gx = Math.floor(xMeters / interpInfo.gridSize);
      const gy = Math.floor(yMeters / interpInfo.gridSize);
      
      const clampedGx = Math.max(0, Math.min(gx, gridWidth - 1));
      const clampedGy = Math.max(0, Math.min(gy, gridHeight - 1));
      
      const gridIdx = clampedGy * gridWidth + clampedGx;
      const value = grid[gridIdx];
      
      if (isNaN(value)) {
        rgbaData[pixelIdx] = 0;
        rgbaData[pixelIdx + 1] = 0;
        rgbaData[pixelIdx + 2] = 0;
        rgbaData[pixelIdx + 3] = 0;
      } else {
        const [r, g, b] = interpolateColor(value, colorScale);
        rgbaData[pixelIdx] = r;
        rgbaData[pixelIdx + 1] = g;
        rgbaData[pixelIdx + 2] = b;
        rgbaData[pixelIdx + 3] = 180;
      }
    }
  }
  
  return createPNG(tileSize, tileSize, rgbaData);
}

