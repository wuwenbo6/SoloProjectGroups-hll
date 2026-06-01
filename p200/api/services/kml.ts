import type { MetricType, ColorStop, ColorRGB } from "../../shared/types.js";
import { RSRP_COLOR_SCALE, SINR_COLOR_SCALE } from "../../shared/types.js";

export interface KMLExportParams {
  fileId: string;
  metric: MetricType;
  grid: Float64Array;
  gridWidth: number;
  gridHeight: number;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  colorScale: ColorStop[];
}

function interpolateColor(
  value: number,
  colorScale: ColorStop[]
): ColorRGB {
  if (isNaN(value)) return [128, 128, 128];
  if (value <= colorScale[0].value) return colorScale[0].color;
  if (value >= colorScale[colorScale.length - 1].value) return colorScale[colorScale.length - 1].color;

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
  return colorScale[colorScale.length - 1].color;
}

export function generateKML(params: KMLExportParams): string {
  const latRange = params.bounds.maxLat - params.bounds.minLat;
  const lonRange = params.bounds.maxLon - params.bounds.minLon;

  let kml = '<?xml version="1.0" encoding="UTF-8"?>';
  kml += '<kml xmlns="http://www.opengis.net/kml/2.2">';
  kml += '<Document>';
  kml += `<name>Heatmap - ${params.fileId} - ${params.metric}</name>`;

  for (let y = 0; y < params.gridHeight; y++) {
    for (let x = 0; x < params.gridWidth; x++) {
      const idx = y * params.gridWidth + x;
      const value = params.grid[idx];

      if (isNaN(value)) continue;

      const color = interpolateColor(value, params.colorScale);
      const colorHex = `${color[2].toString(16).padStart(2, '0')}${color[1].toString(16).padStart(2, '0')}${color[0].toString(16).padStart(2, '0')}`;
      const styleId = `style_${colorHex}`;

      const west = params.bounds.minLon + (x / params.gridWidth) * lonRange;
      const east = params.bounds.minLon + ((x + 1) / params.gridWidth) * lonRange;
      const south = params.bounds.minLat + (y / params.gridHeight) * latRange;
      const north = params.bounds.minLat + ((y + 1) / params.gridHeight) * latRange;

      kml += `<Placemark>`;
      kml += `<styleUrl>#${styleId}</styleUrl>`;
      kml += '<Polygon><outerBoundaryIs><LinearRing><coordinates>';
      kml += `${west},${north} ${east},${north} ${east},${south} ${west},${south} ${west},${north}`;
      kml += '</coordinates></LinearRing></outerBoundaryIs></Polygon>';
      kml += '</Placemark>';

      kml += `<Style id="${styleId}"><PolyStyle><color>cc${colorHex}</color><fill>1</fill><outline>0</outline></PolyStyle></Style>`;
    }
  }

  kml += '</Document>';
  kml += '</kml>';

  return kml;
}

export function getColorScale(metric: MetricType) {
  return metric === 'rsrp' ? RSRP_COLOR_SCALE : SINR_COLOR_SCALE;
}

