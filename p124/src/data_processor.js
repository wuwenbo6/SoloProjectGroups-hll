class DataProcessor {
  constructor() {
    this.calibration = {
      pressureOffset: 0,
      pressureScale: 1,
      waterContentOffset: 0,
      waterContentScale: 1
    }

    this.driftCompensation = {
      enabled: false,
      referenceValue: null,
      referenceTime: null,
      driftRate: 0,
      lastCorrectedValue: null
    }

    this.filterConfig = {
      type: 'none',
      windowSize: 5,
      alpha: 0.3,
      outlierThreshold: 2
    }

    this.filterBuffer = {
      pressure: [],
      waterContent: []
    }
  }

  setCalibration(pressureOffset = 0, pressureScale = 1, waterContentOffset = 0, waterContentScale = 1) {
    this.calibration = {
      pressureOffset,
      pressureScale,
      waterContentOffset,
      waterContentScale
    }
  }

  autoCalibrate(referenceData, measuredData) {
    if (referenceData.length !== measuredData.length || referenceData.length < 2) {
      throw new Error('校准数据点不足')
    }

    const n = referenceData.length
    const refPressure = referenceData.map(d => d.pressure)
    const meaPressure = measuredData.map(d => d.pressure)
    const refWC = referenceData.map(d => d.waterContent)
    const meaWC = measuredData.map(d => d.waterContent)

    const pressureScale = this._linearRegression(meaPressure, refPressure).slope
    const pressureOffset = this._linearRegression(meaPressure, refPressure).intercept

    const wcScale = this._linearRegression(meaWC, refWC).slope
    const wcOffset = this._linearRegression(meaWC, refWC).intercept

    this.setCalibration(pressureOffset, pressureScale, wcOffset, wcScale)

    return {
      pressure: { offset: pressureOffset, scale: pressureScale },
      waterContent: { offset: wcOffset, scale: wcScale }
    }
  }

  _linearRegression(x, y) {
    const n = x.length
    const sumX = x.reduce((a, b) => a + b, 0)
    const sumY = y.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0)
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0)

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n

    return { slope, intercept }
  }

  enableDriftCompensation(referenceValue, referenceTime = Date.now()) {
    this.driftCompensation.enabled = true
    this.driftCompensation.referenceValue = referenceValue
    this.driftCompensation.referenceTime = referenceTime
    this.driftCompensation.lastCorrectedValue = referenceValue
  }

  disableDriftCompensation() {
    this.driftCompensation.enabled = false
  }

  setDriftRate(driftRatePerHour) {
    this.driftCompensation.driftRate = driftRatePerHour
  }

  estimateDriftRate(historicalData) {
    if (historicalData.length < 10) {
      return 0
    }

    const sorted = [...historicalData].sort((a, b) => a.timestamp - b.timestamp)
    const startTime = sorted[0].timestamp
    const pressures = sorted.map(d => d.pressure)
    const times = sorted.map(d => (d.timestamp - startTime) / 3600000)

    const regression = this._linearRegression(times, pressures)
    return regression.slope
  }

  setFilterConfig(config) {
    this.filterConfig = { ...this.filterConfig, ...config }
  }

  applyCalibration(data) {
    return {
      ...data,
      pressure: data.pressure * this.calibration.pressureScale + this.calibration.pressureOffset,
      waterContent: data.waterContent * this.calibration.waterContentScale + this.calibration.waterContentOffset
    }
  }

  applyDriftCompensation(data) {
    if (!this.driftCompensation.enabled || this.driftCompensation.referenceTime === null) {
      return data
    }

    const hoursElapsed = (data.timestamp - this.driftCompensation.referenceTime) / 3600000
    const pressureCorrection = this.driftCompensation.driftRate * hoursElapsed

    return {
      ...data,
      pressure: data.pressure - pressureCorrection,
      rawPressure: data.pressure,
      driftCorrection: pressureCorrection
    }
  }

  applyFilter(data) {
    const { type, windowSize, alpha, outlierThreshold } = this.filterConfig

    if (type === 'none') {
      return data
    }

    this.filterBuffer.pressure.push({ value: data.pressure, timestamp: data.timestamp })
    this.filterBuffer.waterContent.push({ value: data.waterContent, timestamp: data.timestamp })

    if (this.filterBuffer.pressure.length > windowSize) {
      this.filterBuffer.pressure.shift()
      this.filterBuffer.waterContent.shift()
    }

    let filteredPressure = data.pressure
    let filteredWaterContent = data.waterContent

    switch (type) {
      case 'movingAverage':
        filteredPressure = this._movingAverage(this.filterBuffer.pressure)
        filteredWaterContent = this._movingAverage(this.filterBuffer.waterContent)
        break

      case 'exponential':
        if (this.driftCompensation.lastCorrectedValue !== null) {
          filteredPressure = alpha * data.pressure + (1 - alpha) * this.driftCompensation.lastCorrectedValue
        }
        filteredWaterContent = alpha * data.waterContent + (1 - alpha) * this._lastWC(data.waterContent)
        break

      case 'median':
        filteredPressure = this._medianFilter(this.filterBuffer.pressure)
        filteredWaterContent = this._medianFilter(this.filterBuffer.waterContent)
        break

      case 'savgolay':
        filteredPressure = this._savitzkyGolay(this.filterBuffer.pressure)
        filteredWaterContent = this._savitzkyGolay(this.filterBuffer.waterContent)
        break
    }

    if (outlierThreshold > 0) {
      const { pressure: smoothPressure } = this._removeOutliers(
        this.filterBuffer.pressure.map(d => d.value),
        outlierThreshold
      )
      const { waterContent: smoothWC } = this._removeOutliers(
        this.filterBuffer.waterContent.map(d => d.value),
        outlierThreshold
      )

      if (Math.abs(filteredPressure - data.pressure) > Math.abs(smoothPressure - data.pressure)) {
        filteredPressure = this._lastValue(this.filterBuffer.pressure)
      }
    }

    this.driftCompensation.lastCorrectedValue = filteredPressure

    return {
      ...data,
      pressure: filteredPressure,
      waterContent: filteredWaterContent,
      rawPressure: data.pressure,
      rawWaterContent: data.waterContent
    }
  }

  _movingAverage(buffer) {
    if (buffer.length === 0) return 0
    const sum = buffer.reduce((s, d) => s + d.value, 0)
    return sum / buffer.length
  }

  _lastWC(current) {
    if (this.filterBuffer.waterContent.length < 2) return current
    return this.filterBuffer.waterContent[this.filterBuffer.waterContent.length - 2].value
  }

  _lastValue(buffer) {
    if (buffer.length === 0) return 0
    return buffer[buffer.length - 1].value
  }

  _medianFilter(buffer) {
    if (buffer.length === 0) return 0
    const sorted = [...buffer].sort((a, b) => a.value - b.value)
    const mid = Math.floor(sorted.length / 2)
    return sorted[mid].value
  }

  _savitzkyGolay(buffer) {
    if (buffer.length < 5) return this._lastValue(buffer)

    const values = buffer.map(d => d.value)
    const n = values.length
    const mid = Math.floor(n / 2)

    const coefficients = [
      -3, 12, 17, 12, -3
    ]

    if (n === 5) {
      let sum = 0
      for (let i = 0; i < 5; i++) {
        sum += coefficients[i] * values[i]
      }
      return sum / 35
    }

    return values[mid]
  }

  _removeOutliers(data, threshold) {
    if (data.length < 3) return { pressure: data, waterContent: data }

    const mean = data.reduce((a, b) => a + b, 0) / data.length
    const std = Math.sqrt(data.reduce((sum, v) => sum + (v - mean) ** 2, 0) / data.length)

    const filtered = data.filter(v => Math.abs(v - mean) <= threshold * std)

    if (filtered.length < Math.ceil(data.length * 0.5)) {
      return { pressure: data, waterContent: data }
    }

    return { pressure: filtered, waterContent: filtered }
  }

  process(data) {
    let result = { ...data }

    result = this.applyCalibration(result)

    if (this.driftCompensation.enabled) {
      result = this.applyDriftCompensation(result)
    }

    if (this.filterConfig.type !== 'none') {
      result = this.applyFilter(result)
    }

    return result
  }

  batchProcess(dataPoints) {
    this.filterBuffer = { pressure: [], waterContent: [] }
    return dataPoints.map(d => this.process(d))
  }

  calculateDriftStats(dataPoints) {
    if (dataPoints.length < 10) {
      return null
    }

    const pressures = dataPoints.map(d => d.pressure)
    const times = dataPoints.map((d, i) => i)

    const regression = this._linearRegression(times, pressures)

    const predicted = times.map(t => regression.slope * t + regression.intercept)
    const residuals = pressures.map((p, i) => p - predicted[i])
    const rmse = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length)

    return {
      driftRate: regression.slope,
      intercept: regression.intercept,
      rmse,
      totalDrift: regression.slope * (times.length - 1),
      trend: regression.slope > 0 ? 'increasing' : regression.slope < 0 ? 'decreasing' : 'stable'
    }
  }

  reset() {
    this.filterBuffer = { pressure: [], waterContent: [] }
  }
}

module.exports = DataProcessor
