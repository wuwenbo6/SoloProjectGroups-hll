const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class DroneDatabase {
  constructor(dbPath = null) {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const dbFile = dbPath || path.join(dataDir, 'db.json');
    const adapter = new JSONFile(dbFile);
    
    const defaultData = {
      formations: [],
      flightLogs: []
    };
    
    this.db = new Low(adapter, defaultData);
    this.init();
  }

  async init() {
    await this.db.read();
  }

  async saveFormation(name, description, droneCount, positions, waypoints = null, lightConfig = null) {
    await this.db.read();
    
    const id = uuidv4();
    const formation = {
      id,
      name,
      description: description || '',
      droneCount,
      positions,
      waypoints: waypoints || [],
      lightConfig: lightConfig || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.db.data.formations.push(formation);
    await this.db.write();
    
    return formation;
  }

  async updateFormation(id, name, description, droneCount, positions, waypoints = null, lightConfig = null) {
    await this.db.read();
    
    const index = this.db.data.formations.findIndex(f => f.id === id);
    if (index === -1) return false;
    
    this.db.data.formations[index] = {
      ...this.db.data.formations[index],
      name,
      description: description || '',
      droneCount,
      positions,
      waypoints: waypoints || this.db.data.formations[index].waypoints,
      lightConfig: lightConfig || this.db.data.formations[index].lightConfig,
      updatedAt: new Date().toISOString()
    };
    
    await this.db.write();
    return true;
  }

  async getFormation(id) {
    await this.db.read();
    const formation = this.db.data.formations.find(f => f.id === id);
    
    if (formation) {
      return {
        ...formation,
        createdAt: formation.createdAt,
        updatedAt: formation.updatedAt
      };
    }
    return null;
  }

  async getAllFormations() {
    await this.db.read();
    return this.db.data.formations.map(f => ({
      id: f.id,
      name: f.name,
      description: f.description,
      droneCount: f.droneCount,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt
    })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async deleteFormation(id) {
    await this.db.read();
    const initialLength = this.db.data.formations.length;
    this.db.data.formations = this.db.data.formations.filter(f => f.id !== id);
    await this.db.write();
    return this.db.data.formations.length < initialLength;
  }

  async logFlightData(droneId, data) {
    await this.db.read();
    
    const logEntry = {
      id: uuidv4(),
      droneId,
      timestamp: new Date().toISOString(),
      lat: data.lat || null,
      lng: data.lng || null,
      alt: data.alt || null,
      vx: data.vx || null,
      vy: data.vy || null,
      vz: data.vz || null,
      battery: data.battery || null,
      status: data.status || null
    };
    
    this.db.data.flightLogs.push(logEntry);
    
    if (this.db.data.flightLogs.length > 10000) {
      this.db.data.flightLogs = this.db.data.flightLogs.slice(-5000);
    }
    
    await this.db.write();
  }

  async getFlightLogs(droneId, limit = 100) {
    await this.db.read();
    return this.db.data.flightLogs
      .filter(log => log.droneId === droneId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  close() {
  }
}

module.exports = DroneDatabase;
