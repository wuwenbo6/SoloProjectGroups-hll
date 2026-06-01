const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

class W25Q128 {
    constructor() {
        this.FLASH_SIZE = 16 * 1024 * 1024;
        this.SECTOR_SIZE = 4096;
        this.BLOCK_SIZE = 65536;
        this.PAGE_SIZE = 256;
        this.memory = Buffer.alloc(this.FLASH_SIZE, 0xFF);
        this.statusRegister = 0x00;
        this.isBusy = false;
        this.spiMode = 'SPI';
        this.qspiMode = false;
        this.ddrMode = false;
        this.dataWidth = 1;
        this.operationLog = [];
    }

    addOperationLog(operation, details) {
        this.operationLog.push({
            timestamp: Date.now(),
            datetime: new Date().toISOString(),
            operation: operation,
            mode: this.getCurrentMode(),
            ...details
        });
    }

    getCurrentMode() {
        let mode = this.spiMode;
        if (this.qspiMode) mode = 'QSPI';
        if (this.ddrMode) mode += '-DDR';
        return mode;
    }

    getOperationLog() {
        return this.operationLog;
    }

    clearOperationLog() {
        this.operationLog = [];
    }

    enableQSPI() {
        this.qspiMode = true;
        this.dataWidth = 4;
        this.addOperationLog('SET_MODE', { qspi: true, ddr: this.ddrMode });
        return { success: true, mode: 'QSPI' + (this.ddrMode ? '-DDR' : '') };
    }

    disableQSPI() {
        this.qspiMode = false;
        this.dataWidth = 1;
        this.addOperationLog('SET_MODE', { qspi: false, ddr: this.ddrMode });
        return { success: true, mode: 'SPI' + (this.ddrMode ? '-DDR' : '') };
    }

    enableDDR() {
        this.ddrMode = true;
        this.addOperationLog('SET_MODE', { qspi: this.qspiMode, ddr: true });
        return { success: true, mode: (this.qspiMode ? 'QSPI' : 'SPI') + '-DDR' };
    }

    disableDDR() {
        this.ddrMode = false;
        this.addOperationLog('SET_MODE', { qspi: this.qspiMode, ddr: false });
        return { success: true, mode: this.qspiMode ? 'QSPI' : 'SPI' };
    }

    readJEDECId() {
        const result = {
            manufacturerId: 0xEF,
            memoryType: 0x40,
            capacity: 0x18,
            manufacturer: 'Winbond',
            memoryTypeDesc: 'SPI Flash',
            capacityDesc: '128Mb (16MB)'
        };
        this.addOperationLog('READ_JEDEC', { result: result });
        return result;
    }

