const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

class TraceRecorder {
  constructor() {
    this.traces = []
    this.recording = false
  }

  start() {
    this.recording = true
  }

  stop() {
    this.recording = false
  }

  clear() {
    this.traces = []
  }

  record(gpio, oldValue, newValue, event) {
    if (!this.recording) return
    this.traces.push({
      time: Date.now(),
      timeUs: performance.now() * 1000,
      gpio,
      oldValue,
      newValue,
      event,
    })
  }

  getTraces() {
    return this.traces
  }

  toCsv() {
    let csv = 'timestamp_us,gpio,old_value,new_value,event\n'
    for (const t of this.traces) {
      csv += `${t.timeUs.toFixed(3)},${t.gpio},${t.oldValue},${t.newValue},${t.event}\n`
    }
    return csv
  }
}

class I2CBus {
  constructor(gpioEngine, traceRecorder) {
    this.gpioEngine = gpioEngine
    this.traceRecorder = traceRecorder
    this.sdaGpio = null
    this.sclGpio = null
    this.devices = new Map()
    this.active = false
    this.bitDelayMs = 50
    this.lastTransaction = null
  }

  configure(sdaGpio, sclGpio) {
    const sda = parseInt(sdaGpio, 10)
    const scl = parseInt(sclGpio, 10)
    if (isNaN(sda) || isNaN(scl) || sda < 0 || scl < 0)
      return { ok: false, error: 'Invalid GPIO number' }
    if (sda === scl)
      return { ok: false, error: 'SDA and SCL must be different pins' }
    if (!this.gpioEngine.pins.has(sda))
      return { ok: false, error: `GPIO ${sda} not exported` }
    if (!this.gpioEngine.pins.has(scl))
      return { ok: false, error: `GPIO ${scl} not exported` }
    this.sdaGpio = sda
    this.sclGpio = scl
    return { ok: true }
  }

  addDevice(address, registers) {
    const addr = parseInt(address, 10)
    if (isNaN(addr) || addr < 0 || addr > 127)
      return { ok: false, error: 'Address must be 0-127 (7-bit)' }
    this.devices.set(addr, {
      address: addr,
      registers: registers || new Array(256).fill(0),
      pointer: 0,
    })
    return { ok: true }
  }

  removeDevice(address) {
    const addr = parseInt(address, 10)
    return { ok: this.devices.delete(addr) }
  }

  getDevices() {
    const result = []
    for (const [addr, dev] of this.devices) {
      result.push({ address: addr, pointer: dev.pointer })
    }
    return result
  }

  getConfig() {
    return {
      sdaGpio: this.sdaGpio,
      sclGpio: this.sclGpio,
      active: this.active,
      bitDelayMs: this.bitDelayMs,
      deviceCount: this.devices.size,
    }
  }

  setBitDelay(ms) {
    this.bitDelayMs = Math.max(10, Math.min(500, parseInt(ms, 10) || 50))
    return { ok: true }
  }

  async _setPin(gpio, value) {
    const pin = this.gpioEngine.pins.get(gpio)
    if (!pin) return
    const old = pin.value
    pin.value = value
    if (old !== value) {
      this.traceRecorder.record(gpio, old, value, 'i2c')
      this.gpioEngine._emit('change', this.gpioEngine._serialize(gpio))
    }
  }

  _getPin(gpio) {
    const pin = this.gpioEngine.pins.get(gpio)
    return pin ? pin.value : 0
  }

  async _delay(ms) {
    return new Promise((r) => setTimeout(r, ms || this.bitDelayMs))
  }

  async _startCondition() {
    await this._setPin(this.sdaGpio, 1)
    await this._setPin(this.sclGpio, 1)
    await this._delay()
    await this._setPin(this.sdaGpio, 0)
    await this._delay()
    await this._setPin(this.sclGpio, 0)
    await this._delay()
  }

  async _stopCondition() {
    await this._setPin(this.sdaGpio, 0)
    await this._delay()
    await this._setPin(this.sclGpio, 1)
    await this._delay()
    await this._setPin(this.sdaGpio, 1)
    await this._delay()
  }

  async _writeBit(bit) {
    await this._setPin(this.sdaGpio, bit)
    await this._delay()
    await this._setPin(this.sclGpio, 1)
    await this._delay()
    await this._setPin(this.sclGpio, 0)
    await this._delay()
  }

