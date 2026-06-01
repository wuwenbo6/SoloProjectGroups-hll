import dgram from 'dgram';
import crypto from 'crypto';

const HOST = '127.0.0.1';
const PORT = 12201;
const CHUNKED_MAGIC = Buffer.from([0x1e, 0x0f]);

function buildChunkedGelf(message, chunkSize = 100) {
  const fullPayload = Buffer.from(JSON.stringify(message));
  const chunks = [];

  if (fullPayload.length <= chunkSize) {
    return [fullPayload];
  }

  const totalChunks = Math.ceil(fullPayload.length / chunkSize);
  const messageId = crypto.randomBytes(8);

  for (let seq = 0; seq < totalChunks; seq++) {
    const start = seq * chunkSize;
    const end = Math.min(start + chunkSize, fullPayload.length);
    const chunkData = fullPayload.subarray(start, end);

    const chunkHeader = Buffer.alloc(12);
    CHUNKED_MAGIC.copy(chunkHeader, 0);
    messageId.copy(chunkHeader, 2);
    chunkHeader.writeUInt8(seq, 10);
    chunkHeader.writeUInt8(totalChunks, 11);

    chunks.push(Buffer.concat([chunkHeader, chunkData]));
  }

  return chunks;
}

function sendChunk(chunk, delay) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const client = dgram.createSocket('udp4');
      client.send(chunk, PORT, HOST, (err) => {
        if (err) console.error('Error sending chunk:', err);
        client.close();
        resolve();
      });
    }, delay);
  });
}

async function testChunkedGelf() {
  const testMessage = {
    version: '1.1',
    host: 'chunk-test-server',
    short_message: 'This is a large log message that will be chunked into multiple UDP packets to test the GELF chunk reassembly functionality',
    full_message: `This is a detailed log message that spans multiple lines.
It contains a lot of information that exceeds the typical UDP packet size.
When a GELF message is too large, it gets split into multiple chunks.
Each chunk has a 12-byte header containing:
- Magic bytes (0x1e 0x0f)
- 8-byte message ID (unique for this message)
- Sequence number (0-indexed)
- Total number of chunks
The receiver must collect all chunks, sort them by sequence number,
and then concatenate them to reconstruct the original message.
If any chunk is missing or the timeout is reached, the message is discarded.
Let's add some more data to ensure we need multiple chunks:
${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20)}`,
    level: 6,
    timestamp: Date.now() / 1000,
    _custom_field: 'test_value',
  };

  const chunks = buildChunkedGelf(testMessage, 150);

  console.log(`Test message size: ${JSON.stringify(testMessage).length} bytes`);
  console.log(`Number of chunks: ${chunks.length}`);
  console.log(`Sending chunks to ${HOST}:${PORT}...`);

  const sendPromises = chunks.map((chunk, i) => sendChunk(chunk, i * 50));
  await Promise.all(sendPromises);

  console.log('All chunks sent!');

  setTimeout(async () => {
    const res = await fetch('http://localhost:3001/api/logs/chunk-stats');
    const stats = await res.json();
    console.log('\nChunk stats after test:');
    console.log(JSON.stringify(stats, null, 2));

    const res2 = await fetch('http://localhost:3001/api/logs?q=chunk-test-server');
    const logs = await res2.json();
    console.log('\nLogs matching "chunk-test-server":');
    console.log(`Total: ${logs.total}`);
    if (logs.data.length > 0) {
      console.log(`Latest log short_message: ${logs.data[0].short_message}`);
      console.log(`Has full_message: ${!!logs.data[0].full_message}`);
    }
  }, 1000);
}

async function testOutOfOrderChunks() {
  console.log('\n--- Testing out-of-order chunks ---');

  const testMessage = {
    version: '1.1',
    host: 'out-of-order-test',
    short_message: 'Testing out-of-order chunk delivery',
    full_message: 'This message tests that chunks received in wrong order are correctly sorted.',
    level: 5,
    timestamp: Date.now() / 1000,
  };

  const chunks = buildChunkedGelf(testMessage, 80);
  console.log(`Number of chunks: ${chunks.length}`);

  const indices = chunks.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  console.log(`Send order: [${indices.join(', ')}]`);

  const sendPromises = indices.map((chunkIdx, i) =>
    sendChunk(chunks[chunkIdx], i * 80)
  );
  await Promise.all(sendPromises);

  console.log('All out-of-order chunks sent!');

  setTimeout(async () => {
    const res = await fetch('http://localhost:3001/api/logs?q=out-of-order-test');
    const logs = await res.json();
    console.log('\nLogs matching "out-of-order-test":');
    console.log(`Total: ${logs.total}`);
    if (logs.data.length > 0) {
      console.log(`Successfully reassembled: YES`);
      console.log(`short_message: ${logs.data[0].short_message}`);
    } else {
      console.log(`Successfully reassembled: NO`);
    }
  }, 1000);
}

async function testMissingChunk() {
  console.log('\n--- Testing missing chunk (should be dropped after timeout) ---');

  const testMessage = {
    version: '1.1',
    host: 'missing-chunk-test',
    short_message: 'This message should be dropped due to missing chunk',
    full_message: 'We will intentionally skip chunk #1, so the message can never be complete.',
    level: 4,
    timestamp: Date.now() / 1000,
  };

  const chunks = buildChunkedGelf(testMessage, 60);
  console.log(`Number of chunks: ${chunks.length}`);
  console.log('Will skip chunk #1');

  const sendPromises = [];
  for (let i = 0; i < chunks.length; i++) {
    if (i === 1) continue;
    sendPromises.push(sendChunk(chunks[i], i * 60));
  }
  await Promise.all(sendPromises);

  console.log('Chunks sent (minus chunk #1)!');

  setTimeout(async () => {
    const res = await fetch('http://localhost:3001/api/logs/pending-chunks');
    const pending = await res.json();
    console.log('\nPending chunks after test:');
    console.log(JSON.stringify(pending, null, 2));

    const res2 = await fetch('http://localhost:3001/api/logs/chunk-stats');
    const stats = await res2.json();
    console.log('\nChunk stats:');
    console.log(JSON.stringify(stats, null, 2));
  }, 1000);
}

const testNum = parseInt(process.argv[2] || '1');

if (testNum === 1) {
  testChunkedGelf();
} else if (testNum === 2) {
  testOutOfOrderChunks();
} else if (testNum === 3) {
  testMissingChunk();
}
