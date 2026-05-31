const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

class ArtificialPotentialField {
  constructor() {
    this.attractiveGain = 0.8;
    this.repulsiveGain = 15.0;
    this.repulsiveThreshold = 5.0;
    this.boundaryGain = 10.0;
    this.boundaryDistance = 50.0;
    this.maxForce = 3.0;
  }

  calculateAttractiveForce(position, target) {
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const dz = target.z - position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance < 0.1) {
      return { x: 0, y: 0, z: 0 };
    }

    const force = this.attractiveGain * distance;
    return {
      x: (dx / distance) * force,
      y: (dy / distance) * force,
      z: (dz / distance) * force
    };
  }

  calculateRepulsiveForce(position, otherDrones) {
    let totalForce = { x: 0, y: 0, z: 0 };

    otherDrones.forEach(other => {
      const dx = position.x - other.position.x;
      const dy = position.y - other.position.y;
      const dz = position.z - other.position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance < this.repulsiveThreshold && distance > 0.01) {
        const distanceRatio = this.repulsiveThreshold / distance;
        const force = this.repulsiveGain * (distanceRatio - 1) / (distance * distance);
        
        totalForce.x += (dx / distance) * force;
        totalForce.y += (dy / distance) * force;
        totalForce.z += (dz / distance) * force * 0.5;
      }
    });

    return totalForce;
  }

  calculateBoundaryForce(position) {
    let force = { x: 0, y: 0, z: 0 };
    const dist = Math.sqrt(position.x * position.x + position.y * position.y);

    if (dist > this.boundaryDistance) {
      const excess = dist - this.boundaryDistance;
      const angle = Math.atan2(position.y, position.x);
      force.x = -Math.cos(angle) * excess * this.boundaryGain;
      force.y = -Math.sin(angle) * excess * this.boundaryGain;
    }

    if (position.z < 0.5) {
      force.z += (0.5 - position.z) * this.boundaryGain;
    }
    if (position.z > 50) {
      force.z -= (position.z - 50) * this.boundaryGain;
    }

    return force;
  }

  calculateTotalForce(position, target, otherDrones) {
    const attractive = this.calculateAttractiveForce(position, target);
    const repulsive = this.calculateRepulsiveForce(position, otherDrones);
    const boundary = this.calculateBoundaryForce(position);

    let totalForce = {
      x: attractive.x + repulsive.x + boundary.x,
      y: attractive.y + repulsive.y + boundary.y,
      z: attractive.z + repulsive.z + boundary.z
    };

    const magnitude = Math.sqrt(
      totalForce.x * totalForce.x +
      totalForce.y * totalForce.y +
      totalForce.z * totalForce.z
    );

    if (magnitude > this.maxForce) {
      const ratio = this.maxForce / magnitude;
      totalForce.x *= ratio;
      totalForce.y *= ratio;
      totalForce.z *= ratio;
    }

    return totalForce;
  }
}

class BatteryModel {
  constructor(initialCapacity = 100) {
    this.capacity = initialCapacity;
    this.remaining = initialCapacity;
    this.voltage = 12.6;
    this.currentDraw = 0;
    this.temperature = 25;
    
    this.baseIdleCurrent = 0.5;
    this.hoverCurrent = 3.0;
    this.flightCurrent = 5.0;
    this.aggressiveCurrent = 8.0;
    this.lightCurrent = 0.2;
    
    this.temperatureFactor = 1.0;
    this.ageFactor = 1.0;
  }

