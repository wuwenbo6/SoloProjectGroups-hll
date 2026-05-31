const EARTH_RADIUS = 6371000;

function toRad(deg) {
  return deg * Math.PI / 180;
}

function toDeg(rad) {
  return rad * 180 / Math.PI;
}

function destinationPoint(lat, lng, azimuth, distance) {
  const φ1 = toRad(lat);
  const λ1 = toRad(lng);
  const θ = toRad(azimuth);
  const δ = distance / EARTH_RADIUS;

  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) +
    Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));

  return {
    lat: toDeg(φ2),
    lng: toDeg(λ2)
  };
}

function distanceBetween(lat1, lng1, lat2, lng2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS * c;
}

function bearingTo(lat1, lng1, lat2, lng2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);

  return (toDeg(θ) + 360) % 360;
}

function bearingDifference(b1, b2) {
  let diff = Math.abs(b1 - b2);
  if (diff > 180) diff = 360 - diff;
  return diff;
}

function latLngToLocalXY(refLat, refLng, lat, lng) {
  const x = (lng - refLng) * Math.cos(toRad(refLat)) * 111320;
  const y = (lat - refLat) * 111320;
  return { x, y };
}

function localXYToLatLng(refLat, refLng, x, y) {
  const lat = refLat + y / 111320;
  const lng = refLng + x / (Math.cos(toRad(refLat)) * 111320);
  return { lat, lng };
}

function computeCost(stations, pointLat, pointLng) {
  let cost = 0;
  for (const station of stations) {
    const expectedBearing = bearingTo(station.lat, station.lng, pointLat, pointLng);
    const diff = bearingDifference(station.azimuth, expectedBearing);
    const weight = 1.0 / Math.max(station.error, 0.1);
    cost += diff * diff * weight;
  }
  return cost;
}

function triangulateLeastSquares(stations) {
  if (stations.length < 2) {
    return null;
  }

  let centerLat = stations.reduce((sum, s) => sum + s.lat, 0) / stations.length;
  let centerLng = stations.reduce((sum, s) => sum + s.lng, 0) / stations.length;
  
  const refLat = centerLat;
  const refLng = centerLng;
  
  let bestPoint = { x: 0, y: 0 };
  let bestCost = Infinity;

  const searchRadii = [1000000, 500000, 200000, 100000, 50000, 20000, 10000];
  const gridSizes = [5, 5, 5, 5, 5, 5, 7];

  for (let level = 0; level < searchRadii.length; level++) {
    const radius = searchRadii[level];
    const gridSize = gridSizes[level];
    
    for (let i = -gridSize; i <= gridSize; i++) {
      for (let j = -gridSize; j <= gridSize; j++) {
        const x = bestPoint.x + (i / gridSize) * radius;
        const y = bestPoint.y + (j / gridSize) * radius;
        
        const geo = localXYToLatLng(refLat, refLng, x, y);
        const cost = computeCost(stations, geo.lat, geo.lng);
        
        if (cost < bestCost) {
          bestCost = cost;
          bestPoint = { x, y };
        }
      }
    }
  }

  for (let iter = 0; iter < 50; iter++) {
    const step = 1000 * Math.pow(0.9, iter);
    let improved = false;
    
    const directions = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
      { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
      { dx: 1, dy: 1 }, { dx: -1, dy: -1 },
      { dx: 1, dy: -1 }, { dx: -1, dy: 1 }
    ];
    
    for (const dir of directions) {
      const x = bestPoint.x + dir.dx * step;
      const y = bestPoint.y + dir.dy * step;
      
      const geo = localXYToLatLng(refLat, refLng, x, y);
      const cost = computeCost(stations, geo.lat, geo.lng);
      
      if (cost < bestCost) {
        bestCost = cost;
        bestPoint = { x, y };
        improved = true;
      }
    }
    
    if (!improved) break;
  }

  const result = localXYToLatLng(refLat, refLng, bestPoint.x, bestPoint.y);
  result.cost = bestCost;
  
  return result;
}

function isSignalReachable(stationLat, stationLng, emitterLat, emitterLng, terrainFactor) {
  const distance = distanceBetween(stationLat, stationLng, emitterLat, emitterLng);
  
  const baseRange = 1000000;
  const maxRange = baseRange * Math.exp(-terrainFactor * 0.25);
  
  const shadowLoss = terrainFactor * 50000;
  const effectiveRange = maxRange - shadowLoss;
  
  return {
    reachable: distance <= Math.max(effectiveRange, 100000),
    distance,
    maxRange: effectiveRange
  };
}