  async _readBit() {
    await this._setPin(this.sdaGpio, 1)
    await this._delay()
    await this._setPin(this.sclGpio, 1)
    await this._delay()
    const bit = this._getPin(this.sdaGpio)
    await this._setPin(this.sclGpio, 0)
    await this._delay()
    return bit
  }

  async _writeByte(byte) {
    for (let i = 7; i >= 0; i--) {
      await this._writeBit((byte >> i) & 1)
    }
    const ack = await this._readBit()
    return ack === 0
  }

  async _readByte(ack) {
    let byte = 0
    for (let i = 7; i >= 0; i--) {
      const bit = await this._readBit()
      byte |= (bit << i)
    }
    await this._writeBit(ack ? 0 : 1)
    return byte
  }

  async write(address, data) {
    if (this.sdaGpio === null || this.sclGpio === null)
      return { ok: false, error: 'I2C bus not configured' }
    if (this.active)
      return { ok: false, error: 'I2C bus busy' }

    const addr = parseInt(address, 10)
    const dataBytes = Array.isArray(data) ? data : [parseInt(data, 10)]

    this.active = true
    const events = []

    try {
      await this._startCondition()
      events.push({ phase: 'START', sda: 0, scl: 0 })

      const addrByte = (addr << 1) | 0
      const addrAck = await this._writeByte(addrByte)
      events.push({ phase: 'ADDR_WRITE', address: addr, ack: addrAck, byte: addrByte })

      if (!addrAck) {
        await this._stopCondition()
        events.push({ phase: 'STOP', sda: 1, scl: 1 })
        return { ok: false, error: `NACK on address 0x${addr.toString(16)}`, events }
      }

      const written = []
      for (const b of dataBytes) {
        const ack = await this._writeByte(b)
        events.push({ phase: 'DATA_WRITE', byte: b, ack })
        written.push(b)
        if (!ack) break
      }

      await this._stopCondition()
      events.push({ phase: 'STOP', sda: 1, scl: 1 })

      const dev = this.devices.get(addr)
      if (dev) {
        for (const b of written) {
          dev.registers[dev.pointer] = b
          dev.pointer = (dev.pointer + 1) & 0xFF
        }
      }

      this.lastTransaction = { type: 'write', address: addr, data: written, events }
      return { ok: true, events, written }
    } finally {
      this.active = false
    }
  }

  async read(address, count) {
    if (this.sdaGpio === null || this.sclGpio === null)
      return { ok: false, error: 'I2C bus not configured' }
    if (this.active)
      return { ok: false, error: 'I2C bus busy' }

    const addr = parseInt(address, 10)
    const len = parseInt(count, 10) || 1

    this.active = true
    const events = []

    try {
      await this._startCondition()
      events.push({ phase: 'START', sda: 0, scl: 0 })

      const addrByte = (addr << 1) | 1
      const addrAck = await this._writeByte(addrByte)
      events.push({ phase: 'ADDR_READ', address: addr, ack: addrAck, byte: addrByte })

      if (!addrAck) {
        await this._stopCondition()
        events.push({ phase: 'STOP', sda: 1, scl: 1 })
        return { ok: false, error: `NACK on address 0x${addr.toString(16)}`, events }
      }

      const readData = []
      for (let i = 0; i < len; i++) {
        const isLast = i === len - 1
        const byte = await this._readByte(!isLast)
        events.push({ phase: 'DATA_READ', byte, ack: !isLast })
        readData.push(byte)
      }

      await this._stopCondition()
      events.push({ phase: 'STOP', sda: 1, scl: 1 })

      const dev = this.devices.get(addr)
      if (dev) {
        for (let i = 0; i < readData.length; i++) {
          readData[i] = dev.registers[dev.pointer]
          dev.pointer = (dev.pointer + 1) & 0xFF
        }
      }

      this.lastTransaction = { type: 'read', address: addr, data: readData, events }
      return { ok: true, events, data: readData }
    } finally {
      this.active = false
    }
  }

  async setRegisterPointer(address, regAddr) {
    if (this.sdaGpio === null || this.sclGpio === null)
      return { ok: false, error: 'I2C bus not configured' }
    const dev = this.devices.get(address)
    if (!dev) return { ok: false, error: `No device at address 0x${address.toString(16)}` }
    dev.pointer = regAddr & 0xFF

    return await this.write(address, [regAddr])
  }

