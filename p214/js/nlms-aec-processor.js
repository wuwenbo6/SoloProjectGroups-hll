class NlmsAecProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        
        const processorOptions = options.processorOptions || {};
        
        this.filterLength = processorOptions.filterLength || 1024;
        this.stepSize = processorOptions.stepSize || 0.5;
        this.regularization = processorOptions.regularization || 0.0001;
        this.enabled = processorOptions.enabled !== false;
        
        this.weights = new Float32Array(this.filterLength);
        this.referenceBuffer = new Float32Array(this.filterLength);
        this.bufferIndex = 0;
        
        this.energy = 0;
        this.alpha = 0.99;
        
        this.stats = {
            iterations: 0,
            avgError: 0,
            avgFilterOutput: 0
        };
        
        this.port.onmessage = (event) => {
            const { type, data } = event.data;
            
            switch (type) {
                case 'setEnabled':
                    this.enabled = data;
                    break;
                case 'setStepSize':
                    this.stepSize = Math.max(0.001, Math.min(1.0, data));
                    break;
                case 'setFilterLength':
                    this.setFilterLength(data);
                    break;
                case 'reset':
                    this.reset();
                    break;
                case 'getStats':
                    this.port.postMessage({
                        type: 'stats',
                        data: {
                            ...this.stats,
                            filterLength: this.filterLength,
                            stepSize: this.stepSize,
                            enabled: this.enabled
                        }
                    });
                    break;
            }
        };
    }
    
    setFilterLength(newLength) {
        newLength = Math.max(128, Math.min(4096, newLength));
        
        const newWeights = new Float32Array(newLength);
        const newBuffer = new Float32Array(newLength);
        
        const copyLength = Math.min(this.filterLength, newLength);
        for (let i = 0; i < copyLength; i++) {
            newWeights[i] = this.weights[i];
        }
        
        this.weights = newWeights;
        this.referenceBuffer = newBuffer;
        this.filterLength = newLength;
        this.bufferIndex = 0;
    }
    
    reset() {
        this.weights.fill(0);
        this.referenceBuffer.fill(0);
        this.bufferIndex = 0;
        this.energy = 0;
        this.stats.iterations = 0;
        this.stats.avgError = 0;
        this.stats.avgFilterOutput = 0;
    }
    
    updateReferenceBuffer(sample) {
        this.referenceBuffer[this.bufferIndex] = sample;
        this.bufferIndex = (this.bufferIndex + 1) % this.filterLength;
    }
    
    getReferenceSample(index) {
        const adjustedIndex = (this.bufferIndex - 1 - index + this.filterLength) % this.filterLength;
        return this.referenceBuffer[adjustedIndex];
    }
    
    computeFilterOutput() {
        let output = 0;
        for (let i = 0; i < this.filterLength; i++) {
            output += this.weights[i] * this.getReferenceSample(i);
        }
        return output;
    }
    
    computeEnergy() {
        let energy = 0;
        for (let i = 0; i < this.filterLength; i++) {
            const sample = this.getReferenceSample(i);
            energy += sample * sample;
        }
        return energy;
    }
    
    updateWeights(error, referenceEnergy) {
        const normalization = referenceEnergy + this.regularization;
        const mu = this.stepSize / normalization;
        
        for (let i = 0; i < this.filterLength; i++) {
            const refSample = this.getReferenceSample(i);
            this.weights[i] += mu * error * refSample;
        }
    }
    
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        
        if (input.length === 0 || input[0].length === 0) {
            return true;
        }
        
        const inputChannel = input[0];
        const outputChannel = output[0];
        const blockSize = inputChannel.length;
        
        for (let n = 0; n < blockSize; n++) {
            const microphoneSignal = inputChannel[n];
            
            this.updateReferenceBuffer(microphoneSignal);
            
            if (this.enabled) {
                const filterOutput = this.computeFilterOutput();
                const error = microphoneSignal - filterOutput;
                
                const referenceEnergy = this.computeEnergy();
                this.updateWeights(error, referenceEnergy);
                
                outputChannel[n] = error;
                
                this.stats.iterations++;
                const iter = this.stats.iterations;
                this.stats.avgError = (this.stats.avgError * (iter - 1) + Math.abs(error)) / iter;
                this.stats.avgFilterOutput = (this.stats.avgFilterOutput * (iter - 1) + Math.abs(filterOutput)) / iter;
            } else {
                outputChannel[n] = microphoneSignal;
            }
        }
        
        if (this.stats.iterations % 1000 === 0) {
            this.port.postMessage({
                type: 'stats',
                data: {
                    ...this.stats,
                    filterLength: this.filterLength,
                    stepSize: this.stepSize,
                    enabled: this.enabled
                }
            });
        }
        
        return true;
    }
}

registerProcessor('nlms-aec-processor', NlmsAecProcessor);