  update(deltaTime, flightStatus, speedFactor = 1, lightIntensity = 1) {
    let currentDraw = this.baseIdleCurrent;

    switch (flightStatus) {
      case 'idle':
        currentDraw = this.baseIdleCurrent;
        break;
      case 'flying':
        currentDraw = this.hoverCurrent + (this.flightCurrent - this.hoverCurrent) * speedFactor;
        break;
      case 'returning':
        currentDraw = this.flightCurrent;
        break;
      case 'paused':
        currentDraw = this.hoverCurrent * 0.8;
        break;
      default:
        currentDraw = this.baseIdleCurrent;
    }

    currentDraw += this.lightCurrent * lightIntensity;
    currentDraw *= this.temperatureFactor;
    currentDraw *= this.ageFactor;

    this.currentDraw = currentDraw;
    const consumption = (currentDraw * deltaTime) / 3600;
    this.remaining = Math.max(0, this.remaining - consumption);

    this.voltage = 9.0 + (this.remaining / 100) * 3.6;

    return this.remaining;
  }

  getEstimatedFlightTime(flightStatus = 'flying') {
    let currentDraw;
    switch (flightStatus) {
      case 'flying':
        currentDraw = this.flightCurrent;
        break;
      case 'hovering':
        currentDraw = this.hoverCurrent;
        break;
      default:
        currentDraw = this.baseIdleCurrent;
    }
    
    const timeHours = (this.remaining / 100) / (currentDraw / 3600);
    return timeHours * 60;
  }

  reset() {
    this.remaining = this.capacity;
    this.voltage = 12.6;
    this.currentDraw = 0;
  }
}

class Drone {
  constructor(id, homePosition = { x: 0, y: 0, z: 0 }) {
    this.id = id;
    this.homePosition = { ...homePosition };
    this.position = { ...homePosition };
    this.targetPosition = { ...homePosition };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.acceleration = { x: 0, y: 0, z: 0 };
    this.attitude = { roll: 0, pitch: 0, yaw: 0 };
    this.status = 'idle';
    this.waypointIndex = 0;
    this.waypoints = [];
    this.formationOffset = { x: 0, y: 0, z: 0 };
    this.lightColor = { r: 255, g: 0, b: 0 };
    this.lightIntensity = 1;
    this.lastHeartbeat = Date.now();
    this.isOnline = true;
    this.apfForce = { x: 0, y: 0, z: 0 };
    this.maxSpeed = 8;
    this.maxAcceleration = 4;
    
    this.battery = new BatteryModel(100);
    this.potentialField = new ArtificialPotentialField();
    
    this.flightLog = [];
    this.maxLogEntries = 100;
  }

  setTargetPosition(x, y, z) {
    this.targetPosition = { x, y, z };
  }

  setWaypoints(waypoints) {
    this.waypoints = waypoints;
    this.waypointIndex = 0;
    if (waypoints.length > 0) {
      const wp = waypoints[0];
      this.setTargetPosition(wp.x, wp.y, wp.z);
    }
  }

  updateHeartbeat() {
    this.lastHeartbeat = Date.now();
    this.isOnline = true;
  }

  checkOnline(timeoutMs = 5000) {
    this.isOnline = (Date.now() - this.lastHeartbeat) < timeoutMs;
    return this.isOnline;
  }

  calculateAPFForce(allDrones) {
    const otherDrones = allDrones.filter(d => d.id !== this.id && d.isOnline);
    this.apfForce = this.potentialField.calculateTotalForce(
      this.position,
      this.targetPosition,
      otherDrones
    );
    return this.apfForce;
  }