  getDeviceRegisters(address, startReg, count) {
    const dev = this.devices.get(parseInt(address, 10))
    if (!dev) return { ok: false, error: 'Device not found' }
    const s = (parseInt(startReg, 10) || 0) & 0xFF
    const c = Math.min(parseInt(count, 10) || 16, 64)
    const regs = []
    for (let i = 0; i < c; i++) {
      regs.push({ reg: (s + i) & 0xFF, value: dev.registers[(s + i) & 0xFF] })
    }
    return { ok: true, registers: regs }
  }

  setDeviceRegister(address, regAddr, value) {
    const dev = this.devices.get(parseInt(address, 10))
    if (!dev) return { ok: false, error: 'Device not found' }
    dev.registers[parseInt(regAddr, 10) & 0xFF] = parseInt(value, 10) & 0xFF
    return { ok: true }
  }
}

class GpioEngine {
  constructor() {
    this.pins = new Map()
    this.listeners = new Map()
    this.pollQueues = new Map()
    this.nextPollId = 1
    this.traceRecorder = new TraceRecorder()
    this.i2cBus = new I2CBus(this, this.traceRecorder)
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, [])
    this.listeners.get(event).push(fn)
  }

  _emit(event, data) {
    const fns = this.listeners.get(event) || []
    fns.forEach((fn) => fn(data))
  }

  _wakePollers(num, interruptType) {
    const queue = this.pollQueues.get(num)
    if (!queue || queue.length === 0) return
    this.pollQueues.delete(num)
    queue.forEach((entry) => {
      clearTimeout(entry.timeout)
      entry.resolve({ ok: true, type: interruptType, count: entry.count })
    })
  }

  poll(gpio, timeoutMs = 10000) {
    const num = parseInt(gpio, 10)
    if (isNaN(num) || num < 0) return Promise.resolve({ ok: false, error: 'Invalid GPIO number' })
    const pin = this.pins.get(num)
    if (!pin) return Promise.resolve({ ok: false, error: `GPIO ${num} not exported` })
    if (pin.edge === 'none') return Promise.resolve({ ok: false, error: `GPIO ${num} has edge=none, poll not supported` })

    return new Promise((resolve) => {
      const pollId = this.nextPollId++
      const timeout = setTimeout(() => {
        const queue = this.pollQueues.get(num)
        if (queue) {
          const filtered = queue.filter((e) => e.pollId !== pollId)
          if (filtered.length === 0) this.pollQueues.delete(num)
          else this.pollQueues.set(num, filtered)
        }
        resolve({ ok: false, error: 'ETIMEDOUT', type: 'timeout' })
      }, timeoutMs)

      if (!this.pollQueues.has(num)) this.pollQueues.set(num, [])
      this.pollQueues.get(num).push({ pollId, resolve, timeout, count: pin.risingCount + pin.fallingCount })
      this._emit('change', this._serialize(num))
    })
  }

  cancelPoll(gpio) {
    const num = parseInt(gpio, 10)
    const queue = this.pollQueues.get(num)
    if (!queue) return { ok: true, count: 0 }
    this.pollQueues.delete(num)
    queue.forEach((entry) => {
      clearTimeout(entry.timeout)
      entry.resolve({ ok: false, error: 'ECANCEL', type: 'cancelled' })
    })
    this._emit('change', this._serialize(num))
    return { ok: true, count: queue.length }
  }

  getPollCount(gpio) {
    const num = parseInt(gpio, 10)
    const queue = this.pollQueues.get(num)
    return queue ? queue.length : 0
  }

  exportPin(gpio) {
    const num = parseInt(gpio, 10)
    if (isNaN(num) || num < 0) return { ok: false, error: 'Invalid GPIO number' }
    if (this.pins.has(num)) return { ok: false, error: `GPIO ${num} already exported` }
    this.pins.set(num, {
      gpio: num,
      direction: 'in',
      value: 0,
      edge: 'none',
      risingCount: 0,
      fallingCount: 0,
      exported: true,
    })
    this._emit('change', this._serialize(num))
    return { ok: true }
  }

  unexportPin(gpio) {
    const num = parseInt(gpio, 10)
    if (isNaN(num) || num < 0) return { ok: false, error: 'Invalid GPIO number' }
    if (!this.pins.has(num)) return { ok: false, error: `GPIO ${num} not exported` }
    this.cancelPoll(num)
    this.pins.delete(num)
    this._emit('change', { gpio: num, removed: true })
    return { ok: true }
  }

  setDirection(gpio, dir) {
    const num = parseInt(gpio, 10)
    if (isNaN(num) || num < 0) return { ok: false, error: 'Invalid GPIO number' }
    const pin = this.pins.get(num)
    if (!pin) return { ok: false, error: `GPIO ${num} not exported` }
    if (pin.exported !== true) return { ok: false, error: `GPIO ${num} is not in valid exported state` }
    if (typeof dir !== 'string') return { ok: false, error: 'Direction must be a string' }
    const normalized = dir.trim().toLowerCase()
    if (normalized !== 'in' && normalized !== 'out')
      return { ok: false, error: 'Direction must be "in" (input) or "out" (output)' }
    if (pin.direction !== normalized) {
      pin.direction = normalized
      this._emit('change', this._serialize(num))
    }
    return { ok: true }
  }

  setValue(gpio, val) {
    const num = parseInt(gpio, 10)
    if (isNaN(num) || num < 0) return { ok: false, error: 'Invalid GPIO number' }
    const pin = this.pins.get(num)
    if (!pin) return { ok: false, error: `GPIO ${num} not exported` }
    if (pin.exported !== true) return { ok: false, error: `GPIO ${num} is not in valid exported state` }
    if (pin.direction !== 'out') return { ok: false, error: `GPIO ${num} is not configured as output` }
    const v = parseInt(val, 10)
    if (v !== 0 && v !== 1) return { ok: false, error: 'Value must be 0 or 1' }
    const oldVal = pin.value
    pin.value = v
    if (oldVal !== v) {
      this.traceRecorder.record(num, oldVal, v, 'gpio')
      if (v === 1 && (pin.edge === 'rising' || pin.edge === 'both')) {
        pin.risingCount++
        this._wakePollers(num, 'rising')
        this._emit('interrupt', { gpio: num, type: 'rising', count: pin.risingCount })
      }
      if (v === 0 && (pin.edge === 'falling' || pin.edge === 'both')) {
        pin.fallingCount++
        this._wakePollers(num, 'falling')
        this._emit('interrupt', { gpio: num, type: 'falling', count: pin.fallingCount })
      }
    }
    this._emit('change', this._serialize(num))
    return { ok: true }
  }

  getValue(gpio) {
    const num = parseInt(gpio, 10)
    const pin = this.pins.get(num)
    if (!pin) return { ok: false, error: `GPIO ${num} not exported` }
    return { ok: true, value: pin.value }
  }

  setEdge(gpio, edge) {
    const num = parseInt(gpio, 10)
    const pin = this.pins.get(num)
    if (!pin) return { ok: false, error: `GPIO ${num} not exported` }
    if (!['none', 'rising', 'falling', 'both'].includes(edge))
      return { ok: false, error: 'Edge must be none, rising, falling, or both' }
    pin.edge = edge
    this._emit('change', this._serialize(num))
    return { ok: true }
  }

  triggerInterrupt(gpio, type) {
    const num = parseInt(gpio, 10)
    if (isNaN(num) || num < 0) return { ok: false, error: 'Invalid GPIO number' }
    const pin = this.pins.get(num)
    if (!pin) return { ok: false, error: `GPIO ${num} not exported` }
    const oldVal = pin.value
    if (type === 'rising') {
      pin.value = 1
      pin.risingCount++
      this.traceRecorder.record(num, oldVal, 1, 'irq_rising')
      this._wakePollers(num, 'rising')
      this._emit('interrupt', { gpio: num, type: 'rising', count: pin.risingCount })
    } else if (type === 'falling') {
      pin.value = 0
      pin.fallingCount++
      this.traceRecorder.record(num, oldVal, 0, 'irq_falling')
      this._wakePollers(num, 'falling')
      this._emit('interrupt', { gpio: num, type: 'falling', count: pin.fallingCount })
    }
    this._emit('change', this._serialize(num))
    return { ok: true }
  }

  getAll() {
    const result = {}
    for (const [num, pin] of this.pins) {
      result[num] = this._serialize(num)
    }
    return result
  }

  _serialize(num) {
    const pin = this.pins.get(num)
    if (!pin) return null
    return {
      gpio: pin.gpio,
      direction: pin.direction,
      value: pin.value,
      edge: pin.edge,
      risingCount: pin.risingCount,
      fallingCount: pin.fallingCount,
      exported: pin.exported,
      pollCount: this.getPollCount(num),
    }
  }
}

