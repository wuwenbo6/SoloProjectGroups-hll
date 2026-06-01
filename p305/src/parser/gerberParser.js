function parseGerber(content) {
  const lines = content.split(/\r?\n/);
  const result = {
    format: { xFormat: 6, yFormat: 6, xDecimal: 3, yDecimal: 3, unit: 'mm' },
    apertures: {},
    traces: [],
    pads: [],
    regions: [],
    bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    nets: {},
  };

  let currentAperture = null;
  let currentX = 0;
  let currentY = 0;
  let interpolationMode = 'linear';
  let regionMode = false;
  let regionPoints = [];
  let quadrantMode = null;
  let currentMacro = null;
  let macros = {};
  let apertureToNet = {};
  let netCounter = 1;

  function coordToNumber(val, format) {
    const totalLen = format;
    const decimal = format / 2;
    const sign = val.startsWith('-') ? -1 : 1;
    const digits = val.replace(/[+-]/, '');
    if (digits.length < totalLen) {
      const padded = digits.padStart(totalLen, '0');
      return sign * parseFloat(padded) / Math.pow(10, decimal);
    }
    return sign * parseFloat(digits) / Math.pow(10, decimal);
  }

  function updateBounds(x, y, aperture) {
    const r = aperture ? (aperture.params[0] || 0) / 2 : 0;
    result.bounds.minX = Math.min(result.bounds.minX, x - r);
    result.bounds.minY = Math.min(result.bounds.minY, y - r);
    result.bounds.maxX = Math.max(result.bounds.maxX, x + r);
    result.bounds.maxY = Math.max(result.bounds.maxY, y + r);
  }

  function getOrCreateNet(apertureCode) {
    if (!apertureToNet[apertureCode]) {
      apertureToNet[apertureCode] = 'Net_' + netCounter++;
    }
    return apertureToNet[apertureCode];
  }

  function discretizeArc(cx, cy, r, startAngle, endAngle, isCCW) {
    const segments = [];
    const stepSize = 0.05;
    let angleDiff = isCCW ? endAngle - startAngle : startAngle - endAngle;

    if (angleDiff < 0) angleDiff += 2 * Math.PI;
    if (angleDiff > 2 * Math.PI) angleDiff = angleDiff % (2 * Math.PI);

    const numSteps = Math.max(2, Math.ceil(angleDiff / stepSize));
    const step = isCCW ? angleDiff / numSteps : -angleDiff / numSteps;

    for (let i = 0; i < numSteps; i++) {
      const a1 = startAngle + step * i;
      const a2 = startAngle + step * (i + 1);
      segments.push({
        startX: cx + r * Math.cos(a1),
        startY: cy + r * Math.sin(a1),
        endX: cx + r * Math.cos(a2),
        endY: cy + r * Math.sin(a2),
      });
    }
    return segments;
  }

  function createArcSegments(startX, startY, endX, endY, i, j, isCCW) {
    const cx = startX + i;
    const cy = startY + j;
    const dx1 = startX - cx;
    const dy1 = startY - cy;
    const dx2 = endX - cx;
    const dy2 = endY - cy;

    const r = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    if (r < 0.0001) return [{ startX, startY, endX, endY }];

    const startAngle = Math.atan2(dy1, dx1);
    const endAngle = Math.atan2(dy2, dx2);

    return discretizeArc(cx, cy, r, startAngle, endAngle, isCCW);
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line || line.startsWith('G04') || line.startsWith('%')) {
      if (line.startsWith('%FS')) {
        const fsMatch = line.match(/FS([LA])([TI])X(\d)(\d)Y(\d)(\d)/);
        if (fsMatch) {
          result.format.xFormat = parseInt(fsMatch[3]) + parseInt(fsMatch[4]);
          result.format.yFormat = parseInt(fsMatch[5]) + parseInt(fsMatch[6]);
          result.format.xDecimal = parseInt(fsMatch[4]);
          result.format.yDecimal = parseInt(fsMatch[6]);
        }
      } else if (line.startsWith('%MO')) {
        if (line.includes('MM')) result.format.unit = 'mm';
        else if (line.includes('IN')) result.format.unit = 'in';
      } else if (line.startsWith('%AM')) {
        currentMacro = line.substring(3).split('*')[0];
        macros[currentMacro] = { primitives: [] };
        let macroContent = line.substring(3 + currentMacro.length + 1);
        if (macroContent) {
          macros[currentMacro].primitives.push(macroContent.replace(/%/g, '').trim());
        }
        continue;
      } else if (line.startsWith('%ADD')) {
        const addMatch = line.match(/ADD(\d+)([CROS][^,*]*)(?:,([^*]*))?\*/);
        if (addMatch) {
          const code = parseInt(addMatch[1]);
          const shape = addMatch[2].charAt(0);
          const paramStr = addMatch[3] || '';
          const params = paramStr ? paramStr.split('X').map(Number) : [];
          result.apertures[code] = { shape, params, code };

          if (addMatch[2].length > 1 && addMatch[2].charAt(0) !== 'C' && addMatch[2].charAt(0) !== 'R' && addMatch[2].charAt(0) !== 'O' && addMatch[2].charAt(0) !== 'S') {
            const macroName = addMatch[2];
            result.apertures[code].macroName = macroName;
            result.apertures[code].macroParams = params;
          }
        }
      } else if (currentMacro && !line.startsWith('%')) {
        macros[currentMacro].primitives.push(line.replace(/%/g, '').trim());
        if (line.endsWith('%')) currentMacro = null;
        continue;
      }
      if (line.endsWith('%') && currentMacro) {
        currentMacro = null;
      }
      continue;
    }

    if (line.startsWith('G54D') || line.startsWith('G55D')) {
      const dMatch = line.match(/D(\d+)/);
      if (dMatch) currentAperture = parseInt(dMatch[1]);
      continue;
    }

    if (line.startsWith('G36')) { regionMode = true; regionPoints = []; continue; }
    if (line.startsWith('G37')) {
      regionMode = false;
      if (regionPoints.length > 2) {
        result.regions.push({ points: [...regionPoints], aperture: currentAperture });
      }
      regionPoints = [];
      continue;
    }
    if (line.startsWith('G01')) { interpolationMode = 'linear'; continue; }
    if (line.startsWith('G02')) { interpolationMode = 'cw'; continue; }
    if (line.startsWith('G03')) { interpolationMode = 'ccw'; continue; }
    if (line.startsWith('G74')) { quadrantMode = 'single'; continue; }
    if (line.startsWith('G75')) { quadrantMode = 'multi'; continue; }
    if (line.startsWith('G70')) { result.format.unit = 'in'; continue; }
    if (line.startsWith('G71')) { result.format.unit = 'mm'; continue; }
    if (line.startsWith('G90')) continue;
    if (line.startsWith('G91')) continue;
    if (line.startsWith('LPD') || line.startsWith('LPC')) continue;
    if (line.startsWith('LMN') || line.startsWith('LMC') || line.startsWith('LPR')) continue;
    if (line.startsWith('LR') || line.startsWith('LS')) continue;
    if (line.startsWith('SR')) continue;

    const xMatch = line.match(/X([+-]?\d+)/);
    const yMatch = line.match(/Y([+-]?\d+)/);
    const iMatch = line.match(/I([+-]?\d+)/);
    const jMatch = line.match(/J([+-]?\d+)/);

    const prevX = currentX;
    const prevY = currentY;

    let newX = xMatch ? coordToNumber(xMatch[1], result.format.xFormat) : currentX;
    let newY = yMatch ? coordToNumber(yMatch[1], result.format.yFormat) : currentY;
    let offsetI = iMatch ? coordToNumber(iMatch[1], result.format.xFormat) : 0;
    let offsetJ = jMatch ? coordToNumber(jMatch[1], result.format.yFormat) : 0;

    currentX = newX;
    currentY = newY;

    if (line.includes('D01')) {
      const aperture = result.apertures[currentAperture];
      if (aperture) {
        const net = getOrCreateNet(currentAperture);
        if (!result.nets[net]) result.nets[net] = { traces: [], pads: [] };

        const isArc = (interpolationMode === 'cw' || interpolationMode === 'ccw') && (offsetI !== 0 || offsetJ !== 0);

        if (isArc) {
          const arcSegments = createArcSegments(prevX, prevY, newX, newY, offsetI, offsetJ, interpolationMode === 'ccw');
          for (const seg of arcSegments) {
            const trace = {
              type: 'trace',
              startX: seg.startX,
              startY: seg.startY,
              endX: seg.endX,
              endY: seg.endY,
              aperture: currentAperture,
              width: getApertureWidth(aperture),
              interpolation: 'linear',
              isArcSegment: true,
              net: net,
            };

            if (regionMode) {
              regionPoints.push({ x: seg.endX, y: seg.endY });
            } else {
              result.traces.push(trace);
              result.nets[net].traces.push(trace);
              updateBounds(trace.startX, trace.startY, aperture);
              updateBounds(trace.endX, trace.endY, aperture);
            }
          }
        } else {
          const trace = {
            type: 'trace',
            startX: prevX,
            startY: prevY,
            endX: newX,
            endY: newY,
            aperture: currentAperture,
            width: getApertureWidth(aperture),
            interpolation: interpolationMode,
            net: net,
          };

          if (regionMode) {
            regionPoints.push({ x: newX, y: newY });
          } else {
            result.traces.push(trace);
            result.nets[net].traces.push(trace);
            updateBounds(trace.startX, trace.startY, aperture);
            updateBounds(trace.endX, trace.endY, aperture);
          }
        }
      }
    } else if (line.includes('D03')) {
      const aperture = result.apertures[currentAperture];
      if (aperture) {
        const net = getOrCreateNet(currentAperture);
        if (!result.nets[net]) result.nets[net] = { traces: [], pads: [] };

        const pad = {
          type: 'pad',
          x: currentX,
          y: currentY,
          aperture: currentAperture,
          shape: aperture.shape,
          params: aperture.params,
          width: getApertureWidth(aperture),
          height: getApertureHeight(aperture),
          net: net,
        };
        result.pads.push(pad);
        result.nets[net].pads.push(pad);
        updateBounds(currentX, currentY, aperture);
      }
    } else if (line.includes('D02')) {
      if (regionMode) {
        regionPoints.push({ x: currentX, y: currentY });
      }
    } else {
      if (line.match(/^D(\d+)/)) {
        const dMatch = line.match(/^D(\d+)/);
        if (dMatch) currentAperture = parseInt(dMatch[1]);
      }
    }
  }

  if (result.bounds.minX === Infinity) {
    result.bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  }

  return result;
}

function getApertureWidth(aperture) {
  switch (aperture.shape) {
    case 'C': return aperture.params[0] || 0;
    case 'R': return aperture.params[0] || 0;
    case 'O': return aperture.params[0] || 0;
    case 'S': return aperture.params[0] || 0;
    default: return aperture.params[0] || 0;
  }
}

function getApertureHeight(aperture) {
  switch (aperture.shape) {
    case 'C': return aperture.params[0] || 0;
    case 'R': return aperture.params.length > 1 ? aperture.params[1] : aperture.params[0] || 0;
    case 'O': return aperture.params.length > 1 ? aperture.params[1] : aperture.params[0] || 0;
    case 'S': return aperture.params.length > 1 ? aperture.params[1] : aperture.params[0] || 0;
    default: return aperture.params[0] || 0;
  }
}

module.exports = { parseGerber };
