import React, { useState, useRef, useCallback, useEffect } from 'react';
import SvgComponent from './SvgComponent.jsx';
import { createComponent, createWire } from '../types/circuit.js';
import { getPinPosition, snapToGrid, pointToLineDistance } from '../utils/circuitUtils.js';

const GRID_SIZE = 20;

export default function CircuitEditor({ circuitData, onChange, selectedComponent, onSelectComponent }) {
  const { components = [], wires = [] } = circuitData;
  const svgRef = useRef(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 1200, h: 800 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [movingComponent, setMovingComponent] = useState(null);
  const [moveOffset, setMoveOffset] = useState({ x: 0, y: 0 });
  const [wiring, setWiring] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [selectedWire, setSelectedWire] = useState(null);

  const getSvgPoint = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * viewBox.w + viewBox.x;
    const y = ((e.clientY - rect.top) / rect.height) * viewBox.h + viewBox.y;
    return { x, y };
  }, [viewBox]);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const componentType = e.dataTransfer.getData('componentType');
    if (!componentType) return;

    const point = getSvgPoint(e);
    const newComp = createComponent(componentType, snapToGrid(point.x, GRID_SIZE), snapToGrid(point.y, GRID_SIZE));

    onChange({
      ...circuitData,
      components: [...components, newComp]
    });
    onSelectComponent(newComp.id);
  };

  const handleComponentMouseDown = (componentId, e) => {
    e.stopPropagation();
    onSelectComponent(componentId);
    setSelectedWire(null);

    const comp = components.find(c => c.id === componentId);
    if (!comp) return;

    const point = getSvgPoint(e);
    setMovingComponent(componentId);
    setMoveOffset({ x: point.x - comp.x, y: point.y - comp.y });
  };

  const handlePinMouseDown = (componentId, pinIndex, e) => {
    e.stopPropagation();
    const point = getSvgPoint(e);
    const comp = components.find(c => c.id === componentId);
    if (!comp) return;

    const pinPos = getPinPosition(comp, pinIndex);
    setWiring({
      from: { component: componentId, pin: pinIndex },
      startX: pinPos.x,
      startY: pinPos.y
    });
    setMousePos({ x: point.x, y: point.y });
  };

  const handlePinMouseUp = (componentId, pinIndex, e) => {
    if (!wiring) return;
    if (wiring.from.component === componentId && wiring.from.pin === pinIndex) {
      setWiring(null);
      return;
    }

    const newWire = createWire(wiring.from.component, wiring.from.pin, componentId, pinIndex);
    onChange({
      ...circuitData,
      wires: [...wires, newWire]
    });
    setWiring(null);
  };

  const handleMouseDown = (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsDragging(true);
      const point = getSvgPoint(e);
      setDragStart({ x: point.x - viewBox.x, y: point.y - viewBox.y });
      return;
    }

    if (e.target === svgRef.current || e.target.tagName === 'rect' || e.target.tagName === 'line' && e.target.dataset.grid) {
      onSelectComponent(null);
      setSelectedWire(null);
    }

    if (wiring) {
      return;
    }

    const point = getSvgPoint(e);
    for (const wire of wires) {
      const fromComp = components.find(c => c.id === wire.from.component);
      const toComp = components.find(c => c.id === wire.to.component);
      if (!fromComp || !toComp) continue;

      const fromPos = getPinPosition(fromComp, wire.from.pin);
      const toPos = getPinPosition(toComp, wire.to.pin);
      const dist = pointToLineDistance(point.x, point.y, fromPos.x, fromPos.y, toPos.x, toPos.y);

      if (dist < 8) {
        setSelectedWire(wire.id);
        onSelectComponent(null);
        return;
      }
    }
  };

  const handleMouseMove = (e) => {
    const point = getSvgPoint(e);
    setMousePos(point);

    if (isDragging) {
      setViewBox(v => ({
        ...v,
        x: point.x - dragStart.x,
        y: point.y - dragStart.y
      }));
    }

    if (movingComponent) {
      const newComponents = components.map(c => {
        if (c.id === movingComponent) {
          return {
            ...c,
            x: snapToGrid(point.x - moveOffset.x, GRID_SIZE),
            y: snapToGrid(point.y - moveOffset.y, GRID_SIZE)
          };
        }
        return c;
      });
      onChange({ ...circuitData, components: newComponents });
    }
  };

  const handleMouseUp = (e) => {
    setIsDragging(false);
    setMovingComponent(null);

    if (wiring) {
      const point = getSvgPoint(e);
      for (const comp of components) {
        const config = comp.pins || [];
        for (let i = 0; i < config.length; i++) {
          const pinPos = getPinPosition(comp, i);
          const dist = Math.sqrt((point.x - pinPos.x) ** 2 + (point.y - pinPos.y) ** 2);
          if (dist < 15 && !(wiring.from.component === comp.id && wiring.from.pin === i)) {
            handlePinMouseUp(comp.id, i, e);
            return;
          }
        }
      }
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.1 : 0.9;
    const point = getSvgPoint(e);

    setViewBox(v => {
      const newW = v.w * delta;
      const newH = v.h * delta;
      const ratioW = (point.x - v.x) / v.w;
      const ratioH = (point.y - v.y) / v.h;

      return {
        x: point.x - ratioW * newW,
        y: point.y - ratioH * newH,
        w: newW,
        h: newH
      };
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedComponent) {
          const newComponents = components.filter(c => c.id !== selectedComponent);
          const newWires = wires.filter(w => w.from.component !== selectedComponent && w.to.component !== selectedComponent);
          onChange({ components: newComponents, wires: newWires });
          onSelectComponent(null);
        } else if (selectedWire) {
          const newWires = wires.filter(w => w.id !== selectedWire);
          onChange({ ...circuitData, wires: newWires });
          setSelectedWire(null);
        }
      }
      if (e.key === 'r' && selectedComponent) {
        const newComponents = components.map(c => {
          if (c.id === selectedComponent) {
            return { ...c, rotation: ((c.rotation || 0) + 90) % 360 };
          }
          return c;
        });
        onChange({ ...circuitData, components: newComponents });
      }
      if (e.key === 'Escape') {
        setWiring(null);
        onSelectComponent(null);
        setSelectedWire(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedComponent, selectedWire, circuitData, onChange, onSelectComponent]);

  const renderWires = () => {
    return wires.map(wire => {
      const fromComp = components.find(c => c.id === wire.from.component);
      const toComp = components.find(c => c.id === wire.to.component);
      if (!fromComp || !toComp) return null;

      const fromPos = getPinPosition(fromComp, wire.from.pin);
      const toPos = getPinPosition(toComp, wire.to.pin);

      return (
        <line
          key={wire.id}
          x1={fromPos.x}
          y1={fromPos.y}
          x2={toPos.x}
          y2={toPos.y}
          stroke={selectedWire === wire.id ? '#4a90d9' : '#333'}
          strokeWidth={selectedWire === wire.id ? 4 : 2}
          style={{ cursor: 'pointer' }}
        />
      );
    });
  };

  const renderGrid = () => {
    const lines = [];
    for (let x = Math.floor(viewBox.x / GRID_SIZE) * GRID_SIZE; x < viewBox.x + viewBox.w; x += GRID_SIZE) {
      lines.push(
        <line
          key={`v${x}`}
          data-grid="1"
          x1={x}
          y1={viewBox.y}
          x2={x}
          y2={viewBox.y + viewBox.h}
          stroke="#eee"
          strokeWidth="0.5"
        />
      );
    }
    for (let y = Math.floor(viewBox.y / GRID_SIZE) * GRID_SIZE; y < viewBox.y + viewBox.h; y += GRID_SIZE) {
      lines.push(
        <line
          key={`h${y}`}
          data-grid="1"
          x1={viewBox.x}
          y1={y}
          x2={viewBox.x + viewBox.w}
          y2={y}
          stroke="#eee"
          strokeWidth="0.5"
        />
      );
    }
    return lines;
  };

  return (
    <div className="circuit-editor">
      <svg
        ref={svgRef}
        className="circuit-canvas"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <rect
          x={viewBox.x - 1000}
          y={viewBox.y - 1000}
          width={viewBox.w + 2000}
          height={viewBox.h + 2000}
          fill="#fafafa"
        />
        {renderGrid()}
        {renderWires()}
        {wiring && (
          <line
            x1={wiring.startX}
            y1={wiring.startY}
            x2={mousePos.x}
            y2={mousePos.y}
            stroke="#4a90d9"
            strokeWidth="2"
            strokeDasharray="5,3"
          />
        )}
        {components.map(comp => (
          <SvgComponent
            key={comp.id}
            component={comp}
            selected={selectedComponent === comp.id}
            onPinMouseDown={handlePinMouseDown}
            onMouseDown={handleComponentMouseDown}
          />
        ))}
      </svg>
      <div className="editor-hint">
        <span>拖拽元件放置 | 点击引脚连线 | R旋转 | Delete删除 | Alt+拖拽平移 | 滚轮缩放</span>
      </div>
    </div>
  );
}
