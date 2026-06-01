const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const EFI_VARIABLE_NON_VOLATILE = 0x00000001;
const EFI_VARIABLE_BOOTSERVICE_ACCESS = 0x00000002;
const EFI_VARIABLE_RUNTIME_ACCESS = 0x00000004;

const EFI_GLOBAL_VARIABLE_GUID = '{8BE4DF61-93CA-11D2-AA0D-00E098032B8C}';

const PROTECTED_VARIABLES = [
  { name: 'BootOrder', guid: EFI_GLOBAL_VARIABLE_GUID },
  { name: 'Boot0000', guid: EFI_GLOBAL_VARIABLE_GUID },
  { name: 'SecureBoot', guid: EFI_GLOBAL_VARIABLE_GUID },
  { name: 'SetupMode', guid: EFI_GLOBAL_VARIABLE_GUID }
];

class UEFIVariableStore {
  constructor() {
    this.volatileVariables = new Map();
    this.dbPath = path.join(app.getPath('userData'), 'uefi-variables.db');
    this.db = null;
    this.SQL = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    this.SQL = await initSqlJs();
    
    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(fileBuffer);
    } else {
      this.db = new this.SQL.Database();
    }
    
    this.initializeDatabase();
    this.initializeDefaultVariables();
    this.saveToDisk();
    this.initialized = true;
  }

  initializeDatabase() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS uefi_variables (
        name TEXT NOT NULL,
        guid TEXT NOT NULL,
        data BLOB,
        attributes INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (name, guid)
      )
    `);
    
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_guid ON uefi_variables(guid)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_attributes ON uefi_variables(attributes)`);
  }

  initializeDefaultVariables() {
    const defaults = [
      {
        name: 'BootOrder',
        guid: EFI_GLOBAL_VARIABLE_GUID,
        data: [0x00, 0x01, 0x02, 0x03],
        attributes: EFI_VARIABLE_NON_VOLATILE | EFI_VARIABLE_BOOTSERVICE_ACCESS | EFI_VARIABLE_RUNTIME_ACCESS
      },
      {
        name: 'Boot0000',
        guid: EFI_GLOBAL_VARIABLE_GUID,
        data: Array.from(Buffer.from('UEFI: Built-in EFI Shell', 'utf16le')),
        attributes: EFI_VARIABLE_NON_VOLATILE | EFI_VARIABLE_BOOTSERVICE_ACCESS | EFI_VARIABLE_RUNTIME_ACCESS
      },
      {
        name: 'Boot0001',
        guid: EFI_GLOBAL_VARIABLE_GUID,
        data: Array.from(Buffer.from('UEFI: USB HDD', 'utf16le')),
        attributes: EFI_VARIABLE_NON_VOLATILE | EFI_VARIABLE_BOOTSERVICE_ACCESS | EFI_VARIABLE_RUNTIME_ACCESS
      },
      {
        name: 'Lang',
        guid: EFI_GLOBAL_VARIABLE_GUID,
        data: Array.from(Buffer.from('en-US', 'ascii')),
        attributes: EFI_VARIABLE_NON_VOLATILE | EFI_VARIABLE_BOOTSERVICE_ACCESS | EFI_VARIABLE_RUNTIME_ACCESS
      },
      {
        name: 'SecureBoot',
        guid: EFI_GLOBAL_VARIABLE_GUID,
        data: [0x01],
        attributes: EFI_VARIABLE_BOOTSERVICE_ACCESS | EFI_VARIABLE_RUNTIME_ACCESS
      },
      {
        name: 'SetupMode',
        guid: EFI_GLOBAL_VARIABLE_GUID,
        data: [0x00],
        attributes: EFI_VARIABLE_BOOTSERVICE_ACCESS | EFI_VARIABLE_RUNTIME_ACCESS
      },
      {
        name: 'PlatformLang',
        guid: EFI_GLOBAL_VARIABLE_GUID,
        data: Array.from(Buffer.from('en-US', 'ascii')),
        attributes: EFI_VARIABLE_NON_VOLATILE | EFI_VARIABLE_BOOTSERVICE_ACCESS | EFI_VARIABLE_RUNTIME_ACCESS
      },
      {
        name: 'OsIndications',
        guid: EFI_GLOBAL_VARIABLE_GUID,
        data: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
        attributes: EFI_VARIABLE_NON_VOLATILE | EFI_VARIABLE_BOOTSERVICE_ACCESS | EFI_VARIABLE_RUNTIME_ACCESS
      }
    ];

    for (const variable of defaults) {
      if (variable.attributes & EFI_VARIABLE_NON_VOLATILE) {
        const existing = this.db.exec(
          `SELECT name FROM uefi_variables WHERE name = '${variable.name}' AND guid = '${variable.guid}'`
        );
        
        if (existing.length === 0 || existing[0].values.length === 0) {
          this.db.run(
            `INSERT INTO uefi_variables (name, guid, data, attributes) VALUES (?, ?, ?, ?)`,
            [variable.name, variable.guid, new Uint8Array(variable.data), variable.attributes]
          );
        }
      } else {
        const key = `${variable.name}:${variable.guid}`;
        if (!this.volatileVariables.has(key)) {
          this.volatileVariables.set(key, {
            name: variable.name,
            guid: variable.guid,
            data: variable.data,
            attributes: variable.attributes
          });
        }
      }
    }
  }

  saveToDisk() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dbPath, buffer);
    } catch (error) {
      console.error('Failed to save database:', error);
    }
  }

  getVariable(name, guid) {
    const normalizedGuid = this.normalizeGuid(guid);
    const key = `${name}:${normalizedGuid}`;

    if (this.volatileVariables.has(key)) {
      return { ...this.volatileVariables.get(key) };
    }

    const results = this.db.exec(
      `SELECT name, guid, data, attributes FROM uefi_variables WHERE name = '${name}' AND guid = '${normalizedGuid}'`
    );

    if (results.length > 0 && results[0].values.length > 0) {
      const row = results[0].values[0];
      const columns = results[0].columns;
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      
      return {
        name: obj.name,
        guid: obj.guid,
        data: Array.from(obj.data),
        attributes: obj.attributes
      };
    }

    return null;
  }

  isProtectedVariable(name, guid) {
    const normalizedGuid = this.normalizeGuid(guid);
    return PROTECTED_VARIABLES.some(v => v.name === name && v.guid === normalizedGuid);
  }

  setVariable(name, guid, data, attributes) {
    const normalizedGuid = this.normalizeGuid(guid);
    const key = `${name}:${normalizedGuid}`;
    const isNonVolatile = attributes & EFI_VARIABLE_NON_VOLATILE;

    if (data === null || data.length === 0) {
      if (this.isProtectedVariable(name, normalizedGuid)) {
        throw new Error(`Cannot delete protected variable: ${name}`);
      }
      this.volatileVariables.delete(key);
      this.db.run(`DELETE FROM uefi_variables WHERE name = '${name}' AND guid = '${normalizedGuid}'`);
      this.saveToDisk();
      return true;
    }

    const variable = {
      name,
      guid: normalizedGuid,
      data: Array.from(data),
      attributes
    };

    if (isNonVolatile) {
      this.volatileVariables.delete(key);
      this.db.run(
        `INSERT OR REPLACE INTO uefi_variables (name, guid, data, attributes, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`,
        [name, normalizedGuid, new Uint8Array(data), attributes]
      );
      this.saveToDisk();
    } else {
      this.volatileVariables.set(key, variable);
    }

    return true;
  }

  getAllVariables() {
    const variables = [];

    const results = this.db.exec(
      `SELECT name, guid, data, attributes FROM uefi_variables ORDER BY guid, name`
    );

    if (results.length > 0) {
      const columns = results[0].columns;
      for (const row of results[0].values) {
        const obj = {};
        columns.forEach((col, idx) => {
          obj[col] = row[idx];
        });
        variables.push({
          name: obj.name,
          guid: obj.guid,
          data: Array.from(obj.data),
          attributes: obj.attributes
        });
      }
    }

    for (const variable of this.volatileVariables.values()) {
      variables.push({ ...variable });
    }

    variables.sort((a, b) => {
      if (a.guid === b.guid) {
        return a.name.localeCompare(b.name);
      }
      return a.guid.localeCompare(b.guid);
    });

    return variables;
  }

  getNextVariableName(vendorGuid) {
    const variables = this.getAllVariables();
    if (!vendorGuid) {
      return variables.length > 0 ? variables[0] : null;
    }

    const normalizedGuid = this.normalizeGuid(vendorGuid);
    const foundIndex = variables.findIndex(v => v.guid === normalizedGuid);
    if (foundIndex >= 0 && foundIndex < variables.length - 1) {
      return variables[foundIndex + 1];
    }
    return null;
  }

  queryVariableInfo(attributes) {
    let count = 0;
    let maxSize = 0;
    let totalSize = 0;

    const results = this.db.exec(
      `SELECT data FROM uefi_variables WHERE (attributes & ${attributes}) = ${attributes}`
    );

    if (results.length > 0) {
      for (const row of results[0].values) {
        count++;
        const size = row[0].length;
        if (size > maxSize) maxSize = size;
        totalSize += size;
      }
    }

    for (const variable of this.volatileVariables.values()) {
      if ((variable.attributes & attributes) === attributes) {
        count++;
        const size = variable.data.length;
        if (size > maxSize) maxSize = size;
        totalSize += size;
      }
    }

    return {
      maximumVariableStorageSize: 1024 * 1024,
      remainingVariableStorageSize: 1024 * 1024 - totalSize,
      maximumVariableSize: maxSize || 65536
    };
  }

  normalizeGuid(guid) {
    if (!guid) return guid;
    
    let result = guid.trim().toUpperCase();
    
    if (!result.startsWith('{')) {
      result = '{' + result;
    }
    if (!result.endsWith('}')) {
      result = result + '}';
    }
    
    return result;
  }

  exportVariables() {
    const variables = this.getAllVariables();
    return JSON.stringify(variables, null, 2);
  }

  importVariables(jsonData) {
    try {
      const variables = JSON.parse(jsonData);
      if (!Array.isArray(variables)) {
        throw new Error('Invalid format: expected array');
      }

      let importedCount = 0;
      let skippedCount = 0;

      for (const variable of variables) {
        if (!variable.name || !variable.guid) {
          skippedCount++;
          continue;
        }

        if (this.isProtectedVariable(variable.name, variable.guid)) {
          skippedCount++;
          continue;
        }

        try {
          this.setVariable(
            variable.name,
            variable.guid,
            variable.data || [],
            variable.attributes || 0
          );
          importedCount++;
        } catch (error) {
          skippedCount++;
        }
      }

      return { imported: importedCount, skipped: skippedCount };
    } catch (error) {
      throw new Error(`Import failed: ${error.message}`);
    }
  }

  getProtectedVariables() {
    return PROTECTED_VARIABLES;
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

let mainWindow;
let variableStore;

async function createWindow() {
  variableStore = new UEFIVariableStore();
  await variableStore.initialize();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', () => {
  createWindow();
});