  update(deltaTime, speedMultiplier = 1, allDrones = null) {
    if (allDrones) {
      this.calculateAPFForce(allDrones);
    }

    const targetAccel = {
      x: this.apfForce.x * this.maxAcceleration,
      y: this.apfForce.y * this.maxAcceleration,
      z: this.apfForce.z * this.maxAcceleration
    };

    this.acceleration.x += (targetAccel.x - this.acceleration.x) * 0.2;
    this.acceleration.y += (targetAccel.y - this.acceleration.y) * 0.2;
    this.acceleration.z += (targetAccel.z - this.acceleration.z) * 0.2;

    this.velocity.x += this.acceleration.x * deltaTime * speedMultiplier;
    this.velocity.y += this.acceleration.y * deltaTime * speedMultiplier;
    this.velocity.z += this.acceleration.z * deltaTime * speedMultiplier;

    const speed = Math.sqrt(
      this.velocity.x ** 2 +
      this.velocity.y ** 2 +
      this.velocity.z ** 2
    );

    if (speed > this.maxSpeed * speedMultiplier) {
      const ratio = (this.maxSpeed * speedMultiplier) / speed;
      this.velocity.x *= ratio;
      this.velocity.y *= ratio;
      this.velocity.z *= ratio;
    }

    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
    this.position.z += this.velocity.z * deltaTime;

    const speedFactor = speed / this.maxSpeed;
    this.attitude.pitch = -this.velocity.z * 0.1;
    this.attitude.roll = this.velocity.x * 0.1;
    this.attitude.yaw = Math.atan2(this.velocity.x, this.velocity.y);

    this.velocity.x *= 0.95;
    this.velocity.y *= 0.95;
    this.velocity.z *= 0.95;

    this.battery.update(deltaTime, this.status, speedFactor, this.lightIntensity);

    const distanceToTarget = Math.sqrt(
      (this.targetPosition.x - this.position.x) ** 2 +
      (this.targetPosition.y - this.position.y) ** 2 +
      (this.targetPosition.z - this.position.z) ** 2
    );

    if (distanceToTarget < 1.0 && this.waypoints.length > 0 && this.status === 'flying') {
      this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
      const wp = this.waypoints[this.waypointIndex];
      this.setTargetPosition(wp.x, wp.y, wp.z);
    }

    this.updateHeartbeat();

    if (this.flightLog.length % 10 === 0) {
      this.flightLog.push({
        timestamp: Date.now(),
        position: { ...this.position },
        battery: this.battery.remaining
      });
      if (this.flightLog.length > this.maxLogEntries) {
        this.flightLog.shift();
      }
    }

    return this.position;
  }

  getMavLinkHeartbeat() {
    return {
      type: 'HEARTBEAT',
      systemId: this.id,
      autopilot: 'SIMULATED',
      baseMode: this.getBaseMode(),
      customMode: 0,
      systemStatus: this.getSystemStatus(),
      mavlinkVersion: 2,
      timestamp: Date.now()
    };
  }

  getMavLinkPosition() {
    return {
      type: 'GLOBAL_POSITION_INT',
      systemId: this.id,
      lat: this.position.x * 1e7,
      lon: this.position.y * 1e7,
      alt: this.position.z * 1000,
      relativeAlt: this.position.z * 1000,
      vx: this.velocity.x * 100,
      vy: this.velocity.y * 100,
      vz: this.velocity.z * 100,
      hdg: this.attitude.yaw * 180 / Math.PI,
      timestamp: Date.now()
    };
  }

  getMavLinkAttitude() {
    return {
      type: 'ATTITUDE',
      systemId: this.id,
      roll: this.attitude.roll,
      pitch: this.attitude.pitch,
      yaw: this.attitude.yaw,
      rollspeed: this.velocity.x * 0.1,
      pitchspeed: this.velocity.z * 0.1,
      yawspeed: 0,
      timestamp: Date.now()
    };
  }

  getMavLinkBattery() {
    return {
      type: 'BATTERY_STATUS',
      systemId: this.id,
      voltage: this.battery.voltage,
      current: this.battery.currentDraw,
      remaining: this.battery.remaining,
      currentConsumed: (100 - this.battery.remaining) * 10,
      energyConsumed: (100 - this.battery.remaining) * 100,
      timestamp: Date.now()
    };
  }

  getMavLinkSysStatus() {
    return {
      type: 'SYS_STATUS',
      systemId: this.id,
      onboardControlSensorsPresent: 65535,
      onboardControlSensorsEnabled: 65535,
      onboardControlSensorsHealth: 65535,
      load: 10 + Math.random() * 20,
      voltageBattery: this.battery.voltage,
      currentBattery: this.battery.currentDraw,
      batteryRemaining: this.battery.remaining,
      dropRateComm: 0,
      errorsCount: 0,
      timestamp: Date.now()
    };
  }

