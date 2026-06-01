const { SerialPort, ReadlineParser } = require('serialport')
const { EventEmitter } = require('events')
const DataProcessor = require('./data_processor.js')

class SerialModule extends EventEmitter {
  constructor() {
    super()
    this.port = null
    this.parser = null
    this.isOpening = false
    this.dataBuffer = ''
    this.readings = []
    this.rawReadings = []
    this.maxReadings = 10000

    this.dataProcessor = new DataProcessor()
    this.processingEnabled = true
  }

  async listPorts() {
    try {
      const ports = await SerialPort.list()
      return ports.map(p => ({
        path: p.path,
        manufacturer: p.manufacturer || '未知',
        serialNumber: p.serialNumber || '',
        vendorId: p.vendorId || '',
        productId: p.productId || ''
      }))
    } catch (err) {
      throw new Error(`列出串口失败: ${err.message}`)
    }
  }

  connect(options) {
    return new Promise((resolve, reject) => {
      if (this.port && this.port.isOpen) {
        reject(new Error('串口已连接'))
        return
      }

      this.isOpening = true
      const { path, baudRate = 9600, dataBits = 8, stopBits = 1, parity = 'none' } = options

      try {
        this.port = new SerialPort({
          path,
          baudRate: parseInt(baudRate),
          dataBits: parseInt(dataBits),
          stopBits: parseInt(stopBits),
          parity,
          autoOpen: false
        })

        this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n', encoding: 'utf8' }))

        this.parser.on('data', (line) => {
          this._handleDataLine(line.trim())
        })

        this.port.on('error', (err) => {
          this.emit('error', err)
        })

        this.port.on('close', () => {
          this.emit('disconnected')
        })

        this.port.open((err) => {
          this.isOpening = false
          if (err) {
            reject(new Error(`打开串口失败: ${err.message}`))
          } else {
            this.dataProcessor.reset()
            this.emit('connected', { path, baudRate })
            resolve()
          }
        })
      } catch (err) {
        this.isOpening = false
        reject(new Error(`创建串口实例失败: ${err.message}`))
      }
    })
  }

  _handleDataLine(line) {
    if (!line || line.length === 0) return

    const rawData = this._parseDataLine(line)
    if (!rawData) return

    this.rawReadings.push(rawData)
    if (this.rawReadings.length > this.maxReadings) {
      this.rawReadings = this.rawReadings.slice(-this.maxReadings)
    }

    let processedData = rawData
    if (this.processingEnabled) {
      processedData = this.dataProcessor.process(rawData)
    }

    this.readings.push(processedData)
    if (this.readings.length > this.maxReadings) {
      this.readings = this.readings.slice(-this.maxReadings)
    }

    this.emit('data', processedData)
    this.emit('rawData', rawData)
  }

  _parseDataLine(line) {
    try {
      let pressure = null
      let waterContent = null
      let timestamp = Date.now()

      const jsonMatch = line.match(/\{.*\}/)
      if (jsonMatch) {
        const obj = JSON.parse(jsonMatch[0])
        pressure = obj.pressure ?? obj.p ?? obj.h ?? null
        waterContent = obj.waterContent ?? obj.theta ?? obj.w ?? null
        timestamp = obj.timestamp ?? obj.t ?? timestamp
      } else {
        const csvParts = line.split(/[,;\t\s]+/)
        if (csvParts.length >= 2) {
          const p = parseFloat(csvParts[0])
          const w = parseFloat(csvParts[1])
          if (!isNaN(p) && !isNaN(w)) {
            pressure = p
            waterContent = w
          }
          if (csvParts.length >= 3) {
            const t = parseFloat(csvParts[2])
            if (!isNaN(t)) {
              if (t > 1000000000000) {
                timestamp = t
              }
            }
          }
        }
      }

      if (pressure !== null && waterContent !== null) {
        return {
          pressure: parseFloat(pressure),
          waterContent: parseFloat(waterContent),
          timestamp,
          raw: line
        }
      }

      return null
    } catch (err) {
      return null
    }
  }

  disconnect() {
    return new Promise((resolve, reject) => {
      if (!this.port) {
        resolve()
        return
      }

      if (this.port.isOpen) {
        this.port.close((err) => {
          if (err) {
            reject(new Error(`关闭串口失败: ${err.message}`))
          } else {
            this.port = null
            this.parser = null
            resolve()
          }
        })
      } else {
        this.port = null
        this.parser = null
        resolve()
      }
    })
  }

  send(command) {
    return new Promise((resolve, reject) => {
      if (!this.port || !this.port.isOpen) {
        reject(new Error('串口未连接'))
        return
      }

      const data = typeof command === 'string' ? command : JSON.stringify(command)
      this.port.write(data + '\n', (err) => {
        if (err) {
          reject(new Error(`发送数据失败: ${err.message}`))
        } else {
          resolve()
        }
      })
    })
  }

  isConnected() {
    return this.port !== null && this.port.isOpen
  }

  getPortPath() {
    return this.port ? this.port.path : null
  }

  getBaudRate() {
    return this.port ? this.port.baudRate : null
  }

  getReadings() {
    return [...this.readings]
  }

  getRawReadings() {
    return [...this.rawReadings]
  }

  clearReadings() {
    this.readings = []
    this.rawReadings = []
    this.dataProcessor.reset()
  }

  setProcessingEnabled(enabled) {
    this.processingEnabled = enabled
  }

  setCalibration(config) {
    this.dataProcessor.setCalibration(
      config.pressureOffset,
      config.pressureScale,
      config.waterContentOffset,
      config.waterContentScale
    )
  }

  getCalibration() {
    return { ...this.dataProcessor.calibration }
  }

  autoCalibrate(referenceData, measuredData) {
    return this.dataProcessor.autoCalibrate(referenceData, measuredData)
  }

  setFilterConfig(config) {
    this.dataProcessor.setFilterConfig(config)
  }

  getFilterConfig() {
    return { ...this.dataProcessor.filterConfig }
  }

  enableDriftCompensation(referenceValue) {
    this.dataProcessor.enableDriftCompensation(referenceValue)
  }

  disableDriftCompensation() {
    this.dataProcessor.disableDriftCompensation()
  }

  setDriftRate(rate) {
    this.dataProcessor.setDriftRate(rate)
  }

  estimateDriftRate() {
    return this.dataProcessor.estimateDriftRate(this.rawReadings)
  }

  getDriftStats() {
    return this.dataProcessor.calculateDriftStats(this.rawReadings)
  }

  processBatch(dataPoints) {
    return this.dataProcessor.batchProcess(dataPoints)
  }
}

module.exports = SerialModule