const gpioEngine = new GpioEngine()

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'GPIO Sysfs Simulator',
    backgroundColor: '#0f172a',
  })

  win.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('gpio:export', (_, gpio) => gpioEngine.exportPin(gpio))
ipcMain.handle('gpio:unexport', (_, gpio) => gpioEngine.unexportPin(gpio))
ipcMain.handle('gpio:setDirection', (_, gpio, dir) => gpioEngine.setDirection(gpio, dir))
ipcMain.handle('gpio:setValue', (_, gpio, val) => gpioEngine.setValue(gpio, val))
ipcMain.handle('gpio:getValue', (_, gpio) => gpioEngine.getValue(gpio))
ipcMain.handle('gpio:setEdge', (_, gpio, edge) => gpioEngine.setEdge(gpio, edge))
ipcMain.handle('gpio:getAll', () => gpioEngine.getAll())
ipcMain.handle('gpio:triggerInterrupt', (_, gpio, type) => gpioEngine.triggerInterrupt(gpio, type))
ipcMain.handle('gpio:poll', (_, gpio, timeout) => gpioEngine.poll(gpio, timeout))
ipcMain.handle('gpio:cancelPoll', (_, gpio) => gpioEngine.cancelPoll(gpio))
ipcMain.handle('gpio:getPollCount', (_, gpio) => gpioEngine.getPollCount(gpio))

