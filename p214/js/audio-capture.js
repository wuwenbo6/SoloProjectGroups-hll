class AudioCapture {
    constructor(options = {}) {
        this.audioContext = null;
        this.mediaStream = null;
        this.sourceNode = null;
        this.processorNode = null;
        this.gainNode = null;
        this.analyserNode = null;
        this.destinationNode = null;
        
        this.isRecording = false;
        this.isInitialized = false;
        this.isWorkletInitialized = false;
        
        this.sampleRate = options.sampleRate || 48000;
        this.bufferSize = options.bufferSize || 2048;
        this.numberOfChannels = options.numberOfChannels || 1;
        
        this.onAudioProcess = options.onAudioProcess || null;
        this.onEncodedData = options.onEncodedData || null;
        this.onDecodedData = options.onDecodedData || null;
        
        this.stats = {
            sampleCount: 0,
            byteCount: 0,
            startTime: 0,
            encodedByteCount: 0
        };
        
        this.echoCanceller = null;
        this.echoCancellerType = 'nlms';
        this.enableEchoCancellation = options.enableEchoCancellation || false;
        
        this.codecType = options.codecType || 'ulaw';
        this.recordedData = [];
        this.maxRecordedBytes = options.maxRecordedBytes || 10 * 1024 * 1024;
    }

    async init() {
        if (this.isInitialized) return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContextClass({
                sampleRate: this.sampleRate
            });

            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 1.0;

            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = 2048;

            this.destinationNode = this.audioContext.createMediaStreamDestination();

            this.processorNode = this.audioContext.createScriptProcessor(
                this.bufferSize,
                this.numberOfChannels,
                this.numberOfChannels
            );

            this.processorNode.onaudioprocess = (event) => {
                this._handleAudioProcess(event);
            };

            if (typeof NLMSAdaptiveFilterAEC !== 'undefined') {
                try {
                    this.echoCanceller = new NLMSAdaptiveFilterAEC(
                        this.audioContext,
                        'js/nlms-aec-processor.js'
                    );
                    await this.echoCanceller.init();
                    this.isWorkletInitialized = true;
                    this.echoCancellerType = 'nlms';
                } catch (workletError) {
                    console.warn('NLMS AudioWorklet initialization failed, falling back to simulated AEC:', workletError);
                    this._initFallbackAEC();
                }
            } else if (typeof SimulatedEchoCanceller !== 'undefined') {
                this._initFallbackAEC();
            }

            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize audio context:', error);
            throw error;
        }
    }

    _initFallbackAEC() {
        this.echoCanceller = new SimulatedEchoCanceller(16384);
        this.echoCanceller.setDelayTime(0.1, this.sampleRate);
        this.echoCancellerType = 'simulated';
    }

    async start() {
        if (this.isRecording) return;

        if (!this.isInitialized) {
            await this.init();
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: this.sampleRate,
                    channelCount: this.numberOfChannels
                }
            });

            this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            if (this.isWorkletInitialized && this.echoCancellerType === 'nlms' && this.echoCanceller) {
                this.sourceNode.connect(this.echoCanceller.workletNode);
                this.echoCanceller.workletNode.connect(this.processorNode);
            } else {
                this.sourceNode.connect(this.processorNode);
            }
            
            this.processorNode.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            this.gainNode.connect(this.analyserNode);

            this.stats.sampleCount = 0;
            this.stats.byteCount = 0;
            this.stats.encodedByteCount = 0;
            this.stats.startTime = performance.now();
            
            this.recordedData = [];
            
            this.isRecording = true;
            return true;
        } catch (error) {
            console.error('Failed to start audio capture:', error);
            throw error;
        }
    }

    stop() {
        if (!this.isRecording) return;

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }

        if (this.processorNode) {
            this.processorNode.disconnect();
        }

        if (this.gainNode) {
            this.gainNode.disconnect();
        }

        if (this.echoCanceller && this.echoCancellerType === 'nlms') {
            this.echoCanceller.disconnect();
        }

        this.isRecording = false;
    }

    _handleAudioProcess(event) {
        if (!this.isRecording) return;

        const inputBuffer = event.inputBuffer;
        const outputBuffer = event.outputBuffer;
        
        const inputData = inputBuffer.getChannelData(0);
        const outputData = outputBuffer.getChannelData(0);

        this.stats.sampleCount += inputData.length;
        this.stats.byteCount += inputData.length * 2;

        if (this.echoCanceller && this.enableEchoCancellation && this.echoCancellerType !== 'nlms') {
            this.echoCanceller.process(inputData, outputData);
        } else {
            inputData.forEach((sample, i) => {
                outputData[i] = sample;
            });
        }

        if (typeof G711Codec !== 'undefined') {
            const encoded = G711Codec.encodeFloat32(outputData, this.codecType);
            const decoded = G711Codec.decodeToFloat32(encoded, this.codecType);
            
            this.stats.encodedByteCount += encoded.length;

            const totalBytes = this.recordedData.reduce((sum, chunk) => sum + chunk.length, 0);
            if (totalBytes < this.maxRecordedBytes) {
                this.recordedData.push(new Uint8Array(encoded));
            }

            for (let i = 0; i < decoded.length; i++) {
                outputData[i] = decoded[i];
            }

            if (this.onEncodedData) {
                this.onEncodedData(encoded);
            }

            if (this.onDecodedData) {
                this.onDecodedData(decoded);
            }
        }

        if (this.onAudioProcess) {
            this.onAudioProcess(inputData, outputData);
        }
    }

    setVolume(value) {
        if (this.gainNode) {
            this.gainNode.gain.setTargetAtTime(
                Math.max(0, Math.min(1, value)),
                this.audioContext.currentTime,
                0.01
            );
        }
    }

    setEchoCancellationEnabled(enabled) {
        this.enableEchoCancellation = enabled;
        if (this.echoCanceller) {
            if (enabled) {
                this.echoCanceller.enable();
            } else {
                this.echoCanceller.disable();
            }
        }
    }

    setEchoCancellationParams(delayTime, decay, strength) {
        if (this.echoCanceller) {
            if (this.echoCancellerType === 'nlms') {
                if (strength !== undefined) {
                    this.echoCanceller.setStepSize(strength);
                }
            } else {
                if (delayTime !== undefined) {
                    this.echoCanceller.setDelayTime(delayTime, this.sampleRate);
                }
                if (decay !== undefined) {
                    this.echoCanceller.setDecay(decay);
                }
                if (strength !== undefined) {
                    this.echoCanceller.setCancellationStrength(strength);
                }
            }
        }
    }

    setNLMSParams(stepSize, filterLength) {
        if (this.echoCanceller && this.echoCancellerType === 'nlms') {
            if (stepSize !== undefined) {
                this.echoCanceller.setStepSize(stepSize);
            }
            if (filterLength !== undefined) {
                this.echoCanceller.setFilterLength(filterLength);
            }
        }
    }

    resetEchoCanceller() {
        if (this.echoCanceller && this.echoCanceller.reset) {
            this.echoCanceller.reset();
        }
    }

    getEchoCancellerType() {
        return this.echoCancellerType;
    }

    getStats() {
        const elapsed = (performance.now() - this.stats.startTime) / 1000;
        const bitRate = elapsed > 0 ? (this.stats.byteCount * 8) / elapsed / 1000 : 0;
        const encodedBitRate = elapsed > 0 ? (this.stats.encodedByteCount * 8) / elapsed / 1000 : 0;

        const totalRecordedBytes = this.recordedData.reduce((sum, chunk) => sum + chunk.length, 0);
        
        return {
            isRecording: this.isRecording,
            sampleRate: this.audioContext ? this.audioContext.sampleRate : 0,
            bufferSize: this.bufferSize,
            samplesProcessed: this.stats.sampleCount,
            originalBitRate: bitRate.toFixed(1),
            encodedBitRate: encodedBitRate.toFixed(1),
            compressionRatio: bitRate > 0 ? ((bitRate - encodedBitRate) / bitRate * 100).toFixed(1) : 0,
            echoCancellationEnabled: this.enableEchoCancellation,
            echoCancellerType: this.echoCancellerType,
            echoCancellerStats: this.echoCanceller ? this.echoCanceller.getStats() : null,
            codecType: this.codecType,
            recordedBytes: totalRecordedBytes,
            maxRecordedBytes: this.maxRecordedBytes
        };
    }

    setCodecType(codecType) {
        if (codecType === 'ulaw' || codecType === 'alaw') {
            this.codecType = codecType;
        }
    }

    getCodecType() {
        return this.codecType;
    }

    getRecordedData() {
        const totalLength = this.recordedData.reduce((sum, chunk) => sum + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        
        for (const chunk of this.recordedData) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        
        return result;
    }

    getRecordedDuration() {
        if (this.sampleRate === 0) return 0;
        const totalSamples = this.recordedData.reduce((sum, chunk) => sum + chunk.length, 0);
        return totalSamples / this.sampleRate;
    }

    clearRecordedData() {
        this.recordedData = [];
    }

    async close() {
        this.stop();
        
        if (this.echoCanceller && this.echoCancellerType === 'nlms') {
            this.echoCanceller.close();
        }
        
        if (this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
        }

        this.isInitialized = false;
        this.isWorkletInitialized = false;
    }
}
