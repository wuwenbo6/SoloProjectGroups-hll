import { EITVisualizer } from './EITVisualizer.js';

class EITApp {
    constructor() {
        this.visualizer = null;
        this.currentV0 = null;
        this.currentV1 = null;
        this.currentVolume = null;
        this.currentReconstruction = null;
        this.currentAnomaly = null;
        
        this.dynamicMode = false;
        this.dynamicInterval = null;
        this.frameCount = 0;
        this.dynamicPhase = 0;
        this.anomalySequence = [];
        
        this.init();
    }
    
    init() {
        const container = document.getElementById('visualizer-container');
        this.visualizer = new EITVisualizer(container);
        
        this.bindEvents();
        this.loadMeasurements();
        this.setStatus('就绪', 'success');
    }
    
    bindEvents() {
        document.getElementById('simulate-btn').addEventListener('click', () => this.simulate());
        document.getElementById('use-default-anomaly').addEventListener('click', () => this.useDefaultAnomaly());
        document.getElementById('reconstruct-btn').addEventListener('click', () => this.reconstruct());
        document.getElementById('save-btn').addEventListener('click', () => this.saveMeasurement());
        document.getElementById('refresh-btn').addEventListener('click', () => this.loadMeasurements());
        document.getElementById('algorithm-select').addEventListener('change', (e) => {
            document.getElementById('method-display').textContent = `算法: ${e.target.value === 'greit' ? 'GREIT' : '高斯牛顿'}`;
        });
        
        document.getElementById('isovalue-slider').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('isovalue-display').textContent = value.toFixed(2);
            this.visualizer.setIsovalue(value);
        });
        
        document.getElementById('lambda-slider').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('lambda-display').textContent = value.toFixed(3);
        });
        
        document.getElementById('smooth-slider').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('smooth-display').textContent = value.toFixed(1);
        });
        
        document.getElementById('denoise-slider').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('denoise-display').textContent = `${value}级`;
        });
        
        this.bindSliceToggle('x');
        this.bindSliceToggle('y');
        this.bindSliceToggle('z');
        
        this.bindSliceSlider('x');
        this.bindSliceSlider('y');
        this.bindSliceSlider('z');
        
        document.getElementById('temporal-slider').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('temporal-display').textContent = value.toFixed(1);
        });
        
        document.getElementById('start-dynamic-btn').addEventListener('click', () => this.startDynamic());
        document.getElementById('stop-dynamic-btn').addEventListener('click', () => this.stopDynamic());
        document.getElementById('check-electrodes-btn').addEventListener('click', () => this.checkElectrodes());
        document.getElementById('export-dicom-btn').addEventListener('click', () => this.exportDICOM());
        document.getElementById('export-json-btn').addEventListener('click', () => this.exportJSON());
    }
    
    bindSliceToggle(axis) {
        const toggle = document.getElementById(`slice-${axis}-toggle`);
        const row = document.getElementById(`slice-${axis}-row`);
        
        toggle.addEventListener('click', () => {
            const isActive = toggle.classList.toggle('active');
            row.style.display = isActive ? 'flex' : 'none';
            this.visualizer.setSlice(axis, isActive);
        });
    }
    
    bindSliceSlider(axis) {
        const slider = document.getElementById(`slice-${axis}-slider`);
        const display = document.getElementById(`slice-${axis}-display`);
        
        slider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            display.textContent = value.toFixed(2);
            this.visualizer.setSlicePosition(axis, value);
        });
    }
    
    async useDefaultAnomaly() {
        try {
            const response = await fetch('/api/anomaly/sample');
            const result = await response.json();
            
            if (result.success) {
                document.getElementById('anomaly-config').value = JSON.stringify(result.data, null, 2);
                this.setStatus('已加载默认异常配置', 'success');
            }
        } catch (error) {
            this.setStatus(`错误: ${error.message}`, 'error');
        }
    }
    
    async simulate() {
        this.setStatus('正在模拟边界电压...', '');
        
        try {
            let anomaly = null;
            const anomalyText = document.getElementById('anomaly-config').value.trim();
            
            if (anomalyText) {
                anomaly = JSON.parse(anomalyText);
            }
            
            const response = await fetch('/api/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ anomaly })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.currentV0 = result.data.v0;
                this.currentV1 = result.data.v1;
                this.currentAnomaly = result.data.anomaly;
                
                document.getElementById('v0-status').textContent = `已设置 (${this.currentV0.length}点)`;
                document.getElementById('v1-status').textContent = `已设置 (${this.currentV1.length}点)`;
                
                this.setStatus('边界电压模拟完成', 'success');
            } else {
                this.setStatus(`错误: ${result.error}`, 'error');
            }
        } catch (error) {
            this.setStatus(`错误: ${error.message}`, 'error');
        }
    }
    
    async reconstruct() {
        this.setStatus('正在重建阻抗分布...', '');
        
        try {
            const method = document.getElementById('algorithm-select').value;
            const lamb = parseFloat(document.getElementById('lambda-slider').value);
            const smooth_sigma = parseFloat(document.getElementById('smooth-slider').value);
            const denoise_level = parseInt(document.getElementById('denoise-slider').value);
            
            const response = await fetch('/api/reconstruct', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    v0: this.currentV0,
                    v1: this.currentV1,
                    method,
                    grid_size: 32,
                    lambda: lamb,
                    smooth_sigma: smooth_sigma,
                    denoise_level: denoise_level
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.currentReconstruction = result.data.reconstruction;
                this.currentVolume = result.data.volume;
                
                this.visualizer.setVolumeData(this.currentVolume);
                
                this.setStatus(`重建完成 (使用 ${method === 'greit' ? 'GREIT' : '高斯牛顿'} 算法)`, 'success');
            } else {
                this.setStatus(`错误: ${result.error}`, 'error');
            }
        } catch (error) {
            this.setStatus(`错误: ${error.message}`, 'error');
        }
    }
    
    async saveMeasurement() {
        const name = document.getElementById('measurement-name').value.trim() || `测量 ${new Date().toLocaleString()}`;
        
        try {
            const response = await fetch('/api/measurements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    v0: this.currentV0,
                    v1: this.currentV1,
                    reconstruction: this.currentReconstruction,
                    volume: this.currentVolume,
                    anomaly_params: this.currentAnomaly,
                    method: document.getElementById('algorithm-select').value
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.setStatus('保存成功', 'success');
                this.loadMeasurements();
                document.getElementById('measurement-name').value = '';
            } else {
                this.setStatus(`错误: ${result.error}`, 'error');
            }
        } catch (error) {
            this.setStatus(`错误: ${error.message}`, 'error');
        }
    }
    
    async loadMeasurements() {
        const list = document.getElementById('measurement-list');
        list.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">加载中...</div>';
        
        try {
            const response = await fetch('/api/measurements');
            const result = await response.json();
            
            if (result.success && result.data.length > 0) {
                list.innerHTML = result.data.map(m => `
                    <div class="measurement-item" data-id="${m.id}">
                        <div class="name">${m.name}</div>
                        <div class="meta">${new Date(m.timestamp).toLocaleString()} | ${m.method}</div>
                    </div>
                `).join('');
                
                list.querySelectorAll('.measurement-item').forEach(item => {
                    item.addEventListener('click', () => this.loadMeasurement(parseInt(item.dataset.id)));
                });
            } else {
                list.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">暂无记录</div>';
            }
        } catch (error) {
            list.innerHTML = `<div style="text-align: center; color: #ff4757; padding: 20px;">加载失败: ${error.message}</div>`;
        }
    }
    
    async loadMeasurement(id) {
        this.setStatus('正在加载测量数据...', '');
        
        try {
            const response = await fetch(`/api/measurements/${id}`);
            const result = await response.json();
            
            if (result.success) {
                const data = result.data;
                this.currentV0 = data.v0;
                this.currentV1 = data.v1;
                this.currentReconstruction = data.reconstruction;
                this.currentVolume = data.volume;
                this.currentAnomaly = data.anomaly_params;
                
                if (this.currentVolume) {
                    this.visualizer.setVolumeData(this.currentVolume);
                }
                
                document.getElementById('v0-status').textContent = this.currentV0 ? `已加载 (${this.currentV0.length}点)` : '未设置';
                document.getElementById('v1-status').textContent = this.currentV1 ? `已加载 (${this.currentV1.length}点)` : '未设置';
                document.getElementById('measurement-name').value = data.name;
                
                this.setStatus(`已加载: ${data.name}`, 'success');
            } else {
                this.setStatus(`错误: ${result.error}`, 'error');
            }
        } catch (error) {
            this.setStatus(`错误: ${error.message}`, 'error');
        }
    }
    
    setStatus(text, type = '') {
        const statusEl = document.getElementById('status-text');
        statusEl.textContent = text;
        statusEl.className = type ? type : '';
    }
    
    async startDynamic() {
        if (this.dynamicMode) return;
        
        this.setStatus('初始化动态成像...', '');
        await this.resetDynamicBuffer();
        
        this.dynamicMode = true;
        this.frameCount = 0;
        this.dynamicPhase = 0;
        
        document.getElementById('start-dynamic-btn').disabled = true;
        document.getElementById('start-dynamic-btn').classList.add('recording');
        document.getElementById('stop-dynamic-btn').disabled = false;
        
        const fps = parseInt(document.getElementById('fps-select').value);
        const intervalMs = 1000 / fps;
        
        if (!this.currentV0) {
            await this.simulate();
        }
        
        this.dynamicInterval = setInterval(() => this.processDynamicFrame(), intervalMs);
        this.setStatus(`动态成像运行中 (${fps} FPS)`, 'success');
    }
    
    async resetDynamicBuffer() {
        try {
            await fetch('/api/dynamic/reset', { method: 'POST' });
        } catch (e) {
            console.warn('Buffer reset warning:', e);
        }
    }
    
    stopDynamic() {
        if (!this.dynamicMode) return;
        
        this.dynamicMode = false;
        if (this.dynamicInterval) {
            clearInterval(this.dynamicInterval);
            this.dynamicInterval = null;
        }
        
        document.getElementById('start-dynamic-btn').disabled = false;
        document.getElementById('start-dynamic-btn').classList.remove('recording');
        document.getElementById('stop-dynamic-btn').disabled = true;
        document.getElementById('fps-info').textContent = `已停止 - 共 ${this.frameCount} 帧`;
        
        this.setStatus('动态成像已停止', '');
    }
    
    async processDynamicFrame() {
        if (!this.dynamicMode) return;
        
        this.frameCount++;
        this.dynamicPhase += 0.1;
        
        try {
            const phase = this.dynamicPhase;
            const movingAnomaly = [
                {
                    x: 0.3 + 0.15 * Math.sin(phase),
                    y: 0.2 + 0.15 * Math.cos(phase),
                    d: 0.2,
                    perm: 10.0
                },
                {
                    x: -0.2,
                    y: -0.2,
                    d: 0.15,
                    perm: 0.1
                }
            ];
            
            const method = document.getElementById('algorithm-select').value;
            const lamb = parseFloat(document.getElementById('lambda-slider').value);
            const smooth_sigma = parseFloat(document.getElementById('smooth-slider').value);
            const temporal_smooth = parseFloat(document.getElementById('temporal-slider').value) > 0;
            
            const response = await fetch('/api/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ anomaly: movingAnomaly })
            });
            
            const simResult = await response.json();
            if (!simResult.success) throw new Error(simResult.error);
            
            const recResponse = await fetch('/api/dynamic/reconstruct', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    v0: simResult.data.v0,
                    v1: simResult.data.v1,
                    method,
                    grid_size: 32,
                    lambda: lamb,
                    smooth_sigma: smooth_sigma,
                    temporal_smooth: temporal_smooth
                })
            });
            
            const recResult = await recResponse.json();
            if (recResult.success) {
                this.currentReconstruction = recResult.data.reconstruction;
                this.currentVolume = recResult.data.volume;
                this.visualizer.setVolumeData(this.currentVolume);
                
                document.getElementById('fps-info').textContent = `帧: ${this.frameCount}`;
            }
        } catch (error) {
            console.error('Dynamic frame error:', error);
        }
    }
    
    async checkElectrodes() {
        this.setStatus('正在检测电极状态...', '');
        
        try {
            const response = await fetch('/api/electrode/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ v1: this.currentV1 })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.updateElectrodeDisplay(result.data);
                this.setStatus('电极检测完成', 'success');
            } else {
                this.setStatus(`错误: ${result.error}`, 'error');
            }
        } catch (error) {
            this.setStatus(`错误: ${error.message}`, 'error');
        }
    }
    
    updateElectrodeDisplay(data) {
        const scoreEl = document.getElementById('quality-score');
        const gridEl = document.getElementById('electrode-grid');
        const recEl = document.getElementById('contact-recommendation');
        
        const score = data.quality_score;
        scoreEl.textContent = score.toFixed(0);
        scoreEl.style.color = score >= 80 ? '#00ff88' : score >= 60 ? '#ffa502' : '#ff4757';
        
        let gridHTML = '';
        data.electrode_status.forEach((status, idx) => {
            gridHTML += `
                <div class="electrode-item ${status}">
                    <span class="electrode-number">${idx + 1}</span>
                    <span class="electrode-status">${status === 'good' ? '良好' : status === 'fair' ? '一般' : '较差'}</span>
                </div>
            `;
        });
        gridEl.innerHTML = gridHTML;
        
        recEl.textContent = data.recommendation;
        recEl.className = 'recommendation';
        if (score < 60) {
            recEl.classList.add('error');
        } else if (score < 80) {
            recEl.classList.add('warning');
        }
    }
    
    async exportDICOM() {
        this.setStatus('正在导出 DICOM...', '');
        
        try {
            const patientName = document.getElementById('patient-name').value.trim() || 'EIT_PATIENT';
            
            const response = await fetch('/api/export/dicom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    volume_data: this.currentVolume,
                    patient_name: patientName
                })
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `eit_${Date.now()}.dcm`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
                this.setStatus('DICOM 导出成功', 'success');
            } else {
                const result = await response.json();
                this.setStatus(`错误: ${result.error || '导出失败'}`, 'error');
            }
        } catch (error) {
            this.setStatus(`错误: ${error.message}`, 'error');
        }
    }
    
    exportJSON() {
        this.setStatus('正在导出 JSON...', '');
        
        try {
            const exportData = {
                timestamp: new Date().toISOString(),
                patient_name: document.getElementById('patient-name').value.trim() || 'EIT_PATIENT',
                method: document.getElementById('algorithm-select').value,
                v0: this.currentV0,
                v1: this.currentV1,
                reconstruction: this.currentReconstruction,
                volume: this.currentVolume,
                anomaly: this.currentAnomaly,
                parameters: {
                    lambda: parseFloat(document.getElementById('lambda-slider').value),
                    smooth_sigma: parseFloat(document.getElementById('smooth-slider').value),
                    denoise_level: parseInt(document.getElementById('denoise-slider').value)
                }
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `eit_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            this.setStatus('JSON 导出成功', 'success');
        } catch (error) {
            this.setStatus(`错误: ${error.message}`, 'error');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new EITApp();
});
