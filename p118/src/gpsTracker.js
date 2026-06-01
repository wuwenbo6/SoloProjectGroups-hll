const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

class GPSTracker extends EventEmitter {
  constructor(db) {
    super();
    this.db = db;
    this.currentTrack = null;
    this.gpsData = [];
    this.trackStartTime = null;
    this.trackEndTime = null;
    this.isRecording = false;
    this.videoStartTime = null;
    
    this.defaultSpeedKmh = 60;
    this.earthRadiusKm = 6371;
  }

  startRecording(videoStartTime = null) {
    this.isRecording = true;
    this.gpsData = [];
    this.trackStartTime = Date.now();
    this.videoStartTime = videoStartTime;
    
    this.currentTrack = {
      id: `track_${Date.now()}`,
      startTime: new Date().toISOString(),
      endTime: null,
      pointCount: 0,
      totalDistance: 0,
      avgSpeed: 0,
      maxSpeed: 0
    };
    
    console.log('GPS轨迹记录已开始');
    this.emit('gps:recording_started', this.currentTrack);
    
    return this.currentTrack;
  }

  addPoint(lat, lon, timestamp = null, extraData = {}) {
    if (!this.isRecording) return null;
    
    const point = {
      lat,
      lon,
      timestamp: timestamp || Date.now(),
      videoTimestamp: this.videoStartTime 
        ? (timestamp || Date.now()) - this.videoStartTime 
        : null,
      ...extraData
    };
    
    if (this.gpsData.length > 0) {
      const lastPoint = this.gpsData[this.gpsData.length - 1];
      point.distanceFromLast = this.calculateDistance(
        lastPoint.lat, lastPoint.lon,
        lat, lon
      );
      
      if (point.distanceFromLast > 0) {
        this.currentTrack.totalDistance += point.distanceFromLast;
        
        if (point.timestamp && lastPoint.timestamp) {
          const timeHours = (point.timestamp - lastPoint.timestamp) / 3600000;
          if (timeHours > 0) {
            point.speedKmh = point.distanceFromLast / timeHours;
            this.currentTrack.maxSpeed = Math.max(this.currentTrack.maxSpeed, point.speedKmh);
          }
        }
      }
    } else {
      point.distanceFromLast = 0;
    }
    
    this.gpsData.push(point);
    this.currentTrack.pointCount = this.gpsData.length;
    
    if (this.gpsData.length > 1) {
      this.currentTrack.avgSpeed = this.currentTrack.totalDistance / 
        ((this.gpsData[this.gpsData.length - 1].timestamp - this.gpsData[0].timestamp) / 3600000 || 1);
    }
    
    return point;
  }

  stopRecording() {
    if (!this.isRecording) return null;
    
    this.isRecording = false;
    this.trackEndTime = Date.now();
    this.currentTrack.endTime = new Date().toISOString();
    
    if (this.gpsData.length > 0) {
      this.db.addGPSTrack({
        ...this.currentTrack,
        data: JSON.stringify(this.gpsData)
      });
    }
    
    console.log(`GPS轨迹记录已停止: ${this.currentTrack.pointCount}个点, ${this.currentTrack.totalDistance.toFixed(2)}km`);
    this.emit('gps:recording_stopped', this.currentTrack);
    
    return this.currentTrack;
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return this.earthRadiusKm * c;
  }

  toRad(deg) {
    return deg * (Math.PI / 180);
  }

  toDeg(rad) {
    return rad * (180 / Math.PI);
  }

  getPointAtVideoTimestamp(videoTimestamp) {
    if (!this.gpsData || this.gpsData.length === 0) return null;
    
    let closestPoint = null;
    let closestDiff = Infinity;
    
    for (const point of this.gpsData) {
      if (point.videoTimestamp !== null) {
        const diff = Math.abs(point.videoTimestamp - videoTimestamp);
        if (diff < closestDiff) {
          closestDiff = diff;
          closestPoint = point;
        }
      }
    }
    
    if (closestPoint && closestDiff < 2000) {
      return closestPoint;
    }
    
    return this.interpolatePoint(videoTimestamp);
  }

