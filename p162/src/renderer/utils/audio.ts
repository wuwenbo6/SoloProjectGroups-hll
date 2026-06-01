import { FSKModem, CHUNK_SIZE } from './fsk-modem'
import { HARTProtocol } from './hart-protocol'
import type { HARTResponse } from '../../shared/types'

export interface StreamResult {
  bytes: Uint8Array | null
  markEnergy: number
  spaceEnergy: number
  bitsDetected: number[]
}

export class BandpassFilter {
  private sampleRate: number
  private centerFreq: number
  private bandwidth: number
  private b0: number = 0
  private b1: number = 0
  private b2: number = 0
  private a1: number = 0
  private a2: number = 0
  private x1: number = 0
  private x2: number = 0
  private y1: number = 0
  private y2: number = 0

  constructor(sampleRate: number, centerFreq: number = 1200, bandwidth: number = 1500) {
    this.sampleRate = sampleRate
    this.centerFreq = centerFreq
    this.bandwidth = bandwidth
    this.calculateCoefficients()
  }

  private calculateCoefficients(): void {
    const w0 = (2 * Math.PI * this.centerFreq) / this.sampleRate
    const alpha = Math.sin(w0) * Math.sinh((Math.LN2 / 2) * (this.bandwidth / this.centerFreq) * w0 / Math.sin(w0))
    
    const cosW0 = Math.cos(w0)
    const a0 = 1 + alpha
    
    this.b0 = alpha / a0
    this.b1 = 0
    this.b2 = -alpha / a0
    this.a1 = (-2 * cosW0) / a0
    this.a2 = (1 - alpha) / a0
  }

  processSample(sample: number): number {
    const y = this.b0 * sample + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2
    
    this.x2 = this.x1
    this.x1 = sample
    this.y2 = this.y1
    this.y1 = y
    
    return y
  }

  processBuffer(buffer: Float32Array): Float32Array {
    const output = new Float32Array(buffer.length)
    for (let i = 0; i < buffer.length; i++) {
      output[i] = this.processSample(buffer[i])
    }
    return output
  }

  reset(): void {
    this.x1 = 0
    this.x2 = 0
    this.y1 = 0
    this.y2 = 0
  }
}

export class AudioHARTManager {
  private audioContext: AudioContext | null = null
  private modem: FSKModem | null = null
  private protocol: HARTProtocol
  private gainNode: GainNode | null = null
  private analyserNode: AnalyserNode | null = null
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null
  private scriptProcessor: ScriptProcessorNode | null = null
  private bandpassFilter: BandpassFilter | null = null
  private onDataCallback: ((response: HARTResponse) => void) | null = null
  private onWaveformCallback: ((data: Float32Array) => void) | null = null
  private onStreamCallback: ((result: StreamResult) => void) | null = null
  private isReceiving: boolean = false
  private sampleBuffer: number[] = []
  private accumulatedBytes: number[] = []
  private sampleRate: number = 48000

  constructor() {
    this.protocol = new HARTProtocol(5)
  }

