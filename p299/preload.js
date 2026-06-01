const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('gpioAPI', {
  exportPin: (gpio) => ipcRenderer.invoke('gpio:export', gpio),
  unexportPin: (gpio) => ipcRenderer.invoke('gpio:unexport', gpio),
  setDirection: (gpio, dir) => ipcRenderer.invoke('gpio:setDirection', gpio, dir),
  setValue: (gpio, val) => ipcRenderer.invoke('gpio:setValue', gpio, val),
  getValue: (gpio) => ipcRenderer.invoke('gpio:getValue', gpio),
  setEdge: (gpio, edge) => ipcRenderer.invoke('gpio:setEdge', gpio, edge),
  getAll: () => ipcRenderer.invoke('gpio:getAll'),
  triggerInterrupt: (gpio, type) => ipcRenderer.invoke('gpio:triggerInterrupt', gpio, type),
  poll: (gpio, timeout) => ipcRenderer.invoke('gpio:poll', gpio, timeout),
  cancelPoll: (gpio) => ipcRenderer.invoke('gpio:cancelPoll', gpio),
  getPollCount: (gpio) => ipcRenderer.invoke('gpio:getPollCount', gpio),
  onChanged: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('gpio:changed', handler)
    return () => ipcRenderer.removeListener('gpio:changed', handler)
  },
  onInterrupt: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('gpio:interrupt', handler)
    return () => ipcRenderer.removeListener('gpio:interrupt', handler)
  },
})

contextBridge.exposeInMainWorld('i2cAPI', {
  configure: (sda, scl) => ipcRenderer.invoke('i2c:configure', sda, scl),
  addDevice: (addr, regs) => ipcRenderer.invoke('i2c:addDevice', addr, regs),
  removeDevice: (addr) => ipcRenderer.invoke('i2c:removeDevice', addr),
  getDevices: () => ipcRenderer.invoke('i2c:getDevices'),
  getConfig: () => ipcRenderer.invoke('i2c:getConfig'),
  setBitDelay: (ms) => ipcRenderer.invoke('i2c:setBitDelay', ms),
  write: (addr, data) => ipcRenderer.invoke('i2c:write', addr, data),
  read: (addr, count) => ipcRenderer.invoke('i2c:read', addr, count),
  setRegisterPointer: (addr, reg) => ipcRenderer.invoke('i2c:setRegisterPointer', addr, reg),
  getDeviceRegisters: (addr, start, count) => ipcRenderer.invoke('i2c:getDeviceRegisters', addr, start, count),
  setDeviceRegister: (addr, reg, val) => ipcRenderer.invoke('i2c:setDeviceRegister', addr, reg, val),
})

contextBridge.exposeInMainWorld('traceAPI', {
  start: () => ipcRenderer.invoke('trace:start'),
  stop: () => ipcRenderer.invoke('trace:stop'),
  clear: () => ipcRenderer.invoke('trace:clear'),
  getTraces: () => ipcRenderer.invoke('trace:getTraces'),
  isRecording: () => ipcRenderer.invoke('trace:isRecording'),
  exportCsv: () => ipcRenderer.invoke('trace:exportCsv'),
})
