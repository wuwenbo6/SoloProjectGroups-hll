const EventEmitter = require('events');
const { spawn } = require('child_process');
const { RDSDataValidator, RDSReassemblyBuffer } = require('./audioProcessor');

class RDSDecoder extends EventEmitter {
  constructor(options = {}) {
    super();
    this.rdsProcess = null;
    this.reassemblyBuffer = new RDSReassemblyBuffer();
    
    this.currentStation = {
      name: '',
      type: 'Unknown',
      text: '',
      programType: 0,
      pi: null
    };
    
    this.programTypes = this.loadProgramTypes();
    this.stats = {
      totalGroups: 0,
      validGroups: 0,
      invalidGroups: 0,
      errors: {}
    };
    
    this.enableReassembly = options.enableReassembly !== false;
    this.minPSLength = options.minPSLength || 2;
    this.updateThreshold = options.updateThreshold || 3;
    
    this.psUpdateCount = 0;
    this.lastPS = '';
    this.lastPTY = -1;
  }

  loadProgramTypes() {
    return [
      'None', 'News', 'Current Affairs', 'Information', 'Sport', 'Education',
      'Drama', 'Culture', 'Science', 'Varied', 'Pop Music', 'Rock Music',
      'Easy Listening', 'Light Classical', 'Serious Classical', 'Other Music',
      'Weather', 'Finance', 'Children\'s', 'Social Affairs', 'Religion',
      'Phone In', 'Travel', 'Leisure', 'Jazz', 'Country Music',
      'National Music', 'Oldies Music', 'Folk Music', 'Documentary',
      'Alarm Test', 'Alarm'
    ];
  }

  start(audioStream) {
    return new Promise((resolve, reject) => {
      this.stop();
      this.resetStats();
      this.reassemblyBuffer.clear();

      try {
        this.rdsProcess = spawn('redsea', ['-u', '-l']);
        
        audioStream.pipe(this.rdsProcess.stdin);

        this.rdsProcess.stdout.on('data', (data) => {
          this.parseRDSData(data.toString());
        });

        this.rdsProcess.stderr.on('data', (data) => {
          const msg = data.toString();
          if (msg.includes('error') || msg.includes('Error')) {
            this.recordError('redsea_error');
          }
        });

        this.rdsProcess.on('error', (err) => {
          console.log('RDS decoder (redsea) not available, using simulated mode');
          this.startSimulatedMode();
          resolve({ mode: 'simulated' });
        });

        this.rdsProcess.on('close', (code) => {
          console.log('RDS process exited with code', code);
        });

        setTimeout(() => {
          resolve({ mode: 'redsea' });
        }, 1000);

      } catch (err) {
        console.log('Starting simulated RDS mode');
        this.startSimulatedMode();
        resolve({ mode: 'simulated' });
      }
    });
  }

  parseRDSData(data) {
    const lines = data.split('\n');
    
    lines.forEach(line => {
      if (!line.trim()) return;

      this.stats.totalGroups++;

      try {
        const json = JSON.parse(line);
        
        const validation = this.validateRDSData(json);
        
        if (!validation.valid) {
          this.stats.invalidGroups++;
          this.recordError(validation.error);
          return;
        }
        
        this.stats.validGroups++;
        
        if (this.enableReassembly) {
          this.processWithReassembly(json);
        } else {
          this.processDirect(json);
        }

      } catch (e) {
        this.stats.invalidGroups++;
        this.recordError('parse_error');
      }
    });
  }

  validateRDSData(json) {
    if (!json || typeof json !== 'object') {
      return { valid: false, error: 'invalid_json' };
    }
    
    if (json.pi) {
      if (json.pi === '0000' || json.pi === '000000') {
        return { valid: false, error: 'invalid_pi' };
      }
    }
    
    if (json.group === 'none') {
      return { valid: false, error: 'no_sync' };
    }
    
    return { valid: true };
  }

  processWithReassembly(json) {
    const group = {
      valid: true,
      pi: json.pi,
      groupType: json.group ? parseInt(json.group) : undefined,
      version: json.version,
      ps: json.ps,
      rt: json.rt,
      ptype: json.ptype
    };
    
    this.reassemblyBuffer.addGroup(group);
    
    if (json.ps) {
      const cleanPS = this.cleanPS(json.ps);
      if (cleanPS) {
        for (let i = 0; i < cleanPS.length && i < 8; i++) {
          this.reassemblyBuffer.addPSChar(i, cleanPS[i]);
        }
      }
    }
    
    if (json.rt) {
      const cleanRT = this.cleanRT(json.rt);
      if (cleanRT) {
        for (let i = 0; i < cleanRT.length && i < 64; i++) {
          this.reassemblyBuffer.addRTChar(i, cleanRT[i]);
        }
      }
    }
    
    this.updateStationData();
  }

