const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spiceAPI', {
  connect: (config) => ipcRenderer.invoke('spice:connect', config),
  disconnect: () => ipcRenderer.invoke('spice:disconnect'),

  listReaders: () => ipcRenderer.invoke('card:list-readers'),
  connectReader: (readerName) => ipcRenderer.invoke('card:connect', readerName),
  disconnectReader: (readerName) => ipcRenderer.invoke('card:disconnect', readerName),
  transmit: (readerName, apduHex) => ipcRenderer.invoke('card:transmit', readerName, apduHex),
  startMonitor: () => ipcRenderer.invoke('card:start-monitor'),
  stopMonitor: () => ipcRenderer.invoke('card:stop-monitor'),

  coldReset: (readerName) => ipcRenderer.invoke('card:cold-reset', readerName),
  parseAtr: (atrHex) => ipcRenderer.invoke('card:parse-atr', atrHex),
  matchSelect: (apduHex) => ipcRenderer.invoke('card:match-select', apduHex),
  getSelectedApp: (readerName) => ipcRenderer.invoke('card:get-selected-app', readerName),
  addApplication: (app) => ipcRenderer.invoke('card:add-application', app),
  getAppRegistry: () => ipcRenderer.invoke('card:get-app-registry'),

  getSlots: () => ipcRenderer.invoke('card:get-slots'),
  assignSlot: (slotId, readerName) => ipcRenderer.invoke('card:assign-slot', slotId, readerName),
  unassignSlot: (slotId) => ipcRenderer.invoke('card:unassign-slot', slotId),
  swapSlots: (slotId1, slotId2) => ipcRenderer.invoke('card:swap-slots', slotId1, slotId2),
  addSlot: (slotId) => ipcRenderer.invoke('card:add-slot', slotId),
  removeSlot: (slotId) => ipcRenderer.invoke('card:remove-slot', slotId),
  setMaxSlots: (count) => ipcRenderer.invoke('card:set-max-slots', count),

  getTraces: (filter) => ipcRenderer.invoke('card:get-traces', filter),
  getTraceCount: () => ipcRenderer.invoke('card:get-trace-count'),
  clearTraces: () => ipcRenderer.invoke('card:clear-traces'),
  exportTraces: (filePath, format, filter) => ipcRenderer.invoke('card:export-traces', filePath, format, filter),
  getTraceFormats: () => ipcRenderer.invoke('card:get-trace-formats'),
  showSaveDialog: (options) => ipcRenderer.invoke('card:show-save-dialog', options),

  onSpiceStatus: (callback) => {
    ipcRenderer.on('spice:status', (_event, data) => callback(data));
  },
  onSpiceError: (callback) => {
    ipcRenderer.on('spice:error', (_event, data) => callback(data));
  },
  onCardStatus: (callback) => {
    ipcRenderer.on('card:status', (_event, data) => callback(data));
  },
  onApduLog: (callback) => {
    ipcRenderer.on('card:apdu-log', (_event, data) => callback(data));
  },
  onReaderEvent: (callback) => {
    ipcRenderer.on('card:reader-event', (_event, data) => callback(data));
  },
  onColdReset: (callback) => {
    ipcRenderer.on('card:cold-reset', (_event, data) => callback(data));
  },
  onAppSelected: (callback) => {
    ipcRenderer.on('card:app-selected', (_event, data) => callback(data));
  },
  onSlotChanged: (callback) => {
    ipcRenderer.on('card:slot-changed', (_event, data) => callback(data));
  },
  onSlotsSwapped: (callback) => {
    ipcRenderer.on('card:slots-swapped', (_event, data) => callback(data));
  },
});
