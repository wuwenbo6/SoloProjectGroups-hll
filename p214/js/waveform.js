class WaveformVisualizer {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            throw new Error(`Canvas element with id "${canvasId}" not found`);
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.options = {
            lineWidth: options.lineWidth || 2,
            strokeStyle: options.strokeStyle || '#10B981',
            fillStyle: options.fillStyle || 'rgba(16, 185, 129, 0.1)',
            gridColor: options.gridColor || 'rgba(255, 255, 255, 0.1)',
            centerLineColor: options.centerLineColor || 'rgba(255, 255, 255, 0.3)',
            backgroundColor: options.backgroundColor || 'rgba(15, 23, 42, 0.8)',
            showGrid: options.showGrid !== false,
            showCenterLine: options.showCenterLine !== false,
            mirror: options.mirror || false,
            ...options
        };

        this.bufferSize = options.bufferSize || 4096;
        this.dataBuffer = new Float32Array(this.bufferSize);
        this.writeIndex = 0;
        this.isAnimating = false;
        this.animationId = null;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        this.ctx.scale(dpr, dpr);
        
        this.displayWidth = rect.width;
        this.displayHeight = rect.height;
    }

    pushData(audioData) {
        const length = audioData.length;
        
        for (let i = 0; i < length; i++) {
            this.dataBuffer[this.writeIndex] = audioData[i];
            this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
        }
    }

    clear() {
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
    }

    drawGrid() {
        if (!this.options.showGrid) return;
        
        const ctx = this.ctx;
        const width = this.displayWidth;
        const height = this.displayHeight;
        
        ctx.strokeStyle = this.options.gridColor;
        ctx.lineWidth = 1;
        
        const gridSize = 40;
        
        ctx.beginPath();
        for (let x = 0; x <= width; x += gridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
        }
        for (let y = 0; y <= height; y += gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }
        ctx.stroke();
        
        if (this.options.showCenterLine) {
            ctx.strokeStyle = this.options.centerLineColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, height / 2);
            ctx.lineTo(width, height / 2);
            ctx.stroke();
        }
    }

    draw() {
        this.clear();
        this.drawGrid();
        
        const ctx = this.ctx;
        const width = this.displayWidth;
        const height = this.displayHeight;
        const centerY = height / 2;
        const amplitude = height / 2 - 10;
        
        ctx.strokeStyle = this.options.strokeStyle;
        ctx.lineWidth = this.options.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        
        const step = this.bufferSize / width;
        
        for (let x = 0; x < width; x++) {
            const bufferIndex = Math.floor(x * step);
            const actualIndex = (this.writeIndex + bufferIndex) % this.bufferSize;
            const value = this.dataBuffer[actualIndex];
            
            const y = centerY + value * amplitude;
            
            if (x === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        if (this.options.mirror) {
            ctx.beginPath();
            for (let x = 0; x < width; x++) {
                const bufferIndex = Math.floor(x * step);
                const actualIndex = (this.writeIndex + bufferIndex) % this.bufferSize;
                const value = this.dataBuffer[actualIndex];
                
                const y = centerY - value * amplitude;
                
                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }
        
        if (this.options.fillStyle) {
            ctx.fillStyle = this.options.fillStyle;
            ctx.lineTo(width, centerY);
            ctx.lineTo(0, centerY);
            ctx.closePath();
            ctx.fill();
        }
    }

    start() {
        if (this.isAnimating) return;
        
        this.isAnimating = true;
        this.animate();
    }

    stop() {
        this.isAnimating = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    animate() {
        if (!this.isAnimating) return;
        
        this.draw();
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    setColor(strokeStyle, fillStyle) {
        if (strokeStyle) this.options.strokeStyle = strokeStyle;
        if (fillStyle) this.options.fillStyle = fillStyle;
    }
}

class MultiWaveformVisualizer {
    constructor(configs) {
        this.visualizers = {};
        
        for (const config of configs) {
            this.visualizers[config.id] = new WaveformVisualizer(config.canvasId, config.options);
        }
    }

    pushData(id, audioData) {
        if (this.visualizers[id]) {
            this.visualizers[id].pushData(audioData);
        }
    }

    start() {
        for (const id in this.visualizers) {
            this.visualizers[id].start();
        }
    }

    stop() {
        for (const id in this.visualizers) {
            this.visualizers[id].stop();
        }
    }

    clear() {
        for (const id in this.visualizers) {
            this.visualizers[id].clear();
        }
    }

    getVisualizer(id) {
        return this.visualizers[id];
    }
}
