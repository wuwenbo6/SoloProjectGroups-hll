const { EventEmitter } = require('events')
const VanGenuchtenModule = require('./van_genuchten.js')

class MultiPlateManager extends EventEmitter {
  constructor(config = {}) {
    super()
    this.plateCount = config.plateCount || 6
    this.activePlate = null
    this.plates = {}
    this.isRunning = false
    this.autoMode = false
    this.currentStep = 0
    this.pressureSteps = []
    this.equilibriumThreshold = 0.001
    this.equilibriumTime = 300
    this.minDataPoints = 5

    for (let i = 0; i < this.plateCount; i++) {
      this.plates[i] = {
        id: i,
        name: `样本#${i + 1}`,
        active: false,
        data: [],
        rawData: [],
        status: 'idle',
        fitResult: null,
        sampleInfo: null,
        startTime: null,
        lastReading: null,
        equilibriumCheck: {
          stableCount: 0,
          lastValue: null,
          startTime: null
        }
      }
    }
  }

  setPlateCount(count) {
    if (count < 1 || count > 12) {
      return { success: false, error: '样本数必须在 1-12 之间' }
    }
    this.plateCount = count
    this.plates = {}
    for (let i = 0; i < count; i++) {
      this.plates[i] = this.plates[i] || {
        id: i,
        name: `样本#${i + 1}`,
        active: false,
        data: [],
        rawData: [],
        status: 'idle',
        fitResult: null,
        sampleInfo: null,
        startTime: null,
        lastReading: null
      }
    }
    this.emit('configChanged', { plateCount: count })
    return { success: true }
  }

  setPlateName(plateId, name) {
    if (!this.plates[plateId]) {
      return { success: false, error: '无效的样本编号' }
    }
    this.plates[plateId].name = name
    this.emit('plateUpdated', { plateId, name })
    return { success: true }
  }

  setPlateActive(plateId, active) {
    if (!this.plates[plateId]) {
      return { success: false, error: '无效的样本编号' }
    }
    this.plates[plateId].active = active
    this.emit('plateActiveChanged', { plateId, active })
    return { success: true }
  }

  setPlateSampleInfo(plateId, info) {
    if (!this.plates[plateId]) {
      return { success: false, error: '无效的样本编号' }
    }
    this.plates[plateId].sampleInfo = info
    return { success: true }
  }

  getActivePlates() {
    return Object.values(this.plates).filter(p => p.active)
  }

  getPlateData(plateId) {
    if (!this.plates[plateId]) return null
    return {
      ...this.plates[plateId],
      data: [...this.plates[plateId].data],
      rawData: [...this.plates[plateId].rawData]
    }
  }

  getAllData() {
    const result = {}
    for (const [id, plate] of Object.entries(this.plates)) {
      if (plate.active) {
        result[id] = {
          name: plate.name,
          data: [...plate.data],
          fitResult: plate.fitResult
        }
      }
    }
    return result
  }

  addDataPoint(plateId, data) {
    if (!this.plates[plateId] || !this.plates[plateId].active) {
      return { success: false, error: '样本未激活' }
    }

    const plate = this.plates[plateId]
    const point = {
      ...data,
      timestamp: data.timestamp || Date.now(),
      plateId
    }

    plate.rawData.push(point)
    
    if (plate.rawData.length > 10000) {
      plate.rawData = plate.rawData.slice(-10000)
    }

    if (this._isValidReading(point)) {
      plate.data.push(point)
      plate.lastReading = point

      if (plate.data.length > 5000) {
        plate.data = plate.data.slice(-5000)
      }
    }

    this._checkEquilibrium(plate)

    this.emit('dataAdded', { plateId, data: point, plateName: plate.name })
    return { success: true }
  }

  _isValidReading(data) {
    return (
      data.pressure !== undefined &&
      data.waterContent !== undefined &&
      !isNaN(data.pressure) &&
      !isNaN(data.waterContent) &&
      data.pressure >= 0 &&
      data.waterContent >= 0 &&
      data.waterContent <= 1
    )
  }

  _checkEquilibrium(plate) {
    if (!plate.lastReading || plate.data.length < this.minDataPoints) return

    const recentData = plate.data.slice(-this.minDataPoints)
    const wcValues = recentData.map(d => d.waterContent)
    const mean = wcValues.reduce((a, b) => a + b, 0) / wcValues.length
    const std = Math.sqrt(wcValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / wcValues.length)

    if (std < this.equilibriumThreshold) {
      if (!plate.equilibriumCheck.startTime) {
        plate.equilibriumCheck.startTime = Date.now()
      }

      const elapsed = (Date.now() - plate.equilibriumCheck.startTime) / 1000
      if (elapsed >= this.equilibriumTime) {
        plate.status = 'equilibrated'
        this.emit('equilibriumReached', {
          plateId: plate.id,
          plateName: plate.name,
          dataPoint: plate.lastReading
        })
      }
    } else {
      plate.equilibriumCheck.startTime = null
      plate.status = 'collecting'
    }
  }

  setEquilibriumConfig(threshold, time, minPoints) {
    if (threshold !== undefined) this.equilibriumThreshold = threshold
    if (time !== undefined) this.equilibriumTime = time
    if (minPoints !== undefined) this.minDataPoints = minPoints
    return { success: true }
  }

  setPressureSteps(steps) {
    if (!Array.isArray(steps) || steps.length === 0) {
      return { success: false, error: '压力步长必须是数组' }
    }
    this.pressureSteps = [...steps].sort((a, b) => a - b)
    this.currentStep = 0
    return { success: true }
  }

