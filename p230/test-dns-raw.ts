import * as dgram from 'dgram';
import * as dnsPacket from 'dns-packet';

const DNS_RECORD_TYPES: Record<string, number> = {
  A: 1,
  RRSIG: 46,
};

const RECORD_TYPE_NAMES: Record<number, string> = {
  1: 'A',
  46: 'RRSIG',
};

function sendDNSQuery(
  domain: string,
  recordType: number,
  resolver: string,
  dnssecOk: boolean = true
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const query = dnsPacket.encode({
      type: 'query',
      id: Math.floor(Math.random() * 65535),
      flags: dnssecOk
        ? dnsPacket.RECURSION_DESIRED | dnsPacket.DNSSEC_OK
        : dnsPacket.RECURSION_DESIRED,
      questions: [
        {
          type: RECORD_TYPE_NAMES[recordType] || 'A',
          name: domain,
          class: 'IN',
        },
      ],
      additions: dnssecOk
        ? [
            {
              name: '.',
              type: 'OPT',
              udpPayloadSize: 4096,
              flags: 0,
              options: [],
            },
          ]
        : [],
    });

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('DNS query timeout'));
    }, 5000);

    socket.on('message', (msg) => {
      clearTimeout(timeout);
      socket.close();
      resolve(msg);
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      socket.close();
      reject(err);
    });

    socket.send(query, 53, resolver, (err) => {
      if (err) {
        clearTimeout(timeout);
        socket.close();
        reject(err);
      }
    });
  });
}

function parseRR(buffer: Buffer, offset: number): any {
  let pos = offset;

  function readName(buf: Buffer, off: number): { name: string; offset: number } {
    const labels: string[] = [];
    let jumped = false;
    let jumpOffset = 0;
    let currentOff = off;

    while (currentOff < buf.length) {
      const len = buf.readUInt8(currentOff);
      
      if (len === 0) {
        currentOff++;
        break;
      }
      
      if ((len & 0xc0) === 0xc0) {
        if (!jumped) {
          jumpOffset = currentOff + 2;
          jumped = true;
        }
        const pointer = ((len & 0x3f) << 8) | buf.readUInt8(currentOff + 1);
        currentOff = pointer;
        continue;
      }
      
      currentOff++;
      labels.push(buf.slice(currentOff, currentOff + len).toString('ascii'));
      currentOff += len;
    }

    return {
      name: labels.join('.'),
      offset: jumped ? jumpOffset : currentOff,
    };
  }

  const { name, offset: nameEnd } = readName(buffer, pos);
  pos = nameEnd;

  const type = buffer.readUInt16BE(pos);
  pos += 2;
  const cls = buffer.readUInt16BE(pos);
  pos += 2;
  const ttl = buffer.readUInt32BE(pos);
  pos += 4;
  const rdLength = buffer.readUInt16BE(pos);
  pos += 2;
  const rdata = buffer.slice(pos, pos + rdLength);
  pos += rdLength;

  return {
    name,
    type,
    class: cls,
    ttl,
    rdLength,
    rdata,
    nextOffset: pos,
  };
}

async function test() {
  try {
    const response = await sendDNSQuery('cloudflare.com', DNS_RECORD_TYPES.A, '8.8.8.8', true);
    
    console.log('Response length:', response.length);
    console.log('Response (hex):', response.toString('hex'));
    
    const header = {
      id: response.readUInt16BE(0),
      flags: response.readUInt16BE(2),
      qdCount: response.readUInt16BE(4),
      anCount: response.readUInt16BE(6),
      nsCount: response.readUInt16BE(8),
      arCount: response.readUInt16BE(10),
    };
    
    console.log('\nHeader:', JSON.stringify(header, null, 2));
    
    let offset = 12;
    
    console.log('\n=== Questions ===');
    for (let i = 0; i < header.qdCount; i++) {
      const qnameParts: string[] = [];
      while (response[offset] !== 0) {
        const len = response[offset];
        offset++;
        qnameParts.push(response.slice(offset, offset + len).toString('ascii'));
        offset += len;
      }
      offset++;
      const qtype = response.readUInt16BE(offset);
      offset += 2;
      const qclass = response.readUInt16BE(offset);
      offset += 2;
      console.log(`Q${i + 1}: ${qnameParts.join('.')} type=${qtype} class=${qclass}`);
    }
    
    console.log('\n=== Answers ===');
    for (let i = 0; i < header.anCount; i++) {
      const rr = parseRR(response, offset);
      console.log(`\nRR ${i + 1}:`);
      console.log(`  Name: ${rr.name}`);
      console.log(`  Type: ${rr.type} (${RECORD_TYPE_NAMES[rr.type] || 'UNKNOWN'})`);
      console.log(`  Class: ${rr.class}`);
      console.log(`  TTL: ${rr.ttl}`);
      console.log(`  RD Length: ${rr.rdLength}`);
      console.log(`  RDATA (hex): ${rr.rdata.toString('hex')}`);
      console.log(`  RDATA (base64): ${rr.rdata.toString('base64')}`);
      offset = rr.nextOffset;
    }
    
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