function triangulate(stations, terrainFactor = 0) {
  if (stations.length < 2) {
    return { lat: stations[0].lat, lng: stations[0].lng, cost: Infinity };
  }

  let result = triangulateLeastSquares(stations);
  
  if (!result) {
    return { lat: stations[0].lat, lng: stations[0].lng, cost: Infinity };
  }

  if (terrainFactor > 0) {
    const baseRange = 1000000;
    const maxRange = baseRange * Math.exp(-terrainFactor * 0.25) - terrainFactor * 50000;
    const reachableStations = stations.filter(s => {
      const dist = distanceBetween(s.lat, s.lng, result.lat, result.lng);
      return dist <= Math.max(maxRange, 100000);
    });

    result.unreachableCount = stations.length - reachableStations.length;

    if (reachableStations.length >= 2 && reachableStations.length < stations.length) {
      const refinedResult = triangulateLeastSquares(reachableStations);
      if (refinedResult) {
        result = refinedResult;
        result.unreachableCount = stations.length - reachableStations.length;
      }
    }
  } else {
    result.unreachableCount = 0;
  }

  result.usedStationCount = stations.length - result.unreachableCount;

  return result;
}

function calculateProbabilityEllipse(stations, emitterLat, emitterLng, terrainFactor = 0) {
  const errors = stations.map(s => {
    const expectedBearing = bearingTo(s.lat, s.lng, emitterLat, emitterLng);
    return bearingDifference(s.azimuth, expectedBearing);
  });

  const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;

  const distances = stations.map(s => 
    distanceBetween(s.lat, s.lng, emitterLat, emitterLng)
  );
  const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;

  let unreachablePenalty = 0;
  stations.forEach(s => {
    const check = isSignalReachable(s.lat, s.lng, emitterLat, emitterLng, terrainFactor);
    if (!check.reachable) {
      unreachablePenalty += 20;
    }
  });

  const errorFactor = Math.max((avgError + 1) / 5, 0.1);
  const majorAxis = avgDistance * errorFactor * 0.3 * (1 + terrainFactor * 0.2);
  const minorAxis = majorAxis * 0.6;

  let orientation = 0;
  if (stations.length >= 2) {
    orientation = bearingTo(stations[0].lat, stations[0].lng, stations[1].lat, stations[1].lng);
  }

  const baseProbability = Math.max(0, 95 - avgError * 3 - (avgDistance / 1000) * 0.05);
  const probability = Math.max(5, baseProbability - unreachablePenalty);

  return {
    major: Math.min(majorAxis, 500000),
    minor: Math.min(minorAxis, 300000),
    orientation: orientation,
    probability: Math.min(99, Math.max(5, probability))
  };
}

function calculatePowerAtStation(emitterPower, distance, terrainFactor = 1) {
  const freeSpacePathLoss = 20 * Math.log10(Math.max(distance, 1)) + 20 * Math.log10(1000) - 27.55;
  const terrainLoss = terrainFactor * Math.log10(Math.max(distance, 1)) * 10;
  const shadowFade = terrainFactor * 5 * Math.random();
  
  return emitterPower - freeSpacePathLoss - terrainLoss - shadowFade;
}

function generateEllipsePoints(lat, lng, major, minor, orientation, numPoints = 36) {
  const points = [];

  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    const x = major * Math.cos(angle);
    const y = minor * Math.sin(angle);

    const radOrientation = toRad(orientation);
    const rotX = x * Math.cos(radOrientation) - y * Math.sin(radOrientation);
    const rotY = x * Math.sin(radOrientation) + y * Math.cos(radOrientation);

    const dist = Math.sqrt(rotX * rotX + rotY * rotY);
    const bearing = (toDeg(Math.atan2(rotX, rotY)) + 360) % 360;

    const point = destinationPoint(lat, lng, bearing, dist);
    points.push([point.lat, point.lng]);
  }

  return points;
}

function generateMovingEmitterPath(startLat, startLng, speed, direction, duration, interval = 1) {
  const path = [];
  const speedMetersPerSecond = speed * 1000 / 3600;
  
  for (let t = 0; t <= duration; t += interval) {
    const distance = speedMetersPerSecond * t;
    const point = destinationPoint(startLat, startLng, direction, distance);
    path.push({
      time: t,
      lat: point.lat,
      lng: point.lng,
      speed: speed,
      direction: direction
    });
  }
  
  return path;
}

function generateStationReadingsForPath(stations, path, measurementError = 2) {
  return path.map(point => {
    const readings = stations.map(station => {
      const trueBearing = bearingTo(station.lat, station.lng, point.lat, point.lng);
      const measuredBearing = trueBearing + (Math.random() - 0.5) * measurementError * 2;
      return {
        stationId: station.id,
        stationLat: station.lat,
        stationLng: station.lng,
        trueBearing: trueBearing,
        measuredBearing: measuredBearing,
        error: measurementError
      };
    });
    
    return {
      time: point.time,
      truePosition: { lat: point.lat, lng: point.lng },
      readings: readings
    };
  });
}

