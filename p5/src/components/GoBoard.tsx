import React, { useEffect, useRef, useState, useCallback } from 'react';
import { StoneColor, TopMove } from '../store/gameStore';

interface GoBoardProps {
  board: StoneColor[][];
  boardSize: number;
  onMove: (x: number, y: number) => void;
  topMoves?: TopMove[];
  lastMove?: { x: number; y: number };
  heatmap?: number[][] | null;
  showHeatmap?: boolean;
  disabled?: boolean;
}

export const GoBoard: React.FC<GoBoardProps> = ({
  board,
  boardSize,
  onMove,
  topMoves = [],
  lastMove,
  heatmap,
  showHeatmap = false,
  disabled = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const canvasSize = 600;
  const padding = 30;
  const cellSize = (canvasSize - padding * 2) / (boardSize - 1);
  const stoneRadius = cellSize * 0.42;

  const getStarPoints = useCallback(() => {
    const points: Array<{ x: number; y: number }> = [];
    if (boardSize === 19) {
      const positions = [3, 9, 15];
      for (const x of positions) {
        for (const y of positions) {
          points.push({ x, y });
        }
      }
    } else if (boardSize === 13) {
      const positions = [3, 6, 9];
      for (const x of positions) {
        for (const y of positions) {
          points.push({ x, y });
        }
      }
    } else if (boardSize === 9) {
      const positions = [2, 4, 6];
      for (const x of positions) {
        for (const y of positions) {
          points.push({ x, y });
        }
      }
    }
    return points;
  }, [boardSize]);

  const drawBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    const gradient = ctx.createLinearGradient(0, 0, canvasSize, canvasSize);
    gradient.addColorStop(0, '#D4A76A');
    gradient.addColorStop(0.5, '#E8C48E');
    gradient.addColorStop(1, '#D4A76A');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    ctx.strokeStyle = '#5D4037';
    ctx.lineWidth = 0.8;

    for (let i = 0; i < boardSize; i++) {
      ctx.beginPath();
      ctx.moveTo(padding, padding + i * cellSize);
      ctx.lineTo(padding + (boardSize - 1) * cellSize, padding + i * cellSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(padding + i * cellSize, padding);
      ctx.lineTo(padding + i * cellSize, padding + (boardSize - 1) * cellSize);
      ctx.stroke();
    }

    ctx.fillStyle = '#5D4037';
    for (const point of getStarPoints()) {
      ctx.beginPath();
      ctx.arc(
        padding + point.x * cellSize,
        padding + point.y * cellSize,
        3.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }, [boardSize, cellSize, getStarPoints]);

  const drawHeatmap = useCallback(() => {
    if (!showHeatmap || !heatmap) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const intensity = heatmap[y]?.[x] || 0;
        if (intensity > 0) {
          const alpha = intensity * 0.6;
          ctx.fillStyle = `rgba(255, 87, 34, ${alpha})`;
          ctx.beginPath();
          ctx.arc(
            padding + x * cellSize,
            padding + y * cellSize,
            cellSize * 0.4,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }
    }
  }, [showHeatmap, heatmap, boardSize, cellSize]);

  const drawStones = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const stone = board[y]?.[x];
        if (!stone) continue;

        const posX = padding + x * cellSize;
        const posY = padding + y * cellSize;

        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        const stoneGradient = ctx.createRadialGradient(
          posX - stoneRadius * 0.3,
          posY - stoneRadius * 0.3,
          0,
          posX,
          posY,
          stoneRadius
        );

        if (stone === 'black') {
          stoneGradient.addColorStop(0, '#4a4a4a');
          stoneGradient.addColorStop(0.5, '#1a1a1a');
          stoneGradient.addColorStop(1, '#000000');
        } else {
          stoneGradient.addColorStop(0, '#ffffff');
          stoneGradient.addColorStop(0.5, '#f0f0f0');
          stoneGradient.addColorStop(1, '#d0d0d0');
        }

        ctx.fillStyle = stoneGradient;
        ctx.beginPath();
        ctx.arc(posX, posY, stoneRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        if (stone === 'white') {
          ctx.strokeStyle = '#888';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.arc(posX, posY, stoneRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }, [board, boardSize, cellSize, stoneRadius]);

  const drawTopMoves = useCallback(() => {
    if (!topMoves || topMoves.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const colors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    topMoves.slice(0, 3).forEach((move, index) => {
      const posX = padding + move.x * cellSize;
      const posY = padding + move.y * cellSize;

      ctx.strokeStyle = colors[index];
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(posX, posY, stoneRadius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = colors[index];
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((index + 1).toString(), posX, posY);
    });
  }, [topMoves, cellSize, stoneRadius]);

  const drawLastMoveMarker = useCallback(() => {
    if (!lastMove) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const posX = padding + lastMove.x * cellSize;
    const posY = padding + lastMove.y * cellSize;
    const stone = board[lastMove.y]?.[lastMove.x];

    ctx.strokeStyle = stone === 'black' ? '#FF5722' : '#F44336';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(posX, posY, stoneRadius * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }, [lastMove, board, cellSize, stoneRadius]);

  const drawHover = useCallback(() => {
    if (!hoverPos || disabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const posX = padding + hoverPos.x * cellSize;
    const posY = padding + hoverPos.y * cellSize;

    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(posX, posY, stoneRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }, [hoverPos, cellSize, stoneRadius, disabled]);

  useEffect(() => {
    drawBoard();
    drawHeatmap();
    drawStones();
    drawTopMoves();
    drawLastMoveMarker();
    drawHover();
  }, [drawBoard, drawHeatmap, drawStones, drawTopMoves, drawLastMoveMarker, drawHover]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const x = Math.round((mouseX - padding) / cellSize);
    const y = Math.round((mouseY - padding) / cellSize);

    if (x >= 0 && x < boardSize && y >= 0 && y < boardSize) {
      if (!board[y]?.[x]) {
        setHoverPos({ x, y });
      } else {
        setHoverPos(null);
      }
    } else {
      setHoverPos(null);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const x = Math.round((mouseX - padding) / cellSize);
    const y = Math.round((mouseY - padding) / cellSize);

    if (x >= 0 && x < boardSize && y >= 0 && y < boardSize) {
      if (!board[y]?.[x]) {
        onMove(x, y);
      }
    }
  };

  const handleMouseLeave = () => {
    setHoverPos(null);
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={canvasSize}
        height={canvasSize}
        className="rounded-lg shadow-2xl cursor-pointer"
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={handleMouseLeave}
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      <div className="absolute top-2 left-2 text-xs text-amber-900 bg-amber-100/80 px-2 py-1 rounded">
        {boardSize}×{boardSize} 棋盘
      </div>
    </div>
  );
};
