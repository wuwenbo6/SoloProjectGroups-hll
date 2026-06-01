class Timestamp {
  constructor(low, high) {
    this.low = low;
    this.high = high;
  }
  toString() {
    return `Timestamp(${this.low}, ${this.high})`;
  }
}

class ChangeStreamsSimulator {
  constructor() {
    this.oplog = [];
    this.term = 1;
    this.lastTimestamp = 0;
    this.incrementCounter = 0;
    this.maxOplogSize = 1000;
    this.oplogTruncationCount = 0;
  }

  advanceOptime() {
    const now = Math.floor(Date.now() / 1000);
    if (now > this.lastTimestamp) {
      this.lastTimestamp = now;
      this.incrementCounter = 1;
    } else {
      this.incrementCounter++;
    }
    return { ts: this.lastTimestamp, inc: this.incrementCounter };
  }

  generateResumeToken(optime, term) {
    const raw = `${term}:${optime.ts}:${optime.inc}`;
    return { _data: Buffer.from(raw).toString('base64'), _term: term, _optime: { ...optime } };
  }

  parseResumeToken(token) {
    try {
      const decoded = Buffer.from(token, 'base64').toString();
      const parts = decoded.split(':');
      if (parts.length !== 3) {
        return { code: 40601, message: 'Invalid resume token format' };
      }
      const term = parseInt(parts[0]);
      const ts = parseInt(parts[1]);
      const inc = parseInt(parts[2]);
      if (isNaN(term) || isNaN(ts) || isNaN(inc)) {
        return { code: 40601, message: 'Invalid resume token values' };
      }
      return { term, optime: { ts, inc } };
    } catch {
      return { code: 40601, message: 'Failed to decode resume token' };
    }
  }

  validateResumeToken(token) {
    const parsed = this.parseResumeToken(token);
    if (parsed.code) return parsed;

    const { term, optime } = parsed;

    if (term > this.term) {
      return { code: 40604, message: 'Resume token references a future term', detail: `Token term ${term} is ahead of current term ${this.term}` };
    }
    if (term < this.term) {
      return { code: 40603, message: 'Resume token belongs to an old term', detail: `Token term ${term} is behind current term ${this.term}` };
    }
    if (this.oplog.length === 0) return null;

    const oldestEntry = this.oplog[0];
    if (optime.ts < oldestEntry.optime.ts || (optime.ts === oldestEntry.optime.ts && optime.inc < oldestEntry.optime.inc)) {
      return { code: 40602, message: 'Resume token is too old (oplog truncated)', detail: `Token optime (${optime.ts}:${optime.inc}) is before oldest (${oldestEntry.optime.ts}:${oldestEntry.optime.inc})` };
    }
    return null;
  }

  createEvent(operationType, doc, updateDescription) {
    const optime = this.advanceOptime();
    const token = this.generateResumeToken(optime, this.term);
    const event = {
      _id: token,
      operationType,
      clusterTime: new Timestamp(optime.ts, optime.inc),
      ns: { db: 'test', coll: 'simulation' },
      documentKey: { _id: doc._id },
      ...(operationType !== 'delete' && { fullDocument: doc }),
      ...(operationType === 'update' && updateDescription && { updateDescription }),
    };
    this.oplog.push({ optime, term: this.term, event });
    if (this.oplog.length > this.maxOplogSize) {
      const removed = this.oplog.splice(0, this.oplog.length - this.maxOplogSize);
      this.oplogTruncationCount += removed.length;
    }
    return event;
  }

  getEventsAfter(resumeToken) {
    if (!resumeToken) return this.oplog.map(e => e.event);
    const err = this.validateResumeToken(resumeToken);
    if (err) return err;
    const parsed = this.parseResumeToken(resumeToken);
    if (parsed.code) return parsed;
    const { optime, term } = parsed;
    return this.oplog
      .filter(entry => {
        if (entry.term !== term) return entry.term > term;
        if (entry.optime.ts !== optime.ts) return entry.optime.ts > optime.ts;
        return entry.optime.inc > optime.inc;
      })
      .map(e => e.event);
  }

  advanceTerm() { this.term++; return this.term; }
  setMaxOplogSize(size) {
    this.maxOplogSize = Math.max(1, size);
    if (this.oplog.length > this.maxOplogSize) {
      const removed = this.oplog.splice(0, this.oplog.length - this.maxOplogSize);
      this.oplogTruncationCount += removed.length;
    }
  }
}

