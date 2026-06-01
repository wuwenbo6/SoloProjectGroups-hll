import React, { useState, useRef, useCallback, useEffect } from 'react';

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];
const TEMP_COLORS = ['#0000ff', '#4a90d9', '#8bc34a', '#ff9800', '#f44336', '#9c27b0', '#00bcd4', '#795548'];

export default function WaveformViewer({ simulationResult, temperatureSweepResult, monteCarloResult }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [visibleSignals, setVisibleSignals] = useState(new Set());
  const [viewRange, setViewRange] = useState({ xStart: null, xEnd: null, yMin: null, yMax: null });
  const [phaseViewRange, setPhaseViewRange] = useState({ yMin: -180, yMax: 180 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [zoomBox, setZoomBox] = useState(null);
  const [zoomTarget, setZoomTarget] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [cursor2, setCursor2] = useState(null);
  const [measureMode, setMeasureMode] = useState(false);
  const [logScale, setLogScale] = useState(true);
  const [showAllMonteCarlo, setShowAllMonteCarlo] = useState(true);

  const isTemperatureSweep = !!temperatureSweepResult?.results?.length;
  const isMonteCarlo = !!monteCarloResult?.results?.length;

  let activeResult = simulationResult?.result;
  let allDatasets = [];

  if (isTemperatureSweep) {
    allDatasets = temperatureSweepResult.results.map((r, i) => ({
      label: `${r.temperature}°C`,
      data: r.result.data,
      header: r.result.header,
      isComplex: r.result.isComplex,
      color: TEMP_COLORS[i % TEMP_COLORS.length]
    }));
    activeResult = temperatureSweepResult.results[0]?.result;
  } else if (isMonteCarlo) {
    allDatasets = monteCarloResult.results.map((r, i) => ({
      label: `Run #${r.run}`,
      data: r.result.data,
      header: r.result.header,
      isComplex: r.result.isComplex,
      color: showAllMonteCarlo ? 'rgba(74, 144, 217, 0.3)' : COLORS[i % COLORS.length]
    }));
    activeResult = monteCarloResult.results[0]?.result;
  }

  const { header, data, isComplex } = activeResult || {};
  const isAC = header?.plotname === 'AC Analysis';

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      const signals = Object.keys(data);
      setVisibleSignals(new Set(signals.filter(s => s !== 'time' && s !== 'frequency')));
      setLogScale(isAC);
    }
  }, [data, isTemperatureSweep, isMonteCarlo]);

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      resetZoom();
    }
  }, [data, isTemperatureSweep, isMonteCarlo, logScale]);

  const resetZoom = () => {
    const allMagValues = [];
    const allPhaseValues = [];
    let xMin = Infinity, xMax = -Infinity;

    const datasetsToProcess = allDatasets.length > 0 ? allDatasets.map(d => ({ data: d.data, isComplex: d.isComplex })) : [{ data, isComplex }];

    datasetsToProcess.forEach(ds => {
      if (!ds.data) return;
      Object.entries(ds.data).forEach(([key, values]) => {
        if (key === 'time' || key === 'frequency') {
          values.forEach(v => {
            if (v < xMin) xMin = v;
            if (v > xMax) xMax = v;
          });
          return;
        }
        values.forEach(v => {
          if (ds.isComplex) {
            const { mag, phase } = getValue(v);
            allMagValues.push(mag);
            allPhaseValues.push(phase);
          } else {
            allMagValues.push(v);
          }
        });
      });
    });

    if (allMagValues.length === 0) return;

    let yMin, yMax;
    if (isAC && logScale) {
      const dBs = allMagValues.map(v => 20 * Math.log10(Math.max(v, 1e-12)));
      yMin = Math.min(...dBs);
      yMax = Math.max(...dBs);
      const pad = Math.max((yMax - yMin) * 0.1, 1);
      yMin -= pad;
      yMax += pad;
    } else {
      yMin = Math.min(...allMagValues) * 1.1;
      yMax = Math.max(...allMagValues) * 1.1;
    }

    setViewRange({
      xStart: xMin,
      xEnd: xMax,
      yMin,
      yMax
    });

    if (isAC && allPhaseValues.length > 0) {
      const pMin = Math.min(...allPhaseValues);
      const pMax = Math.max(...allPhaseValues);
      const pPad = Math.max((pMax - pMin) * 0.1, 10);
      setPhaseViewRange({
        yMin: Math.max(-180, pMin - pPad),
        yMax: Math.min(180, pMax + pPad)
      });
    }
  };

  const getXData = () => {
    if (!data) return [];
    if (data.time) return data.time;
    if (data.frequency) return data.frequency;
    return [];
  };

  const getXLabel = () => {
    if (!header) return 'X';
    if (header.plotname === 'Transient Analysis') return 'Time (s)';
    if (header.plotname === 'AC Analysis') return 'Frequency (Hz)';
    if (header.plotname === 'DC transfer characteristic') return 'Voltage (V)';
    return 'X';
  };

  const getValue = (v) => {
    if (typeof v === 'object' && v !== null) {
      return {
        mag: Math.sqrt(v.real ** 2 + v.imag ** 2),
        phase: Math.atan2(v.imag, v.real) * 180 / Math.PI
      };
    }
    return v;
  };

  const xToPx = useCallback((x, padding, plotWidth) => {
    if (logScale && isAC && viewRange.xStart > 0) {
      const logStart = Math.log10(viewRange.xStart);
      const logEnd = Math.log10(viewRange.xEnd);
      const logX = Math.log10(Math.max(x, viewRange.xStart * 0.999));
      return padding.left + ((logX - logStart) / (logEnd - logStart)) * plotWidth;
    }
    return padding.left + ((x - viewRange.xStart) / (viewRange.xEnd - viewRange.xStart)) * plotWidth;
  }, [viewRange, logScale, isAC]);

  const yToPx = useCallback((y, padding, plotHeight, yMin, yMax) => {
    return padding.top + plotHeight - ((y - yMin) / (yMax - yMin)) * plotHeight;
  }, []);

  const pxToX = useCallback((px, padding, plotWidth) => {
    if (logScale && isAC && viewRange.xStart > 0) {
      const logStart = Math.log10(viewRange.xStart);
      const logEnd = Math.log10(viewRange.xEnd);
      const logX = logStart + ((px - padding.left) / plotWidth) * (logEnd - logStart);
      return Math.pow(10, logX);
    }
    return viewRange.xStart + ((px - padding.left) / plotWidth) * (viewRange.xEnd - viewRange.xStart);
  }, [viewRange, logScale, isAC]);

  const pxToY = useCallback((py, padding, plotHeight, yMin, yMax) => {
    return yMax - ((py - padding.top) / plotHeight) * (yMax - yMin);
  }, []);

  const drawGrid = (ctx, padding, plotWidth, plotHeight, yMin, yMax) => {
    const xData = getXData();
    if (!xData.length) return;

    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;

    if (logScale && isAC && viewRange.xStart > 0) {
      const logStart = Math.log10(viewRange.xStart);
      const logEnd = Math.log10(viewRange.xEnd);

      for (let d = Math.floor(logStart); d <= Math.ceil(logEnd); d++) {
        for (let m = 1; m <= 9; m++) {
          const x = m * Math.pow(10, d);
          if (x >= viewRange.xStart && x <= viewRange.xEnd) {
            const px = xToPx(x, padding, plotWidth);
            ctx.globalAlpha = m === 1 ? 1 : 0.3;
            ctx.beginPath();
            ctx.moveTo(px, padding.top);
            ctx.lineTo(px, padding.top + plotHeight);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
    } else {
      for (let i = 0; i <= 10; i++) {
        const x = padding.left + (i / 10) * plotWidth;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + plotHeight);
        ctx.stroke();
      }
    }

    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (i / 5) * plotHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + plotWidth, y);
      ctx.stroke();
    }
  };

  const drawAxes = (ctx, padding, plotWidth, plotHeight, yMin, yMax, yLabel, isPhase = false) => {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(padding.left, padding.top, plotWidth, plotHeight);

    ctx.fillStyle = '#333';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';

    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (i / 5) * plotHeight;
      const val = yMax - (i / 5) * (yMax - yMin);
      ctx.fillText(formatY(val, isPhase), padding.left - 8, y + 4);
    }

    ctx.textAlign = 'center';
    const xData = getXData();

    if (logScale && isAC && viewRange.xStart > 0) {
      const logStart = Math.log10(viewRange.xStart);
      const logEnd = Math.log10(viewRange.xEnd);
      const ticks = [];
      for (let d = Math.floor(logStart); d <= Math.ceil(logEnd); d++) {
        ticks.push(Math.pow(10, d));
      }
      ticks.filter(x => x >= viewRange.xStart && x <= viewRange.xEnd).forEach(x => {
        const px = xToPx(x, padding, plotWidth);
        ctx.fillText(formatX(x), px, padding.top + plotHeight + 15);
      });
    } else {
      for (let i = 0; i <= 5; i++) {
        const x = padding.left + (i / 5) * plotWidth;
        const val = viewRange.xStart + (i / 5) * (viewRange.xEnd - viewRange.xStart);
        ctx.fillText(formatX(val), x, padding.top + plotHeight + 15);
      }
    }

    ctx.save();
    ctx.translate(20, padding.top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  };

  const getXDataForDataset = (dsData) => {
    if (!dsData) return [];
    if (dsData.time) return dsData.time;
    if (dsData.frequency) return dsData.frequency;
    return [];
  };

  const drawWaveform = (ctx, padding, plotWidth, plotHeight, yMin, yMax, mode = 'mag') => {
    const datasets = allDatasets.length > 0 ? allDatasets : [{ data, isComplex, color: null }];
    let signalColorIdx = 0;
    const signalColors = {};

    if (allDatasets.length === 0) {
      Object.keys(data || {}).forEach(key => {
        if (key !== 'time' && key !== 'frequency') {
          signalColors[key] = COLORS[signalColorIdx % COLORS.length];
          signalColorIdx++;
        }
      });
    }

    datasets.forEach((ds, dsIdx) => {
      const xData = getXDataForDataset(ds.data);
      const dsIsComplex = ds.isComplex;

      Object.entries(ds.data || {}).forEach(([key, values]) => {
        if (!visibleSignals.has(key)) return;
        if (key === 'time' || key === 'frequency') return;

        let color;
        if (allDatasets.length > 0) {
          color = ds.color;
        } else {
          color = signalColors[key];
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = (allDatasets.length > 0 && isMonteCarlo && showAllMonteCarlo) ? 1 : 1.5;
        ctx.beginPath();

        values.forEach((v, i) => {
          const x = xData[i];
          if (x === undefined || x < viewRange.xStart || x > viewRange.xEnd) return;

          let yVal;
          if (dsIsComplex) {
            const val = getValue(v);
            if (mode === 'phase') {
              yVal = val.phase;
            } else {
              yVal = logScale && isAC
                ? 20 * Math.log10(Math.max(val.mag, 1e-12))
                : val.mag;
            }
          } else {
            yVal = v;
          }

          const px = xToPx(x, padding, plotWidth);
          const py = yToPx(yVal, padding, plotHeight, yMin, yMax);

          if (i === 0 || (xData[i - 1] !== undefined && xData[i - 1] < viewRange.xStart)) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        });
        ctx.stroke();
      });
    });
  };

  const drawCursors = (ctx, padding, plotWidth, plotHeight, yMin, yMax, mode = 'mag') => {
    const xData = getXData();
    const drawOne = (c, offset) => {
      if (!c) return;
      const px = xToPx(c.x, padding, plotWidth);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(px, padding.top);
      ctx.lineTo(px, padding.top + plotHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#333';
      ctx.font = '11px monospace';
      ctx.fillText(formatX(c.x), px + 5, padding.top + plotHeight + offset);

      let colorIdx = 0;
      Object.entries(data || {}).forEach(([key, values]) => {
        if (!visibleSignals.has(key)) return;
        if (key === 'time' || key === 'frequency') return;

        const color = COLORS[colorIdx % COLORS.length];
        colorIdx++;

        const nearIdx = findNearestIndex(xData, c.x);
        let yVal;
        if (isComplex) {
          const val = getValue(values[nearIdx]);
          if (mode === 'phase') {
            yVal = val.phase;
          } else {
            yVal = logScale && isAC
              ? 20 * Math.log10(Math.max(val.mag, 1e-12))
              : val.mag;
          }
        } else {
          yVal = values[nearIdx];
        }
        const py = yToPx(yVal, padding, plotHeight, yMin, yMax);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();

        const displayVal = mode === 'phase' ? `${yVal.toFixed(1)}°` : formatY(yVal, false);
        ctx.fillText(`${key}: ${displayVal}`, px + 10, py - 5);
      });
    };

    drawOne(cursor, 20);
    drawOne(cursor2, 35);
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || !viewRange.xStart) return;

    const rect = containerRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    if (isAC) {
      const magPadding = { top: 20, right: 20, bottom: 60, left: 70 };
      const phasePadding = { top: 20 + (height / 2) + 10, right: 20, bottom: 50, left: 70 };
      const plotWidth = width - magPadding.left - magPadding.right;
      const plotHeight = (height - magPadding.top - magPadding.bottom - 20) / 2;

      ctx.fillStyle = '#fafafa';
      ctx.fillRect(magPadding.left, magPadding.top, plotWidth, plotHeight);
      drawGrid(ctx, magPadding, plotWidth, plotHeight, viewRange.yMin, viewRange.yMax);
      drawWaveform(ctx, magPadding, plotWidth, plotHeight, viewRange.yMin, viewRange.yMax, 'mag');
      drawCursors(ctx, magPadding, plotWidth, plotHeight, viewRange.yMin, viewRange.yMax, 'mag');
      drawAxes(ctx, magPadding, plotWidth, plotHeight, viewRange.yMin, viewRange.yMax,
        logScale ? 'Magnitude (dB)' : 'Magnitude', false);

      ctx.fillStyle = '#fafafa';
      ctx.fillRect(phasePadding.left, phasePadding.top, plotWidth, plotHeight);
      drawGrid(ctx, phasePadding, plotWidth, plotHeight, phaseViewRange.yMin, phaseViewRange.yMax);
      drawWaveform(ctx, phasePadding, plotWidth, plotHeight, phaseViewRange.yMin, phaseViewRange.yMax, 'phase');
      drawCursors(ctx, phasePadding, plotWidth, plotHeight, phaseViewRange.yMin, phaseViewRange.yMax, 'phase');
      drawAxes(ctx, phasePadding, plotWidth, plotHeight, phaseViewRange.yMin, phaseViewRange.yMax,
        'Phase (°)', true);

      ctx.fillStyle = '#333';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(getXLabel(), magPadding.left + plotWidth / 2, height - 10);

      if (zoomBox && isDragging && zoomTarget === 'mag') {
        ctx.strokeStyle = '#4a90d9';
        ctx.fillStyle = 'rgba(74, 144, 217, 0.1)';
        ctx.lineWidth = 1;
        const x = Math.min(dragStart.x, zoomBox.x);
        const y = Math.min(dragStart.y, zoomBox.y);
        const w = Math.abs(zoomBox.x - dragStart.x);
        const h = Math.abs(zoomBox.y - dragStart.y);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
    } else {
      const padding = { top: 20, right: 20, bottom: 50, left: 70 };
      const plotWidth = width - padding.left - padding.right;
      const plotHeight = height - padding.top - padding.bottom;

      ctx.fillStyle = '#fafafa';
      ctx.fillRect(padding.left, padding.top, plotWidth, plotHeight);
      drawGrid(ctx, padding, plotWidth, plotHeight, viewRange.yMin, viewRange.yMax);
      drawWaveform(ctx, padding, plotWidth, plotHeight, viewRange.yMin, viewRange.yMax, 'mag');
      drawCursors(ctx, padding, plotWidth, plotHeight, viewRange.yMin, viewRange.yMax, 'mag');
      drawAxes(ctx, padding, plotWidth, plotHeight, viewRange.yMin, viewRange.yMax,
        isComplex ? 'Magnitude' : 'Value', false);

      ctx.fillStyle = '#333';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(getXLabel(), padding.left + plotWidth / 2, height - 10);

      if (zoomBox && isDragging) {
        ctx.strokeStyle = '#4a90d9';
        ctx.fillStyle = 'rgba(74, 144, 217, 0.1)';
        ctx.lineWidth = 1;
        const x = Math.min(dragStart.x, zoomBox.x);
        const y = Math.min(dragStart.y, zoomBox.y);
        const w = Math.abs(zoomBox.x - dragStart.x);
        const h = Math.abs(zoomBox.y - dragStart.y);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
    }
  }, [data, visibleSignals, viewRange, phaseViewRange, cursor, cursor2, zoomBox, isDragging,
      dragStart, isComplex, isAC, logScale, showAllMonteCarlo, xToPx, yToPx]);

  useEffect(() => {
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [draw]);

  const getMousePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const getYRangeForPos = (py) => {
    if (!isAC) return { range: viewRange, isPhase: false };
    const rect = containerRef.current.getBoundingClientRect();
    const magBottom = 20 + (rect.height - 20 - 60 - 20) / 2;
    return py < magBottom
      ? { range: viewRange, isPhase: false }
      : { range: phaseViewRange, isPhase: true };
  };

  const handleMouseDown = (e) => {
    const pos = getMousePos(e);
    setIsDragging(true);
    setDragStart(pos);
    setZoomBox(pos);
    if (isAC) {
      const { isPhase } = getYRangeForPos(pos.y);
      setZoomTarget(isPhase ? 'phase' : 'mag');
    }
  };

  const handleMouseMove = (e) => {
    const pos = getMousePos(e);
    if (isDragging && !measureMode) {
      setZoomBox(pos);
    }
  };

  const handleMouseUp = (e) => {
    if (!isDragging || !dragStart || !zoomBox) {
      setIsDragging(false);
      return;
    }

    const pos = getMousePos(e);
    const rect = containerRef.current.getBoundingClientRect();
    const padding = { top: 20, right: 20, bottom: 50, left: 70 };
    let plotHeight, plotWidth, currentYRange, yPadding;

    if (isAC) {
      plotWidth = rect.width - padding.left - padding.right;
      plotHeight = (rect.height - padding.top - padding.bottom - 20) / 2;
      const { isPhase, range } = getYRangeForPos(pos.y);
      currentYRange = range;
      yPadding = isPhase
        ? { top: 20 + plotHeight + 20, bottom: 50 }
        : { top: 20, bottom: 60 };
    } else {
      plotWidth = rect.width - padding.left - padding.right;
      plotHeight = rect.height - padding.top - padding.bottom;
      yPadding = padding;
      currentYRange = viewRange;
    }

    if (measureMode) {
      if (!cursor) {
        setCursor({ x: pxToX(pos.x, padding, plotWidth), y: pxToY(pos.y, yPadding, plotHeight, currentYRange.yMin, currentYRange.yMax) });
      } else if (!cursor2) {
        setCursor2({ x: pxToX(pos.x, padding, plotWidth), y: pxToY(pos.y, yPadding, plotHeight, currentYRange.yMin, currentYRange.yMax) });
      } else {
        setCursor({ x: pxToX(pos.x, padding, plotWidth), y: pxToY(pos.y, yPadding, plotHeight, currentYRange.yMin, currentYRange.yMax) });
        setCursor2(null);
      }
    } else {
      const dx = Math.abs(pos.x - dragStart.x);
      const dy = Math.abs(pos.y - dragStart.y);

      if (dx > 10 && dy > 10) {
        const x1 = Math.min(dragStart.x, pos.x);
        const x2 = Math.max(dragStart.x, pos.x);
        const y1 = Math.min(dragStart.y, pos.y);
        const y2 = Math.max(dragStart.y, pos.y);

        if (x1 >= padding.left && x2 <= padding.left + plotWidth &&
            y1 >= yPadding.top && y2 <= yPadding.top + plotHeight) {

          const yMin = pxToY(y2, yPadding, plotHeight, currentYRange.yMin, currentYRange.yMax);
          const yMax = pxToY(y1, yPadding, plotHeight, currentYRange.yMin, currentYRange.yMax);

          if (isAC && !getYRangeForPos(pos.y).isPhase) {
            setViewRange({
              xStart: pxToX(x1, padding, plotWidth),
              xEnd: pxToX(x2, padding, plotWidth),
              yMin,
              yMax
            });
          } else if (isAC && getYRangeForPos(pos.y).isPhase) {
            setPhaseViewRange({ yMin, yMax });
          } else {
            setViewRange({
              xStart: pxToX(x1, padding, plotWidth),
              xEnd: pxToX(x2, padding, plotWidth),
              yMin,
              yMax
            });
          }
        }
      }
    }

    setIsDragging(false);
    setDragStart(null);
    setZoomBox(null);
    setZoomTarget(null);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const pos = getMousePos(e);
    const rect = containerRef.current.getBoundingClientRect();
    const padding = { left: 70, right: 20 };
    const plotWidth = rect.width - padding.left - padding.right;
    const x = pxToX(pos.x, padding, plotWidth);
    const factor = e.deltaY > 0 ? 1.2 : 0.8;

    setViewRange(v => {
      let xStart, xEnd;
      if (logScale && isAC && v.xStart > 0) {
        const logStart = Math.log10(v.xStart);
        const logEnd = Math.log10(v.xEnd);
        const logX = Math.log10(Math.max(x, v.xStart * 0.999));
        const ratio = (logX - logStart) / (logEnd - logStart);
        const newLogRange = (logEnd - logStart) * factor;
        xStart = Math.pow(10, logX - newLogRange * ratio);
        xEnd = Math.pow(10, logX + newLogRange * (1 - ratio));
      } else {
        const xRange = (v.xEnd - v.xStart) * factor;
        const ratio = (pos.x - 70) / (rect.width - 90);
        xStart = x - xRange * ratio;
        xEnd = x + xRange * (1 - ratio);
      }

      return {
        ...v,
        xStart,
        xEnd,
        yMin: v.yMin,
        yMax: v.yMax
      };
    });
  };

  const formatX = (v) => {
    if (!header) return v.toExponential(2);
    if (header.plotname === 'Transient Analysis') return formatSI(v, 's');
    if (header.plotname === 'AC Analysis') return formatSI(v, 'Hz');
    return formatSI(v, 'V');
  };

  const formatY = (v, isPhase = false) => {
    if (isPhase) return `${v.toFixed(1)}°`;
    if (isAC && logScale) return `${v.toFixed(1)} dB`;
    return formatSI(v, '');
  };

  const formatSI = (v, unit) => {
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'G' + unit;
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M' + unit;
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(2) + 'k' + unit;
    if (Math.abs(v) >= 1) return v.toFixed(2) + unit;
    if (Math.abs(v) >= 1e-3) return (v * 1e3).toFixed(2) + 'm' + unit;
    if (Math.abs(v) >= 1e-6) return (v * 1e6).toFixed(2) + 'u' + unit;
    if (Math.abs(v) >= 1e-9) return (v * 1e9).toFixed(2) + 'n' + unit;
    if (Math.abs(v) >= 1e-12) return (v * 1e12).toFixed(2) + 'p' + unit;
    return '0' + unit;
  };

  const findNearestIndex = (arr, val) => {
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < val) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(arr[lo - 1] - val) < Math.abs(arr[lo] - val)) lo--;
    return lo;
  };

  const toggleSignal = (key) => {
    const next = new Set(visibleSignals);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setVisibleSignals(next);
  };

  const getMeasurements = () => {
    if (!cursor || !cursor2) return null;
    const dx = cursor2.x - cursor.x;
    const xData = getXData();
    let gain = null, phaseDiff = null;

    if (isAC) {
      const idx1 = findNearestIndex(xData, cursor.x);
      const idx2 = findNearestIndex(xData, cursor2.x);
      const keys = [...visibleSignals].filter(k => k !== 'time' && k !== 'frequency');
      if (keys.length >= 1 && data && data[keys[0]]) {
        const v1 = getValue(data[keys[0]][idx1]);
        const v2 = getValue(data[keys[0]][idx2]);
        gain = 20 * Math.log10(v2.mag / Math.max(v1.mag, 1e-12));
        phaseDiff = v2.phase - v1.phase;
      }
    }

    return {
      deltaX: dx,
      freq: dx !== 0 ? 1 / dx : 0,
      gain,
      phaseDiff
    };
  };

  const handleResetZoom = () => {
    resetZoom();
  };

  if (!simulationResult && !monteCarloResult && !temperatureSweepResult) {
    return (
      <div className="waveform-viewer empty">
        <p>运行仿真以查看波形</p>
      </div>
    );
  }

  const measurements = getMeasurements();

  return (
    <div className="waveform-viewer">
      <div className="waveform-toolbar">
        <div className="waveform-legend">
          {isTemperatureSweep && allDatasets.map((ds, idx) => (
            <div key={idx} className="legend-item active">
              <span className="legend-color" style={{ backgroundColor: ds.color }} />
              <span className="legend-name">{ds.label}</span>
            </div>
          ))}
          {isMonteCarlo && (
            <div className="legend-item active">
              <span className="legend-color" style={{ backgroundColor: '#4a90d9' }} />
              <span className="legend-name">{allDatasets.length} 次运行</span>
            </div>
          )}
          {!isTemperatureSweep && !isMonteCarlo && data && Object.keys(data).filter(k => k !== 'time' && k !== 'frequency').map((key, idx) => (
            <label key={key} className={`legend-item ${visibleSignals.has(key) ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={visibleSignals.has(key)}
                onChange={() => toggleSignal(key)}
              />
              <span className="legend-color" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
              <span className="legend-name">{key}</span>
            </label>
          ))}
        </div>
        <div className="waveform-controls">
          {isMonteCarlo && (
            <button
              className={`btn ${showAllMonteCarlo ? '' : 'active'}`}
              onClick={() => setShowAllMonteCarlo(!showAllMonteCarlo)}
            >
              {showAllMonteCarlo ? '显示全部' : '独立着色'}
            </button>
          )}
          {isAC && (
            <button
              className={`btn ${logScale ? 'active' : ''}`}
              onClick={() => { setLogScale(!logScale); setTimeout(resetZoom, 0); }}
            >
              {logScale ? '线性' : '对数'}
            </button>
          )}
          <button
            className={`btn ${measureMode ? 'active' : ''}`}
            onClick={() => { setMeasureMode(!measureMode); setCursor(null); setCursor2(null); }}
          >
            {measureMode ? '关闭测量' : '测量模式'}
          </button>
          <button className="btn" onClick={() => { setCursor(null); setCursor2(null); }}>
            清除光标
          </button>
          <button className="btn" onClick={handleResetZoom}>
            重置视图
          </button>
        </div>
      </div>

      {measurements && (
        <div className="measurements">
          <span>ΔX: {formatSI(measurements.deltaX, isAC ? 'Hz' : 's')}</span>
          {!isAC && <span>频率: {formatSI(measurements.freq, 'Hz')}</span>}
          {isAC && measurements.gain !== null && (
            <>
              <span>Δ增益: {measurements.gain.toFixed(2)} dB</span>
              <span>Δ相位: {measurements.phaseDiff.toFixed(1)}°</span>
            </>
          )}
        </div>
      )}

      <div ref={containerRef} className="waveform-canvas-container">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{ cursor: measureMode ? 'crosshair' : isDragging ? 'grabbing' : 'crosshair' }}
        />
      </div>

      <div className="waveform-info">
        {isTemperatureSweep && (
          <>
            <span>分析类型: 温度扫描 ({allDatasets.length} 个温度)</span>
            <span>范围: {temperatureSweepResult.temperatures?.join(', ')} °C</span>
          </>
        )}
        {isMonteCarlo && (
          <>
            <span>分析类型: 蒙特卡洛 ({allDatasets.length} 次运行)</span>
            <span>分布: {monteCarloResult.distribution === 'gaussian' ? '高斯' : '均匀'}</span>
          </>
        )}
        {!isTemperatureSweep && !isMonteCarlo && (
          <>
            <span>分析类型: {header?.plotname || '-'}</span>
            <span>点数: {header?.numPoints || 0}</span>
            <span>变量: {header?.numVars || 0}</span>
          </>
        )}
        {isAC && <span>坐标: {logScale ? '对数' : '线性'}</span>}
      </div>
    </div>
  );
}
