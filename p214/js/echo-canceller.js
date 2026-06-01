class EchoCanceller {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.enabled = false;
        this.delayTime = 0.1;
        this.decay = 0.3;
        
        this.inputNode = null;
        this.outputNode = null;
        this.delayNode = null;
        this.feedbackGain = null;
        this.dryGain = null;
        this.wetGain = null;
        this.cancellationGain = null;
        
        this._createNodes();
    }

    _createNodes() {
        this.delayNode = this.audioContext.createDelay(2.0);
        this.delayNode.delayTime.value = this.delayTime;
        
        this.feedbackGain = this.audioContext.createGain();
        this.feedbackGain.gain.value = this.decay;
        
        this.dryGain = this.audioContext.createGain();
        this.dryGain.gain.value = 1.0;
        
        this.wetGain = this.audioContext.createGain();
        this.wetGain.gain.value = 0.0;
        
        this.cancellationGain = this.audioContext.createGain();
        this.cancellationGain.gain.value = 0.0;
        
        this.delayNode.connect(this.feedbackGain);
        this.feedbackGain.connect(this.delayNode);
    }

    connect(inputNode, outputNode) {
        this.inputNode = inputNode;
        this.outputNode = outputNode;
        
        this.inputNode.connect(this.dryGain);
        this.dryGain.connect(this.outputNode);
        
        this.inputNode.connect(this.delayNode);
        this.delayNode.connect(this.wetGain);
        this.wetGain.connect(this.outputNode);
    }

    enable() {
        if (this.enabled) return;
        
        this.enabled = true;
        this._updateGains();
    }

    disable() {
        if (!this.enabled) return;
        
        this.enabled = false;
        this._updateGains();
    }

    toggle() {
        if (this.enabled) {
            this.disable();
        } else {
            this.enable();
        }
        return this.enabled;
    }

    setDelayTime(seconds) {
        this.delayTime = Math.max(0.001, Math.min(2.0, seconds));
        if (this.delayNode) {
            this.delayNode.delayTime.setTargetAtTime(
                this.delayTime,
                this.audioContext.currentTime,
                0.01
            );
        }
    }

    setDecay(value) {
        this.decay = Math.max(0, Math.min(0.9, value));
        if (this.feedbackGain) {
            this.feedbackGain.gain.setTargetAtTime(
                this.decay,
                this.audioContext.currentTime,
                0.01
            );
        }
    }

    setCancellationStrength(strength) {
        const cancellationAmount = Math.max(0, Math.min(1.0, strength));
        this.cancellationStrength = cancellationAmount;
        this._updateGains();
    }

    _updateGains() {
        const now = this.audioContext.currentTime;
        
        if (this.enabled) {
            this.wetGain.gain.setTargetAtTime(0.3, now, 0.01);
            this.cancellationGain.gain.setTargetAtTime(
                this.cancellationStrength || 0.5,
                now,
                0.01
            );
        } else {
            this.wetGain.gain.setTargetAtTime(0.0, now, 0.01);
            this.cancellationGain.gain.setTargetAtTime(0.0, now, 0.01);
        }
    }

    simulateEchoAndCancel(inputBuffer, outputBuffer) {
        const inputData = inputBuffer.getChannelData(0);
        const outputData = outputBuffer.getChannelData(0);
        
        const bufferLength = inputData.length;
        
        for (let i = 0; i < bufferLength; i++) {
            const originalSample = inputData[i];
            
            if (this.enabled) {
                const echoAmount = this.decay * 0.5;
                const echoSample = originalSample * echoAmount;
                outputData[i] = originalSample - echoSample * (this.cancellationStrength || 0.5);
            } else {
                outputData[i] = originalSample;
            }
        }
    }

    getStats() {
        return {
            enabled: this.enabled,
            delayTime: this.delayTime,
            decay: this.decay,
            cancellationStrength: this.cancellationStrength || 0.5
        };
    }
}

class SimulatedEchoCanceller {
    constructor(bufferSize = 8192) {
        this.bufferSize = bufferSize;
        this.echoBuffer = new Float32Array(bufferSize);
        this.bufferIndex = 0;
        this.enabled = false;
        this.delaySamples = 4800;
        this.decay = 0.3;
        this.cancellationStrength = 0.5;
    }

    enable() {
        this.enabled = true;
    }

