const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

class LISPMapServer {
  constructor() {
    this.eidToRlocMap = new Map();
    this.cleanupInterval = null;
    this._startCleanup();
    this._initSampleData();
  }

  _initSampleData() {
    this.addMapping('10.0.0.0/8', [
      { address: '192.168.1.1', priority: 1, weight: 100 }
    ], 0);
    this.addMapping('10.1.0.0/16', [
      { address: '192.168.1.2', priority: 1, weight: 50 },
      { address: '192.168.1.3', priority: 2, weight: 50 }
    ], 0);
    this.addMapping('2001:db8::/32', [
      { address: '2001:db8:1::1', priority: 1, weight: 100 }
    ], 0);
  }

  _startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this._cleanupExpired();
    }, 10000);
  }

  _cleanupExpired() {
    const now = Date.now();
    for (const [key, mapping] of this.eidToRlocMap.entries()) {
      if (mapping.ttl > 0 && mapping.expiresAt <= now) {
        this.eidToRlocMap.delete(key);
        console.log(`[TTL] Expired mapping removed: ${key}`);
      }
    }
  }

  _parseRloc(rloc) {
    if (typeof rloc === 'string') {
      return {
        address: rloc.trim(),
        priority: 1,
        weight: 100
      };
    }
    if (typeof rloc === 'object' && rloc.address) {
      return {
        address: rloc.address.trim(),
        priority: rloc.priority ?? 1,
        weight: rloc.weight ?? 100
      };
    }
    return null;
  }

  _parseEid(eid) {
    const parts = eid.split('/');
    const address = parts[0].trim();
    const prefixLen = parts.length > 1 ? parseInt(parts[1], 10) : (address.includes(':') ? 128 : 32);
    return { address, prefixLen };
  }

  _ipToBinary(address) {
    if (address.includes(':')) {
      return this._ipv6ToBinary(address);
    }
    return this._ipv4ToBinary(address);
  }

  _ipv4ToBinary(address) {
    return address.split('.').map(octet => {
      return parseInt(octet, 10).toString(2).padStart(8, '0');
    }).join('');
  }

  _ipv6ToBinary(address) {
    let groups;
    if (address.includes('::')) {
      const parts = address.split('::');
      const left = parts[0] ? parts[0].split(':').filter(g => g) : [];
      const right = parts[1] ? parts[1].split(':').filter(g => g) : [];
      const zeroCount = 8 - left.length - right.length;
      groups = [...left, ...Array(zeroCount).fill('0'), ...right];
    } else {
      groups = address.split(':').filter(g => g);
    }
    groups = groups.slice(0, 8);
    while (groups.length < 8) groups.push('0');
    
    return groups.map(group => {
      return parseInt(group, 16).toString(2).padStart(16, '0');
    }).join('');
  }

  _matchPrefix(eid1, eid2) {
    const parsed1 = this._parseEid(eid1);
    const parsed2 = this._parseEid(eid2);
    const minPrefix = Math.min(parsed1.prefixLen, parsed2.prefixLen);
    
    const bin1 = this._ipToBinary(parsed1.address).substring(0, minPrefix);
    const bin2 = this._ipToBinary(parsed2.address).substring(0, minPrefix);
    
    return bin1 === bin2;
  }

  addMapping(eid, rlocs, ttl = 0) {
    const parsed = this._parseEid(eid);
    const key = `${parsed.address}/${parsed.prefixLen}`;
    
    const parsedRlocs = (Array.isArray(rlocs) ? rlocs : [rlocs])
      .map(r => this._parseRloc(r))
      .filter(r => r !== null);
    
    const now = Date.now();
    const mapping = {
      eid: key,
      rlocs: parsedRlocs,
      timestamp: now,
      ttl: parseInt(ttl, 10) || 0,
      expiresAt: ttl > 0 ? now + (ttl * 1000) : null
    };
    
    this.eidToRlocMap.set(key, mapping);
    return this.eidToRlocMap.get(key);
  }

  deleteMapping(eid) {
    const parsed = this._parseEid(eid);
    const key = `${parsed.address}/${parsed.prefixLen}`;
    return this.eidToRlocMap.delete(key);
  }

  _isExpired(mapping) {
    return mapping.ttl > 0 && mapping.expiresAt <= Date.now();
  }

  mapRequest(eid) {
    const parsed = this._parseEid(eid);
    const searchKey = `${parsed.address}/${parsed.prefixLen}`;
    
    let bestMatch = null;
    let longestPrefix = -1;

    for (const [key, mapping] of this.eidToRlocMap.entries()) {
      if (this._isExpired(mapping)) {
        continue;
      }
      if (this._matchPrefix(searchKey, key)) {
        const mapPrefix = this._parseEid(key).prefixLen;
        if (mapPrefix > longestPrefix) {
          longestPrefix = mapPrefix;
          bestMatch = mapping;
        }
      }
    }

    return bestMatch ? {
      success: true,
      eid: searchKey,
      mappedEid: bestMatch.eid,
      rlocs: bestMatch.rlocs,
      timestamp: bestMatch.timestamp,
      ttl: bestMatch.ttl,
      expiresAt: bestMatch.expiresAt,
      remainingTtl: bestMatch.ttl > 0 ? Math.max(0, Math.floor((bestMatch.expiresAt - Date.now()) / 1000)) : null
    } : {
      success: false,
      eid: searchKey,
      message: 'No mapping found for the requested EID'
    };
  }

  getAllMappings() {
    const now = Date.now();
    return Array.from(this.eidToRlocMap.values())
      .filter(m => !this._isExpired(m))
      .map(m => ({
        ...m,
        remainingTtl: m.ttl > 0 ? Math.max(0, Math.floor((m.expiresAt - now) / 1000)) : null
      }));
  }

  registerMapping(eid, rlocs, ttl = 3600, source = 'map-register') {
    const parsed = this._parseEid(eid);
    const key = `${parsed.address}/${parsed.prefixLen}`;
    
    const parsedRlocs = (Array.isArray(rlocs) ? rlocs : [rlocs])
      .map(r => this._parseRloc(r))
      .filter(r => r !== null);
    
    if (parsedRlocs.length === 0) {
      return null;
    }
    
    const now = Date.now();
    const ttlSeconds = parseInt(ttl, 10) || 3600;
    const mapping = {
      eid: key,
      rlocs: parsedRlocs,
      timestamp: now,
      ttl: ttlSeconds,
      expiresAt: ttlSeconds > 0 ? now + (ttlSeconds * 1000) : null,
      source: source,
      registeredAt: now
    };
    
    this.eidToRlocMap.set(key, mapping);
    console.log(`[Map-Register] Registered: ${key} -> ${parsedRlocs.map(r => r.address).join(', ')} (TTL: ${ttlSeconds}s)`);
    return this.eidToRlocMap.get(key);
  }

  exportJSON(includeExpired = false) {
    const now = Date.now();
    let mappings = Array.from(this.eidToRlocMap.values());
    
    if (!includeExpired) {
      mappings = mappings.filter(m => !this._isExpired(m));
    }
    
    const exportData = {
      server: "LISP Mapping Server (MS/MR)",
      version: "1.0",
      exportedAt: now,
      exportedAtHuman: new Date(now).toISOString(),
      count: mappings.length,
      mappings: mappings.map(m => ({
        eid: m.eid,
        rlocs: m.rlocs,
        ttl: m.ttl,
        expiresAt: m.expiresAt,
        remainingTtl: m.ttl > 0 ? Math.max(0, Math.floor((m.expiresAt - now) / 1000)) : null,
        source: m.source || 'manual',
        createdAt: m.timestamp,
        registeredAt: m.registeredAt || m.timestamp
      }))
    };
    
    return exportData;
  }
}

