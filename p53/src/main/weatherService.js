const EventEmitter = require('events');

class WeatherService extends EventEmitter {
  constructor() {
    super();
    this.weatherData = {
      wind: [],
      storms: [],
      clouds: []
    };
    this.updateInterval = null;
    this.simulated = true;
  }

  start(updateIntervalMs = 30000) {
    this.generateMockWeather();
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    this.updateInterval = setInterval(() => {
      this.updateWeather();
    }, updateIntervalMs);
  }

  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  generateMockWeather() {
    this.weatherData.storms = [];
    for (let i = 0; i < 5; i++) {
      this.weatherData.storms.push({
        id: `storm-${i}`,
        lat: 30 + Math.random() * 20,
        lon: 105 + Math.random() * 25,
        radius: 20 + Math.random() * 50,
        intensity: 0.3 + Math.random() * 0.7,
        direction: Math.random() * 360,
        speed: 10 + Math.random() * 30
      });
    }
    
    this.weatherData.wind = [];
    for (let lat = 20; lat <= 50; lat += 5) {
      for (let lon = 100; lon <= 130; lon += 5) {
        this.weatherData.wind.push({
          lat,
          lon,
          speed: 5 + Math.random() * 40,
          direction: Math.random() * 360
        });
      }
    }
    
    this.weatherData.clouds = [];
    for (let i = 0; i < 10; i++) {
      this.weatherData.clouds.push({
        id: `cloud-${i}`,
        lat: 25 + Math.random() * 25,
        lon: 105 + Math.random() * 25,
        radius: 50 + Math.random() * 100,
        ceiling: 5000 + Math.random() * 15000,
        floor: 1000 + Math.random() * 3000
      });
    }
  }

  updateWeather() {
    for (const storm of this.weatherData.storms) {
      const rad = storm.direction * Math.PI / 180;
      const speedKmPerSec = storm.speed / 3600;
      
      storm.lat += (speedKmPerSec / 111) * Math.cos(rad);
      storm.lon += (speedKmPerSec / (111 * Math.cos(storm.lat * Math.PI / 180))) * Math.sin(rad);
      
      storm.lat = Math.max(10, Math.min(60, storm.lat));
      storm.lon = Math.max(80, Math.min(150, storm.lon));
      
      storm.intensity = Math.max(0.1, Math.min(1, storm.intensity + (Math.random() - 0.5) * 0.1));
    }
    
    for (const windPt of this.weatherData.wind) {
      windPt.speed = Math.max(0, windPt.speed + (Math.random() - 0.5) * 5);
      windPt.direction = (windPt.direction + (Math.random() - 0.5) * 10 + 360) % 360;
    }
    
    this.emit('weatherUpdate', this.weatherData);
  }

  getWeatherData() {
    return this.weatherData;
  }

  getWindAtLocation(lat, lon, altitude = null) {
    let nearest = null;
    let minDist = Infinity;
    
    for (const windPt of this.weatherData.wind) {
      const dist = this.haversineDistance(lat, lon, windPt.lat, windPt.lon);
      if (dist < minDist) {
        minDist = dist;
        nearest = windPt;
      }
    }
    
    if (!nearest) return null;
    
    return {
      speed: nearest.speed,
      direction: nearest.direction,
      u: nearest.speed * Math.sin(nearest.direction * Math.PI / 180),
      v: nearest.speed * Math.cos(nearest.direction * Math.PI / 180)
    };
  }

  checkStormRisk(lat, lon) {
    const risks = [];
    
    for (const storm of this.weatherData.storms) {
      const dist = this.haversineDistance(lat, lon, storm.lat, storm.lon);
      if (dist < storm.radius * 2) {
        risks.push({
          stormId: storm.id,
          distance: dist,
          intensity: storm.intensity,
          riskLevel: dist < storm.radius ? 'high' : dist < storm.radius * 1.5 ? 'medium' : 'low'
        });
      }
    }
    
    return risks;
  }

  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}

module.exports = WeatherService;
