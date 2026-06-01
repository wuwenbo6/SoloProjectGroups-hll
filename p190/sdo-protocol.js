const EventEmitter = require('events');

class SDOProtocol extends EventEmitter {
  constructor(canSimulator) {
    super();
    this.can = canSimulator;
    this.pendingTransactions = new Map();
    this.segmentedTransactions = new Map();
    this.SEGMENT_TIMEOUT = 500;
    this.MAX_RETRIES = 3;

    this.can.on('message', (msg) => {
      this.handleCANMessage(msg);
    });
  }

  read(nodeId, index, subIndex) {
    return new Promise((resolve, reject) => {
      const txId = 0x600 + nodeId;
      const rxId = 0x580 + nodeId;
      const key = `${nodeId}-${index}-${subIndex}`;

      const timeout = setTimeout(() => {
        this.cleanupTransaction(key);
        reject(new Error('SDO读取超时'));
      }, 5000);

      this.pendingTransactions.set(key, {
        type: 'read',
        resolve,
        reject,
        timeout,
        data: Buffer.alloc(0),
        totalSize: 0,
        toggle: 0,
        rxId,
        retryCount: 0,
        segmentTimeout: null
      });

      const sdoCmd = Buffer.from([
        0x40,
        index & 0xFF,
        (index >> 8) & 0xFF,
        subIndex,
        0x00, 0x00, 0x00, 0x00
      ]);

      this.can.send(txId, sdoCmd).catch((err) => {
        clearTimeout(timeout);
        this.cleanupTransaction(key);
        reject(err);
      });
    });
  }

  write(nodeId, index, subIndex, data) {
    return new Promise((resolve, reject) => {
      const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const txId = 0x600 + nodeId;
      const rxId = 0x580 + nodeId;
      const key = `${nodeId}-${index}-${subIndex}`;

      const timeout = setTimeout(() => {
        this.cleanupTransaction(key);
        reject(new Error('SDO写入超时'));
      }, 10000);

      if (dataBuffer.length <= 4) {
        this.writeExpedited(key, txId, index, subIndex, dataBuffer, timeout, resolve, reject);
      } else {
        this.writeSegmented(key, txId, rxId, index, subIndex, dataBuffer, timeout, resolve, reject);
      }
    });
  }

  writeExpedited(key, txId, index, subIndex, data, timeout, resolve, reject) {
    const noDataBytes = 4 - data.length;
    const cmdByte = 0x23 | (noDataBytes << 2) | 0x01;

    const sdoCmd = Buffer.alloc(8);
    sdoCmd[0] = cmdByte;
    sdoCmd[1] = index & 0xFF;
    sdoCmd[2] = (index >> 8) & 0xFF;
    sdoCmd[3] = subIndex;
    data.copy(sdoCmd, 4);

    this.pendingTransactions.set(key, {
      type: 'write',
      resolve,
      reject,
      timeout,
      data: Buffer.alloc(0),
      totalSize: data.length,
      segmented: false,
      txId
    });

    this.can.send(txId, sdoCmd).catch((err) => {
      clearTimeout(timeout);
      this.cleanupTransaction(key);
      reject(err);
    });
  }

  writeSegmented(key, txId, rxId, index, subIndex, data, timeout, resolve, reject) {
    const cmdByte = 0x21;
    const size = data.length;

    const sdoCmd = Buffer.from([
      cmdByte,
      index & 0xFF,
      (index >> 8) & 0xFF,
      subIndex,
      size & 0xFF,
      (size >> 8) & 0xFF,
      (size >> 16) & 0xFF,
      (size >> 24) & 0xFF
    ]);

    this.pendingTransactions.set(key, {
      type: 'write',
      resolve,
      reject,
      timeout,
      data: data,
      totalSize: size,
      offset: 0,
      toggle: 0,
      segmented: true,
      txId,
      rxId,
      retryCount: 0,
      segmentTimeout: null,
      lastSegment: null
    });

    this.can.send(txId, sdoCmd).catch((err) => {
      clearTimeout(timeout);
      this.cleanupTransaction(key);
      reject(err);
    });
  }

