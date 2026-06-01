import type { FSKConfig } from '../../shared/types'

const DEFAULT_FSK_CONFIG: FSKConfig = {
  markFrequency: 1200,
  spaceFrequency: 2200,
  baudRate: 1200,
}

const CHUNK_SIZE = 128

interface StreamState {
  sampleBuffer: number[]
  bitHistory: number[]
  byteBuffer: number[]
  currentByte: number
  bitPosition: number
  preambleCount: number
  frameDetected: boolean
  lastBitTime: number
  phaseOffset: number
}

export class GoertzelDetector {
  private sampleRate: number
  private frequency: number
  private coeff: number
  private q1: number = 0
  private q2: number = 0

  constructor(sampleRate: number, frequency: number) {
    this.sampleRate = sampleRate
    this.frequency = frequency
    const k = Math.floor(0.5 + (CHUNK_SIZE * frequency) / sampleRate)
    const w = (2 * Math.PI * k) / CHUNK_SIZE
    this.coeff = 2 * Math.cos(w)
  }

  reset(): void {
    this.q1 = 0
    this.q2 = 0
  }

  process(samples: Float32Array): number {
    let q0: number
    for (let i = 0; i < samples.length; i++) {
      q0 = this.coeff * this.q1 - this.q2 + samples[i]
      this.q2 = this.q1
      this.q1 = q0
    }
    const magnitude = Math.sqrt(this.q1 * this.q1 + this.q2 * this.q2 - this.coeff * this.q1 * this.q2)
    this.q1 = 0
    this.q2 = 0
    return magnitude
  }

  processChunk(chunk: Float32Array): number {
    return this.process(chunk)
  }
}

export class FSKModem {
  private config: FSKConfig
  private sampleRate: number
  private samplesPerBit: number
  private markTable: Float32Array
  private spaceTable: Float32Array
  private markDetector: GoertzelDetector
  private spaceDetector: GoertzelDetector
  private streamState: StreamState

  constructor(sampleRate: number = 48000, config: Partial<FSKConfig> = {}) {
    this.config = { ...DEFAULT_FSK_CONFIG, ...config }
    this.sampleRate = sampleRate
    this.samplesPerBit = Math.floor(sampleRate / this.config.baudRate)
    this.markTable = this.generateWaveTable(this.config.markFrequency)
    this.spaceTable = this.generateWaveTable(this.config.spaceFrequency)
    this.markDetector = new GoertzelDetector(sampleRate, this.config.markFrequency)
    this.spaceDetector = new GoertzelDetector(sampleRate, this.config.spaceFrequency)
    this.streamState = this.createInitialState()
  }

  private createInitialState(): StreamState {
    return {
      sampleBuffer: [],
      bitHistory: [],
      byteBuffer: [],
      currentByte: 0,
      bitPosition: 0,
      preambleCount: 0,
      frameDetected: false,
      lastBitTime: 0,
      phaseOffset: 0,
    }
  }

  resetStream(): void {
    this.streamState = this.createInitialState()
    this.markDetector.reset()
    this.spaceDetector.reset()
  }

  private generateWaveTable(frequency: number): Float32Array {
    const tableSize = this.samplesPerBit
    const table = new Float32Array(tableSize)
    const angularFreq = (2 * Math.PI * frequency) / this.sampleRate

    for (let i = 0; i < tableSize; i++) {
      table[i] = Math.sin(angularFreq * i) * 0.5
    }

    return table
  }

  modulate(data: Uint8Array): Float32Array {
    const audioLength = data.length * 8 * this.samplesPerBit
    const audio = new Float32Array(audioLength)
    let audioIndex = 0

    for (const byte of data) {
      for (let bit = 7; bit >= 0; bit--) {
        const isMark = (byte >> bit) & 1
        const table = isMark ? this.markTable : this.spaceTable

        for (let i = 0; i < this.samplesPerBit; i++) {
          audio[audioIndex++] = table[i]
        }
      }
    }

    return audio
  }

  demodulate(audio: Float32Array): Uint8Array {
    const bitCount = Math.floor(audio.length / this.samplesPerBit)
    const byteCount = Math.floor(bitCount / 8)
    const data = new Uint8Array(byteCount)
    let bitIndex = 0

    for (let byteIdx = 0; byteIdx < byteCount; byteIdx++) {
      let byte = 0
      for (let bit = 0; bit < 8; bit++) {
        const startSample = bitIndex * this.samplesPerBit
        const endSample = startSample + this.samplesPerBit
        const chunk = audio.slice(startSample, endSample)

        const markPower = this.goertzelSingle(chunk, this.config.markFrequency)
        const spacePower = this.goertzelSingle(chunk, this.config.spaceFrequency)

        const isMark = markPower > spacePower
        if (isMark) {
          byte |= 1 << (7 - bit)
        }
        bitIndex++
      }
      data[byteIdx] = byte
    }

    return data
  }

