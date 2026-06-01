function compressIPv6(ip) {
  if (!ip || !ip.includes(':')) {
    return ip;
  }

  let normalized = ip.toLowerCase();

  if (normalized.startsWith('::ffff:')) {
    const rest = normalized.substring(7);
    if (rest.includes('.')) {
      return rest;
    }
    if (/^[0-9a-f]{1,4}:[0-9a-f]{1,4}$/i.test(rest)) {
      const parts = rest.split(':');
      const high = parseInt(parts[0], 16);
      const low = parseInt(parts[1], 16);
      const octet1 = (high >> 8) & 0xFF;
      const octet2 = high & 0xFF;
      const octet3 = (low >> 8) & 0xFF;
      const octet4 = low & 0xFF;
      return `${octet1}.${octet2}.${octet3}.${octet4}`;
    }
  }

  if (normalized === '::1') {
    return '127.0.0.1';
  }

  let parts = normalized.split(':');

  const newParts = [];
  for (let part of parts) {
    if (part === '') {
      newParts.push('');
    } else {
      newParts.push(part.replace(/^0+/, '') || '0');
    }
  }
  parts = newParts;

  let maxZeroStart = -1;
  let maxZeroLength = 0;
  let currentZeroStart = -1;
  let currentZeroLength = 0;

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '0') {
      if (currentZeroStart === -1) {
        currentZeroStart = i;
        currentZeroLength = 1;
      } else {
        currentZeroLength++;
      }
      if (currentZeroLength > maxZeroLength) {
        maxZeroStart = currentZeroStart;
        maxZeroLength = currentZeroLength;
      }
    } else {
      currentZeroStart = -1;
      currentZeroLength = 0;
    }
  }

  if (maxZeroLength >= 2) {
    const before = parts.slice(0, maxZeroStart);
    const after = parts.slice(maxZeroStart + maxZeroLength);
    
    if (before.length === 0 && after.length === 0) {
      return '::';
    }
    if (before.length === 0) {
      return '::' + after.join(':');
    }
    if (after.length === 0) {
      return before.join(':') + '::';
    }
    return before.join(':') + '::' + after.join(':');
  }

  return parts.join(':');
}

function expandIPv6(ip) {
  if (!ip || !ip.includes(':')) {
    return ip;
  }

  let normalized = ip.toLowerCase();

  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.substring(7);
    if (ipv4Part.includes('.')) {
      return ipv4Part;
    }
  }

  if (normalized === '::') {
    return '0000:0000:0000:0000:0000:0000:0000:0000';
  }
  if (normalized === '::1') {
    return '127.0.0.1';
  }

  const doubleColonIndex = normalized.indexOf('::');
  if (doubleColonIndex !== -1) {
    const before = normalized.substring(0, doubleColonIndex);
    const after = normalized.substring(doubleColonIndex + 2);
    
    const beforeParts = before ? before.split(':') : [];
    const afterParts = after ? after.split(':') : [];
    
    const missingGroups = 8 - beforeParts.length - afterParts.length;
    const zeroParts = Array(missingGroups).fill('0');
    
    normalized = [...beforeParts, ...zeroParts, ...afterParts].join(':');
  }

  const parts = normalized.split(':');
  return parts.map(part => part.padStart(4, '0')).join(':');
}

function normalizeIp(ip) {
  if (!ip) return ip;

  const cleaned = ip.trim().toLowerCase();

  if (cleaned === '::1' || cleaned === '0:0:0:0:0:0:0:1') {
    return '127.0.0.1';
  }

  if (cleaned.startsWith('::ffff:')) {
    const rest = cleaned.substring(7);
    if (rest.includes('.')) {
      return rest;
    }
    if (/^[0-9a-f]{1,4}:[0-9a-f]{1,4}$/i.test(rest)) {
      const parts = rest.split(':');
      const high = parseInt(parts[0], 16);
      const low = parseInt(parts[1], 16);
      const octet1 = (high >> 8) & 0xFF;
      const octet2 = high & 0xFF;
      const octet3 = (low >> 8) & 0xFF;
      const octet4 = low & 0xFF;
      return `${octet1}.${octet2}.${octet3}.${octet4}`;
    }
  }

  if (cleaned.includes('.')) {
    return cleaned;
  }

  if (cleaned.includes(':')) {
    return compressIPv6(cleaned);
  }

  return cleaned;
}

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map(ip => normalizeIp(ip.trim()));
    return ips[0];
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return normalizeIp(realIp);
  }

  const remoteAddress = req.connection.remoteAddress || req.socket.remoteAddress;
  if (remoteAddress) {
    return normalizeIp(remoteAddress);
  }

  return null;
}

function verifyIpBinding(tokenIp, clientIp) {
  if (!tokenIp || !clientIp) {
    return false;
  }
  return normalizeIp(tokenIp) === normalizeIp(clientIp);
}

function isIpInRange(ip, cidr) {
  const [range, prefix] = cidr.split('/');
  const prefixLength = parseInt(prefix, 10);

  if (ip.includes('.') && range.includes('.')) {
    const ipNum = ipv4ToNumber(ip);
    const rangeNum = ipv4ToNumber(range);
    const mask = 0xFFFFFFFF << (32 - prefixLength);
    return (ipNum & mask) === (rangeNum & mask);
  }

  if (ip.includes(':') && range.includes(':')) {
    const ipExpanded = expandIPv6(ip);
    const rangeExpanded = expandIPv6(range);
    return ipExpanded === rangeExpanded || isIPv6InRange(ipExpanded, rangeExpanded, prefixLength);
  }

  return false;
}

function ipv4ToNumber(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isIPv6InRange(ipExpanded, rangeExpanded, prefixLength) {
  const ipParts = ipExpanded.split(':').map(p => parseInt(p, 16));
  const rangeParts = rangeExpanded.split(':').map(p => parseInt(p, 16));

  for (let i = 0; i < 8; i++) {
    const bitsInPart = Math.min(16, prefixLength - i * 16);
    if (bitsInPart <= 0) break;
    
    const mask = 0xFFFF << (16 - bitsInPart);
    if ((ipParts[i] & mask) !== (rangeParts[i] & mask)) {
      return false;
    }
  }
  return true;
}

module.exports = {
  getClientIp,
  normalizeIp,
  compressIPv6,
  expandIPv6,
  verifyIpBinding,
  isIpInRange,
};