  interpolatePoint(videoTimestamp) {
    if (this.gpsData.length < 2) return null;
    
    let beforePoint = null;
    let afterPoint = null;
    
    for (let i = 0; i < this.gpsData.length - 1; i++) {
      const p1 = this.gpsData[i];
      const p2 = this.gpsData[i + 1];
      
      if (p1.videoTimestamp !== null && p2.videoTimestamp !== null) {
        if (p1.videoTimestamp <= videoTimestamp && videoTimestamp <= p2.videoTimestamp) {
          beforePoint = p1;
          afterPoint = p2;
          break;
        }
      }
    }
    
    if (!beforePoint || !afterPoint) return null;
    
    const ratio = (videoTimestamp - beforePoint.videoTimestamp) / 
      (afterPoint.videoTimestamp - beforePoint.videoTimestamp);
    
    return {
      lat: beforePoint.lat + (afterPoint.lat - beforePoint.lat) * ratio,
      lon: beforePoint.lon + (afterPoint.lon - beforePoint.lon) * ratio,
      timestamp: beforePoint.timestamp + (afterPoint.timestamp - beforePoint.timestamp) * ratio,
      videoTimestamp,
      interpolated: true
    };
  }

  generateSimulatedTrack(durationSeconds, baseLat, baseLon) {
    const track = [];
    const startTime = Date.now();
    const numPoints = Math.ceil(durationSeconds);
    
    const bearing = Math.random() * 360;
    const speedKmh = this.defaultSpeedKmh + (Math.random() * 40 - 20);
    
    for (let i = 0; i < numPoints; i++) {
      const timeOffset = i * 1000;
      const distanceKm = (speedKmh / 3600) * i / 1000;
      
      const { lat, lon } = this.getDestinationPoint(
        baseLat, baseLon,
        bearing,
        distanceKm
      );
      
      const jitter = 0.00001;
      track.push({
        lat: lat + (Math.random() * jitter * 2 - jitter),
        lon: lon + (Math.random() * jitter * 2 - jitter),
        timestamp: startTime + timeOffset,
        videoTimestamp: timeOffset,
        speedKmh: speedKmh + (Math.random() * 10 - 5),
        distanceFromLast: i > 0 ? this.calculateDistance(
          track[i - 1].lat, track[i - 1].lon,
          lat, lon
        ) : 0
      });
    }
    
    return track;
  }

  getDestinationPoint(lat, lon, bearing, distanceKm) {
    const bearingRad = this.toRad(bearing);
    const angularDistance = distanceKm / this.earthRadiusKm;
    
    const lat2 = Math.asin(
      Math.sin(this.toRad(lat)) * Math.cos(angularDistance) +
      Math.cos(this.toRad(lat)) * Math.sin(angularDistance) * Math.cos(bearingRad)
    );
    
    const lon2 = this.toRad(lon) + Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(this.toRad(lat)),
      Math.cos(angularDistance) - Math.sin(this.toRad(lat)) * Math.sin(lat2)
    );
    