const mapServer = new LISPMapServer();

app.get('/api/map-request', (req, res) => {
  const { eid } = req.query;
  if (!eid) {
    return res.status(400).json({
      success: false,
      message: 'EID parameter is required'
    });
  }
  const result = mapServer.mapRequest(eid);
  res.json(result);
});

app.get('/api/mappings', (req, res) => {
  const mappings = mapServer.getAllMappings();
  res.json({
    success: true,
    count: mappings.length,
    mappings
  });
});

app.post('/api/mappings', (req, res) => {
  const { eid, rlocs, ttl } = req.body;
  if (!eid || !rlocs) {
    return res.status(400).json({
      success: false,
      message: 'EID and RLOCs are required'
    });
  }
  const rlocArray = Array.isArray(rlocs) ? rlocs : [rlocs];
  const mapping = mapServer.addMapping(eid, rlocArray, ttl);
  res.json({
    success: true,
    message: 'Mapping added successfully',
    mapping
  });
});

app.delete('/api/mappings', (req, res) => {
  const { eid } = req.body;
  if (!eid) {
    return res.status(400).json({
      success: false,
      message: 'EID parameter is required'
    });
  }
  const deleted = mapServer.deleteMapping(eid);
  if (deleted) {
    res.json({
      success: true,
      message: 'Mapping deleted successfully'
    });
  } else {
    res.status(404).json({
      success: false,
      message: 'Mapping not found'
    });
  }
});

app.post('/api/map-register', (req, res) => {
  const { eid, rlocs, ttl, source } = req.body;
  if (!eid || !rlocs) {
    return res.status(400).json({
      success: false,
      message: 'EID and RLOCs are required for Map-Register'
    });
  }
  const mapping = mapServer.registerMapping(eid, rlocs, ttl, source);
  if (mapping) {
    res.json({
      success: true,
      message: 'Map-Register successful',
      mapping
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Invalid RLOCs provided'
    });
  }
});

app.get('/api/export', (req, res) => {
  const { includeExpired } = req.query;
  const includeExp = includeExpired === 'true' || includeExpired === '1';
  const exportData = mapServer.exportJSON(includeExp);
  
  const filename = `lisp-mappings-${Date.now()}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.json(exportData);
});

app.listen(PORT, () => {
  console.log(`LISP Mapping Server (MS/MR) running on http://localhost:${PORT}`);
  console.log(`API Endpoints:`);
  console.log(`  GET  /api/map-request?eid=<eid>    - Map-Request query`);
  console.log(`  GET  /api/mappings                 - List all mappings`);
  console.log(`  POST /api/mappings                 - Add mapping`);
  console.log(`  DELETE /api/mappings               - Delete mapping`);
  console.log(`  POST /api/map-register             - Map-Register (dynamic registration)`);
  console.log(`  GET  /api/export                   - Export mappings as JSON`);
});
