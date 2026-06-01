const USBTMCDriver = require('./USBTMCDriver');
const GPIBDriver = require('./GPIBDriver');
const SCPIParser = require('./SCPIParser');

const DEFAULT_TIMEOUT = 10000;
const MAX_LOCK_WAIT = 30000;

class Mutex {
  constructor() {
    this.queue = [];
    this.locked = false;
  }

  acquire(timeout = MAX_LOCK_WAIT) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.queue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.queue.splice(index, 1);
          reject(new Error(`Lock acquisition timeout after ${timeout}ms`));
        }
      }, timeout);

      const item = {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      };

      if (!this.locked) {
        this.locked = true;
        resolve(this._createRelease());
      } else {
        this.queue.push(item);
      }
    });
  }

  _createRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next.resolve(this._createRelease());
      } else {
        this.locked = false;
      }
    };
  }

  isLocked() {
    return this.locked;
  }

  pendingCount() {
    return this.queue.length;
  }
}

function withTimeout(promise, timeout, errorMessage) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(errorMessage || `Operation timed out after ${timeout}ms`));
    }, timeout);
  });

  return Promise.race([promise, timeoutPromise])
    .finally(() => clearTimeout(timer));
}

class InstrumentManager {
  constructor(options = {}) {
    this.drivers = new Map();
    this.connections = new Map();
    this.locks = new Map();
    this.parser = new SCPIParser();
    this.defaultTimeout = options.defaultTimeout || DEFAULT_TIMEOUT;
    this._initializeDrivers();
  }

  _initializeDrivers() {
    this.drivers.set('usbtmc', new USBTMCDriver());
    this.drivers.set('gpib', new GPIBDriver());
  }

  async listDevices() {
    const devices = [];
    
    for (const [type, driver] of this.drivers) {
      try {
        const driverDevices = await driver.listDevices();
        devices.push(...driverDevices.map(d => ({
          ...d,
          type
        })));
      } catch (error) {
        console.warn(`Failed to list ${type} devices:`, error.message);
      }
    }
    
    return devices;
  }

  async connect(deviceId) {
    const [type, id] = deviceId.split(':');
    const driver = this.drivers.get(type);
    
    if (!driver) {
      throw new Error(`Unknown device type: ${type}`);
    }

    const connection = await driver.connect(id);
    this.connections.set(deviceId, {
      driver,
      connection,
      type,
      connectedAt: Date.now()
    });
    this.locks.set(deviceId, new Mutex());

    return { success: true, deviceId };
  }

  async disconnect(deviceId) {
    const conn = this.connections.get(deviceId);
    const lock = this.locks.get(deviceId);
    
    if (lock) {
      await lock.acquire(5000).catch(() => {});
    }
    
    if (conn) {
      await conn.driver.disconnect(conn.connection);
      this.connections.delete(deviceId);
    }
    this.locks.delete(deviceId);
    
    return { success: true };
  }

  async sendCommand(deviceId, command, timeout) {
    const conn = this._getConnection(deviceId);
    const lock = this._getLock(deviceId);
    const release = await lock.acquire();
    
    try {
      await withTimeout(
        conn.driver.send(conn.connection, command + '\n'),
        timeout || this.defaultTimeout,
        `Send command timeout after ${timeout || this.defaultTimeout}ms: ${command}`
      );
      return { success: true, command };
    } catch (error) {
      throw new Error(`Send failed for device ${deviceId}: ${error.message}`);
    } finally {
      release();
    }
  }

  async query(deviceId, command, timeout) {
    const conn = this._getConnection(deviceId);
    const lock = this._getLock(deviceId);
    const release = await lock.acquire();
    
    try {
      await withTimeout(
        conn.driver.send(conn.connection, command + '\n'),
        timeout || this.defaultTimeout,
        `Query send timeout after ${timeout || this.defaultTimeout}ms: ${command}`
      );

      const response = await withTimeout(
        conn.driver.read(conn.connection),
        timeout || this.defaultTimeout,
        `Query read timeout after ${timeout || this.defaultTimeout}ms: ${command}`
      );
      
      const parsed = this.parser.parse(response);

      return {
        success: true,
        raw: response,
        parsed,
        command
      };
    } catch (error) {
      throw new Error(`Query failed for device ${deviceId}: ${error.message}`);
    } finally {
      release();
    }
  }

  async batchCommands(deviceId, commands, options = {}) {
    const { 
      stopOnError = true, 
      delayMs = 0,
      timeout = this.defaultTimeout 
    } = options;
    
    const conn = this._getConnection(deviceId);
    const lock = this._getLock(deviceId);
    const release = await lock.acquire();
    
    const results = [];
    
    try {
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        
        if (delayMs > 0 && i > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        try {
          if (cmd.endsWith('?')) {
            await withTimeout(
              conn.driver.send(conn.connection, cmd + '\n'),
              timeout,
              `Query send timeout: ${cmd}`
            );
            
            const response = await withTimeout(
              conn.driver.read(conn.connection),
              timeout,
              `Query read timeout: ${cmd}`
            );
            
            results.push({
              index: i,
              command: cmd,
              success: true,
              raw: response,
              parsed: this.parser.parse(response)
            });
          } else {
            await withTimeout(
              conn.driver.send(conn.connection, cmd + '\n'),
              timeout,
              `Send timeout: ${cmd}`
            );
            
            results.push({
              index: i,
              command: cmd,
              success: true
            });
          }
        } catch (error) {
          results.push({
            index: i,
            command: cmd,
            success: false,
            error: error.message
          });
          
          if (stopOnError) {
            throw new Error(`Batch command failed at index ${i} (${cmd}): ${error.message}`);
          }
        }
      }
      
      return { success: true, results };
    } finally {
      release();
    }
  }

  _getConnection(deviceId) {
    const conn = this.connections.get(deviceId);
    if (!conn) {
      throw new Error(`Not connected to device: ${deviceId}`);
    }
    return conn;
  }

  _getLock(deviceId) {
    let lock = this.locks.get(deviceId);
    if (!lock) {
      lock = new Mutex();
      this.locks.set(deviceId, lock);
    }
    return lock;
  }

  isConnected(deviceId) {
    return this.connections.has(deviceId);
  }

  isBusy(deviceId) {
    const lock = this.locks.get(deviceId);
    return lock ? lock.isLocked() : false;
  }

  getPendingCount(deviceId) {
    const lock = this.locks.get(deviceId);
    return lock ? lock.pendingCount() : 0;
  }

  setTimeout(deviceId, timeout) {
    const conn = this.connections.get(deviceId);
    if (conn) {
      conn.timeout = timeout;
    }
  }

  async resetConnection(deviceId) {
    const conn = this.connections.get(deviceId);
    if (conn) {
      try {
        await conn.driver.send(conn.connection, '*RST\n');
      } catch (e) {
        console.warn(`Reset failed for ${deviceId}:`, e.message);
      }
    }
    return { success: true };
  }
}

InstrumentManager.Mutex = Mutex;
InstrumentManager.withTimeout = withTimeout;
InstrumentManager.DEFAULT_TIMEOUT = DEFAULT_TIMEOUT;
InstrumentManager.MAX_LOCK_WAIT = MAX_LOCK_WAIT;

module.exports = InstrumentManager;