  private goertzelSingle(chunk: Float32Array, frequency: number): number {
    const k = Math.floor(0.5 + (chunk.length * frequency) / this.sampleRate)
    const w = (2 * Math.PI * k) / chunk.length
    const cosine = Math.cos(w)
    const coeff = 2 * cosine
    const sine = Math.sin(w)
    let q0 = 0, q1 = 0, q2 = 0

    for (let n = 0; n < chunk.length; n++) {
      q0 = coeff * q1 - q2 + chunk[n]
      q2 = q1
      q1 = q0
    }

    const real = q1 - q2 * cosine
    const imag = q2 * sine
    return Math.sqrt(real * real + imag * imag)
  }

  processStream(samples: Float32Array): Uint8Array | null {
    const state = this.streamState
    state.sampleBuffer.push(...Array.from(samples))

    const results: number[] = []

    while (state.sampleBuffer.length >= this.samplesPerBit) {
      const bitSamples = new Float32Array(state.sampleBuffer.splice(0, this.samplesPerBit))
      
      const markPower = this.markDetector.processChunk(bitSamples)
      const spacePower = this.spaceDetector.processChunk(bitSamples)
      
      const bit = markPower > spacePower ? 1 : 0
      const confidence = Math.abs(markPower - spacePower) / Math.max(markPower, spacePower, 0.001)

      if (confidence > 0.1) {
        state.bitHistory.push(bit)
        if (state.bitHistory.length > 16) {
          state.bitHistory.shift()
        }

        if (!state.frameDetected) {
          if (bit === 1) {
            state.preambleCount++
            if (state.preambleCount >= 16) {
              state.frameDetected = true
              state.bitPosition = 0
              state.currentByte = 0
            }
          } else {
            state.preambleCount = Math.max(0, state.preambleCount - 2)
          }
        } else {
          state.currentByte = (state.currentByte << 1) | bit
          state.bitPosition++

          if (state.bitPosition >= 8) {
            results.push(state.currentByte)
            state.byteBuffer.push(state.currentByte)
            
            if (state.currentByte === 0x02 || state.currentByte === 0x06) {
            }
            
            state.bitPosition = 0
            state.currentByte = 0
          }
        }
      }
    }

    if (results.length > 0) {
      return new Uint8Array(results)
    }
    return null
  }

  process128Samples(samples: Float32Array): {
    bytes: Uint8Array | null
    markEnergy: number
    spaceEnergy: number
    bitsDetected: number[]
  } {
    if (samples.length < 128) {
      const padded = new Float32Array(128)
      padded.set(samples)
      samples = padded
    }

    const chunk = samples.slice(0, 128)
    const markEnergy = this.markDetector.processChunk(chunk)
    const spaceEnergy = this.spaceDetector.processChunk(chunk)

    const bits: number[] = []
    const samplesPerBit = this.samplesPerBit
    const numBits = Math.floor(128 / samplesPerBit)

    for (let i = 0; i < numBits; i++) {
      const start = i * samplesPerBit
      const bitChunk = chunk.slice(start, start + samplesPerBit)
      const m = this.markDetector.processChunk(bitChunk)
      const s = this.spaceDetector.processChunk(bitChunk)
      bits.push(m > s ? 1 : 0)
    }

    const bytes = this.processStream(samples)

    return {
      bytes,
      markEnergy,
      spaceEnergy,
      bitsDetected: bits,
    }
  }

  detectBits(samples: Float32Array): number[] {
    const bits: number[] = []
    const samplesPerBit = this.samplesPerBit
    const numBits = Math.floor(samples.length / samplesPerBit)

    for (let i = 0; i < numBits; i++) {
      const start = i * samplesPerBit
      const chunk = samples.slice(start, start + samplesPerBit)
      const markPower = this.goertzelSingle(chunk, this.config.markFrequency)
      const spacePower = this.goertzelSingle(chunk, this.config.spaceFrequency)
      bits.push(markPower > spacePower ? 1 : 0)
    }

    return bits
  }

  bitsToBytes(bits: number[]): Uint8Array {
    const byteCount = Math.floor(bits.length / 8)
    const bytes = new Uint8Array(byteCount)

    for (let i = 0; i < byteCount; i++) {
      let byte = 0
      for (let b = 0; b < 8; b++) {
        byte = (byte << 1) | bits[i * 8 + b]
      }
      bytes[i] = byte
    }

    return bytes
  }

  detectCarrier(audio: Float32Array, threshold: number = 0.1): boolean {
    const markEnergy = this.goertzelSingle(audio.slice(0, 128), this.config.markFrequency)
    const spaceEnergy = this.goertzelSingle(audio.slice(0, 128), this.config.spaceFrequency)
    return Math.max(markEnergy, spaceEnergy) > threshold
  }

  generatePreamble(length: number = 5): Float32Array {
    const preamble = new Uint8Array(length).fill(0xff)
    return this.modulate(preamble)
  }

  getSamplesPerBit(): number {
    return this.samplesPerBit
  }

  getSampleRate(): number {
    return this.sampleRate
  }

  getConfig(): FSKConfig {
    return { ...this.config }
  }

  getMarkDetector(): GoertzelDetector {
    return this.markDetector
  }

  getSpaceDetector(): GoertzelDetector {
    return this.spaceDetector
  }
}

export function createFSKModem(sampleRate?: number, config?: Partial<FSKConfig>) {
  return new FSKModem(sampleRate, config)
}

export { CHUNK_SIZE }
