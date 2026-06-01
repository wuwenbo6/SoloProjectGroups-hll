import { useEffect, useRef, useMemo } from 'react';
import {
  getFixtureColor,
  getFixtureDimmer,
  getFixtureValue,
  DEFAULT_FIXTURES,
} from '../lib/fixtures';
import type { Fixture } from '../../shared/types';

interface StagePreviewProps {
  channels: number[];
  grandMaster: number;
  blackout: boolean;
  fixtures?: Fixture[];
}

export function StagePreview({
  channels,
  grandMaster,
  blackout,
  fixtures = DEFAULT_FIXTURES,
}: StagePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fixtureStates = useMemo(() => {
    return fixtures.map((fixture) => {
      const color = getFixtureColor(fixture, channels);
      const dimmer = getFixtureDimmer(fixture, channels, blackout ? 0 : grandMaster);
      const pan = getFixtureValue(fixture, channels, 'pan');
      const tilt = getFixtureValue(fixture, channels, 'tilt');

      return {
        fixture,
        color,
        dimmer,
        pan,
        tilt,
      };
    });
  }, [fixtures, channels, grandMaster, blackout]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1a1a2a';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }
    for (let i = 0; i < height; i += 40) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    const stageX = width * 0.5;
    const stageY = height * 0.6;
    const stageWidth = width * 0.6;
    const stageHeight = height * 0.3;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(
      stageX - stageWidth / 2,
      stageY - stageHeight / 2,
      stageWidth,
      stageHeight
    );

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.strokeRect(
      stageX - stageWidth / 2,
      stageY - stageHeight / 2,
      stageWidth,
      stageHeight
    );

    fixtureStates.forEach(({ fixture, color, dimmer, pan, tilt }) => {
      if (dimmer <= 0.01) return;

      const x = ((fixture.position.x + 6) / 12) * width;
      const y = height - ((fixture.position.z + 6) / 12) * height;

      const beamLength = 80 + (tilt / 255) * 100;
      const beamAngle = (pan / 255 - 0.5) * Math.PI;

      const r = Math.floor(color.r * 255);
      const g = Math.floor(color.g * 255);
      const b = Math.floor(color.b * 255);

      if (dimmer > 0.1) {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, beamLength);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${dimmer * 0.6})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, beamLength, beamAngle - 0.3, beamAngle + 0.3);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(fixture.name, x, y + 20);
    });
  }, [fixtureStates, blackout]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={300}
      className="w-full h-full"
      style={{ display: 'block' }}
    />
  );
}
