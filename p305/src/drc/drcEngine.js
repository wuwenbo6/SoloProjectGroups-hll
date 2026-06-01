function runDRC(parsedData, rules) {
  const violations = [];
  const { traces, pads, regions, apertures } = parsedData;

  const minWidth = rules.minLineWidth || 0.1;
  const minSpacing = rules.minSpacing || 0.1;
  const minAnnularRing = rules.minAnnularRing || 0.05;
  const drillSize = rules.drillSize || 0.2;
  const minMicroviaDiameter = rules.minMicroviaDiameter || 0.05;
  const maxMicroviaDiameter = rules.maxMicroviaDiameter || 0.15;
  const minMicroviaAnnularRing = rules.minMicroviaAnnularRing || 0.02;
  const minMicroviaSpacing = rules.minMicroviaSpacing || 0.2;
  const microviaDiameterThreshold = rules.microviaDiameterThreshold || 0.15;

  checkLineWidth(traces, apertures, minWidth, violations);
  checkSpacingDifferentNets(traces, pads, minSpacing, violations);
  checkAnnularRing(pads, apertures, drillSize, minAnnularRing, violations);
  checkPadToTraceSpacingDifferentNets(pads, traces, minSpacing, violations);
  checkRegionSpacing(regions, traces, pads, minSpacing, violations);
  checkMicrovias(pads, apertures, minMicroviaDiameter, maxMicroviaDiameter, minMicroviaAnnularRing, minMicroviaSpacing, microviaDiameterThreshold, violations);

  return {
    violations,
    summary: {
      total: violations.length,
      lineWidth: violations.filter(v => v.type === 'line_width').length,
      spacing: violations.filter(v => v.type === 'spacing').length,
      annularRing: violations.filter(v => v.type === 'annular_ring').length,
      microvia: violations.filter(v => v.type === 'microvia').length,
    },
  };
}

function checkLineWidth(traces, apertures, minWidth, violations) {
  for (const trace of traces) {
    const aperture = apertures[trace.aperture];
    if (!aperture) continue;

    let width;
    if (aperture.shape === 'C') {
      width = aperture.params[0];
    } else if (aperture.shape === 'R') {
      width = Math.min(aperture.params[0], aperture.params[1] || aperture.params[0]);
    } else {
      width = aperture.params[0];
    }

    if (width < minWidth) {
      violations.push({
        type: 'line_width',
        severity: 'error',
        message: `线宽 ${width.toFixed(4)}mm 小于最小要求 ${minWidth}mm [${trace.net || '未知网络'}]`,
        x: (trace.startX + trace.endX) / 2,
        y: (trace.startY + trace.endY) / 2,
        actual: width,
        required: minWidth,
        element: 'trace',
        net: trace.net,
        startX: trace.startX,
        startY: trace.startY,
        endX: trace.endX,
        endY: trace.endY,
        aperture: trace.aperture,
      });
    }
  }
}

function checkSpacingDifferentNets(traces, pads, minSpacing, violations) {
  for (let i = 0; i < traces.length; i++) {
    for (let j = i + 1; j < traces.length; j++) {
      const t1 = traces[i];
      const t2 = traces[j];

      if (t1.net === t2.net && t1.net != null) {
        continue;
      }

      const dist = segmentToSegmentDistance(
        t1.startX, t1.startY, t1.endX, t1.endY,
        t2.startX, t2.startY, t2.endX, t2.endY,
      );
      const clearance = dist - (t1.width + t2.width) / 2;

      if (clearance < minSpacing) {
        const midX1 = (t1.startX + t1.endX) / 2;
        const midY1 = (t1.startY + t1.endY) / 2;
        const midX2 = (t2.startX + t2.endX) / 2;
        const midY2 = (t2.startY + t2.endY) / 2;

        violations.push({
          type: 'spacing',
          severity: 'error',
          message: `线路间距 ${clearance.toFixed(4)}mm 小于最小要求 ${minSpacing}mm [${t1.net || 'NetA'} vs ${t2.net || 'NetB'}]`,
          x: (midX1 + midX2) / 2,
          y: (midY1 + midY2) / 2,
          actual: clearance,
          required: minSpacing,
          element: 'trace-trace',
          net1: t1.net,
          net2: t2.net,
          trace1: { startX: t1.startX, startY: t1.startY, endX: t1.endX, endY: t1.endY, aperture: t1.aperture },
          trace2: { startX: t2.startX, startY: t2.startY, endX: t2.endX, endY: t2.endY, aperture: t2.aperture },
        });
      }
    }
  }

  for (let i = 0; i < pads.length; i++) {
    for (let j = i + 1; j < pads.length; j++) {
      const p1 = pads[i];
      const p2 = pads[j];

      if (p1.net === p2.net && p1.net != null) {
        continue;
      }

      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const centerDist = Math.sqrt(dx * dx + dy * dy);
      const halfW1 = (p1.width || 0) / 2;
      const halfW2 = (p2.width || 0) / 2;
      const clearance = centerDist - halfW1 - halfW2;

      if (clearance < minSpacing) {
        violations.push({
          type: 'spacing',
          severity: 'error',
          message: `焊盘间距 ${clearance.toFixed(4)}mm 小于最小要求 ${minSpacing}mm [${p1.net || 'NetA'} vs ${p2.net || 'NetB'}]`,
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2,
          actual: clearance,
          required: minSpacing,
          element: 'pad-pad',
          net1: p1.net,
          net2: p2.net,
          pad1: { x: p1.x, y: p1.y, aperture: p1.aperture },
          pad2: { x: p2.x, y: p2.y, aperture: p2.aperture },
        });
      }
    }
  }
}

