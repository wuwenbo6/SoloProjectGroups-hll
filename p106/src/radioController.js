const EventEmitter = require('events');
const { FMReceiver, FrequencyScanner } = require('./fmReceiver');
const { RDSDecoder } = require('./rdsDecoder');
const { AACEncoder } = require('./aacEncoder');
const { StreamServer } = require('./streamServer');
const { AudioProcessor } = require('./audioProcessor');
const { AudioRecorder, TimerPresets } = require('./audioRecorder');
const { SpectrumAnalyzer } = require('./spectrumAnalyzer');

class RadioController extends EventEmitter {
  constructor(options = {}) {
    super();
    this.fmReceiver = new FMReceiver();
    this.rdsDecoder = new RDSDecoder(options.rdsOptions);
    this.aacEncoder = new AACEncoder({ sampleRate: 48000, channels: 1 });
    this.streamServer = new StreamServer(8080);
    this.scanner = new FrequencyScanner();
    this.audioProcessor = new AudioProcessor(options.audioOptions || {
      threshold: 300,
      silenceDuration: 800,
      enableAGC: true,
      agcTargetLevel: 12000,
      agcMaxGain: 8
    });
    this.audioRecorder = new AudioRecorder({ sampleRate: 48000, channels: 1 });
    this.spectrumAnalyzer = new SpectrumAnalyzer({
      sampleRate: 48000,
      fftSize: 2048,
      updateInterval: 50
    });
    
    this.currentFrequency = null;
    this.isPlaying = false;
    this.currentMetadata = {};
    this.signalLevel = 0;
    this.isSilent = false;
    this.processedAudioStream = null;
    this.rawAudioStream = null;
    
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.fmReceiver.on('audioData', (data) => {
    });

    this.fmReceiver.on('stopped', () => {
      this.isPlaying = false;
      this.emit('stopped');
    });

    this.audioProcessor.on('signalDetected', (data) => {
      this.isSilent = false;
      this.signalLevel = data.rms;
      this.emit('signalDetected', data);
    });

    this.audioProcessor.on('silenceDetected', (data) => {
      this.isSilent = true;
      this.signalLevel = data.rms;
      this.emit('silenceDetected', data);
    });

    this.rdsDecoder.on('stationName', (name) => {
      this.currentMetadata.stationName = name;
      this.streamServer.updateMetadata({ stationName: name });
      this.emit('stationName', name);
    });

    this.rdsDecoder.on('programType', (type) => {
      this.currentMetadata.programType = type;
      this.streamServer.updateMetadata({ programType: type });
      this.emit('programType', type);
    });

    this.rdsDecoder.on('radioText', (text) => {
      this.currentMetadata.radioText = text;
      this.streamServer.updateMetadata({ radioText: text });
      this.emit('radioText', text);
    });

    this.rdsDecoder.on('metadata', (metadata) => {
      this.currentMetadata = { ...this.currentMetadata, ...metadata };
      this.emit('metadata', this.currentMetadata);
    });

    this.scanner.on('scanProgress', (progress) => {
      this.emit('scanProgress', progress);
    });

    this.scanner.on('stationFound', (station) => {
      this.emit('stationFound', station);
    });

    this.scanner.on('scanComplete', (stations) => {
      this.emit('scanComplete', stations);
    });

    this.spectrumAnalyzer.on('spectrumData', (data) => {
      this.emit('spectrumData', data);
    });

    this.audioRecorder.on('recordStarted', (data) => {
      this.emit('recordStarted', data);
    });

    this.audioRecorder.on('recordStopped', (data) => {
      this.emit('recordStopped', data);
    });

    this.audioRecorder.on('recordPaused', () => {
      this.emit('recordPaused');
    });

    this.audioRecorder.on('recordResumed', () => {
      this.emit('recordResumed');
    });

    this.audioRecorder.on('recordProgress', (data) => {
      this.emit('recordProgress', data);
    });

    this.audioRecorder.on('timerStarted', (data) => {
      this.emit('timerStarted', data);
    });

    this.audioRecorder.on('timerStopped', () => {
      this.emit('timerStopped');
    });

    this.audioRecorder.on('timerTick', (data) => {
      this.emit('timerTick', data);
    });
  }

  async init() {
    await this.streamServer.start();
    return this;
  }

