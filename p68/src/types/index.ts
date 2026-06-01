export interface Region {
  id: string;
  name: string;
  bbox: [number, number, number, number];
  availableYears: number[];
}

export interface RoadProperties {
  id: string;
  osmId: number;
  name: string;
  highwayType: string;
  firstSeen: number;
  lastSeen: number;
  status: 'existing' | 'new' | 'disappeared';
  length: number;
}

export interface RoadFeature {
  type: 'Feature';
  properties: RoadProperties;
  geometry: GeoJSON.LineString;
}

export interface RoadFeatureCollection {
  type: 'FeatureCollection';
  features: RoadFeature[];
}

export interface YearStats {
  year: number;
  newRoads: number;
  disappearedRoads: number;
  totalRoads: number;
  newLength: number;
  disappearedLength: number;
  totalLength: number;
}

export interface TaskStatus {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
}

export type HighwayType = 'motorway' | 'trunk' | 'primary' | 'secondary' | 'tertiary' | 'residential' | 'all';

export interface MapState {
  selectedRegion: Region | null;
  selectedYear: number;
  isPlaying: boolean;
  roadData: RoadFeatureCollection | null;
  filterTypes: HighwayType[];
}
