const { EventEmitter } = require('events')

class TurntableController extends EventEmitter {
  constructor() {
    super()
    this.currentPosition = 0
    this.totalPositions = 12
    this.isMoving = false
    this.isHomed = false
    this.speed = 50
    this.positionNames = {}
    this.sampleInfo = {}
  }

  async home() {
    this.emit('homing', { started: true })
    
    await this._simulateMovement(2000)
    
    this.currentPosition = 0
    this.isHomed = true
    this.isMoving = false
    
    this.emit('homed', { position: 0 })
    return { success: true, position: 0 }
  }

  async moveTo(position, options = {}) {
    if (position < 0 || position >= this.totalPositions) {
      return { success: false, error: `位置必须在 0-${this.totalPositions - 1} 之间` }
    }

    if (!this.isHomed && !options.skipHomeCheck) {
      return { success: false, error: '请先回原点' }
    }

    if (this.isMoving) {
      return { success: false, error: '转盘正在移动中' }
    }

    this.isMoving = true
    const startPosition = this.currentPosition
    const targetPosition = position
    
    this.emit('moving', { from: startPosition, to: targetPosition })

    const distance = Math.abs(targetPosition - startPosition)
    const moveTime = distance * (500 - this.speed * 3) + 500
    await this._simulateMovement(moveTime)

    this.currentPosition = targetPosition
    this.isMoving = false

    this.emit('positionChanged', { 
      position: targetPosition,
      sampleName: this.positionNames[targetPosition] || `位置${targetPosition + 1}`
    })

    return { success: true, position: targetPosition }
  }

  async moveNext(options = {}) {
    const nextPos = (this.currentPosition + 1) % this.totalPositions
    return this.moveTo(nextPos, options)
  }

  async movePrevious(options = {}) {
    const prevPos = (this.currentPosition - 1 + this.totalPositions) % this.totalPositions
    return this.moveTo(prevPos, options)
  }

  setTotalPositions(count) {
    if (count < 2 || count > 24) {
      return { success: false, error: '位置数必须在 2-24 之间' }
    }
    this.totalPositions = count
    this.emit('configChanged', { totalPositions: count })
    return { success: true }
  }

  setSpeed(speed) {
    if (speed < 1 || speed > 100) {
      return { success: false, error: '速度必须在 1-100 之间' }
    }
    this.speed = speed
    return { success: true }
  }

  setPositionName(position, name) {
    if (position < 0 || position >= this.totalPositions) {
      return { success: false, error: '无效的位置' }
    }
    this.positionNames[position] = name
    this.emit('positionNamed', { position, name })
    return { success: true }
  }

  setSampleInfo(position, info) {
    if (position < 0 || position >= this.totalPositions) {
      return { success: false, error: '无效的位置' }
    }
    this.sampleInfo[position] = info
    return { success: true }
  }

  getStatus() {
    return {
      currentPosition: this.currentPosition,
      totalPositions: this.totalPositions,
      isMoving: this.isMoving,
      isHomed: this.isHomed,
      speed: this.speed,
      positionNames: { ...this.positionNames },
      currentSampleName: this.positionNames[this.currentPosition] || `位置${this.currentPosition + 1}`
    }
  }

  getPositionInfo(position) {
    return {
      name: this.positionNames[position] || `位置${position + 1}`,
      sampleInfo: this.sampleInfo[position] || null
    }
  }

  async runAutoSequence(startPosition, endPosition, options = {}) {
    const {
      dwellTime = 5000,
      onPositionReached = null,
      stopCondition = null
    } = options

    if (startPosition < 0 || endPosition >= this.totalPositions) {
      return { success: false, error: '位置范围无效' }
    }

    const direction = startPosition <= endPosition ? 1 : -1
    const positions = []
    
    if (direction > 0) {
      for (let i = startPosition; i <= endPosition; i++) {
        positions.push(i)
      }
    } else {
      for (let i = startPosition; i >= endPosition; i--) {
        positions.push(i)
      }
    }

    this.emit('autoSequenceStarted', { positions, dwellTime })

    for (const pos of positions) {
      if (stopCondition && stopCondition()) {
        break
      }

      await this.moveTo(pos, { skipHomeCheck: this.isHomed })
      
      if (onPositionReached) {
        await onPositionReached(pos, this.getPositionInfo(pos))
      }

      this.emit('positionDwellStart', { position: pos, duration: dwellTime })
      await this._simulateMovement(dwellTime)
      this.emit('positionDwellEnd', { position: pos })
    }

    this.emit('autoSequenceCompleted', { positions })
    return { success: true, completed: positions }
  }

  stop() {
    this.isMoving = false
    this.emit('stopped', { position: this.currentPosition })
  }

  reset() {
    this.currentPosition = 0
    this.isHomed = false
    this.isMoving = false
    this.emit('reset', {})
  }

  _simulateMovement(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = TurntableController
