import { Region, RoadFeatureCollection, YearStats } from '@/types';

export const mockRegions: Region[] = [
  {
    id: 'beijing',
    name: '北京市',
    bbox: [116.2, 39.7, 116.6, 40.1],
    availableYears: [2018, 2019, 2020, 2021, 2022, 2023, 2024],
  },
  {
    id: 'shanghai',
    name: '上海市',
    bbox: [121.3, 31.1, 121.6, 31.4],
    availableYears: [2018, 2019, 2020, 2021, 2022, 2023, 2024],
  },
  {
    id: 'guangzhou',
    name: '广州市',
    bbox: [113.2, 23.0, 113.5, 23.3],
    availableYears: [2018, 2019, 2020, 2021, 2022, 2023, 2024],
  },
];

export const highwayTypeLabels: Record<string, string> = {
  motorway: '高速公路',
  trunk: '主干道',
  primary: '主要道路',
  secondary: '次要道路',
  tertiary: '三级道路',
  residential: '居民区道路',
  all: '全部',
};

interface RoadTemplate {
  name: string;
  type: string;
  start: number;
  end: number;
  length: number;
}

const roadTemplates: RoadTemplate[] = [
  { name: '长安街', type: 'primary', start: 2018, end: 2024, length: 8500 },
  { name: '建国路', type: 'primary', start: 2019, end: 2024, length: 6200 },
  { name: '三环路', type: 'trunk', start: 2018, end: 2024, length: 48000 },
  { name: '四环路', type: 'trunk', start: 2020, end: 2024, length: 65300 },
  { name: '五环路', type: 'motorway', start: 2021, end: 2024, length: 98580 },
  { name: '王府井大街', type: 'secondary', start: 2018, end: 2024, length: 1800 },
  { name: '中关村大街', type: 'secondary', start: 2019, end: 2024, length: 3500 },
  { name: '望京路', type: 'tertiary', start: 2020, end: 2024, length: 4200 },
  { name: '朝阳路', type: 'secondary', start: 2022, end: 2024, length: 5800 },
  { name: '学院路', type: 'secondary', start: 2018, end: 2023, length: 2900 },
  { name: '旧路1号', type: 'tertiary', start: 2018, end: 2020, length: 1200 },
  { name: '旧路2号', type: 'residential', start: 2019, end: 2021, length: 850 },
  { name: '新建路1号', type: 'residential', start: 2023, end: 2024, length: 650 },
  { name: '新建路2号', type: 'tertiary', start: 2024, end: 2024, length: 2100 },
];

const generateRoadsForRegion = (regionId: string, year: number): RoadFeatureCollection => {
  const centerLat = regionId === 'beijing' ? 39.9042 : regionId === 'shanghai' ? 31.2304 : 23.1291;
  const centerLon = regionId === 'beijing' ? 116.4074 : regionId === 'shanghai' ? 121.4737 : 113.2644;

  const features = roadTemplates
    .filter((road) => road.start <= year && road.end >= year)
    .map((road, index) => {
      const offset = index * 0.015;
      const status = road.start === year ? 'new' : road.end === year ? 'disappeared' : 'existing';

      return {
        type: 'Feature' as const,
        properties: {
          id: `${regionId}_road_${index}`,
          osmId: 100000 + index,
          name: road.name,
          highwayType: road.type,
          firstSeen: road.start,
          lastSeen: road.end,
          status: status as 'existing' | 'new' | 'disappeared',
          length: road.length,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [centerLon - 0.06 + offset, centerLat - 0.03],
            [centerLon + offset, centerLat],
            [centerLon + 0.06 + offset, centerLat + 0.03],
          ],
        },
      };
    });

  return {
    type: 'FeatureCollection',
    features,
  };
};

export const mockStats: YearStats[] = [
  { year: 2018, newRoads: 5, disappearedRoads: 0, totalRoads: 5, newLength: 60000, disappearedLength: 0, totalLength: 60000 },
  { year: 2019, newRoads: 3, disappearedRoads: 0, totalRoads: 8, newLength: 10550, disappearedLength: 0, totalLength: 70550 },
  { year: 2020, newRoads: 2, disappearedRoads: 1, totalRoads: 9, newLength: 69500, disappearedLength: 1200, totalLength: 138850 },
  { year: 2021, newRoads: 2, disappearedRoads: 1, totalRoads: 10, newLength: 102780, disappearedLength: 850, totalLength: 240780 },
  { year: 2022, newRoads: 1, disappearedRoads: 0, totalRoads: 11, newLength: 5800, disappearedLength: 0, totalLength: 246580 },
  { year: 2023, newRoads: 1, disappearedRoads: 1, totalRoads: 11, newLength: 650, disappearedLength: 2900, totalLength: 244330 },
  { year: 2024, newRoads: 1, disappearedRoads: 0, totalRoads: 12, newLength: 2100, disappearedLength: 0, totalLength: 246430 },
];

export const mockApi = {
  async getRegions(): Promise<Region[]> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return mockRegions;
  },

  async getRoads(regionId: string, year: number): Promise<RoadFeatureCollection> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return generateRoadsForRegion(regionId, year);
  },

  async getStats(_regionId: string): Promise<YearStats[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return mockStats;
  },
};