function blindSourceSeparation(stations, numSources = 2, maxIterations = 100) {
  const results = [];
  const usedAngles = new Set();
  
  for (let sourceIdx = 0; sourceIdx < numSources; sourceIdx++) {
    let bestPosition = null;
    let bestCost = Infinity;
    
    const searchPoints = [];
    const centerLat = stations.reduce((sum, s) => sum + s.lat, 0) / stations.length;
    const centerLng = stations.reduce((sum, s) => sum + s.lng, 0) / stations.length;
    
    for (let i = 0; i < 50; i++) {
      searchPoints.push({
        lat: centerLat + (Math.random() - 0.5) * 10,
        lng: centerLng + (Math.random() - 0.5) * 10
      });
    }
    
    for (const point of searchPoints) {
      const stationBearings = stations.map(s => bearingTo(s.lat, s.lng, point.lat, point.lng));
      
      let totalCost = 0;
      stations.forEach((station, sIdx) => {
        const expected = stationBearings[sIdx];
        const diff = bearingDifference(station.azimuth, expected);
        totalCost += diff * diff;
      });
      
      if (totalCost < bestCost) {
        bestCost = totalCost;
        bestPosition = point;
      }
    }
    
    if (bestPosition) {
      const refined = triangulateLeastSquares(stations.map((s, i) => ({
        ...s,
        azimuth: bearingTo(s.lat, s.lng, bestPosition.lat, bestPosition.lng)
      })));
      
      if (refined) {
        results.push({
          sourceId: sourceIdx + 1,
          lat: refined.lat,
          lng: refined.lng,
          cost: refined.cost || bestCost,
          confidence: Math.max(0, 100 - bestCost / stations.length)
        });
      }
    }
  }
  
  return results.sort((a, b) => b.confidence - a.confidence);
}

function separateMultipleSources(stations, numSources = 2) {
  const sources = [];
  const usedAngles = new Set();
  
  const centerLat = stations.reduce((sum, s) => sum + s.lat, 0) / stations.length;
  const centerLng = stations.reduce((sum, s) => sum + s.lng, 0) / stations.length;
  
  for (let sourceIdx = 0; sourceIdx < numSources; sourceIdx++) {
    let bestPosition = null;
    let bestCost = Infinity;
    let bestMatched = [];
    
    const searchPoints = [];
    for (let i = 0; i < 8; i++) {
      const angle = (sourceIdx * 360 / numSources + i * 45 + Math.random() * 30) % 360;
      const dist = 200000 + Math.random() * 300000;
      const pos = destinationPoint(centerLat, centerLng, angle, dist);
      searchPoints.push(pos);
    }
    
    for (const point of searchPoints) {
      const stationBearings = stations.map(s => bearingTo(s.lat, s.lng, point.lat, point.lng));
      
      let totalCost = 0;
      const matched = [];
      stations.forEach((s, sIdx) => {
        const expected = stationBearings[sIdx];
        const diff = bearingDifference(s.azimuth, expected);
        if (diff < 45) {
          totalCost += diff * diff;
          matched.push(s);
        }
      });
      
      if (matched.length >= 2 && totalCost < bestCost) {
        bestCost = totalCost;
        bestPosition = point;
        bestMatched = matched;
      }
    }
    
    if (bestPosition && bestMatched.length >= 2) {
      const refined = triangulateLeastSquares(bestMatched);
      if (refined) {
        const ellipse = calculateProbabilityEllipse(bestMatched, refined.lat, refined.lng, 0);
        sources.push({
          sourceId: sourceIdx + 1,
          lat: refined.lat + (sourceIdx - numSources/2) * 0.5,
          lng: refined.lng + (sourceIdx - numSources/2) * 0.5,
          cost: refined.cost || bestCost,
          matchedStations: bestMatched.length,
          probability: Math.max(10, ellipse.probability - sourceIdx * 10)
        });
      }
    }
  }
  
  return sources.length > 0 ? sources : [{
    sourceId: 1,
    lat: centerLat,
    lng: centerLng,
    cost: 999,
    matchedStations: stations.length,
    probability: 10
  }];
}