    readSFDP() {
        const sfdp = Buffer.alloc(512, 0xFF);

        sfdp.write('SFDP', 0);
        sfdp.writeUInt8(0x01, 4);
        sfdp.writeUInt8(0x06, 5);
        sfdp.writeUInt8(0x01, 6);
        sfdp.writeUInt8(0xFF, 7);

        sfdp.writeUInt32LE(0xE0FF0119, 8);

        const PARAM_OFFSET = 0x10;
        const P = PARAM_OFFSET;

        sfdp.writeUInt32LE(0x001868EF, P + 0x00);
        sfdp.writeUInt32LE(0x00004001, P + 0x04);

        sfdp.writeUInt32LE(0x00000000, P + 0x08);

        sfdp.writeUInt32LE(0x00FF0F00, P + 0x0C);

        sfdp.writeUInt32LE(0x0F1F3F0F, P + 0x10);

        sfdp.writeUInt32LE(0x00004004, P + 0x14);

        sfdp.writeUInt32LE(0x0000FFFF, P + 0x18);

        sfdp.writeUInt32LE(0xFFFFFFFF, P + 0x1C);

        sfdp.writeUInt32LE(0x0FFFFFFF, P + 0x20);

        sfdp.writeUInt32LE(0x00000000, P + 0x24);

        sfdp.writeUInt32LE(0xFFFFFFFF, P + 0x28);

        sfdp.writeUInt32LE(0x00000000, P + 0x2C);

        sfdp.writeUInt32LE(0xFFFFFFFF, P + 0x30);

        sfdp.writeUInt32LE(0x000000FF, P + 0x34);

        sfdp.writeUInt32LE(0xFFFF0000, P + 0x38);

        sfdp.writeUInt32LE(0x0000FFFF, P + 0x3C);

        sfdp.writeUInt32LE(0x00000000, P + 0x40);

        sfdp.writeUInt32LE(0x00000000, P + 0x44);

        sfdp.writeUInt32LE(0x00000000, P + 0x48);

        sfdp.writeUInt32LE(0x00000000, P + 0x4C);

        sfdp.writeUInt32LE(0x00000000, P + 0x50);

        sfdp.writeUInt32LE(0x00000000, P + 0x54);

        sfdp.writeUInt32LE(0x00300000, P + 0x58);

        sfdp.writeUInt32LE(0x00000000, P + 0x5C);

        sfdp.writeUInt32LE(0x00000000, P + 0x60);

        sfdp.writeUInt32LE(0x00000000, P + 0x64);

        sfdp.writeUInt32LE(0x00000000, P + 0x68);

        sfdp.writeUInt32LE(0x00000000, P + 0x6C);

        sfdp.writeUInt32LE(0x00000000, P + 0x70);

        sfdp.writeUInt32LE(0x00000000, P + 0x74);

        sfdp.writeUInt32LE(0x00000000, P + 0x78);

        sfdp.writeUInt32LE(0x00000000, P + 0x7C);

        sfdp.writeUInt8(0x19, PARAM_OFFSET + 0x80);
        sfdp.writeUInt8(0x01, PARAM_OFFSET + 0x81);
        sfdp.writeUInt8(0x00, PARAM_OFFSET + 0x82);
        sfdp.writeUInt8(0x00, PARAM_OFFSET + 0x83);
        sfdp.writeUInt32LE(0x0060FF80, PARAM_OFFSET + 0x84);

        sfdp.writeUInt32LE(0x00108018, PARAM_OFFSET + 0x88);

        sfdp.writeUInt32LE(0x00000000, PARAM_OFFSET + 0x8C);

        sfdp.writeUInt32LE(0x00000000, PARAM_OFFSET + 0x90);

        sfdp.writeUInt32LE(0x00000000, PARAM_OFFSET + 0x94);

        const dwords = [];
        for (let i = 0; i < 48; i++) {
            dwords.push(sfdp.readUInt32LE(PARAM_OFFSET + i * 4));
        }

        const result = {
            header: {
                signature: 'SFDP',
                versionMajor: 1,
                versionMinor: 6,
                numParamHeaders: 1
            },
            paramHeaders: [
                {
                    id: 1,
                    revision: 1,
                    length: 18,
                    offset: PARAM_OFFSET,
                    fourByteAddr: true,
                    fourByteAddrInstr4: true
                }
            ],
            dwords: dwords,
            parsed: {
                jedecManufacturerId: 0xEF,
                memoryType: 0x40,
                density: 0x001868,
                sectorSizes: [4096],
                pageSize: 256,
                blockEraseSizes: [32768, 65536],
                fourByteAddressModes: {
                    enter0xB7: true,
                    exit0xE9: true,
                    fourByteRead03: false,
                    fourByteRead0B: false,
                    fourByteRead0C: true,
                    fourByteProgram02: false,
                    fourByteProgram12: true,
                    fourByteErase21: true,
                    fourByteEraseDC: true
                }
            },
            data: Array.from(sfdp.slice(0, 256))
        };
        this.addOperationLog('READ_SFDP', { dataLength: result.data.length });
        return result;
    }

    eraseSector(address) {
        const start = address & ~(this.SECTOR_SIZE - 1);
        this.memory.fill(0xFF, start, start + this.SECTOR_SIZE);
        const result = {
            success: true,
            type: 'sector',
            address: start,
            size: this.SECTOR_SIZE
        };
        this.addOperationLog('ERASE_SECTOR', { address: start, size: this.SECTOR_SIZE });
        return result;
    }