app.on('window-all-closed', function () {
  if (variableStore) {
    variableStore.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

ipcMain.handle('getVariable', async (event, name, guid) => {
  return variableStore.getVariable(name, guid);
});

ipcMain.handle('setVariable', async (event, name, guid, data, attributes) => {
  return variableStore.setVariable(name, guid, data, attributes);
});

ipcMain.handle('getAllVariables', async () => {
  return variableStore.getAllVariables();
});

ipcMain.handle('getNextVariableName', async (event, vendorGuid) => {
  return variableStore.getNextVariableName(vendorGuid);
});

ipcMain.handle('queryVariableInfo', async (event, attributes) => {
  return variableStore.queryVariableInfo(attributes);
});

ipcMain.handle('getVariableAttributes', async () => {
  return {
    EFI_VARIABLE_NON_VOLATILE,
    EFI_VARIABLE_BOOTSERVICE_ACCESS,
    EFI_VARIABLE_RUNTIME_ACCESS,
    EFI_GLOBAL_VARIABLE_GUID
  };
});

ipcMain.handle('exportVariables', async () => {
  return variableStore.exportVariables();
});

ipcMain.handle('importVariables', async (event, jsonData) => {
  return variableStore.importVariables(jsonData);
});

ipcMain.handle('getProtectedVariables', async () => {
  return variableStore.getProtectedVariables();
});