  getBaseMode() {
    const modes = {
      'idle': 81,
      'flying': 129,
      'paused': 81,
      'returning': 129
    };
    return modes[this.status] || 81;
  }

  getSystemStatus() {
    if (!this.isOnline) return 'UNINIT';
    if (this.battery.remaining < 10) return 'CRITICAL';
    if (this.battery.remaining < 20) return 'EMERGENCY';
    if (this.status === 'flying') return 'ACTIVE';
    return 'STANDBY';
  }

  reset() {
    this.position = { ...this.homePosition };
    this.targetPosition = { ...this.homePosition };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.acceleration = { x: 0, y: 0, z: 0 };
    this.attitude = { roll: 0, pitch: 0, yaw: 0 };
    this.status = 'idle';
    this.waypointIndex = 0;
    this.apfForce = { x: 0, y: 0, z: 0 };
    this.battery.reset();
    this.updateHeartbeat();
    this.isOnline = true;
    this.flightLog = [];
  }
}

class DroneSimulator extends EventEmitter {
  constructor(wss, db, droneCount = 10) {
    super();
    this.wss = wss;
    this.db = db;
    this.drones = new Map();
    this.isRunning = false;
    this.isPaused = false;
    this.speedMultiplier = 1;
    this.lastUpdate = Date.now();
    this.updateInterval = null;
    this.heartbeatInterval = null;
    this.formationCenter = { x: 0, y: 0, z: 15 };
    this.waypoints = [];
    this.lightConfig = {
      mode: 'static',
      color: '#ff0000',
      frequency: 1
    };
    this.lightTime = 0;
    this.enableCollisionAvoidance = true;
    this.heartbeatTimeout = 5000;

    this.setDroneCount(droneCount);
  }

  setDroneCount(count) {
    const targetCount = Math.max(1, Math.min(100, count));
    
    while (this.drones.size < targetCount) {
      const id = `drone-${uuidv4().slice(0, 8)}`;
      const angle = (this.drones.size / targetCount) * Math.PI * 2;
      const radius = 3 + this.drones.size * 0.5;
      const homePos = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        z: 0
      };
      const drone = new Drone(id, homePos);
      drone.formationOffset = {
        x: homePos.x,
        y: homePos.y,
        z: 10
      };
      this.drones.set(id, drone);
    }

    while (this.drones.size > targetCount) {
      const keys = Array.from(this.drones.keys());
      const lastKey = keys[keys.length - 1];
      this.drones.delete(lastKey);
    }