function test() {
  console.log('=== MongoDB Change Streams 模拟器 - Oplog-like 增强测试 ===\n');

  const streams = new ChangeStreamsSimulator();

  const doc1 = { _id: 'doc-1', name: '文档1', _createdAt: Date.now(), _updatedAt: Date.now() };
  const doc2 = { _id: 'doc-2', name: '文档2', _createdAt: Date.now(), _updatedAt: Date.now() };

  console.log('1. 测试 Oplog-like 单调递增顺序');
  console.log('   执行3个Insert操作...');
  const e1 = streams.createEvent('insert', doc1);
  const e2 = streams.createEvent('insert', doc2);
  const e3 = streams.createEvent('update', { ...doc1, name: '更新1' }, { updatedFields: { name: '更新1' }, removedFields: [] });

  const t1 = streams.parseResumeToken(e1._id._data);
  const t2 = streams.parseResumeToken(e2._id._data);
  const t3 = streams.parseResumeToken(e3._id._data);

  console.log(`   事件1: term=${t1.term} optime=${t1.optime.ts}:${t1.optime.inc}`);
  console.log(`   事件2: term=${t2.term} optime=${t2.optime.ts}:${t2.optime.inc}`);
  console.log(`   事件3: term=${t3.term} optime=${t3.optime.ts}:${t3.optime.inc}`);

  const monotonic = (t1.optime.ts < t2.optime.ts || (t1.optime.ts === t2.optime.ts && t1.optime.inc < t2.optime.inc))
    && (t2.optime.ts < t3.optime.ts || (t2.optime.ts === t3.optime.ts && t2.optime.inc < t3.optime.inc));
  console.log(`   ✅ Oplog-like 单调递增: ${monotonic ? 'PASS' : 'FAIL'}`);

  console.log('\n2. 测试 ResumeToken 断点续传');
  const missed = streams.getEventsAfter(e1._id._data);
  console.log(`   从事件1之后恢复: 获得${Array.isArray(missed) ? missed.length : 0}个事件`);
  console.log(`   ${Array.isArray(missed) && missed.length === 2 ? '✅' : '❌'} 预期2个事件`);

  console.log('\n3. 测试 Token 失效 - INVALID_TOKEN (40601)');
  const invalidResult = streams.getEventsAfter('invalid-base64!!!');
  if (invalidResult.code === 40601) {
    console.log(`   ✅ 返回错误码: ${invalidResult.code} - ${invalidResult.message}`);
  } else {
    console.log(`   ❌ 预期40601, 实际: ${JSON.stringify(invalidResult)}`);
  }

  console.log('\n4. 测试 Token 失效 - TERM_MISMATCH (40603)');
  console.log('   推进Term...');
  streams.advanceTerm();
  const termResult = streams.getEventsAfter(e2._id._data);
  if (termResult.code === 40603) {
    console.log(`   ✅ 返回错误码: ${termResult.code} - ${termResult.message}`);
    console.log(`   详情: ${termResult.detail}`);
  } else {
    console.log(`   ❌ 预期40603, 实际: ${JSON.stringify(termResult)}`);
  }

  console.log('\n5. 测试新Term下的事件创建');
  const e4 = streams.createEvent('insert', { _id: 'doc-3', name: '新Term文档', _createdAt: Date.now(), _updatedAt: Date.now() });
  const t4 = streams.parseResumeToken(e4._id._data);
  console.log(`   事件4: term=${t4.term} optime=${t4.optime.ts}:${t4.optime.inc}`);
  console.log(`   ${t4.term === 2 ? '✅' : '❌'} 新事件的Term为2`);

  console.log('\n6. 测试 Token 失效 - TOKEN_EXPIRED (40602)');
  const streams2 = new ChangeStreamsSimulator();
  for (let i = 0; i < 5; i++) {
    streams2.createEvent('insert', { _id: `doc-${i}`, name: `文档${i}`, _createdAt: Date.now(), _updatedAt: Date.now() });
  }
  const oldToken = streams2.oplog[0].event._id._data;
  console.log('   设置oplog大小为3，触发截断...');
  streams2.setMaxOplogSize(3);
  const expiredResult = streams2.getEventsAfter(oldToken);
  if (expiredResult.code === 40602) {
    console.log(`   ✅ 返回错误码: ${expiredResult.code} - ${expiredResult.message}`);
    console.log(`   详情: ${expiredResult.detail}`);
  } else {
    console.log(`   ❌ 预期40602, 实际: ${JSON.stringify(expiredResult)}`);
  }

  console.log('\n7. 测试 Token 失效 - FUTURE_TOKEN (40604)');
  const futureToken = Buffer.from('999:999999999:999').toString('base64');
  const futureResult = streams.validateResumeToken(futureToken);
  if (futureResult && futureResult.code === 40604) {
    console.log(`   ✅ 返回错误码: ${futureResult.code} - ${futureResult.message}`);
    console.log(`   详情: ${futureResult.detail}`);
  } else {
    console.log(`   ❌ 预期40604, 实际: ${JSON.stringify(futureResult)}`);
  }

  console.log('\n=== 测试完成 ===');
  console.log('\n错误码汇总:');
  console.log('  40601 INVALID_TOKEN  - Token格式无效或无法解码');
  console.log('  40602 TOKEN_EXPIRED  - Oplog截断导致Token过期');
  console.log('  40603 TERM_MISMATCH  - 服务器重启导致Term不匹配');
  console.log('  40604 FUTURE_TOKEN   - Token引用了未来的Term');
}

test();
