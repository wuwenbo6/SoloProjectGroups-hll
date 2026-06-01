import * as dgram from 'dgram';
import * as dnsPacket from 'dns-packet';

const DNS_RECORD_TYPES: Record<string, number> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  PTR: 12,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  SRV: 33,
  DS: 43,
  SSHFP: 44,
  RRSIG: 46,
  NSEC: 47,
  DNSKEY: 48,
  NSEC3: 50,
  TLSA: 52,
  CDS: 59,
  CDNSKEY: 60,
};

const RECORD_TYPE_NAMES: Record<number, string> = {
  1: 'A',
  2: 'NS',
  5: 'CNAME',
  6: 'SOA',
  12: 'PTR',
  15: 'MX',
  16: 'TXT',
  28: 'AAAA',
  33: 'SRV',
  43: 'DS',
  44: 'SSHFP',
  46: 'RRSIG',
  47: 'NSEC',
  48: 'DNSKEY',
  50: 'NSEC3',
  52: 'TLSA',
  59: 'CDS',
  60: 'CDNSKEY',
};

function sendDNSQuery(
  domain: string,
  recordType: number,
  resolver: string,
  dnssecOk: boolean = true
): Promise<dnsPacket.Packet> {
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
      try {
        const response = dnsPacket.decode(msg);
        resolve(response);
      } catch (e) {
        reject(e);
      }
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

async function test() {
  try {
    const response = await sendDNSQuery('cloudflare.com', DNS_RECORD_TYPES.A, '8.8.8.8', true);
    console.log('=== DNS Response ===');
    console.log('Flags:', response.flags);
    console.log('Answers:', response.answers?.length || 0);
    if (response.answers) {
      for (const ans of response.answers) {
        console.log('\n--- Answer ---');
        console.log('Type:', ans.type);
        console.log('Name:', ans.name);
        console.log('TTL:', ans.ttl);
        console.log('Data type:', typeof ans.data);
        if (Buffer.isBuffer(ans.data)) {
          console.log('Data (hex):', ans.data.toString('hex'));
          console.log('Data (base64):', ans.data.toString('base64'));
        } else if (typeof ans.data === 'object') {
          console.log('Data (JSON):', JSON.stringify(ans.data));
        } else {
          console.log('Data:', ans.data);
        }
      }
    }
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