  processDirect(json) {
    if (json.ps) {
      const cleanPS = this.cleanPS(json.ps);
      if (cleanPS && cleanPS.length >= this.minPSLength) {
        this.currentStation.name = cleanPS;
        this.emit('stationName', this.currentStation.name);
      }
    }

    if (json.ptype !== undefined && json.ptype !== this.lastPTY) {
      this.currentStation.programType = json.ptype;
      this.currentStation.type = this.programTypes[json.ptype] || 'Unknown';
      this.lastPTY = json.ptype;
      this.emit('programType', this.currentStation.type);
    }

    if (json.rt) {
      const cleanRT = this.cleanRT(json.rt);
      if (cleanRT && cleanRT !== this.currentStation.text) {
        this.currentStation.text = cleanRT;
        this.emit('radioText', this.currentStation.text);
      }
    }

    if (json.pi) {
      this.currentStation.pi = json.pi;
      this.emit('piCode', json.pi);
    }

    this.emit('metadata', { ...this.currentStation });
  }

  updateStationData() {
    const ps = this.reassemblyBuffer.getPS();
    if (ps && ps !== this.lastPS) {
      this.psUpdateCount++;
      if (this.psUpdateCount >= this.updateThreshold) {
        this.currentStation.name = ps;
        this.lastPS = ps;
        this.emit('stationName', ps);
      }
    }
    
    const groups = this.reassemblyBuffer.groups;
    if (groups.length > 0) {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup.ptype !== undefined && lastGroup.ptype !== this.lastPTY) {
        this.currentStation.programType = lastGroup.ptype;
        this.currentStation.type = this.programTypes[lastGroup.ptype] || 'Unknown';
        this.lastPTY = lastGroup.ptype;
        this.emit('programType', this.currentStation.type);
      }
    }
    
    const rt = this.reassemblyBuffer.getRT();
    if (rt && rt !== this.currentStation.text) {
      this.currentStation.text = rt;
      this.emit('radioText', rt);
    }
    
    if (this.reassemblyBuffer.lastPI) {
      this.currentStation.pi = this.reassemblyBuffer.lastPI;
      this.emit('piCode', this.reassemblyBuffer.lastPI);
    }
    
    this.emit('metadata', { ...this.currentStation });
  }

  cleanPS(ps) {
    if (!ps) return null;
    
    let cleaned = ps.replace(/\*/g, ' ').trim();
    cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    if (cleaned.length < this.minPSLength) return null;
    if (/^[0-9\s]+$/.test(cleaned)) return null;
    
    return cleaned;
  }

  cleanRT(rt) {
    if (!rt) return null;
    
    let cleaned = rt.replace(/\*/g, ' ').trim();
    cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    if (cleaned.length < 4) return null;
    
    return cleaned;
  }

  recordError(errorType) {
    if (!this.stats.errors[errorType]) {
      this.stats.errors[errorType] = 0;
    }
    this.stats.errors[errorType]++;
  }

  resetStats() {
    this.stats = {
      totalGroups: 0,
      validGroups: 0,
      invalidGroups: 0,
      errors: {}
    };
    this.psUpdateCount = 0;
    this.lastPS = '';
    this.lastPTY = -1;
  }

  getStats() {
    const errorRate = this.stats.totalGroups > 0 
      ? (this.stats.invalidGroups / this.stats.totalGroups * 100).toFixed(1)
      : 0;
    
    return {
      ...this.stats,
      errorRate: parseFloat(errorRate),
      bufferStats: this.reassemblyBuffer.getStats()
    };
  }

  startSimulatedMode() {
    this.simulatedInterval = setInterval(() => {
      const sampleNames = [
        'FM RADIO', 'MUSIC FM', 'NEWS 98', 'JOY FM', 'HIT FM',
        'EASY FM', 'CLASSIC', 'POP 101', 'ROCK FM', 'JAZZ 92'
      ];
      
      if (!this.currentStation.name) {
        this.currentStation.name = sampleNames[Math.floor(Math.random() * sampleNames.length)];
        this.currentStation.type = this.programTypes[Math.floor(Math.random() * 20) + 1];
        this.currentStation.text = 'Welcome to FM Radio!';
        
        this.emit('stationName', this.currentStation.name);
        this.emit('programType', this.currentStation.type);
        this.emit('radioText', this.currentStation.text);
        this.emit('metadata', { ...this.currentStation });
      }
    }, 2000);
  }

  stop() {
    if (this.rdsProcess) {
      this.rdsProcess.kill();
      this.rdsProcess = null;
    }
    if (this.simulatedInterval) {
      clearInterval(this.simulatedInterval);
      this.simulatedInterval = null;
    }
  }

  getStationInfo() {
    return { ...this.currentStation };
  }

  reset() {
    this.currentStation = {
      name: '',
      type: 'Unknown',
      text: '',
      programType: 0,
      pi: null
    };
    this.reassemblyBuffer.clear();
    this.resetStats();
  }
}

module.exports = { RDSDecoder };