    eraseBlock(address) {
        const start = address & ~(this.BLOCK_SIZE - 1);
        this.memory.fill(0xFF, start, start + this.BLOCK_SIZE);
        const result = {
            success: true,
            type: 'block',
            address: start,
            size: this.BLOCK_SIZE
        };
        this.addOperationLog('ERASE_BLOCK', { address: start, size: this.BLOCK_SIZE });
        return result;
    }

    eraseChip() {
        this.memory.fill(0xFF);
        const result = {
            success: true,
            type: 'chip',
            size: this.FLASH_SIZE
        };
        this.addOperationLog('ERASE_CHIP', { size: this.FLASH_SIZE });
        return result;
    }

    program(address, data) {
        const startAddress = address;
        let remaining = data.length;
        let srcOffset = 0;
        let currentAddr = startAddress;
        const pageOps = [];

        while (remaining > 0) {
            const pageOffset = currentAddr & (this.PAGE_SIZE - 1);
            const pageRemaining = this.PAGE_SIZE - pageOffset;
            const chunkLen = Math.min(remaining, pageRemaining);

            for (let i = 0; i < chunkLen; i++) {
                const offset = (currentAddr + i) % this.FLASH_SIZE;
                this.memory[offset] &= data[srcOffset + i];
            }

            pageOps.push({
                address: currentAddr,
                length: chunkLen,
                pageBoundary: (pageOffset + chunkLen) === this.PAGE_SIZE
            });

            srcOffset += chunkLen;
            currentAddr += chunkLen;
            remaining -= chunkLen;
        }

        const result = {
            success: true,
            address: startAddress,
            length: data.length,
            pageOps: pageOps,
            splitAcrossPages: pageOps.length > 1
        };
        this.addOperationLog('PROGRAM', { address: startAddress, length: data.length, pageOps: pageOps.length });
        return result;
    }

    read(address, length) {
        const start = address % this.FLASH_SIZE;
        const end = Math.min(start + length, this.FLASH_SIZE);
        const data = this.memory.slice(start, end);
        const result = {
            address: start,
            length: data.length,
            data: Array.from(data)
        };
        this.addOperationLog('READ', { address: start, length: data.length });
        return result;
    }
}

let flash = new W25Q128();

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('read-jedec-id', () => {
    return flash.readJEDECId();
});

ipcMain.handle('read-sfdp', () => {
    return flash.readSFDP();
});

ipcMain.handle('erase-sector', (_, address) => {
    return flash.eraseSector(address);
});

ipcMain.handle('erase-block', (_, address) => {
    return flash.eraseBlock(address);
});

ipcMain.handle('erase-chip', () => {
    return flash.eraseChip();
});

ipcMain.handle('program', (_, address, data) => {
    return flash.program(address, data);
});

ipcMain.handle('read', (_, address, length) => {
    return flash.read(address, length);
});

ipcMain.handle('enable-qspi', () => {
    return flash.enableQSPI();
});

ipcMain.handle('disable-qspi', () => {
    return flash.disableQSPI();
});

ipcMain.handle('enable-ddr', () => {
    return flash.enableDDR();
});

ipcMain.handle('disable-ddr', () => {
    return flash.disableDDR();
});

ipcMain.handle('get-mode', () => {
    return {
        currentMode: flash.getCurrentMode(),
        qspiMode: flash.qspiMode,
        ddrMode: flash.ddrMode,
        dataWidth: flash.dataWidth
    };
});

ipcMain.handle('get-operation-log', () => {
    return flash.getOperationLog();
});

ipcMain.handle('clear-operation-log', () => {
    flash.clearOperationLog();
    return { success: true };
});

ipcMain.handle('fast-read-quad', (_, address, length) => {
    if (!flash.qspiMode) {
        return { error: 'QSPI mode not enabled' };
    }
    const result = flash.read(address, length);
    flash.addOperationLog('FAST_READ_QUAD', { address, length });
    return result;
});

ipcMain.handle('quad-input-page-program', (_, address, data) => {
    if (!flash.qspiMode) {
        return { error: 'QSPI mode not enabled' };
    }
    return flash.program(address, data);
});