ipcMain.handle('i2c:configure', (_, sda, scl) => gpioEngine.i2cBus.configure(sda, scl))
ipcMain.handle('i2c:addDevice', (_, addr, regs) => gpioEngine.i2cBus.addDevice(addr, regs))
ipcMain.handle('i2c:removeDevice', (_, addr) => gpioEngine.i2cBus.removeDevice(addr))
ipcMain.handle('i2c:getDevices', () => gpioEngine.i2cBus.getDevices())
ipcMain.handle('i2c:getConfig', () => gpioEngine.i2cBus.getConfig())
ipcMain.handle('i2c:setBitDelay', (_, ms) => gpioEngine.i2cBus.setBitDelay(ms))
ipcMain.handle('i2c:write', (_, addr, data) => gpioEngine.i2cBus.write(addr, data))
ipcMain.handle('i2c:read', (_, addr, count) => gpioEngine.i2cBus.read(addr, count))
ipcMain.handle('i2c:setRegisterPointer', (_, addr, reg) => gpioEngine.i2cBus.setRegisterPointer(addr, reg))
ipcMain.handle('i2c:getDeviceRegisters', (_, addr, start, count) => gpioEngine.i2cBus.getDeviceRegisters(addr, start, count))
ipcMain.handle('i2c:setDeviceRegister', (_, addr, reg, val) => gpioEngine.i2cBus.setDeviceRegister(addr, reg, val))

ipcMain.handle('trace:start', () => { gpioEngine.traceRecorder.start(); return { ok: true } })
ipcMain.handle('trace:stop', () => { gpioEngine.traceRecorder.stop(); return { ok: true } })
ipcMain.handle('trace:clear', () => { gpioEngine.traceRecorder.clear(); return { ok: true } })
ipcMain.handle('trace:getTraces', () => gpioEngine.traceRecorder.getTraces())
ipcMain.handle('trace:isRecording', () => gpioEngine.traceRecorder.recording)

ipcMain.handle('trace:exportCsv', async () => {
  const csv = gpioEngine.traceRecorder.toCsv()
  const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow(), {
    title: 'Export Logic Analyzer CSV',
    defaultPath: 'gpio_trace.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  })
  if (result.canceled) return { ok: false, error: 'Cancelled' }
  try {
    fs.writeFileSync(result.filePath, csv, 'utf-8')
    return { ok: true, path: result.filePath }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

gpioEngine.on('change', (data) => {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('gpio:changed', data))
})

gpioEngine.on('interrupt', (data) => {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('gpio:interrupt', data))
})
