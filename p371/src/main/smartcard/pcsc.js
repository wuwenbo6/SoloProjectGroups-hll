const { EventEmitter } = require('events');
const { execFile } = require('child_process');
const path = require('path');

const SCARD_SCOPE_USER = 0;
const SCARD_SHARE_SHARED = 2;
const SCARD_PROTOCOL_T0 = 1;
const SCARD_PROTOCOL_T1 = 2;
const SCARD_PROTOCOL_RAW = 0x00010000;

class PcscManager extends EventEmitter {
  constructor() {
    super();
    this.context = null;
    this.connections = new Map();
    this._monitoring = false;
    this._monitorProcess = null;
  }

  async establishContext() {
    try {
      const result = await this._pcscCommand('establish-context', {
        scope: SCARD_SCOPE_USER,
      });
      this.context = result.context;
      return result;
    } catch (err) {
      this.emit('error', new Error(`Failed to establish PC/SC context: ${err.message}`));
      throw err;
    }
  }

  async releaseContext() {
    if (!this.context) return;
    try {
      await this._pcscCommand('release-context', { context: this.context });
    } catch (_err) {
      // ignore
    }
    this.context = null;
  }

  async listReaders() {
    if (!this.context) {
      throw new Error('No PC/SC context established');
    }
    const result = await this._pcscCommand('list-readers', {
      context: this.context,
    });
    return result.readers || [];
  }

  async connect(readerName) {
    if (!this.context) {
      throw new Error('No PC/SC context established');
    }

    const result = await this._pcscCommand('connect', {
      context: this.context,
      reader: readerName,
      shareMode: SCARD_SHARE_SHARED,
      preferredProtocols: SCARD_PROTOCOL_T0 | SCARD_PROTOCOL_T1,
    });

    this.connections.set(readerName, {
      handle: result.handle,
      protocol: result.protocol,
    });

    return {
      handle: result.handle,
      protocol: result.protocol,
      atr: result.atr || '',
    };
  }

  async disconnect(readerName) {
    const conn = this.connections.get(readerName);
    if (!conn) return;

    try {
      await this._pcscCommand('disconnect', {
        handle: conn.handle,
        disposition: 0,
      });
    } catch (_err) {
      // ignore
    }

    this.connections.delete(readerName);
  }

  async transmit(readerName, apdu) {
    const conn = this.connections.get(readerName);
    if (!conn) {
      throw new Error(`No active connection for reader: ${readerName}`);
    }

    const result = await this._pcscCommand('transmit', {
      handle: conn.handle,
      protocol: conn.protocol,
      apdu: apdu.toString('hex'),
    });

    const responseData = Buffer.from(result.data || '', 'hex');
    const sw = responseData.subarray(-2);
    const data = responseData.subarray(0, -2);

    return {
      data,
      sw,
      raw: responseData,
    };
  }

  async coldReset(readerName) {
    const conn = this.connections.get(readerName);
    if (!conn) {
      throw new Error(`No active connection for reader: ${readerName}`);
    }

    const result = await this._pcscCommand('cold-reset', {
      handle: conn.handle,
      protocol: conn.protocol,
      context: this.context,
      reader: readerName,
    });

    if (result.handle) {
      conn.handle = result.handle;
    }
    if (result.protocol) {
      conn.protocol = result.protocol;
    }

    return {
      atr: result.atr || '',
      protocol: result.protocol,
      reset: result.reset,
    };
  }

  async reconnect(readerName, disposition = 1) {
    const conn = this.connections.get(readerName);
    if (!conn) {
      throw new Error(`No active connection for reader: ${readerName}`);
    }

    const result = await this._pcscCommand('reconnect', {
      handle: conn.handle,
      protocol: conn.protocol,
      disposition,
    });

    if (result.handle) {
      conn.handle = result.handle;
    }
    if (result.protocol) {
      conn.protocol = result.protocol;
    }

    return {
      atr: result.atr || '',
      protocol: result.protocol,
      disposition: result.disposition,
    };
  }

  startStatusChange() {
    if (this._monitoring) return;
    this._monitoring = true;

    this._pollReaders();
  }

  stopStatusChange() {
    this._monitoring = false;
  }

  async _pollReaders() {
    while (this._monitoring) {
      try {
        if (!this.context) {
          await this.establishContext();
        }

        const readers = await this.listReaders();
        for (const reader of readers) {
          try {
            const status = await this._pcscCommand('status', {
              context: this.context,
              reader,
            });

            if (status.state & 0x0020) {
              this.emit('reader-event', {
                type: 'card-inserted',
                reader,
                atr: status.atr,
              });
            } else if (status.state & 0x0040) {
              this.emit('reader-event', {
                type: 'card-removed',
                reader,
              });
            }
          } catch (_err) {
            // reader may have been removed
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        this.emit('error', err);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  _pcscCommand(command, params) {
    return new Promise((resolve, reject) => {
      const args = [command, JSON.stringify(params)];
      const helperPath = path.join(__dirname, 'pcsc-helper.js');

      execFile('node', [helperPath, ...args], {
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }

        try {
          const result = JSON.parse(stdout.trim());
          if (result.error) {
            reject(new Error(result.error));
          } else {
            resolve(result);
          }
        } catch (parseErr) {
          reject(new Error(`Failed to parse PC/SC response: ${stdout}`));
        }
      });
    });
  }
}

module.exports = { PcscManager };