function checkPadToTraceSpacingDifferentNets(pads, traces, minSpacing, violations) {
  for (const pad of pads) {
    for (const trace of traces) {
      if (pad.net === trace.net && pad.net != null) {
        continue;
      }

      const dist = pointToSegmentDistance(pad.x, pad.y, trace.startX, trace.startY, trace.endX, trace.endY);
      const halfPadW = (pad.width || 0) / 2;
      const halfTraceW = (trace.width || 0) / 2;
      const clearance = dist - halfPadW - halfTraceW;

      if (clearance < minSpacing) {
        violations.push({
          type: 'spacing',
          severity: 'error',
          message: `焊盘-线路间距 ${clearance.toFixed(4)}mm 小于最小要求 ${minSpacing}mm [${pad.net || 'NetA'} vs ${trace.net || 'NetB'}]`,
          x: pad.x,
          y: pad.y,
          actual: clearance,
          required: minSpacing,
          element: 'pad-trace',
          net1: pad.net,
          net2: trace.net,
          pad: { x: pad.x, y: pad.y, aperture: pad.aperture },
          trace: { startX: trace.startX, startY: trace.startY, endX: trace.endX, endY: trace.endY, aperture: trace.aperture },
        });
      }
    }
  }
}

function checkAnnularRing(pads, apertures, drillSize, minAnnularRing, violations) {
  for (const pad of pads) {
    const aperture = apertures[pad.aperture];
    if (!aperture) continue;

    let padRadius;
    if (aperture.shape === 'C') {
      padRadius = aperture.params[0] / 2;
    } else if (aperture.shape === 'R') {
      padRadius = Math.min(aperture.params[0], aperture.params[1] || aperture.params[0]) / 2;
    } else if (aperture.shape === 'O') {
      padRadius = Math.min(aperture.params[0], aperture.params[1] || aperture.params[0]) / 2;
    } else {
      padRadius = aperture.params[0] / 2;
    }

    const drillRadius = drillSize / 2;
    const annularRing = padRadius - drillRadius;

    if (annularRing < minAnnularRing) {
      violations.push({
        type: 'annular_ring',
        severity: 'error',
        message: `环宽 ${annularRing.toFixed(4)}mm 小于最小要求 ${minAnnularRing}mm [${pad.net || '未知网络'}]`,
        x: pad.x,
        y: pad.y,
        actual: annularRing,
        required: minAnnularRing,
        element: 'pad',
        net: pad.net,
        pad: { x: pad.x, y: pad.y, aperture: pad.aperture, shape: pad.shape },
        padRadius,
        drillRadius,
      });
    }
  }
}

function checkRegionSpacing(regions, traces, pads, minSpacing, violations) {
  for (const region of regions) {
    const regionCenter = getPolygonCentroid(region.points);

    for (const trace of traces) {
      for (const point of region.points) {
        const dist = pointToSegmentDistance(point.x, point.y, trace.startX, trace.startY, trace.endX, trace.endY);
        const halfTraceW = (trace.width || 0) / 2;
        const clearance = dist - halfTraceW;

        if (clearance < minSpacing && clearance > -0.001) {
          violations.push({
            type: 'spacing',
            severity: 'warning',
            message: `铜区-线路间距 ${clearance.toFixed(4)}mm 可能不足 ${minSpacing}mm`,
            x: point.x,
            y: point.y,
            actual: clearance,
            required: minSpacing,
            element: 'region-trace',
          });
          break;
        }
      }
    }

    for (const pad of pads) {
      const dist = pointToPolygonDistance(pad.x, pad.y, region.points);
      const halfPadW = (pad.width || 0) / 2;
      const clearance = dist - halfPadW;

      if (clearance < minSpacing && clearance > -0.001) {
        violations.push({
          type: 'spacing',
          severity: 'warning',
          message: `铜区-焊盘间距 ${clearance.toFixed(4)}mm 可能不足 ${minSpacing}mm`,
          x: pad.x,
          y: pad.y,
          actual: clearance,
          required: minSpacing,
          element: 'region-pad',
        });
      }
    }
  }
}