  async startRadio(frequency, options = {}) {
    try {
      if (options.noiseThreshold !== undefined) {
        this.audioProcessor.setNoiseThreshold(options.noiseThreshold);
      }

      await this.fmReceiver.start(frequency, options);
      
      this.rawAudioStream = this.fmReceiver.getAudioStream();
      
      this.processedAudioStream = this.audioProcessor.processStream(this.rawAudioStream);
      
      this.spectrumAnalyzer.processStream(this.processedAudioStream);
      
      await this.rdsDecoder.start(this.rawAudioStream);
      
      await this.aacEncoder.start(this.processedAudioStream);
      
      this.streamServer.setAACStream(this.aacEncoder.getOutputStream());
      
      this.currentFrequency = frequency;
      this.isPlaying = true;
      
      this.emit('started', {
        frequency,
        streamUrl: this.streamServer.getStreamUrl()
      });

      return {
        frequency,
        streamUrl: this.streamServer.getStreamUrl(),
        metadataUrl: this.streamServer.getMetadataUrl()
      };
    } catch (error) {
      console.error('Failed to start radio:', error);
      this.stopRadio();
      throw error;
    }
  }

  stopRadio() {
    if (this.audioRecorder.isRecording) {
      this.audioRecorder.stop();
    }
    
    this.spectrumAnalyzer.stop();
    this.fmReceiver.stop();
    this.rdsDecoder.stop();
    this.aacEncoder.stop();
    this.streamServer.setAACStream(null);
    
    this.currentFrequency = null;
    this.isPlaying = false;
    this.currentMetadata = {};
    this.signalLevel = 0;
    this.isSilent = false;
    this.processedAudioStream = null;
    this.rawAudioStream = null;
    
    this.emit('stopped');
  }

  setNoiseThreshold(threshold) {
    this.audioProcessor.setNoiseThreshold(threshold);
  }

  getSignalLevel() {
    return this.audioProcessor.getSignalLevel();
  }

  getIsSilent() {
    return this.audioProcessor.isSilent();
  }

  getRDSStats() {
    return this.rdsDecoder.getStats();
  }

  async startRecording(options = {}) {
    if (!this.processedAudioStream) {
      throw new Error('Radio not playing');
    }
    
    const prefix = options.prefix || `FM_${this.currentFrequency || 'Radio'}`;
    return this.audioRecorder.start(this.processedAudioStream, { ...options, prefix });
  }

  pauseRecording() {
    this.audioRecorder.pause();
  }

  resumeRecording() {
    this.audioRecorder.resume();
  }

  async stopRecording() {
    return this.audioRecorder.stop();
  }

  async startTimerRecording(durationSeconds, options = {}) {
    if (!this.processedAudioStream) {
      throw new Error('Radio not playing');
    }
    
    const prefix = options.prefix || `FM_${this.currentFrequency || 'Radio'}`;
    return this.audioRecorder.startTimer(durationSeconds, this.processedAudioStream, { ...options, prefix });
  }

  stopTimerRecording() {
    return this.audioRecorder.stopTimer();
  }

  getRecordingStatus() {
    return this.audioRecorder.getStatus();
  }

  getTimerPresets() {
    return TimerPresets.getPresets();
  }

  async getRecordingsList() {
    return this.audioRecorder.getRecordingsList();
  }

  async deleteRecording(filePath) {
    return this.audioRecorder.deleteRecording(filePath);
  }

  setRecordingOutputDir(dir) {
    this.audioRecorder.setOutputDir(dir);
  }

  getRecordingOutputDir() {
    return this.audioRecorder.getOutputDir();
  }

  async startScan(startFreq = 87.5, endFreq = 108.0, step = 0.1) {
    if (this.isPlaying) {
      this.stopRadio();
    }
    
    return this.scanner.scanRange(startFreq, endFreq, step);
  }

  stopScan() {
    this.scanner.stop();
  }

  getStreamUrl() {
    return this.streamServer.getStreamUrl();
  }

  getMetadata() {
    return { ...this.currentMetadata };
  }

  getStatus() {
    return {
      isPlaying: this.isPlaying,
      frequency: this.currentFrequency,
      metadata: this.currentMetadata,
      streamUrl: this.streamServer.getStreamUrl(),
      signalLevel: this.signalLevel,
      isSilent: this.isSilent,
      rdsStats: this.rdsDecoder.getStats(),
      recording: this.audioRecorder.getStatus()
    };
  }

  isScanning() {
    return this.scanner.isScanning;
  }

  async shutdown() {
    if (this.audioRecorder.isRecording) {
      await this.audioRecorder.stop();
    }
    this.spectrumAnalyzer.stop();
    this.stopRadio();
    this.stopScan();
    await this.streamServer.stop();
  }
}

module.exports = { RadioController };
