const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'history.json');

let historyData = [];

if (fs.existsSync(dataPath)) {
  try {
    const content = fs.readFileSync(dataPath, 'utf8');
    historyData = JSON.parse(content);
  } catch (e) {
    historyData = [];
  }
}

function saveData() {
  fs.writeFileSync(dataPath, JSON.stringify(historyData, null, 2));
}

function saveHistory(data) {
  const id = historyData.length > 0 ? historyData[historyData.length - 1].id + 1 : 1;
  
  const record = {
    id,
    timestamp: new Date().toISOString(),
    emitter_lat: data.emitterLat,
    emitter_lng: data.emitterLng,
    probability: data.probability,
    ellipse_major: data.ellipseMajor,
    ellipse_minor: data.ellipseMinor,
    ellipse_orientation: data.ellipseOrientation,
    power: data.power,
    terrain_factor: data.terrainFactor,
    stations: data.stations.map(s => ({
      station_id: s.id,
      station_lat: s.lat,
      station_lng: s.lng,
      azimuth: s.azimuth,
      error: s.error
    }))
  };
  
  historyData.push(record);
  saveData();
  return id;
}

function getHistory(limit = 50) {
  return [...historyData].reverse().slice(0, limit);
}

function getHistoryById(id) {
  return historyData.find(r => r.id === parseInt(id)) || null;
}

module.exports = {
  saveHistory,
  getHistory,
  getHistoryById
};