    disable() {
        this.enabled = false;
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    setDelayTime(seconds, sampleRate = 48000) {
        this.delaySamples = Math.floor(seconds * sampleRate);
        this.delaySamples = Math.max(256, Math.min(this.bufferSize - 1, this.delaySamples));
    }

    setDecay(value) {
        this.decay = Math.max(0, Math.min(0.9, value));
    }

    setCancellationStrength(strength) {
        this.cancellationStrength = Math.max(0, Math.min(1.0, strength));
    }

    process(inputData, outputData) {
        const length = inputData.length;
        
        for (let i = 0; i < length; i++) {
            const inputSample = inputData[i];
            
            const echoIndex = (this.bufferIndex - this.delaySamples + this.bufferSize) % this.bufferSize;
            const echoSample = this.echoBuffer[echoIndex] * this.decay;
            
            if (this.enabled) {
                outputData[i] = inputSample - echoSample * this.cancellationStrength;
            } else {
                outputData[i] = inputSample;
            }
            
            this.echoBuffer[this.bufferIndex] = inputSample;
            this.bufferIndex = (this.bufferIndex + 1) % this.bufferSize;
        }
    }

    getStats() {
        return {
            enabled: this.enabled,
            delaySamples: this.delaySamples,
            decay: this.decay,
            cancellationStrength: this.cancellationStrength
        };
    }
}

class NLMSAdaptiveFilterAEC {
    constructor(audioContext, workletUrl = 'js/nlms-aec-processor.js') {
        this.audioContext = audioContext;
        this.workletUrl = workletUrl;
        this.enabled = false;
        this.isInitialized = false;
        this.workletNode = null;
        this.inputNode = null;
        this.outputNode = null;
        
        this.filterLength = 1024;
        this.stepSize = 0.5;
        
        this.stats = {
            iterations: 0,
            avgError: 0,
            avgFilterOutput: 0,
            filterLength: this.filterLength,
            stepSize: this.stepSize
        };
        
        this.onStatsUpdate = null;
    }

    async init() {
        if (this.isInitialized) return;

        try {
            await this.audioContext.audioWorklet.addModule(this.workletUrl);
            
            this.workletNode = new AudioWorkletNode(
                this.audioContext,
                'nlms-aec-processor',
                {
                    processorOptions: {
                        filterLength: this.filterLength,
                        stepSize: this.stepSize,
                        enabled: this.enabled
                    },
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    channelCount: 1,
                    channelCountMode: 'explicit'
                }
            );

            this.workletNode.port.onmessage = (event) => {
                if (event.data.type === 'stats') {
                    this.stats = { ...event.data.data };
                    if (this.onStatsUpdate) {
                        this.onStatsUpdate(this.stats);
                    }
                }
            };

            this.workletNode.onprocessorerror = (event) => {
                console.error('NLMS AEC Processor error:', event);
            };

            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize NLMS AEC:', error);
            throw error;
        }
    }

    connect(inputNode, outputNode) {
        if (!this.isInitialized) {
            throw new Error('NLMS AEC not initialized. Call init() first.');
        }
        
        this.inputNode = inputNode;
        this.outputNode = outputNode;
        
        this.inputNode.connect(this.workletNode);
        this.workletNode.connect(this.outputNode);
    }

    disconnect() {
        if (this.inputNode && this.workletNode) {
            this.inputNode.disconnect(this.workletNode);
        }
        if (this.workletNode && this.outputNode) {
            this.workletNode.disconnect(this.outputNode);
        }
    }

    enable() {
        if (this.enabled) return;
        
        this.enabled = true;
        this._sendMessage('setEnabled', true);
    }

    disable() {
        if (!this.enabled) return;
        
        this.enabled = false;
        this._sendMessage('setEnabled', false);
    }

    toggle() {
        if (this.enabled) {
            this.disable();
        } else {
            this.enable();
        }
        return this.enabled;
    }

    setStepSize(value) {
        this.stepSize = Math.max(0.001, Math.min(1.0, value));
        this._sendMessage('setStepSize', this.stepSize);
    }

    setFilterLength(value) {
        this.filterLength = Math.max(128, Math.min(4096, value));
        this._sendMessage('setFilterLength', this.filterLength);
    }

    reset() {
        this._sendMessage('reset', null);
        this.stats.iterations = 0;
        this.stats.avgError = 0;
        this.stats.avgFilterOutput = 0;
    }

    _sendMessage(type, data) {
        if (this.workletNode && this.workletNode.port) {
            this.workletNode.port.postMessage({ type, data });
        }
    }

    requestStats() {
        this._sendMessage('getStats', null);
    }

    getStats() {
        return {
            enabled: this.enabled,
            isInitialized: this.isInitialized,
            filterLength: this.filterLength,
            stepSize: this.stepSize,
            ...this.stats
        };
    }

    close() {
        this.disable();
        this.disconnect();
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }
        this.isInitialized = false;
    }
}