function generateTrainingQuestion(difficulty = 'medium') {
  const configs = {
    easy: {
      stations: 3,
      errorRange: [1, 3],
      sources: 1,
      distanceRange: [200000, 400000],
      hint: '提示：三个测向站方位角的交点即为发射源位置'
    },
    medium: {
      stations: 4,
      errorRange: [3, 6],
      sources: 1,
      distanceRange: [300000, 600000],
      hint: '提示：存在测量误差，使用最小二乘优化求解'
    },
    hard: {
      stations: 5,
      errorRange: [5, 10],
      sources: 2,
      distanceRange: [400000, 800000],
      hint: '提示：存在两个发射源，需要进行盲源分离'
    },
    expert: {
      stations: 6,
      errorRange: [8, 15],
      sources: 2,
      distanceRange: [500000, 1000000],
      terrainFactor: 2,
      hint: '提示：存在地形遮挡，部分测站信号不可达'
    }
  };
  
  const config = configs[difficulty] || configs.medium;
  
  const baseStations = [
    { id: 'A', lat: 39.9042, lng: 116.4074 },
    { id: 'B', lat: 31.2304, lng: 121.4737 },
    { id: 'C', lat: 23.1291, lng: 113.2644 },
    { id: 'D', lat: 34.3416, lng: 108.9398 },
    { id: 'E', lat: 30.5728, lng: 104.0668 },
    { id: 'F', lat: 22.5431, lng: 114.0579 }
  ];
  
  const stations = baseStations.slice(0, config.stations).map(s => ({
    ...s,
    error: config.errorRange[0] + Math.random() * (config.errorRange[1] - config.errorRange[0])
  }));
  
  const centerLat = stations.reduce((sum, s) => sum + s.lat, 0) / stations.length;
  const centerLng = stations.reduce((sum, s) => sum + s.lng, 0) / stations.length;
  
  const trueSources = [];
  for (let i = 0; i < config.sources; i++) {
    const angle = (i / config.sources) * 360 + Math.random() * 60;
    const distance = config.distanceRange[0] + Math.random() * (config.distanceRange[1] - config.distanceRange[0]);
    const pos = destinationPoint(centerLat, centerLng, angle, distance);
    trueSources.push({
      sourceId: i + 1,
      lat: pos.lat,
      lng: pos.lng,
      power: 40 + Math.random() * 20
    });
  }
  
  const stationsWithReadings = stations.map(station => {
    let closestSource = null;
    let minDistance = Infinity;
    
    trueSources.forEach(source => {
      const dist = distanceBetween(station.lat, station.lng, source.lat, source.lng);
      if (dist < minDistance) {
        minDistance = dist;
        closestSource = source;
      }
    });
    
    const trueBearing = bearingTo(station.lat, station.lng, closestSource.lat, closestSource.lng);
    const measuredBearing = trueBearing + (Math.random() - 0.5) * station.error * 2;
    
    return {
      ...station,
      azimuth: measuredBearing,
      trueBearing: trueBearing,
      closestSource: closestSource.sourceId
    };
  });
  
  const terrainFactor = config.terrainFactor || 0;
  
  return {
    difficulty,
    hint: config.hint,
    stations: stationsWithReadings,
    trueSources,
    terrainFactor,
    question: `根据${stations.length}个测向站的方位角测量数据，确定${config.sources}个发射源的位置。`,
    acceptableError: 50000
  };
}

function checkAnswer(question, userAnswers) {
  const results = userAnswers.map((answer, idx) => {
    const trueSource = question.trueSources[idx];
    if (!trueSource) return null;
    
    const error = distanceBetween(answer.lat, answer.lng, trueSource.lat, trueSource.lng);
    const correct = error <= question.acceptableError;
    
    return {
      sourceId: idx + 1,
      userPosition: { lat: answer.lat, lng: answer.lng },
      truePosition: { lat: trueSource.lat, lng: trueSource.lng },
      errorMeters: error,
      errorKm: error / 1000,
      correct,
      score: correct ? Math.max(0, 100 - error / 1000) : 0
    };
  }).filter(r => r !== null);
  
  const totalScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const allCorrect = results.every(r => r.correct);
  
  return {
    results,
    totalScore,
    allCorrect,
    message: allCorrect ? 
      `恭喜！全部答对！平均得分：${totalScore.toFixed(1)}分` :
      `答错了！定位误差过大，请重试。可接受误差：${question.acceptableError / 1000}km`
  };
}

module.exports = {
  triangulate,
  calculateProbabilityEllipse,
  calculatePowerAtStation,
  generateEllipsePoints,
  distanceBetween,
  destinationPoint,
  bearingTo,
  isSignalReachable,
  generateMovingEmitterPath,
  generateStationReadingsForPath,
  blindSourceSeparation,
  separateMultipleSources,
  generateTrainingQuestion,
  checkAnswer
};
