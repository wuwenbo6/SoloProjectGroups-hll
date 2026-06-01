const pcsclite = require('@pokusew/pcsclite') || null;
const { execSync } = require('child_process');

const SCARD_SCOPE_USER = 0;

async function main() {
  const command = process.argv[2];
  const params = JSON.parse(process.argv[3]);

  try {
    let result;

    switch (command) {
      case 'establish-context': {
        result = await establishContext();
        break;
      }
      case 'release-context': {
        result = await releaseContext(params.context);
        break;
      }
      case 'list-readers': {
        result = await listReaders(params.context);
        break;
      }
      case 'connect': {
        result = await connectReader(params);
        break;
      }
      case 'disconnect': {
        result = await disconnectReader(params);
        break;
      }
      case 'transmit': {
        result = await transmitApdu(params);
        break;
      }
      case 'status': {
        result = await readerStatus(params);
        break;
      }
      case 'cold-reset': {
        result = await coldReset(params);
        break;
      }
      case 'reconnect': {
        result = await reconnect(params);
        break;
      }
      default: {
        throw new Error(`Unknown command: ${command}`);
      }
    }

    process.stdout.write(JSON.stringify(result));
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: err.message }));
  }
}

function getPcsc() {
  if (pcsclite) return pcsclite;

  try {
    return require('@pokusew/pcsclite');
  } catch (_e) {
    // fallback
  }

  return null;
}

async function establishContext() {
  const pcsc = getPcsc();
  if (pcsc) {
    const context = pcsc.establishContext(SCARD_SCOPE_USER);
    return { context: context.toString('hex') };
  }

  return nativeFallback('establish-context', {});
}

async function releaseContext(context) {
  const pcsc = getPcsc();
  if (pcsc) {
    pcsc.releaseContext(Buffer.from(context, 'hex'));
    return { success: true };
  }

  return nativeFallback('release-context', { context });
}

async function listReaders(context) {
  const pcsc = getPcsc();
  if (pcsc) {
    const ctx = Buffer.from(context, 'hex');
    const readers = pcsc.listReaders(ctx);
    return { readers };
  }

  return nativeFallback('list-readers', { context });
}

async function connectReader(params) {
  const pcsc = getPcsc();
  if (pcsc) {
    const ctx = Buffer.from(params.context, 'hex');
    const result = pcsc.connect(ctx, params.reader, params.shareMode, params.preferredProtocols);
    return {
      handle: result.handle.toString('hex'),
      protocol: result.protocol,
      atr: result.atr ? result.atr.toString('hex') : '',
    };
  }

  return nativeFallback('connect', params);
}

async function disconnectReader(params) {
  const pcsc = getPcsc();
  if (pcsc) {
    pcsc.disconnect(Buffer.from(params.handle, 'hex'), params.disposition || 0);
    return { success: true };
  }

  return nativeFallback('disconnect', params);
}

async function transmitApdu(params) {
  const pcsc = getPcsc();
  if (pcsc) {
    const handle = Buffer.from(params.handle, 'hex');
    const apdu = Buffer.from(params.apdu, 'hex');
    const result = pcsc.transmit(handle, apdu, 65536);
    return { data: result.toString('hex') };
  }

  return nativeFallback('transmit', params);
}

async function readerStatus(params) {
  const pcsc = getPcsc();
  if (pcsc) {
    const ctx = Buffer.from(params.context, 'hex');
    const status = pcsc.status(ctx, params.reader);
    return {
      state: status.state,
      atr: status.atr ? status.atr.toString('hex') : '',
      protocol: status.protocol,
    };
  }

  return nativeFallback('status', params);
}

const SCARD_LEAVE_CARD = 0;
const SCARD_RESET_CARD = 1;
const SCARD_UNPOWER_CARD = 2;
const SCARD_EJECT_CARD = 3;

async function coldReset(params) {
  const pcsc = getPcsc();
  if (pcsc) {
    const handle = Buffer.from(params.handle, 'hex');

    let atrHex = '';
    try {
      const reconnectResult = pcsc.reconnect(
        handle,
        params.shareMode || 2,
        params.preferredProtocols || (1 | 2),
        SCARD_RESET_CARD
      );
      atrHex = reconnectResult.atr ? reconnectResult.atr.toString('hex') : '';
    } catch (resetErr) {
      pcsc.disconnect(handle, SCARD_UNPOWER_CARD);
      const ctx = Buffer.from(params.context, 'hex');
      const connectResult = pcsc.connect(
        ctx,
        params.reader,
        params.shareMode || 2,
        params.preferredProtocols || (1 | 2)
      );
      atrHex = connectResult.atr ? connectResult.atr.toString('hex') : '';
      return {
        handle: connectResult.handle.toString('hex'),
        protocol: connectResult.protocol,
        atr: atrHex,
        reset: true,
      };
    }

    return {
      handle: handle.toString('hex'),
      protocol: params.protocol || 2,
      atr: atrHex,
      reset: true,
    };
  }

  return nativeFallback('cold-reset', params);
}

async function reconnect(params) {
  const pcsc = getPcsc();
  if (pcsc) {
    const handle = Buffer.from(params.handle, 'hex');
    const disposition = params.disposition !== undefined ? params.disposition : SCARD_RESET_CARD;

    const result = pcsc.reconnect(
      handle,
      params.shareMode || 2,
      params.preferredProtocols || (1 | 2),
      disposition
    );

    return {
      handle: result.handle.toString('hex'),
      protocol: result.protocol,
      atr: result.atr ? result.atr.toString('hex') : '',
      disposition,
    };
  }

  return nativeFallback('reconnect', params);
}

function nativeFallback(command, params) {
  if (process.platform === 'darwin') {
    return macosFallback(command, params);
  } else if (process.platform === 'linux') {
    return linuxFallback(command, params);
  }

  throw new Error('No PC/SC implementation available for this platform');
}

function macosFallback(command, params) {
  if (command === 'list-readers') {
    try {
      const output = execSync('system_profiler SPCardReaderDataType 2>/dev/null || echo ""', {
        encoding: 'utf8',
        timeout: 5000,
      });

      const readers = [];
      const readerRegex = /Reader:\s*(.+)/g;
      let match;
      while ((match = readerRegex.exec(output)) !== null) {
        readers.push(match[1].trim());
      }

      if (readers.length === 0) {
        try {
          const scOutput = execSync('security list-smartcards 2>/dev/null || echo ""', {
            encoding: 'utf8',
            timeout: 5000,
          });
          if (scOutput.trim()) {
            readers.push('macOS SmartCard Slot');
          }
        } catch (_e) {
          // no smartcard
        }
      }

      return { readers };
    } catch (_e) {
      return { readers: [] };
    }
  }

  throw new Error(`macOS native fallback not supported for: ${command}`);
}

function linuxFallback(command, params) {
  if (command === 'list-readers') {
    try {
      const output = execSync('lsusb 2>/dev/null | grep -i smart || echo ""', {
        encoding: 'utf8',
        timeout: 5000,
      });

      const readers = [];
      if (output.trim()) {
        readers.push('CCID Reader (USB)');
      }

      return { readers };
    } catch (_e) {
      return { readers: [] };
    }
  }

  throw new Error(`Linux native fallback not supported for: ${command}`);
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ error: err.message }));
});
