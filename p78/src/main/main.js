const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const remoteMain = require('@electron/remote/main');

let mainWindow;
let oscilloscope = null;

try {
    const { Oscilloscope } = require('../../build/Release/oscilloscope.node');
    oscilloscope = new Oscilloscope();
} catch (e) {
    console.log('C++ module not loaded, using mock mode:', e.message);
}

class MockOscilloscope {
    constructor() {
        this.connected = false;
        this.capturing = false;
        this.mockData = [];
        this.phase = 0;
    }

    open() {
        this.connected = true;
        return true;
    }

    close() {
        this.connected = false;
        this.capturing = false;
        return true;
    }

    startCapture() {
        if (!this.connected) return false;
        this.capturing = true;
        return true;
    }

    stopCapture() {
        this.capturing = false;
        return true;
    }

    isConnected() {
        return this.connected;
    }

    readData() {
        if (!this.capturing) return [];
        
        const data = [];
        const len = 1024;
        for (let i = 0; i < len; i++) {
            this.phase += 0.1;
            const noise = (Math.random() - 0.5) * 500;
            const value = Math.sin(this.phase) * 15000 + Math.sin(this.phase * 2.5) * 5000 + noise;
            data.push(Math.round(value));
        }
        return data;
    }

    setVoltageScale() { return true; }
    setTimeScale() { return true; }
    setTrigger() { return true; }
}

if (!oscilloscope) {
    oscilloscope = new MockOscilloscope();
}

remoteMain.initialize();

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        backgroundColor: '#1a1a2e',
        title: 'USB Oscilloscope'
    });

    remoteMain.enable(mainWindow.webContents);

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        if (oscilloscope) {
            oscilloscope.stopCapture();
            oscilloscope.close();
        }
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

ipcMain.handle('oscilloscope:open', async () => {
    return oscilloscope.open();
});

ipcMain.handle('oscilloscope:close', async () => {
    return oscilloscope.close();
});

ipcMain.handle('oscilloscope:startCapture', async () => {
    return oscilloscope.startCapture();
});

ipcMain.handle('oscilloscope:stopCapture', async () => {
    return oscilloscope.stopCapture();
});

ipcMain.handle('oscilloscope:readData', async () => {
    return oscilloscope.readData();
});

ipcMain.handle('oscilloscope:isConnected', async () => {
    return oscilloscope.isConnected();
});

ipcMain.handle('oscilloscope:setVoltageScale', async (event, scale) => {
    return oscilloscope.setVoltageScale(scale);
});

ipcMain.handle('oscilloscope:setTimeScale', async (event, scale) => {
    return oscilloscope.setTimeScale(scale);
});

ipcMain.handle('oscilloscope:setTrigger', async (event, level, edge) => {
    return oscilloscope.setTrigger(level, edge);
});

let dataChannelInterval = null;
let dataChannelActive = false;
let dataBacklog = [];
const MAX_BACKLOG = 10;
let lastSendTime = 0;
let sampleCount = 0;

function sendDataBatch() {
    if (!dataChannelActive || !mainWindow) return;
    
    const now = Date.now();
    const data = oscilloscope.readData();
    
    if (data && data.length > 0) {
        sampleCount += data.length;
        
        if (dataBacklog.length < MAX_BACKLOG) {
            if (data instanceof ArrayBuffer) {
                dataBacklog.push(Buffer.from(data));
            } else {
                dataBacklog.push(data);
            }
        }
        
        if (dataBacklog.length > 0 && now - lastSendTime > 15) {
            const merged = mergeDataBuffers(dataBacklog);
            mainWindow.webContents.send('datachannel:data', merged);
            dataBacklog = [];
            lastSendTime = now;
        }
    }
}

function mergeDataBuffers(buffers) {
    if (buffers.length === 0) return [];
    
    const first = buffers[0];
    if (Buffer.isBuffer(first)) {
        const totalLen = buffers.reduce((sum, b) => sum + b.length, 0);
        const merged = Buffer.concat(buffers, totalLen);
        const int16Array = new Int16Array(merged.buffer, merged.byteOffset, merged.length / 2);
        return Array.from(int16Array);
    } else {
        return buffers.flat();
    }
}

function getDynamicInterval() {
    const baseInterval = 16;
    const backlogFactor = Math.max(1, dataBacklog.length * 2);
    return Math.min(baseInterval * backlogFactor, 50);
}

ipcMain.handle('datachannel:start', async (event, intervalMs = 16) => {
    if (dataChannelInterval) {
        clearInterval(dataChannelInterval);
    }
    dataChannelActive = true;
    dataBacklog = [];
    sampleCount = 0;
    lastSendTime = Date.now();
    
    function scheduleSend() {
        if (!dataChannelActive) return;
        sendDataBatch();
        const nextInterval = getDynamicInterval();
        dataChannelInterval = setTimeout(scheduleSend, nextInterval);
    }
    
    scheduleSend();
    return true;
});

ipcMain.handle('datachannel:stop', async () => {
    dataChannelActive = false;
    if (dataChannelInterval) {
        clearTimeout(dataChannelInterval);
        dataChannelInterval = null;
    }
    dataBacklog = [];
    return true;
});

ipcMain.handle('datachannel:getStats', async () => {
    return {
        backlog: dataBacklog.length,
        sampleCount
    };
});