    this.updateFormationOffsets();
    this.emit('drones_update');
  }

  updateFormationOffsets() {
    const droneArray = Array.from(this.drones.values());
    droneArray.forEach((drone, index) => {
      drone.formationOffset = {
        x: drone.formationOffset.x,
        y: drone.formationOffset.y,
        z: 15
      };
    });
  }

  setFormation(positions) {
    const droneArray = Array.from(this.drones.values());
    droneArray.forEach((drone, index) => {
      if (positions[index]) {
        drone.formationOffset = { ...positions[index] };
        if (this.status !== 'flying') {
          drone.setTargetPosition(
            this.formationCenter.x + positions[index].x,
            this.formationCenter.y + positions[index].y,
            this.formationCenter.z + positions[index].z
          );
        }
      }
    });
    this.emit('drones_update');
  }

  setWaypoints(waypoints) {
    this.waypoints = waypoints;
    const droneArray = Array.from(this.drones.values());
    droneArray.forEach(drone => {
      const droneWaypoints = waypoints.map(wp => ({
        x: wp.x + drone.formationOffset.x,
        y: wp.y + drone.formationOffset.y,
        z: wp.z + drone.formationOffset.z
      }));
      drone.setWaypoints(droneWaypoints);
    });
  }

  setLights(config) {
    this.lightConfig = { ...this.lightConfig, ...config };
  }

  setSpeed(speed) {
    this.speedMultiplier = Math.max(0.1, Math.min(5, speed));
  }

  setCollisionAvoidance(enabled) {
    this.enableCollisionAvoidance = enabled;
  }

  startFlight() {
    this.isRunning = true;
    this.isPaused = false;
    
    this.drones.forEach(drone => {
      drone.status = 'flying';
      drone.setTargetPosition(
        this.formationCenter.x + drone.formationOffset.x,
        this.formationCenter.y + drone.formationOffset.y,
        this.formationCenter.z + drone.formationOffset.z
      );
    });

    if (!this.updateInterval) {
      this.lastUpdate = Date.now();
      this.updateInterval = setInterval(() => this.update(), 50);
    }

    if (!this.heartbeatInterval) {
      this.heartbeatInterval = setInterval(() => this.broadcastHeartbeats(), 1000);
    }
  }

  pauseFlight() {
    this.isPaused = !this.isPaused;
    this.drones.forEach(drone => {
      drone.status = this.isPaused ? 'paused' : 'flying';
    });
  }

  stopFlight() {
    this.isRunning = false;
    this.isPaused = false;
    this.drones.forEach(drone => {
      drone.status = 'idle';
      drone.setTargetPosition(drone.homePosition.x, drone.homePosition.y, drone.homePosition.z);
    });
  }

  returnHome() {
    this.isRunning = true;
    this.isPaused = false;
    this.drones.forEach(drone => {
      drone.status = 'returning';
      drone.setTargetPosition(drone.homePosition.x, drone.homePosition.y, drone.homePosition.z);
    });
  }

  update() {
    const now = Date.now();
    const deltaTime = (now - this.lastUpdate) / 1000;
    this.lastUpdate = now;

    if (this.isPaused) return;

    this.lightTime += deltaTime;

    const allDrones = Array.from(this.drones.values());

    this.drones.forEach((drone, id) => {
      if (this.enableCollisionAvoidance) {
        drone.update(deltaTime, this.speedMultiplier, allDrones);
      } else {
        drone.update(deltaTime, this.speedMultiplier, null);
      }
      
      this.updateDroneLight(drone);

      if (Math.random() < 0.01 && this.db) {
        this.db.logFlightData(id, {
          lat: drone.position.x,
          lng: drone.position.y,
          alt: drone.position.z,
          vx: drone.velocity.x,
          vy: drone.velocity.y,
          vz: drone.velocity.z,
          battery: drone.battery.remaining,
          status: drone.status
        }).catch(console.error);
      }
    });

    this.emit('drones_update');
  }

  broadcastHeartbeats() {
    const heartbeats = [];
    this.drones.forEach(drone => {
      heartbeats.push(drone.getMavLinkHeartbeat());
    });
    
    this.emit('heartbeats', heartbeats);
  }

  checkDroneConnectivity() {
    this.drones.forEach(drone => {
      drone.checkOnline(this.heartbeatTimeout);
    });
  }

  simulateDroneDisconnect(droneId) {
    const drone = this.drones.get(droneId);
    if (drone) {
      drone.isOnline = false;
    }
  }

  simulateDroneReconnect(droneId) {
    const drone = this.drones.get(droneId);
    if (drone) {
      drone.updateHeartbeat();
      drone.isOnline = true;
    }
  }

  updateDroneLight(drone) {
    const config = this.lightConfig;
    const color = this.hexToRgb(config.color);
    
    switch (config.mode) {
      case 'static':
        drone.lightColor = color;
        drone.lightIntensity = 1;
        break;
      case 'pulse':
        const pulse = (Math.sin(this.lightTime * config.frequency * Math.PI * 2) + 1) / 2;
        drone.lightColor = color;
        drone.lightIntensity = 0.3 + pulse * 0.7;
        break;
      case 'rainbow':
        const hue = (this.lightTime * 50 + parseInt(drone.id.slice(-2), 16)) % 360;
        drone.lightColor = this.hsvToRgb(hue, 1, 1);
        drone.lightIntensity = 1;
        break;
      case 'sync':
        const blink = Math.sin(this.lightTime * config.frequency * Math.PI * 2) > 0 ? 1 : 0.2;
        drone.lightColor = color;
        drone.lightIntensity = blink;
        break;
      case 'wave':
        const droneIndex = Array.from(this.drones.keys()).indexOf(drone.id);
        const wave = (Math.sin(this.lightTime * config.frequency * Math.PI * 2 + droneIndex * 0.5) + 1) / 2;
        drone.lightColor = color;
        drone.lightIntensity = 0.3 + wave * 0.7;
        break;
    }
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 0, b: 0 };
  }

  hsvToRgb(h, s, v) {
    h = h / 360;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    
    let r, g, b;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  exportKML() {
    let kml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    kml += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
    kml += '  <Document>\n';
    kml += '    <name>无人机编队飞行轨迹</name>\n';
    kml += '    <description>无人机编队飞行航迹导出</description>\n';
    
    const styles = [
      { id: 'droneOnline', color: 'ff00ff00', scale: 0.5 },
      { id: 'droneOffline', color: 'ff000000', scale: 0.5 },
      { id: 'trajectoryLine', color: '7fff0000', width: 2 },
      { id: 'homePosition', color: 'ffff0000', scale: 0.8 }
    ];
    
    styles.forEach(style => {
      kml += `    <Style id="${style.id}">\n`;
      kml += `      <IconStyle>\n`;
      kml += `        <color>${style.color}</color>\n`;
      kml += `        <scale>${style.scale}</scale>\n`;
      kml += `        <Icon>\n`;
      kml += `          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>\n`;
      kml += `        </Icon>\n`;
      kml += `      </IconStyle>\n`;
      if (style.width) {
        kml += `      <LineStyle>\n`;
        kml += `        <color>${style.color}</color>\n`;
        kml += `        <width>${style.width}</width>\n`;
        kml += `      </LineStyle>\n`;
      }
      kml += `    </Style>\n`;
    });

    kml += '    <Folder>\n';
    kml += '      <name>无人机位置</name>\n';
    
    const baseLat = 39.9042;
    const baseLon = 116.4074;
    const scale = 0.0001;

    this.drones.forEach((drone, id) => {
      const lon = baseLon + drone.position.x * scale;
      const lat = baseLat + drone.position.y * scale;
      const alt = drone.position.z;
      
      kml += '      <Placemark>\n';
      kml += `        <name>${id}</name>\n`;
      kml += `        <styleUrl>#${drone.isOnline ? 'droneOnline' : 'droneOffline'}</styleUrl>\n`;
      kml += '        <description>\n';
      kml += `          <![CDATA[\n`;
      kml += `            <strong>状态:</strong> ${drone.status}<br/>\n`;
      kml += `            <strong>电量:</strong> ${drone.battery.remaining.toFixed(1)}%<br/>\n`;
      kml += `            <strong>电压:</strong> ${drone.battery.voltage.toFixed(2)}V<br/>\n`;
      kml += `            <strong>电流:</strong> ${drone.battery.currentDraw.toFixed(2)}A<br/>\n`;
      kml += `            <strong>速度:</strong> ${Math.sqrt(drone.velocity.x**2 + drone.velocity.y**2 + drone.velocity.z**2).toFixed(2)}m/s\n`;
      kml += `          ]]>\n`;
      kml += '        </description>\n';
      kml += '        <Point>\n';
      kml += `          <coordinates>${lon},${lat},${alt}</coordinates>\n`;
      kml += '        </Point>\n';
      kml += '      </Placemark>\n';
    });
    
    kml += '    </Folder>\n';

    kml += '    <Folder>\n';
    kml += '      <name>飞行轨迹</name>\n';
    
    this.drones.forEach((drone, id) => {
      if (drone.flightLog.length > 1) {
        kml += '      <Placemark>\n';
        kml += `        <name>${id} 轨迹</name>\n`;
        kml += '        <styleUrl>#trajectoryLine</styleUrl>\n';
        kml += '        <LineString>\n';
        kml += '          <extrude>0</extrude>\n';
        kml += '          <tessellate>1</tessellate>\n';
        kml += '          <altitudeMode>absolute</altitudeMode>\n';
        kml += '          <coordinates>\n';
        
        drone.flightLog.forEach(log => {
          const lon = baseLon + log.position.x * scale;
          const lat = baseLat + log.position.y * scale;
          kml += `            ${lon},${lat},${log.position.z}\n`;
        });
        
        kml += '          </coordinates>\n';
        kml += '        </LineString>\n';
        kml += '      </Placemark>\n';
      }
    });
    
    kml += '    </Folder>\n';

    if (this.waypoints.length > 0) {
      kml += '    <Folder>\n';
      kml += '      <name>航点</name>\n';
      
      this.waypoints.forEach((wp, index) => {
        const lon = baseLon + wp.x * scale;
        const lat = baseLat + wp.y * scale;
        const alt = wp.z;
        
        kml += '      <Placemark>\n';
        kml += `        <name>航点 ${index + 1}</name>\n`;
        kml += '        <Point>\n';
        kml += `          <coordinates>${lon},${lat},${alt}</coordinates>\n`;
        kml += '        </Point>\n';
        kml += '      </Placemark>\n';
      });
      
      kml += '    </Folder>\n';
    }

    kml += '    <Folder>\n';
    kml += '      <name>返航点</name>\n';
    
    this.drones.forEach((drone, id) => {
      const lon = baseLon + drone.homePosition.x * scale;
      const lat = baseLat + drone.homePosition.y * scale;
      
      kml += '      <Placemark>\n';
      kml += `        <name>${id} 返航点</name>\n`;
      kml += '        <styleUrl>#homePosition</styleUrl>\n';
      kml += '        <Point>\n';
      kml += `          <coordinates>${lon},${lat},0</coordinates>\n`;
      kml += '        </Point>\n';
      kml += '      </Placemark>\n';
    });
    
    kml += '    </Folder>\n';

    kml += '  </Document>\n';
    kml += '</kml>\n';

    return kml;
  }

  getDronesStatus() {
    const status = [];
    this.drones.forEach((drone, id) => {
      status.push({
        id: drone.id,
        position: { ...drone.position },
        targetPosition: { ...drone.targetPosition },
        velocity: { ...drone.velocity },
        acceleration: { ...drone.acceleration },
        attitude: { ...drone.attitude },
        battery: drone.battery.remaining,
        batteryVoltage: drone.battery.voltage,
        batteryCurrent: drone.battery.currentDraw,
        estimatedFlightTime: drone.battery.getEstimatedFlightTime(),
        status: drone.status,
        isOnline: drone.isOnline,
        lastHeartbeat: drone.lastHeartbeat,
        waypointIndex: drone.waypointIndex,
        lightColor: { ...drone.lightColor },
        lightIntensity: drone.lightIntensity,
        apfForce: { ...drone.apfForce },
        heartbeat: drone.getMavLinkHeartbeat(),
        globalPosition: drone.getMavLinkPosition(),
        attitudeMsg: drone.getMavLinkAttitude(),
        batteryMsg: drone.getMavLinkBattery(),
        sysStatus: drone.getMavLinkSysStatus()
      });
    });
    return status;
  }

  stop() {
    this.isRunning = false;
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

module.exports = DroneSimulator;
