const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { SpiceClient } = require('./spice/client');
const { SmartCardManager } = require('./smartcard/manager');

let mainWindow = null;
let spiceClient = null;
let cardManager = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'SPICE SmartCard Redirector',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  cardManager = new SmartCardManager();
  setupIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (spiceClient) {
    spiceClient.disconnect();
  }
  if (cardManager) {
    cardManager.stop();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function setupIpcHandlers() {
  ipcMain.handle('spice:connect', async (_event, config) => {
    try {
      if (spiceClient) {
        spiceClient.disconnect();
      }
      spiceClient = new SpiceClient(config);
      spiceClient.on('connected', () => {
        sendToRenderer('spice:status', { connected: true, host: config.host });
      });
      spiceClient.on('disconnected', () => {
        sendToRenderer('spice:status', { connected: false });
      });
      spiceClient.on('smartcard-message', (msg) => {
        handleSmartCardMessage(msg);
      });
      spiceClient.on('error', (err) => {
        sendToRenderer('spice:error', { message: err.message });
      });
      await spiceClient.connect();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('spice:disconnect', async () => {
    if (spiceClient) {
      spiceClient.disconnect();
      spiceClient = null;
    }
    return { success: true };
  });

  ipcMain.handle('card:list-readers', async () => {
    if (!cardManager) return { readers: [] };
    return { readers: cardManager.getReaders() };
  });

  ipcMain.handle('card:connect', async (_event, readerName) => {
    try {
      const result = await cardManager.connectReader(readerName);
      sendToRenderer('card:status', { reader: readerName, connected: true });
      return { success: true, atr: result.atr, atrParsed: result.atrParsed };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:disconnect', async (_event, readerName) => {
    try {
      await cardManager.disconnectReader(readerName);
      sendToRenderer('card:status', { reader: readerName, connected: false });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:cold-reset', async (_event, readerName) => {
    try {
      const result = await cardManager.coldReset(readerName);
      sendToRenderer('card:status', { reader: readerName, connected: true, atr: result.atr, atrParsed: result.atrParsed });
      return {
        success: true,
        atr: result.atr,
        atrParsed: result.atrParsed,
        reset: result.reset,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:parse-atr', async (_event, atrHex) => {
    try {
      const parsed = cardManager.parseAtr(atrHex);
      return { success: true, parsed };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:match-select', async (_event, apduHex) => {
    try {
      const match = cardManager.matchSelectCommand(apduHex);
      return { success: true, match };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:get-selected-app', async (_event, readerName) => {
    try {
      const app = cardManager.getSelectedApp(readerName);
      return { success: true, app };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:add-application', async (_event, app) => {
    try {
      cardManager.addApplication(app);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:get-app-registry', async () => {
    try {
      const apps = cardManager.getApplicationRegistry();
      return { success: true, apps };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:transmit', async (_event, readerName, apduHex) => {
    try {
      const response = await cardManager.transmit(readerName, apduHex);
      const logEntry = {
        reader: readerName,
        direction: 'outgoing',
        apdu: apduHex,
        response: response.data,
        sw: response.sw,
        timestamp: Date.now(),
        selectMatch: response.selectMatch,
      };
      sendToRenderer('card:apdu-log', logEntry);
      return { success: true, data: response.data, sw: response.sw, selectMatch: response.selectMatch };
    } catch (err) {
      const logEntry = {
        reader: readerName,
        direction: 'outgoing',
        apdu: apduHex,
        response: null,
        error: err.message,
        timestamp: Date.now(),
      };
      sendToRenderer('card:apdu-log', logEntry);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:start-monitor', async () => {
    if (cardManager) {
      cardManager.startMonitoring((event) => {
        sendToRenderer('card:reader-event', event);
      });
    }
    return { success: true };
  });

  ipcMain.handle('card:stop-monitor', async () => {
    if (cardManager) {
      cardManager.stopMonitoring();
    }
    return { success: true };
  });

  ipcMain.handle('card:get-slots', async () => {
    try {
      const slots = cardManager.getSlots();
      return { success: true, slots };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:assign-slot', async (_event, slotId, readerName) => {
    try {
      cardManager.assignReaderToSlot(slotId, readerName);
      sendToRenderer('card:slot-changed', { slotId, readerName });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:unassign-slot', async (_event, slotId) => {
    try {
      cardManager.unassignSlot(slotId);
      sendToRenderer('card:slot-changed', { slotId, readerName: null });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:swap-slots', async (_event, slotId1, slotId2) => {
    try {
      cardManager.swapSlots(slotId1, slotId2);
      sendToRenderer('card:slots-swapped', { slotId1, slotId2 });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:add-slot', async (_event, slotId) => {
    try {
      cardManager.addSlot(slotId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:remove-slot', async (_event, slotId) => {
    try {
      cardManager.removeSlot(slotId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:set-max-slots', async (_event, count) => {
    try {
      cardManager.setMaxSlots(count);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:get-traces', async (_event, filter) => {
    try {
      const traces = cardManager.getTraces(filter);
      return { success: true, traces };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:get-trace-count', async () => {
    try {
      const count = cardManager.getTraceCount();
      return { success: true, count };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:clear-traces', async () => {
    try {
      cardManager.clearTraces();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:show-save-dialog', async (_event, options) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, options);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:export-traces', async (_event, filePath, format, filter) => {
    try {
      const result = cardManager.exportTraces(filePath, format, filter);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('card:get-trace-formats', async () => {
    try {
      const formats = cardManager.getTraceFormats();
      return { success: true, formats };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

async function handleSmartCardMessage(msg) {
  if (!cardManager) return;

  try {
    if (msg.type === 'PCSC_APDU_REQUEST') {
      const slotId = msg.slotId;
      const readerName = slotId !== undefined && slotId !== null
        ? cardManager.getReaderForSlot(slotId)
        : cardManager.getDefaultReader();

      if (!readerName) {
        spiceClient.sendSmartCardResponse({
          type: 'PCSC_APDU_RESPONSE',
          messageId: msg.messageId,
          error: 'NO_READER_AVAILABLE',
        });
        return;
      }

      const apduHex = Buffer.from(msg.apdu).toString('hex');
      const response = await cardManager.transmitFromSpice(readerName, apduHex, slotId);

      const logEntry = {
        reader: readerName,
        direction: 'incoming',
        apdu: apduHex,
        response: response.data,
        sw: response.sw,
        timestamp: Date.now(),
        source: 'spice-vm',
        slotId,
        selectMatch: response.selectMatch,
      };
      sendToRenderer('card:apdu-log', logEntry);

      if (response.selectMatch && response.selectMatch.matchedApplications && response.selectMatch.matchedApplications.length > 0) {
        sendToRenderer('card:app-selected', {
          reader: readerName,
          app: response.selectMatch.matchedApplications[0],
        });
      }

      spiceClient.sendSmartCardResponse({
        type: 'PCSC_APDU_RESPONSE',
        messageId: msg.messageId,
        data: response.data,
        sw: response.sw,
      });
    } else if (msg.type === 'PCSC_CONNECT') {
      const slotId = msg.slotId;
      const readerName = slotId !== undefined && slotId !== null
        ? cardManager.getReaderForSlot(slotId)
        : cardManager.getDefaultReader();

      const result = await cardManager.connectReader(readerName);
      spiceClient.sendSmartCardResponse({
        type: 'PCSC_CONNECT_RESPONSE',
        messageId: msg.messageId,
        atr: result.atr,
        atrParsed: result.atrParsed,
      });
    } else if (msg.type === 'PCSC_DISCONNECT') {
      const slotId = msg.slotId;
      const readerName = slotId !== undefined && slotId !== null
        ? cardManager.getReaderForSlot(slotId)
        : cardManager.getDefaultReader();

      await cardManager.disconnectReader(readerName);
      spiceClient.sendSmartCardResponse({
        type: 'PCSC_DISCONNECT_RESPONSE',
        messageId: msg.messageId,
      });
    } else if (msg.type === 'PCSC_RESET_CARD' || msg.type === 'VSC_COLD_RESET') {
      const slotId = msg.slotId;
      const readerName = slotId !== undefined && slotId !== null
        ? cardManager.getReaderForSlot(slotId)
        : cardManager.getDefaultReader();

      const result = await cardManager.coldReset(readerName);
      spiceClient.sendSmartCardResponse({
        type: 'PCSC_RESET_RESPONSE',
        messageId: msg.messageId,
        atr: result.atr,
        atrParsed: result.atrParsed,
      });

      sendToRenderer('card:cold-reset', {
        reader: readerName,
        atr: result.atr,
        atrParsed: result.atrParsed,
        slotId,
      });
    }
  } catch (err) {
    sendToRenderer('spice:error', { message: `SmartCard handler error: ${err.message}` });
  }
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}