  handleCANMessage(msg) {
    const id = msg.id;
    const data = msg.data;

    if ((id & 0x780) !== 0x580) return;

    const nodeId = id & 0x7F;
    const cmdByte = data[0];
    const index = data[1] | (data[2] << 8);
    const subIndex = data[3];
    const key = `${nodeId}-${index}-${subIndex}`;

    const transaction = this.pendingTransactions.get(key);
    if (!transaction) return;

    if ((cmdByte & 0xE0) === 0x80) {
      const abortCode = data.readUInt32LE(4);
      this.handleAbort(key, abortCode);
      return;
    }

    if (transaction.type === 'read') {
      this.handleReadResponse(key, cmdByte, data, transaction);
    } else if (transaction.type === 'write') {
      this.handleWriteResponse(key, cmdByte, data, transaction);
    }
  }

  handleReadResponse(key, cmdByte, data, transaction) {
    const index = data[1] | (data[2] << 8);
    const subIndex = data[3];

    if ((cmdByte & 0xE0) === 0x40) {
      const totalSize = data.readUInt32LE(4);
      transaction.totalSize = totalSize;
      transaction.data = Buffer.alloc(0);
      transaction.segmented = true;
      
      this.clearSegmentTimeout(transaction);
      const ack = Buffer.from([0x60, index & 0xFF, (index >> 8) & 0xFF, subIndex, 0x00, 0x00, 0x00, 0x00]);
      this.can.send(0x601, ack);
      this.startSegmentTimeout(key, transaction, ack);
    } else if ((cmdByte & 0xE0) === 0x42 || (cmdByte & 0xE0) === 0x43) {
      const noDataBytes = (cmdByte >> 2) & 0x03;
      const payloadSize = 4 - noDataBytes;
      const result = data.slice(4, 4 + payloadSize);
      
      this.completeTransaction(key, result);
    } else if ((cmdByte & 0xE0) === 0x00 || (cmdByte & 0xE0) === 0x10) {
      this.handleSegmentResponse(key, cmdByte, data, transaction);
    }
  }