function segmentToSegmentDistance(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d1 = pointToSegmentDistance(x1, y1, x3, y3, x4, y4);
  const d2 = pointToSegmentDistance(x2, y2, x3, y3, x4, y4);
  const d3 = pointToSegmentDistance(x3, y3, x1, y1, x2, y2);
  const d4 = pointToSegmentDistance(x4, y4, x1, y1, x2, y2);

  return Math.min(d1, d2, d3, d4);
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const ddx = px - x1;
    const ddy = py - y1;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const ddx = px - closestX;
  const ddy = py - closestY;

  return Math.sqrt(ddx * ddx + ddy * ddy);
}

function pointToPolygonDistance(px, py, points) {
  let minDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const dist = pointToSegmentDistance(px, py, points[i].x, points[i].y, points[j].x, points[j].y);
    minDist = Math.min(minDist, dist);
  }
  return minDist;
}

function getPolygonCentroid(points) {
  let cx = 0, cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / points.length, y: cy / points.length };
}

function isMicrovia(pad, aperture, diameterThreshold) {
  if (!aperture || aperture.shape !== 'C') return false;
  const diam = aperture.params[0] || 0;
  return diam > 0 && diam <= diameterThreshold;
}

function checkMicrovias(pads, apertures, minDiam, maxDiam, minAnnular, minSpacing, diamThreshold, violations) {
  const microvias = [];

  for (const pad of pads) {
    const aperture = apertures[pad.aperture];
    if (!isMicrovia(pad, aperture, diamThreshold)) continue;

    const padDiam = aperture.params[0];

    if (padDiam < minDiam) {
      violations.push({
        type: 'microvia',
        subType: 'diameter_too_small',
        severity: 'error',
        message: `微孔直径 ${padDiam.toFixed(4)}mm 小于最小要求 ${minDiam}mm [${pad.net || '未知'}]`,
        x: pad.x,
        y: pad.y,
        actual: padDiam,
        required: minDiam,
        element: 'microvia',
        net: pad.net,
        pad: { x: pad.x, y: pad.y, aperture: pad.aperture },
      });
    }

    if (padDiam > maxDiam) {
      violations.push({
        type: 'microvia',
        subType: 'diameter_too_large',
        severity: 'warning',
        message: `微孔直径 ${padDiam.toFixed(4)}mm 大于最大要求 ${maxDiam}mm [${pad.net || '未知网络'}]`,
        x: pad.x,
        y: pad.y,
        actual: padDiam,
        required: maxDiam,
        element: 'microvia',
        net: pad.net,
        pad: { x: pad.x, y: pad.y, aperture: pad.aperture },
      });
    }

    const drillRadius = padDiam / 2;
    const padRadius = aperture.params[0] / 2;
    const annular = padRadius - drillRadius;

    if (annular < minAnnular) {
      violations.push({
        type: 'microvia',
        subType: 'annular_ring',
        severity: 'error',
        message: `微孔环宽 ${annular.toFixed(4)}mm 小于最小要求 ${minAnnular}mm [${pad.net || '未知网络'}]`,
        x: pad.x,
        y: pad.y,
        actual: annular,
        required: minAnnular,
        element: 'microvia',
        net: pad.net,
        pad: { x: pad.x, y: pad.y, aperture: pad.aperture },
        padRadius,
        drillRadius,
      });
    }

    microvias.push(pad);
  }

  for (let i = 0; i < microvias.length; i++) {
    for (let j = i + 1; j < microvias.length; j++) {
      const p1 = microvias[i];
      const p2 = microvias[j];

      if (p1.net === p2.net && p1.net != null) continue;

      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const centerDist = Math.sqrt(dx * dx + dy * dy);
      const a1 = apertures[p1.aperture];
      const a2 = apertures[p2.aperture];
      const r1 = a1.params[0] / 2;
      const r2 = a2.params[0] / 2;
      const clearance = centerDist - r1 - r2;

      if (clearance < minSpacing) {
        violations.push({
          type: 'microvia',
          subType: 'spacing',
          severity: 'error',
          message: `微孔间距 ${clearance.toFixed(4)}mm 小于最小要求 ${minSpacing}mm [${p1.net || 'NetA'} vs ${p2.net || 'NetB'}]`,
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2,
          actual: clearance,
          required: minSpacing,
          element: 'microvia-spacing',
          net1: p1.net,
          net2: p2.net,
          pad1: { x: p1.x, y: p1.y, aperture: p1.aperture },
          pad2: { x: p2.x, y: p2.y, aperture: p2.aperture },
        });
      }
    }
  }
}

module.exports = { runDRC };