  startAutoMeasurement(config = {}) {
    if (this.pressureSteps.length === 0) {
      return { success: false, error: '请先设置压力步长' }
    }

    const activePlates = this.getActivePlates()
    if (activePlates.length === 0) {
      return { success: false, error: '没有激活的样本' }
    }

    this.autoMode = true
    this.isRunning = true
    this.currentStep = 0

    activePlates.forEach(plate => {
      plate.status = 'measuring'
      plate.startTime = Date.now()
      plate.data = []
      plate.rawData = []
      plate.equilibriumCheck = { stableCount: 0, lastValue: null, startTime: null }
    })

    this.emit('autoMeasurementStarted', {
      pressureSteps: this.pressureSteps,
      activePlates: activePlates.map(p => ({ id: p.id, name: p.name }))
    })

    this._runAutoStep()
    return { success: true }
  }

  async _runAutoStep() {
    if (!this.autoMode || !this.isRunning || this.currentStep >= this.pressureSteps.length) {
      this.stopAutoMeasurement()
      return
    }

    const currentPressure = this.pressureSteps[this.currentStep]
    this.emit('pressureStepChanged', {
      step: this.currentStep,
      totalSteps: this.pressureSteps.length,
      pressure: currentPressure
    })

    const activePlates = this.getActivePlates()
    activePlates.forEach(plate => {
      plate.status = 'equilibrating'
      plate.equilibriumCheck = { stableCount: 0, lastValue: null, startTime: null }
    })

    const equilibrationCheck = setInterval(() => {
      if (!this.autoMode || !this.isRunning) {
        clearInterval(equilibrationCheck)
        return
      }

      const allEquilibrated = activePlates.every(p => p.status === 'equilibrated')
      if (allEquilibrated) {
        clearInterval(equilibrationCheck)
        this.currentStep++
        this.emit('stepCompleted', { step: this.currentStep - 1, pressure: currentPressure })

        if (this.currentStep < this.pressureSteps.length) {
          setTimeout(() => this._runAutoStep(), 2000)
        } else {
          this.stopAutoMeasurement()
          this.emit('autoMeasurementCompleted', {})
        }
      }
    }, 1000)
  }

  stopAutoMeasurement() {
    this.autoMode = false
    this.isRunning = false
    this.emit('autoMeasurementStopped', {})
  }

  async fitPlate(plateId, options = {}) {
    if (!this.plates[plateId]) {
      return { success: false, error: '无效的样本编号' }
    }

    const plate = this.plates[plateId]
    if (plate.data.length < 4) {
      return { success: false, error: '数据点不足，至少需要4个点' }
    }

    try {
      const pressures = plate.data.map(d => Math.abs(d.pressure))
      const waterContents = plate.data.map(d => d.waterContent)

      const result = VanGenuchtenModule.fit(pressures, waterContents, options)
      plate.fitResult = result

      this.emit('plateFitComplete', { plateId, result })
      return { success: true, result }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async fitAllActivePlates(options = {}) {
    const results = {}
    const activePlates = this.getActivePlates()

    for (const plate of activePlates) {
      const result = await this.fitPlate(plate.id, options)
      results[plate.id] = result
      this.emit('fitProgress', {
        plateId: plate.id,
        plateName: plate.name,
        success: result.success
      })
    }

    return { success: true, results }
  }

  clearPlateData(plateId) {
    if (!this.plates[plateId]) {
      return { success: false, error: '无效的样本编号' }
    }
    this.plates[plateId].data = []
    this.plates[plateId].rawData = []
    this.plates[plateId].fitResult = null
    this.plates[plateId].status = 'idle'
    this.plates[plateId].lastReading = null
    this.plates[plateId].equilibriumCheck = { stableCount: 0, lastValue: null, startTime: null }
    this.emit('plateDataCleared', { plateId })
    return { success: true }
  }

  clearAllData() {
    for (const plateId of Object.keys(this.plates)) {
      this.clearPlateData(parseInt(plateId))
    }
    return { success: true }
  }

  getStatus() {
    const plates = {}
    for (const [id, plate] of Object.entries(this.plates)) {
      plates[id] = {
        id: plate.id,
        name: plate.name,
        active: plate.active,
        status: plate.status,
        dataCount: plate.data.length,
        hasFit: !!plate.fitResult,
        lastReading: plate.lastReading ? {
          pressure: plate.lastReading.pressure,
          waterContent: plate.lastReading.waterContent
        } : null
      }
    }

    return {
      plateCount: this.plateCount,
      activeCount: this.getActivePlates().length,
      isRunning: this.isRunning,
      autoMode: this.autoMode,
      currentStep: this.currentStep,
      totalSteps: this.pressureSteps.length,
      currentPressure: this.pressureSteps[this.currentStep] || null,
      plates
    }
  }

  getSummary() {
    const activePlates = this.getActivePlates()
    return {
      totalSamples: activePlates.length,
      completedFits: activePlates.filter(p => p.fitResult).length,
      totalDataPoints: activePlates.reduce((sum, p) => sum + p.data.length, 0),
      fitResults: activePlates.filter(p => p.fitResult).map(p => ({
        plateId: p.id,
        name: p.name,
        parameters: p.fitResult.parameters,
        statistics: p.fitResult.statistics
      }))
    }
  }
}

module.exports = MultiPlateManager
