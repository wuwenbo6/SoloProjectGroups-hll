import type { MetricType } from '../../shared/types.js';

export interface GeoTIFFExportParams {
  fileId: string;
  metric: MetricType;
  grid: Float64Array;
  gridWidth: number;
  gridHeight: number;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
}

function writeUInt16LE(buffer: Buffer, offset: number, value: number): void {
  buffer.writeUInt16LE(value, offset);
}

function writeUInt32LE(buffer: Buffer, offset: number, value: number): void {
  buffer.writeUInt32LE(value, offset);
}

function writeDoubleLE(buffer: Buffer, offset: number, value: number): void {
  buffer.writeDoubleLE(value, offset);
}

export function generateGeoTIFF(params: GeoTIFFExportParams): Buffer {
  const { grid, gridWidth, gridHeight, bounds } = params;
  const pixelWidth = (bounds.maxLon - bounds.minLon) / gridWidth;
  const pixelHeight = (bounds.maxLat - bounds.minLat) / gridHeight;
  const tiepointLon = bounds.minLon;
  const tiepointLat = bounds.maxLat;
  const headerSize = 8;
  const ifdOffset = headerSize;
  const tags = [
    { id: 256, type: 3, count: 1, value: gridWidth },
    { id: 257, type: 3, count: 1, value: gridHeight },
    { id: 258, type: 3, count: 1, value: 32 },
    { id: 259, type: 3, count: 1, value: 1 },
    { id: 262, type: 3, count: 1, value: 1 },
    { id: 273, type: 4, count: 1, value: 0 },
    { id: 277, type: 3, count: 1, value: 1 },
    { id: 278, type: 3, count: 1, value: gridHeight },
    { id: 279, type: 4, count: 1, value: gridWidth * gridHeight * 4 },
    { id: 282, type: 5, count: 1, value: 1 },
    { id: 283, type: 5, count: 1, value: 1 },
    { id: 296, type: 3, count: 1, value: 1 },
    { id: 33922, type: 12, count: 6, values: [0, 0, 0, tiepointLon, tiepointLat, 0] },
    { id: 33550, type: 12, count: 3, values: [pixelWidth, pixelHeight, 0] },
    { id: 34735, type: 3, count: 0, values: [] },
    { id: 339, type: 3, count: 1, value: 3 },
  ];
  const tagCount = tags.length;
  const ifdSize = 2 + tagCount * 12 + 4;
  let dataOffset = headerSize + ifdSize;
  let doubleValuesOffset = dataOffset;
  let doubleValuesSize = 0;
  for (const tag of tags) {
    if (tag.values && tag.values.length > 0) {
      doubleValuesSize += tag.values.length * 8;
    }
  }
  dataOffset = doubleValuesOffset + doubleValuesSize;
  tags[5].value = dataOffset;
  const totalSize = dataOffset + gridWidth * gridHeight * 4;
  const buffer = Buffer.alloc(totalSize);
  buffer.write('II', 0);
  writeUInt16LE(buffer, 2, 42);
  writeUInt32LE(buffer, 4, ifdOffset);
  let ifdPos = headerSize;
  writeUInt16LE(buffer, ifdPos, tagCount);
  ifdPos += 2;
  let doublePos = doubleValuesOffset;
  for (const tag of tags) {
    writeUInt16LE(buffer, ifdPos, tag.id);
    writeUInt16LE(buffer, ifdPos + 2, tag.type);
    writeUInt32LE(buffer, ifdPos + 4, tag.count);
    if (tag.values && tag.values.length > 0) {
      writeUInt32LE(buffer, ifdPos + 8, doublePos);
      for (const val of tag.values) {
        writeDoubleLE(buffer, doublePos, val);
        doublePos += 8;
      }
    } else {
      writeUInt32LE(buffer, ifdPos + 8, tag.value || 0);
    }
    ifdPos += 12;
  }
  writeUInt32LE(buffer, ifdPos, 0);
  const float32Data = new Float32Array(grid.length);
  for (let i = 0; i < grid.length; i++) {
    const row = Math.floor(i / gridWidth);
    const col = i % gridWidth;
    const srcIdx = (gridHeight - 1 - row) * gridWidth + col;
    float32Data[i] = isNaN(grid[srcIdx]) ? -9999 : grid[srcIdx];
  }
  for (let i = 0; i < float32Data.length; i++) {
    buffer.writeFloatLE(float32Data[i], dataOffset + i * 4);
  }
  return buffer;
}
