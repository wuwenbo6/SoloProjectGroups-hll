class BpfMapArray {
  constructor(name, maxEntries, valueSize) {
    this.name = name;
    this.type = 'BPF_MAP_TYPE_ARRAY';
    this.maxEntries = maxEntries;
    this.valueSize = valueSize;
    this.data = new Array(maxEntries).fill(null);
  }

  lookup(key) {
    if (key < 0 || key >= this.maxEntries) return null;
    return this.data[key];
  }

  update(key, value) {
    if (key < 0 || key >= this.maxEntries) return false;
    this.data[key] = value;
    return true;
  }

  delete(key) {
    if (key < 0 || key >= this.maxEntries) return false;
    this.data[key] = null;
    return true;
  }

  getStats() {
    const used = this.data.filter(x => x !== null).length;
    return {
      type: this.type,
      name: this.name,
      maxEntries: this.maxEntries,
      usedEntries: used,
      utilization: ((used / this.maxEntries) * 100).toFixed(1) + '%'
    };
  }
}

class BpfMapLruHash {
  constructor(name, maxEntries, valueSize) {
    this.name = name;
    this.type = 'BPF_MAP_TYPE_LRU_HASH';
    this.maxEntries = maxEntries;
    this.valueSize = valueSize;
    this.data = new Map();
    this.accessOrder = [];
  }

  _touch(key) {
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
    this.accessOrder.unshift(key);
  }

  _evict() {
    if (this.data.size >= this.maxEntries) {
      const oldestKey = this.accessOrder.pop();
      this.data.delete(oldestKey);
    }
  }

  lookup(key) {
    if (!this.data.has(key)) return null;
    this._touch(key);
    return this.data.get(key);
  }

  update(key, value) {
    if (!this.data.has(key)) {
      this._evict();
    }
    this.data.set(key, value);
    this._touch(key);
    return true;
  }

  delete(key) {
    if (!this.data.has(key)) return false;
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
    this.data.delete(key);
    return true;
  }

  getStats() {
    return {
      type: this.type,
      name: this.name,
      maxEntries: this.maxEntries,
      usedEntries: this.data.size,
      utilization: ((this.data.size / this.maxEntries) * 100).toFixed(1) + '%',
      evictions: Math.max(0, this.accessOrder.length - this.data.size)
    };
  }
}

class EBpfSimulator {
  constructor() {
    this.virtualInterfaces = new Map();
    this.loadedPrograms = new Map();
    this.globalMaps = new Map();
  }

  createVirtualInterface(name) {
    const iface = {
      name,
      stats: {
        rxPackets: 0,
        txPackets: 0,
        droppedPackets: 0,
        passedPackets: 0,
        bytesReceived: 0
      },
      attachedProgram: null,
      packetQueue: [],
      maps: new Map()
    };
    this.virtualInterfaces.set(name, iface);
    return iface;
  }

  estimateInstructionCount(code) {
    let count = 0;
    
    const lines = code.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || 
          trimmed.startsWith('/*') || trimmed.startsWith('*') ||
          trimmed.includes('SEC(') || trimmed.includes('_license') ||
          trimmed.includes('struct ') || trimmed.includes('typedef ')) {
        continue;
      }

      if (trimmed.includes('if ')) count += 8;
      else if (trimmed.includes('else')) count += 4;
      else if (trimmed.includes('for ') || trimmed.includes('while ')) count += 15;
      else if (trimmed.includes('switch ') || trimmed.includes('case ')) count += 6;
      else if (trimmed.includes('return ')) count += 4;
      else if (trimmed.includes('bpf_')) count += 20;
      else if (trimmed.includes('=') && !trimmed.includes('==')) count += 4;
      else if (trimmed.includes('+') || trimmed.includes('-')) count += 2;
      else if (trimmed.includes('*') || trimmed.includes('/')) count += 4;
      else if (trimmed.includes('&') || trimmed.includes('|') || trimmed.includes('^')) count += 2;
      else if (trimmed.includes('->') || trimmed.includes('.')) count += 2;
      else if (trimmed.match(/^\w+\s+\w+\s*\(/)) count += 10;
      else if (trimmed.match(/\w+\s*;/)) count += 2;
      else if (trimmed.includes('static __always_inline')) count += 5;
    }