  async initialize(): Promise<void> {
    this.audioContext = new AudioContext({
      sampleRate: this.sampleRate,
      latencyHint: 'interactive',
    })

    this.modem = new FSKModem(this.sampleRate)
    this.bandpassFilter = new BandpassFilter(this.sampleRate, 1200, 1500)
    
    this.gainNode = this.audioContext.createGain()
    this.gainNode.gain.value = 0.8

    this.analyserNode = this.audioContext.createAnalyser()
    this.analyserNode.fftSize = 512

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }
  }

  async getInputDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter(d => d.kind === 'audioinput')
  }

  async getOutputDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter(d => d.kind === 'audiooutput')
  }

  async startCapture(deviceId?: string): Promise<void> {
    if (!this.audioContext || !this.modem) {
      await this.initialize()
    }

    const constraints: MediaStreamConstraints = {
      audio: deviceId
        ? { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      this.setupReception(stream)
    } catch (error) {
      console.error('Failed to start audio capture:', error)
      throw error
    }
  }

  private setupReception(stream: MediaStream): void {
    if (!this.audioContext || !this.modem) return

    this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream)
    
    const highpassFilter = this.audioContext.createBiquadFilter()
    highpassFilter.type = 'highpass'
    highpassFilter.frequency.value = 800

    const lowpassFilter = this.audioContext.createBiquadFilter()
    lowpassFilter.type = 'lowpass'
    lowpassFilter.frequency.value = 3000

    const bandpassFilter = this.audioContext.createBiquadFilter()
    bandpassFilter.type = 'bandpass'
    bandpassFilter.frequency.value = 1200
    bandpassFilter.Q.value = 1.5
    bandpassFilter.gain.value = 3

    this.scriptProcessor = this.audioContext.createScriptProcessor(256, 1, 1)

    this.mediaStreamSource
      .connect(highpassFilter)
      .connect(lowpassFilter)
      .connect(bandpassFilter)
      .connect(this.analyserNode!)
      .connect(this.scriptProcessor)

    this.scriptProcessor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0)
      this.processAudioChunk(inputData)
      
      if (this.onWaveformCallback) {
        const waveformData = new Float32Array(256)
        this.analyserNode!.getFloatTimeDomainData(waveformData)
        this.onWaveformCallback(waveformData)
      }
    }

    this.scriptProcessor.connect(this.audioContext.destination)
    this.isReceiving = true
    this.modem.resetStream()
    this.sampleBuffer = []
    this.accumulatedBytes = []
  }

  private processAudioChunk(audioData: Float32Array): void {
    if (!this.modem || !this.isReceiving || !this.bandpassFilter) return

    const filteredData = this.bandpassFilter.processBuffer(audioData)

    this.sampleBuffer.push(...Array.from(filteredData))

    while (this.sampleBuffer.length >= CHUNK_SIZE) {
      const chunk = new Float32Array(this.sampleBuffer.splice(0, CHUNK_SIZE))
      this.process128Samples(chunk)
    }
  }

  private process128Samples(chunk: Float32Array): void {
    if (!this.modem) return

    const result = this.modem.process128Samples(chunk)

    if (this.onStreamCallback) {
      this.onStreamCallback(result)
    }

    if (result.bytes && result.bytes.length > 0) {
      this.accumulatedBytes.push(...Array.from(result.bytes))
      this.tryDecodeAccumulatedBytes()
    }
  }

  private tryDecodeAccumulatedBytes(): void {
    if (this.accumulatedBytes.length < 5) return

    const bytes = new Uint8Array(this.accumulatedBytes)
    const frame = this.protocol.bytesToFrame(bytes)
    
    if (frame && this.protocol.verifyChecksum(frame)) {
      const response = this.protocol.parseResponse(frame)
      if (response && this.onDataCallback) {
        this.onDataCallback(response)
      }
      this.accumulatedBytes = []
      this.modem?.resetStream()
    }

    if (this.accumulatedBytes.length > 256) {
      this.accumulatedBytes = this.accumulatedBytes.slice(-128)
    }
  }

  async sendHARTCommand(command: number, data: number[] = []): Promise<void> {
    if (!this.audioContext || !this.modem || !this.gainNode) {
      await this.initialize()
    }

    const frameBytes = this.protocol.buildCommandFrame(command, data)
    const audioData = this.modem!.modulate(frameBytes)

    await this.playAudio(audioData)
  }

  private async playAudio(audioData: Float32Array): Promise<void> {
    if (!this.audioContext) return

    const buffer = this.audioContext.createBuffer(1, audioData.length, this.sampleRate)
    const channelData = buffer.getChannelData(0)
    channelData.set(audioData)

    const source = this.audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(this.gainNode!)
    this.gainNode!.connect(this.audioContext.destination)

    return new Promise((resolve) => {
      source.onended = () => resolve()
      source.start()
    })
  }

  stopCapture(): void {
    this.isReceiving = false

    if (this.mediaStreamSource) {
      this.mediaStreamSource.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStreamSource.disconnect()
      this.mediaStreamSource = null
    }

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect()
      this.scriptProcessor.onaudioprocess = null
      this.scriptProcessor = null
    }

    this.sampleBuffer = []
    this.accumulatedBytes = []
    this.modem?.resetStream()
    this.bandpassFilter?.reset()
  }

  setOnDataCallback(callback: (response: HARTResponse) => void): void {
    this.onDataCallback = callback
  }

  setOnWaveformCallback(callback: (data: Float32Array) => void): void {
    this.onWaveformCallback = callback
  }

  setOnStreamCallback(callback: (result: StreamResult) => void): void {
    this.onStreamCallback = callback
  }

  async close(): Promise<void> {
    this.stopCapture()

    if (this.gainNode) {
      this.gainNode.disconnect()
      this.gainNode = null
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect()
      this.analyserNode = null
    }

    if (this.audioContext) {
      await this.audioContext.close()
      this.audioContext = null
    }

    this.modem = null
    this.bandpassFilter = null
  }

  getModem(): FSKModem | null {
    return this.modem
  }

  getProtocol(): HARTProtocol {
    return this.protocol
  }

  getBandpassFilter(): BandpassFilter | null {
    return this.bandpassFilter
  }

  isInitialized(): boolean {
    return this.audioContext !== null
  }

  resetStream(): void {
    this.modem?.resetStream()
    this.sampleBuffer = []
    this.accumulatedBytes = []
    this.bandpassFilter?.reset()
  }
}

export function createAudioHARTManager(): AudioHARTManager {
  return new AudioHARTManager()
}
