import type { Fixture } from '../../shared/types';

export const DEFAULT_FIXTURES: Fixture[] = [
  {
    id: 'par-1',
    name: 'PAR 左前',
    type: 'par',
    startChannel: 1,
    position: { x: -4, y: 4, z: -4 },
    rotation: { x: Math.PI / 4, y: 0.3, z: 0 },
    channelMap: {
      dimmer: 0,
      red: 1,
      green: 2,
      blue: 3,
    },
  },
  {
    id: 'par-2',
    name: 'PAR 右前',
    type: 'par',
    startChannel: 5,
    position: { x: 4, y: 4, z: -4 },
    rotation: { x: Math.PI / 4, y: -0.3, z: 0 },
    channelMap: {
      dimmer: 0,
      red: 1,
      green: 2,
      blue: 3,
    },
  },
  {
    id: 'par-3',
    name: 'PAR 左后',
    type: 'par',
    startChannel: 9,
    position: { x: -4, y: 4, z: 4 },
    rotation: { x: Math.PI / 4, y: -0.3, z: 0 },
    channelMap: {
      dimmer: 0,
      red: 1,
      green: 2,
      blue: 3,
    },
  },
  {
    id: 'par-4',
    name: 'PAR 右后',
    type: 'par',
    startChannel: 13,
    position: { x: 4, y: 4, z: 4 },
    rotation: { x: Math.PI / 4, y: 0.3, z: 0 },
    channelMap: {
      dimmer: 0,
      red: 1,
      green: 2,
      blue: 3,
    },
  },
  {
    id: 'par-5',
    name: 'PAR 中左',
    type: 'par',
    startChannel: 17,
    position: { x: -2, y: 4.5, z: 0 },
    rotation: { x: Math.PI / 3, y: 0, z: 0 },
    channelMap: {
      dimmer: 0,
      red: 1,
      green: 2,
      blue: 3,
    },
  },
  {
    id: 'par-6',
    name: 'PAR 中右',
    type: 'par',
    startChannel: 21,
    position: { x: 2, y: 4.5, z: 0 },
    rotation: { x: Math.PI / 3, y: 0, z: 0 },
    channelMap: {
      dimmer: 0,
      red: 1,
      green: 2,
      blue: 3,
    },
  },
  {
    id: 'moving-1',
    name: '摇头灯 1',
    type: 'moving-head',
    startChannel: 33,
    position: { x: -3, y: 5, z: -2 },
    rotation: { x: 0, y: 0, z: 0 },
    channelMap: {
      pan: 0,
      tilt: 1,
      dimmer: 2,
      red: 3,
      green: 4,
      blue: 5,
      white: 6,
    },
  },
  {
    id: 'moving-2',
    name: '摇头灯 2',
    type: 'moving-head',
    startChannel: 41,
    position: { x: 3, y: 5, z: -2 },
    rotation: { x: 0, y: 0, z: 0 },
    channelMap: {
      pan: 0,
      tilt: 1,
      dimmer: 2,
      red: 3,
      green: 4,
      blue: 5,
      white: 6,
    },
  },
  {
    id: 'bar-1',
    name: '洗墙灯 1',
    type: 'bar',
    startChannel: 49,
    position: { x: 0, y: 0.1, z: -5 },
    rotation: { x: Math.PI / 2.5, y: 0, z: 0 },
    channelMap: {
      dimmer: 0,
      red: 1,
      green: 2,
      blue: 3,
    },
  },
];

export function getFixtureValue(
  fixture: Fixture,
  channels: number[],
  channelName: keyof Fixture['channelMap']
): number {
  const offset = fixture.channelMap[channelName];
  if (offset === undefined) return 0;
  const channelIndex = fixture.startChannel + offset - 1;
  return channels[channelIndex] || 0;
}

export function getFixtureColor(
  fixture: Fixture,
  channels: number[]
): { r: number; g: number; b: number } {
  const r = getFixtureValue(fixture, channels, 'red') / 255;
  const g = getFixtureValue(fixture, channels, 'green') / 255;
  const b = getFixtureValue(fixture, channels, 'blue') / 255;
  const w = getFixtureValue(fixture, channels, 'white') / 255;

  return {
    r: Math.min(1, r + w * 0.3),
    g: Math.min(1, g + w * 0.3),
    b: Math.min(1, b + w * 0.3),
  };
}

export function getFixtureDimmer(
  fixture: Fixture,
  channels: number[],
  grandMaster: number
): number {
  const dimmer = getFixtureValue(fixture, channels, 'dimmer') / 255;
  return dimmer * grandMaster;
}