    return {
      lat: this.toDeg(lat2),
      lon: this.toDeg(lon2)
    };
  }

  getTrackById(trackId) {
    return this.db.getGPSTrackById(trackId);
  }

  getTracks(filters = {}) {
    return this.db.getGPSTracks(filters);
  }

  getTrackPoints(trackId) {
    const track = this.db.getGPSTrackById(trackId);
    if (track && track.data) {
      try {
        return JSON.parse(track.data);
      } catch (e) {
        console.error('解析GPS轨迹数据失败:', e);
        return [];
      }
    }
    return [];
  }

  exportToGPX(trackId, outputPath) {
    const track = this.db.getGPSTrackById(trackId);
    if (!track) {
      throw new Error(`轨迹不存在: ${trackId}`);
    }
    
    let points;
    try {
      points = JSON.parse(track.data);
    } catch (e) {
      throw new Error('解析轨迹数据失败');
    }
    
    let gpxContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
    gpxContent += '<gpx version="1.1" creator="DashCamAnalyzer" xmlns="http://www.topografix.com/GPX/1/1">\n';
    gpxContent += '  <trk>\n';
    gpxContent += `    <name>轨迹 ${track.id}</name>\n`;
    gpxContent += '    <trkseg>\n';
    
    for (const point of points) {
      const time = new Date(point.timestamp).toISOString();
      gpxContent += `      <trkpt lat="${point.lat}" lon="${point.lon}">\n`;
      gpxContent += `        <time>${time}</time>\n`;
      if (point.speedKmh !== undefined) {
        gpxContent += `        <speed>${point.speedKmh / 3.6}</speed>\n`;
      }
      gpxContent += '      </trkpt>\n';
    }
    
    gpxContent += '    </trkseg>\n';
    gpxContent += '  </trk>\n';
    gpxContent += '</gpx>';
    
    fs.writeFileSync(outputPath, gpxContent, 'utf-8');
    console.log(`GPX文件已导出: ${outputPath}`);
    
    return outputPath;
  }

  exportToKML(trackId, outputPath) {
    const track = this.db.getGPSTrackById(trackId);
    if (!track) {
      throw new Error(`轨迹不存在: ${trackId}`);
    }
    
    let points;
    try {
      points = JSON.parse(track.data);
    } catch (e) {
      throw new Error('解析轨迹数据失败');
    }
    
    let kmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
    kmlContent += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
    kmlContent += '  <Document>\n';
    kmlContent += `    <name>轨迹 ${track.id}</name>\n`;
    kmlContent += '    <Style id="trackStyle">\n';
    kmlContent += '      <LineStyle>\n';
    kmlContent += '        <color>ff0000ff</color>\n';
    kmlContent += '        <width>3</width>\n';
    kmlContent += '      </LineStyle>\n';
    kmlContent += '    </Style>\n';
    kmlContent += '    <Placemark>\n';
    kmlContent += '      <name>行驶轨迹</name>\n';
    kmlContent += '      <styleUrl>#trackStyle</styleUrl>\n';
    kmlContent += '      <LineString>\n';
    kmlContent += '        <tessellate>1</tessellate>\n';
    kmlContent += '        <coordinates>\n';
    
    for (const point of points) {
      kmlContent += `          ${point.lon},${point.lat},0\n`;
    }
    
    kmlContent += '        </coordinates>\n';
    kmlContent += '      </LineString>\n';
    kmlContent += '    </Placemark>\n';
    kmlContent += '  </Document>\n';
    kmlContent += '</kml>';
    
    fs.writeFileSync(outputPath, kmlContent, 'utf-8');
    console.log(`KML文件已导出: ${outputPath}`);
    
    return outputPath;
  }

  exportToJSON(trackId, outputPath) {
    const track = this.db.getGPSTrackById(trackId);
    if (!track) {
      throw new Error(`轨迹不存在: ${trackId}`);
    }
    
    let points;
    try {
      points = JSON.parse(track.data);
    } catch (e) {
      throw new Error('解析轨迹数据失败');
    }
    
    const output = {
      trackId: track.id,
      startTime: track.startTime,
      endTime: track.endTime,
      pointCount: track.pointCount,
      totalDistance: track.totalDistance,
      avgSpeed: track.avgSpeed,
      maxSpeed: track.maxSpeed,
      points: points.map(p => ({
        lat: p.lat,
        lon: p.lon,
        timestamp: p.timestamp,
        videoTimestamp: p.videoTimestamp,
        speedKmh: p.speedKmh,
        distanceFromLast: p.distanceFromLast
      }))
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`JSON文件已导出: ${outputPath}`);
    
    return outputPath;
  }

  getTrackStatistics(trackId) {
    const track = this.db.getGPSTrackById(trackId);
    if (!track) return null;
    
    let points;
    try {
      points = JSON.parse(track.data);
    } catch (e) {
      return null;
    }
    
    if (points.length === 0) return null;
    
    const speeds = points.filter(p => p.speedKmh !== undefined).map(p => p.speedKmh);
    const distances = points.filter(p => p.distanceFromLast !== undefined).map(p => p.distanceFromLast);
    
    const stats = {
      trackId,
      pointCount: points.length,
      startTime: new Date(points[0].timestamp).toLocaleString(),
      endTime: new Date(points[points.length - 1].timestamp).toLocaleString(),
      durationSeconds: (points[points.length - 1].timestamp - points[0].timestamp) / 1000,
      totalDistance: distances.reduce((a, b) => a + b, 0),
      avgSpeed: speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0,
      maxSpeed: speeds.length > 0 ? Math.max(...speeds) : 0,
      minSpeed: speeds.length > 0 ? Math.min(...speeds) : 0
    };
    
    return stats;
  }

  deleteTrack(trackId) {
    return this.db.deleteGPSTrack(trackId);
  }

  getStatus() {
    return {
      isRecording: this.isRecording,
      currentTrackId: this.currentTrack?.id || null,
      currentPointCount: this.gpsData.length,
      currentTrackDistance: this.currentTrack?.totalDistance || 0,
      trackStartTime: this.trackStartTime
    };
  }
}

module.exports = GPSTracker;