  handleSegmentResponse(key, cmdByte, data, transaction) {
    this.clearSegmentTimeout(transaction);

    const expectedToggle = transaction.toggle << 4;
    const receivedToggle = cmdByte & 0x10;
    
    if (receivedToggle !== expectedToggle) {
      this.retryLastSegment(key, transaction);
      return;
    }

    const isLast = (cmdByte & 0x01) === 0x01;
    const noDataBytes = (cmdByte >> 1) & 0x07;
    const segmentSize = 7 - noDataBytes;
    const segmentData = data.slice(1, 1 + segmentSize);

    transaction.data = Buffer.concat([transaction.data, segmentData]);
    transaction.retryCount = 0;

    this.emit('progress', {
      key,
      transferred: transaction.data.length,
      total: transaction.totalSize,
      percent: Math.round((transaction.data.length / transaction.totalSize) * 100)
    });

    if (isLast) {
      this.completeTransaction(key, transaction.data);
    } else {
      transaction.toggle = 1 - transaction.toggle;
      const ack = Buffer.from([transaction.toggle << 4, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      transaction.lastSegment = ack;
      this.can.send(0x601, ack);
      this.startSegmentTimeout(key, transaction, ack);
    }
  }

  handleWriteResponse(key, cmdByte, data, transaction) {
    if ((cmdByte & 0xE0) === 0x60) {
      this.clearSegmentTimeout(transaction);
      transaction.retryCount = 0;

      if (transaction.segmented && transaction.offset < transaction.totalSize) {
        this.sendNextSegment(key, transaction);
      } else {
        this.completeTransaction(key, { success: true, bytesWritten: transaction.totalSize });
      }
    }
  }

  sendNextSegment(key, transaction) {
    const remaining = transaction.totalSize - transaction.offset;
    const segmentSize = Math.min(7, remaining);
    const isLast = segmentSize === remaining;

    const segment = Buffer.alloc(8);
    segment[0] = transaction.toggle << 4;
    if (isLast) segment[0] |= 0x01;
    segment[0] |= ((7 - segmentSize) << 1);

    transaction.data.copy(segment, 1, transaction.offset, transaction.offset + segmentSize);
    transaction.lastSegment = Buffer.from(segment);

    this.emit('progress', {
      key,
      transferred: transaction.offset + segmentSize,
      total: transaction.totalSize,
      percent: Math.round(((transaction.offset + segmentSize) / transaction.totalSize) * 100)
    });

    this.can.send(transaction.txId, segment);
    this.startSegmentTimeout(key, transaction, segment);

    transaction.offset += segmentSize;
    transaction.toggle = 1 - transaction.toggle;
  }

  startSegmentTimeout(key, transaction, segmentData) {
    this.clearSegmentTimeout(transaction);

    transaction.segmentTimeout = setTimeout(() => {
      this.retryLastSegment(key, transaction, segmentData);
    }, this.SEGMENT_TIMEOUT);
  }

  clearSegmentTimeout(transaction) {
    if (transaction.segmentTimeout) {
      clearTimeout(transaction.segmentTimeout);
      transaction.segmentTimeout = null;
    }
  }

  retryLastSegment(key, transaction, segmentData) {
    transaction.retryCount = (transaction.retryCount || 0) + 1;

    if (transaction.retryCount > this.MAX_RETRIES) {
      this.cleanupTransaction(key);
      transaction.reject(new Error(`分块传输失败，已重试${this.MAX_RETRIES}次`));
      return;
    }

    this.emit('progress', {
      key,
      transferred: transaction.offset || transaction.data.length,
      total: transaction.totalSize,
      percent: Math.round(((transaction.offset || transaction.data.length) / transaction.totalSize) * 100),
      retry: transaction.retryCount
    });

    const dataToResend = segmentData || transaction.lastSegment;
    if (dataToResend) {
      if (transaction.type === 'read') {
        this.can.send(0x601, dataToResend);
      } else if (transaction.type === 'write') {
        this.can.send(transaction.txId, dataToResend);
      }
      this.startSegmentTimeout(key, transaction, dataToResend);
    }
  }

  handleAbort(key, abortCode) {
    const transaction = this.pendingTransactions.get(key);
    if (transaction) {
      this.clearSegmentTimeout(transaction);
      clearTimeout(transaction.timeout);
      transaction.reject(new Error(`SDO中止，代码: 0x${abortCode.toString(16).padStart(8, '0')}`));
      this.pendingTransactions.delete(key);
    }
  }

  completeTransaction(key, result) {
    const transaction = this.pendingTransactions.get(key);
    if (transaction) {
      this.clearSegmentTimeout(transaction);
      clearTimeout(transaction.timeout);
      transaction.resolve(result);
      this.pendingTransactions.delete(key);
    }
  }

  cleanupTransaction(key) {
    const transaction = this.pendingTransactions.get(key);
    if (transaction) {
      this.clearSegmentTimeout(transaction);
      clearTimeout(transaction.timeout);
      this.pendingTransactions.delete(key);
    }
  }

  async batchRead(nodeId, entries) {
    const results = [];
    const total = entries.length;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const index = typeof entry.index === 'string' ? parseInt(entry.index, 16) : entry.index;
      const subIndex = entry.subIndex || 0;

      this.emit('batch-progress', {
        operation: 'read',
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100),
        index,
        subIndex,
        status: 'reading'
      });

      try {
        const data = await this.read(nodeId, index, subIndex);
        results.push({
          index,
          subIndex,
          name: entry.name || '',
          data: Array.from(data),
          hex: Buffer.from(data).toString('hex').toUpperCase(),
          length: data.length,
          transferType: data.length > 4 ? 'segmented' : 'expedited',
          success: true,
          error: null
        });
      } catch (error) {
        results.push({
          index,
          subIndex,
          name: entry.name || '',
          data: null,
          hex: '',
          length: 0,
          transferType: '',
          success: false,
          error: error.message
        });
      }

      if (i < entries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }

    return results;
  }

  async batchWrite(nodeId, entries) {
    const results = [];
    const total = entries.length;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const index = typeof entry.index === 'string' ? parseInt(entry.index, 16) : entry.index;
      const subIndex = entry.subIndex || 0;
      const data = entry.data || [];

      this.emit('batch-progress', {
        operation: 'write',
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100),
        index,
        subIndex,
        status: 'writing'
      });

      try {
        const result = await this.write(nodeId, index, subIndex, data);
        results.push({
          index,
          subIndex,
          name: entry.name || '',
          bytesWritten: result.bytesWritten || data.length,
          success: true,
          error: null
        });
      } catch (error) {
        results.push({
          index,
          subIndex,
          name: entry.name || '',
          bytesWritten: 0,
          success: false,
          error: error.message
        });
      }

      if (i < entries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }

    return results;
  }
}

module.exports = SDOProtocol;