    const functionMatches = code.match(/\{\s*([^{}]*)\}/g);
    if (functionMatches) {
      count += functionMatches.length * 3;
    }

    return Math.max(count, 10);
  }

  parseMapDefinitions(code) {
    const maps = [];
    const mapDefPattern = /struct\s*\{([^}]*)\}\s*(\w+)\s+SEC\s*\(\s*"\.maps"\s*\)/g;
    
    let match;
    while ((match = mapDefPattern.exec(code)) !== null) {
      const mapBody = match[1];
      const mapName = match[2];
      
      const typeMatch = mapBody.match(/__uint\s*\(\s*type\s*,\s*(\w+)\s*\)/);
      const entriesMatch = mapBody.match(/__uint\s*\(\s*max_entries\s*,\s*(\d+)\s*\)/);
      const keySizeMatch = mapBody.match(/__type\s*\(\s*key\s*,\s*(\w+)\s*\)/);
      const valueSizeMatch = mapBody.match(/__type\s*\(\s*value\s*,\s*(\w+)\s*\)/);
      
      maps.push({
        name: mapName,
        type: typeMatch ? typeMatch[1] : 'BPF_MAP_TYPE_UNSPEC',
        maxEntries: entriesMatch ? parseInt(entriesMatch[1]) : 256,
        keyType: keySizeMatch ? keySizeMatch[1] : 'u32',
        valueType: valueSizeMatch ? valueSizeMatch[1] : 'u64'
      });
    }

    const legacyPattern = /struct\s+bpf_map_def\s+(\w+)\s*\{([^}]*)\}/g;
    while ((match = legacyPattern.exec(code)) !== null) {
      const mapName = match[1];
      const mapBody = match[2];
      
      const typeMatch = mapBody.match(/\.type\s*=\s*(\w+)/);
      const entriesMatch = mapBody.match(/\.max_entries\s*=\s*(\d+)/);
      
      maps.push({
        name: mapName,
        type: typeMatch ? typeMatch[1] : 'BPF_MAP_TYPE_UNSPEC',
        maxEntries: entriesMatch ? parseInt(entriesMatch[1]) : 256,
        keyType: 'u32',
        valueType: 'u64'
      });
    }

    return maps;
  }

  createMapInstance(mapDef) {
    const valueSize = 8;
    
    switch (mapDef.type) {
      case 'BPF_MAP_TYPE_ARRAY':
        return new BpfMapArray(mapDef.name, mapDef.maxEntries, valueSize);
      case 'BPF_MAP_TYPE_LRU_HASH':
        return new BpfMapLruHash(mapDef.name, mapDef.maxEntries, valueSize);
      case 'BPF_MAP_TYPE_HASH':
        return new BpfMapLruHash(mapDef.name, mapDef.maxEntries, valueSize);
      default:
        return new BpfMapArray(mapDef.name, mapDef.maxEntries, valueSize);
    }
  }

  verifyProgram(code) {
    const logs = [];
    let passed = true;

    logs.push('=== eBPF Verifier Log ===');
    logs.push('[1] Starting program verification...');
    logs.push('[2] Parsing eBPF bytecode structure...');

    if (!code.includes('SEC("xdp') && !code.includes('SEC("xdp_')) {
      logs.push('[ERROR] No XDP program section found. Expected SEC("xdp") or SEC("xdp_...")');
      passed = false;
    } else {
      logs.push('[3] XDP program section detected');
    }

    if (!code.includes('xdp') && !code.includes('XDP')) {
      logs.push('[WARNING] Code does not appear to reference XDP structures');
    }

    const hasXdpAction = code.includes('XDP_DROP') || code.includes('XDP_PASS') || 
                         code.includes('XDP_TX') || code.includes('XDP_REDIRECT');
    
    if (!hasXdpAction) {
      logs.push('[WARNING] No XDP action return value found (XDP_PASS, XDP_DROP, etc.)');
    } else {
      logs.push('[4] XDP action codes detected');
    }

    const loops = this.detectPotentialLoops(code);
    if (loops.length > 0) {
      logs.push(`[ERROR] Potential unbounded loops detected: ${loops.join(', ')}`);
      passed = false;
    } else {
      logs.push('[5] Loop analysis passed - no unbounded loops detected');
    }

    const unsafePtrs = this.checkPointerSafety(code);
    if (unsafePtrs.length > 0) {
      logs.push(`[WARNING] Possible unsafe pointer operations: ${unsafePtrs.join(', ')}`);
    } else {
      logs.push('[6] Basic pointer safety check passed');
    }

    const maps = this.parseMapDefinitions(code);
    if (maps.length > 0) {
      logs.push(`[7] Detected ${maps.length} eBPF map definition(s):`);
      for (const map of maps) {
        logs.push(`    - ${map.name}: ${map.type} (max_entries: ${map.maxEntries})`);
      }
    }

    const mapAccess = this.analyzeMapAccess(code);
    if (mapAccess.length > 0) {
      logs.push(`[8] Detected eBPF map access: ${mapAccess.join(', ')}`);
    }

    const helperCalls = this.analyzeHelperCalls(code);
    if (helperCalls.length > 0) {
      logs.push(`[9] Detected helper function calls: ${helperCalls.join(', ')}`);
    }

    const insnCount = this.estimateInstructionCount(code);
    const maxInstructions = 4096;
    
    logs.push('');
    logs.push('=== Instruction Count Analysis ===');
    logs.push(`Estimated eBPF instructions: ${insnCount}`);
    logs.push(`Maximum allowed: ${maxInstructions}`);
    
    if (insnCount > maxInstructions) {
      const excess = insnCount - maxInstructions;
      logs.push(`[ERROR] Program exceeds maximum instruction count by ${excess} instructions!`);
      logs.push('        Please simplify your code by:');
      logs.push('        - Reducing loop complexity');
      logs.push('        - Removing unnecessary calculations');
      logs.push('        - Splitting complex logic into multiple programs');
      logs.push('        - Using eBPF maps for state storage');
      passed = false;
    } else {
      const remaining = maxInstructions - insnCount;
      logs.push(`[10] Instruction count check passed (${remaining} instructions remaining)`);
    }

    if (code.length > 100000) {
      logs.push('[ERROR] Program source too large');
      passed = false;
    }

    logs.push('');
    if (passed) {
      logs.push('=== Verification PASSED ===');
      logs.push('Program loaded successfully into kernel (simulated)');
    } else {
      logs.push('=== Verification FAILED ===');
    }

    return {
      success: passed,
      logs: logs.join('\n'),
      programId: passed ? `prog_${Date.now()}` : null,
      instructionCount: insnCount,
      maxInstructions,
      maps
    };
  }

  detectPotentialLoops(code) {
    const issues = [];
    const forMatches = code.match(/for\s*\([^)]*\)/g) || [];
    const whileMatches = code.match(/while\s*\([^)]*\)/g) || [];
    
    for (const match of [...forMatches, ...whileMatches]) {
      if (!match.includes('<') && !match.includes('>') && !match.includes('<=')) {
        issues.push(match);
      }
    }
    return issues;
  }

  checkPointerSafety(code) {
    const issues = [];
    const patterns = [
      /\*\s*\w+\s*\+\+/g,
      /\*\s*\w+\s*--/g,
      /\(\s*\w+\s*\*\s*\)\s*\w+/g
    ];
    
    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        issues.push(...matches);
      }
    }
    return [...new Set(issues)].slice(0, 5);
  }

  analyzeMapAccess(code) {
    const maps = [];
    const mapPatterns = [
      /bpf_map_lookup_elem\s*\(\s*&(\w+)/g,
      /bpf_map_update_elem\s*\(\s*&(\w+)/g,
      /bpf_map_delete_elem\s*\(\s*&(\w+)/g,
      /struct\s+bpf_map_def\s+(\w+)/g
    ];

    for (const pattern of mapPatterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        if (!maps.includes(match[1])) {
          maps.push(match[1]);
        }
      }
    }
    return maps;
  }

  analyzeHelperCalls(code) {
    const helpers = [];
    const helperPattern = /bpf_(\w+)\s*\(/g;
    let match;
    while ((match = helperPattern.exec(code)) !== null) {
      if (!helpers.includes(`bpf_${match[1]}`)) {
        helpers.push(`bpf_${match[1]}`);
      }
    }
    return helpers;
  }

  attachProgram(programId, ifaceName, code) {
    let iface = this.virtualInterfaces.get(ifaceName);
    if (!iface) {
      iface = this.createVirtualInterface(ifaceName);
    }

    const maps = this.parseMapDefinitions(code);
    for (const mapDef of maps) {
      const mapInstance = this.createMapInstance(mapDef);
      iface.maps.set(mapDef.name, mapInstance);
      this.globalMaps.set(`${programId}_${mapDef.name}`, mapInstance);
    }

    iface.attachedProgram = {
      programId,
      code,
      loadedAt: new Date().toISOString(),
      mapNames: maps.map(m => m.name)
    };

    this.loadedPrograms.set(programId, {
      ifaceName,
      code,
      loadedAt: new Date().toISOString(),
      maps: maps.map(m => ({ name: m.name, type: m.type }))
    });

    return iface;
  }

  simulateTraffic(ifaceName, packetCount = 100) {
    const iface = this.virtualInterfaces.get(ifaceName);
    if (!iface) {
      throw new Error(`Interface ${ifaceName} not found`);
    }

    const results = {
      totalPackets: packetCount,
      passed: 0,
      dropped: 0,
      tx: 0,
      redirect: 0,
      aborted: 0,
      details: []
    };

    const code = iface.attachedProgram?.code || '';
    const dropProbability = this.calculateDropProbability(code);
    const passProbability = this.calculatePassProbability(code);

    const statsMap = iface.maps.values().next().value;

    for (let i = 0; i < packetCount; i++) {
      const packet = this.generatePacket(i);
      const action = this.simulateXdpAction(code, packet, dropProbability, passProbability);
      
      iface.stats.rxPackets++;
      iface.stats.bytesReceived += packet.size;

      if (statsMap && statsMap.type === 'BPF_MAP_TYPE_ARRAY') {
        const currentCount = statsMap.lookup(0) || 0;
        statsMap.update(0, currentCount + 1);
      }

      switch (action) {
        case 'XDP_PASS':
          results.passed++;
          iface.stats.passedPackets++;
          break;
        case 'XDP_DROP':
          results.dropped++;
          iface.stats.droppedPackets++;
          break;
        case 'XDP_TX':
          results.tx++;
          iface.stats.txPackets++;
          break;
        case 'XDP_REDIRECT':
          results.redirect++;
          break;
        case 'XDP_ABORTED':
          results.aborted++;
          break;
      }

      results.details.push({
        packetId: i,
        srcIp: packet.srcIp,
        dstIp: packet.dstIp,
        srcPort: packet.srcPort,
        dstPort: packet.dstPort,
        protocol: packet.protocol,
        size: packet.size,
        action
      });
    }

    const mapStats = [];
    for (const [name, map] of iface.maps) {
      mapStats.push(map.getStats());
    }

    return {
      stats: { ...iface.stats },
      results,
      maps: mapStats,
      summary: {
        dropRate: ((results.dropped / packetCount) * 100).toFixed(2) + '%',
        passRate: ((results.passed / packetCount) * 100).toFixed(2) + '%',
        totalPackets: packetCount,
        dropped: results.dropped,
        passed: results.passed
      }
    };
  }

  calculateDropProbability(code) {
    let prob = 0.3;
    
    if (code.includes('XDP_DROP')) {
      prob += 0.2;
    }
    if (code.includes('block') || code.includes('deny')) {
      prob += 0.2;
    }
    if (code.includes('udp') && code.includes('53')) {
      prob += 0.1;
    }
    
    return Math.min(prob, 0.9);
  }

  calculatePassProbability(code) {
    let prob = 0.5;
    
    if (code.includes('XDP_PASS')) {
      prob += 0.2;
    }
    if (code.includes('allow') || code.includes('accept')) {
      prob += 0.1;
    }
    
    return Math.min(prob, 0.9);
  }

  generatePacket(id) {
    const protocols = ['TCP', 'UDP', 'ICMP', 'HTTP', 'HTTPS'];
    const protocol = protocols[Math.floor(Math.random() * protocols.length)];
    
    return {
      id,
      srcIp: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      dstIp: `192.168.1.${Math.floor(Math.random() * 255)}`,
      srcPort: Math.floor(Math.random() * 65535),
      dstPort: protocol === 'HTTP' ? 80 : protocol === 'HTTPS' ? 443 : Math.floor(Math.random() * 65535),
      protocol,
      size: 64 + Math.floor(Math.random() * 1400),
      timestamp: Date.now()
    };
  }

  simulateXdpAction(code, packet, dropProb, passProb) {
    const hasDropLogic = code.includes('XDP_DROP');
    const hasPassLogic = code.includes('XDP_PASS');
    const hasTxLogic = code.includes('XDP_TX');
    const hasRedirectLogic = code.includes('XDP_REDIRECT');

    if (packet.dstPort === 22 && code.includes('22')) {
      return 'XDP_DROP';
    }
    if ((packet.dstPort === 80 || packet.dstPort === 443) && 
        code.includes('HTTP') && !code.includes('block')) {
      return 'XDP_PASS';
    }

    const rand = Math.random();

    if (hasDropLogic && rand < dropProb) {
      return 'XDP_DROP';
    }
    if (hasPassLogic && rand < dropProb + passProb) {
      return 'XDP_PASS';
    }
    if (hasTxLogic && rand < dropProb + passProb + 0.1) {
      return 'XDP_TX';
    }
    if (hasRedirectLogic && rand < dropProb + passProb + 0.15) {
      return 'XDP_REDIRECT';
    }

    return 'XDP_PASS';
  }

  getInterfaceStats(ifaceName) {
    const iface = this.virtualInterfaces.get(ifaceName);
    if (!iface) {
      return null;
    }
    return { ...iface.stats };
  }

  getMapStats(ifaceName) {
    const iface = this.virtualInterfaces.get(ifaceName);
    if (!iface) {
      return null;
    }
    const stats = [];
    for (const [name, map] of iface.maps) {
      stats.push(map.getStats());
    }
    return stats;
  }

  resetInterfaceStats(ifaceName) {
    const iface = this.virtualInterfaces.get(ifaceName);
    if (iface) {
      iface.stats = {
        rxPackets: 0,
        txPackets: 0,
        droppedPackets: 0,
        passedPackets: 0,
        bytesReceived: 0
      };
      for (const map of iface.maps.values()) {
        if (map.type === 'BPF_MAP_TYPE_ARRAY') {
          for (let i = 0; i < map.maxEntries; i++) {
            map.update(i, null);
          }
        } else if (map.type === 'BPF_MAP_TYPE_LRU_HASH') {
          map.data.clear();
          map.accessOrder = [];
        }
      }
    }
    return iface?.stats;
  }

  getLoadedPrograms() {
    return Array.from(this.loadedPrograms.entries()).map(([id, prog]) => ({
      id,
      ...prog
    }));
  }

  getInterfaces() {
    return Array.from(this.virtualInterfaces.entries()).map(([name, iface]) => ({
      name,
      stats: iface.stats,
      hasProgram: !!iface.attachedProgram,
      programId: iface.attachedProgram?.programId,
      mapCount: iface.maps.size,
      maps: Array.from(iface.maps.keys())
    }));
  }
}

module.exports = EBpfSimulator;
