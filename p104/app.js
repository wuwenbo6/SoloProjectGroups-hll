class GestureRecognizer {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.loadingOverlay = document.getElementById('loading-overlay');
        
        this.mobileNet = null;
        this.classifier = null;
        this.isPredicting = false;
        
        this.gestureLabels = [];
        this.trainingData = [];
        
        this.predictionHistory = [];
        this.maxHistoryLength = 10;
        this.confidenceThreshold = 0.6;
        
        this.lastPredictionTime = 0;
        this.predictionInterval = 33;
        
        this.frameCount = 0;
        this.lastFPSUpdate = 0;
        this.currentFPS = 0;
        
        this.isContinuousMode = false;
        this.currentWord = '';
        this.gestureSequence = [];
        this.lastAddedGesture = null;
        this.gestureStableCount = 0;
        this.requiredStableFrames = 8;
        this.cooldownFrames = 0;
        this.cooldownPeriod = 15;
        
        this.initElements();
        this.initEventListeners();
        this.initTFBackend();
        this.loadModel();
    }
    
    initElements() {
        this.startCameraBtn = document.getElementById('startCamera');
        this.stopCameraBtn = document.getElementById('stopCamera');
        this.screenshotBtn = document.getElementById('screenshot');
        this.startPredictBtn = document.getElementById('startPredict');
        this.stopPredictBtn = document.getElementById('stopPredict');
        
        this.smoothLevelSlider = document.getElementById('smoothLevel');
        this.smoothValueEl = document.getElementById('smoothValue');
        this.confidenceThresholdSlider = document.getElementById('confidenceThreshold');
        this.thresholdValueEl = document.getElementById('thresholdValue');
        this.fpsDisplay = document.getElementById('fpsDisplay');
        
        this.resultEl = document.getElementById('result');
        this.confidenceEl = document.getElementById('confidence');
        this.predictionsEl = document.getElementById('predictions');
        
        this.startContinuousBtn = document.getElementById('startContinuous');
        this.clearWordBtn = document.getElementById('clearWord');
        this.backspaceBtn = document.getElementById('backspace');
        this.addSpaceBtn = document.getElementById('addSpace');
        this.currentWordEl = document.getElementById('currentWord');
        this.historyContentEl = document.getElementById('historyContent');
        
        this.gestureNameInput = document.getElementById('gestureName');
        this.sampleCountEl = document.getElementById('sampleCount');
        this.addSampleBtn = document.getElementById('addSample');
        this.trainModelBtn = document.getElementById('trainModel');
        this.saveModelBtn = document.getElementById('saveModel');
        this.exportWeightsBtn = document.getElementById('exportWeights');
        this.exportJSONBtn = document.getElementById('exportJSON');
        this.loadModelBtn = document.getElementById('loadModel');
        this.useAugmentationCheckbox = document.getElementById('useAugmentation');
        this.gestureListEl = document.getElementById('gestureList');
        this.progressFill = document.getElementById('progressFill');
        this.trainingStatus = document.getElementById('trainingStatus');
        
        this.currentSampleCount = 0;
    }
    
    initEventListeners() {
        this.startCameraBtn.addEventListener('click', () => this.startCamera());
        this.stopCameraBtn.addEventListener('click', () => this.stopCamera());
        this.screenshotBtn.addEventListener('click', () => this.takeScreenshot());
        this.startPredictBtn.addEventListener('click', () => this.startPrediction());
        this.stopPredictBtn.addEventListener('click', () => this.stopPrediction());
        
        this.smoothLevelSlider.addEventListener('input', (e) => {
            this.maxHistoryLength = parseInt(e.target.value);
            this.smoothValueEl.textContent = e.target.value;
        });
        
        this.confidenceThresholdSlider.addEventListener('input', (e) => {
            this.confidenceThreshold = parseInt(e.target.value) / 100;
            this.thresholdValueEl.textContent = e.target.value + '%';
        });
        
        this.startContinuousBtn.addEventListener('click', () => this.toggleContinuousMode());
        this.clearWordBtn.addEventListener('click', () => this.clearWord());
        this.backspaceBtn.addEventListener('click', () => this.backspace());
        this.addSpaceBtn.addEventListener('click', () => this.addSpace());
        
        this.addSampleBtn.addEventListener('click', () => this.addSample());
        this.trainModelBtn.addEventListener('click', () => this.trainModel());
        this.saveModelBtn.addEventListener('click', () => this.saveModel());
        this.exportWeightsBtn.addEventListener('click', () => this.exportWeights());
        this.exportJSONBtn.addEventListener('click', () => this.exportJSONModel());
        this.loadModelBtn.addEventListener('click', () => this.loadCustomModel());
    }
    
    async initTFBackend() {
        try {
            await tf.setBackend('webgl');
            await tf.ready();
            
            tf.enableProdMode();
            
            const gl = tf.backend().getGPGPUContext().gl;
            gl.disable(gl.DEPTH_TEST);
            gl.disable(gl.STENCIL_TEST);
            
            console.log('WebGL 后端已优化');
        } catch (e) {
            console.log('WebGL 不可用，使用 CPU 后端');
        }
    }
    
    async loadModel() {
        try {
            this.showLoading(true);
            showToast('正在加载 MobileNet 模型...', 'info');
            
            this.mobileNet = await tf.loadLayersModel(
                'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json'
            );
            
            const layer = this.mobileNet.getLayer('conv_pw_13_relu');
            this.mobileNet = tf.model({
                inputs: this.mobileNet.inputs,
                outputs: layer.output
            });
            
            this.mobileNet.predict(tf.zeros([1, 224, 224, 3])).dispose();
            
            showToast('MobileNet 模型加载成功！', 'success');
            this.showLoading(false);
            
            this.createInitialClassifier();
            
        } catch (error) {
            console.error('模型加载失败:', error);
            showToast('模型加载失败，请刷新重试', 'error');
            this.showLoading(false);
        }
    }
    
    createInitialClassifier() {
        this.classifier = tf.sequential({
            layers: [
                tf.layers.flatten({
                    inputShape: this.mobileNet.outputs[0].shape.slice(1)
                }),
                tf.layers.dense({
                    units: 128,
                    activation: 'relu',
                    kernelInitializer: 'varianceScaling'
                }),
                tf.layers.dropout({ rate: 0.5 }),
                tf.layers.dense({
                    units: 64,
                    activation: 'relu',
                    kernelInitializer: 'varianceScaling'
                }),
                tf.layers.dense({
                    units: 10,
                    activation: 'softmax',
                    kernelInitializer: 'varianceScaling'
                })
            ]
        });
        
        this.classifier.compile({
            optimizer: tf.train.adam(0.0001),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });
        
        this.gestureLabels = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    }
    
    async startCamera() {
        try {
            const constraints = {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                }
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = stream;
            
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    resolve();
                };
            });
            
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            
            this.startCameraBtn.disabled = true;
            this.stopCameraBtn.disabled = false;
            this.screenshotBtn.disabled = false;
            this.startPredictBtn.disabled = false;
            this.addSampleBtn.disabled = false;
            this.startContinuousBtn.disabled = false;
            
            showToast('摄像头已启动！', 'success');
            
        } catch (error) {
            console.error('摄像头启动失败:', error);
            showToast('摄像头启动失败，请检查权限', 'error');
        }
    }
    
    stopCamera() {
        if (this.video.srcObject) {
            const stream = this.video.srcObject;
            const tracks = stream.getTracks();
            tracks.forEach(track => track.stop());
            this.video.srcObject = null;
            
            this.stopPrediction();
            this.isContinuousMode = false;
            this.startContinuousBtn.textContent = '开始拼写';
            
            this.startCameraBtn.disabled = false;
            this.stopCameraBtn.disabled = true;
            this.screenshotBtn.disabled = true;
            this.startPredictBtn.disabled = true;
            this.stopPredictBtn.disabled = true;
            this.addSampleBtn.disabled = true;
            this.startContinuousBtn.disabled = true;
            
            this.resultEl.textContent = '--';
            this.confidenceEl.textContent = '置信度: --%';
            this.predictionsEl.innerHTML = '<div class="empty-state">暂无预测数据</div>';
            this.fpsDisplay.textContent = 'FPS: --';
            
            showToast('摄像头已停止', 'info');
        }
    }
    
    takeScreenshot() {
        if (!this.video.srcObject) return;
        
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        this.canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gesture_${new Date().getTime()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showToast('截图已保存！', 'success');
        }, 'image/png');
    }
    
    startPrediction() {
        if (!this.mobileNet || !this.classifier) {
            showToast('模型未加载完成', 'error');
            return;
        }
        
        this.isPredicting = true;
        this.predictionHistory = [];
        this.frameCount = 0;
        this.lastFPSUpdate = performance.now();
        this.startPredictBtn.disabled = true;
        this.stopPredictBtn.disabled = false;
        
        this.predictFrame();
        
        showToast('开始实时识别', 'success');
    }
    
    stopPrediction() {
        this.isPredicting = false;
        this.startPredictBtn.disabled = false;
        this.stopPredictBtn.disabled = true;
        this.predictionHistory = [];
        this.gestureStableCount = 0;
        this.lastAddedGesture = null;
    }
    
    async predictFrame() {
        if (!this.isPredicting) return;
        
        const now = performance.now();
        if (now - this.lastPredictionTime < this.predictionInterval) {
            requestAnimationFrame(() => this.predictFrame());
            return;
        }
        this.lastPredictionTime = now;
        
        this.frameCount++;
        if (now - this.lastFPSUpdate >= 1000) {
            this.currentFPS = Math.round(this.frameCount * 1000 / (now - this.lastFPSUpdate));
            this.fpsDisplay.textContent = `FPS: ${this.currentFPS}`;
            this.frameCount = 0;
            this.lastFPSUpdate = now;
        }
        
        const predictions = tf.tidy(() => {
            const img = this.captureImage();
            const features = this.mobileNet.predict(img);
            return this.classifier.predict(features);
        });
        
        const values = await predictions.data();
        predictions.dispose();
        
        const smoothedPredictions = this.smoothPredictions(values);
        
        this.updatePredictionsDisplay(smoothedPredictions);
        
        const topPred = smoothedPredictions[0];
        if (topPred && topPred.confidence > this.confidenceThreshold) {
            this.resultEl.textContent = topPred.label;
            this.confidenceEl.textContent = `置信度: ${(topPred.confidence * 100).toFixed(1)}%`;
            
            if (this.isContinuousMode) {
                this.processContinuousGesture(topPred.label, topPred.confidence);
            }
        } else if (topPred) {
            this.confidenceEl.textContent = `置信度: ${(topPred.confidence * 100).toFixed(1)}% (低)`;
            this.gestureStableCount = 0;
        }
        
        requestAnimationFrame(() => this.predictFrame());
    }
    
    processContinuousGesture(label, confidence) {
        if (this.cooldownFrames > 0) {
            this.cooldownFrames--;
            return;
        }
        
        if (this.lastAddedGesture === label) {
            this.gestureStableCount++;
        } else {
            this.gestureStableCount = 1;
            this.lastAddedGesture = label;
        }
        
        if (this.gestureStableCount >= this.requiredStableFrames) {
            this.addGestureToWord(label);
            this.gestureStableCount = 0;
            this.cooldownFrames = this.cooldownPeriod;
        }
    }
    
    addGestureToWord(label) {
        this.currentWord += label;
        this.currentWordEl.textContent = this.currentWord;
        
        this.gestureSequence.push(label);
        this.updateGestureHistory();
        
        showToast(`添加: ${label}`, 'success');
    }
    
    updateGestureHistory() {
        if (this.gestureSequence.length === 0) {
            this.historyContentEl.innerHTML = '暂无';
            return;
        }
        
        this.historyContentEl.innerHTML = this.gestureSequence
            .slice(-10)
            .map(g => `<span class="history-item">${g}</span>`)
            .join('');
    }
    
    toggleContinuousMode() {
        this.isContinuousMode = !this.isContinuousMode;
        
        if (this.isContinuousMode) {
            this.startContinuousBtn.textContent = '停止拼写';
            this.startContinuousBtn.classList.remove('btn-primary');
            this.startContinuousBtn.classList.add('btn-warning');
            this.gestureStableCount = 0;
            this.lastAddedGesture = null;
            showToast('连续拼写模式已开启', 'success');
        } else {
            this.startContinuousBtn.textContent = '开始拼写';
            this.startContinuousBtn.classList.remove('btn-warning');
            this.startContinuousBtn.classList.add('btn-primary');
            showToast('连续拼写模式已关闭', 'info');
        }
    }
    
    clearWord() {
        this.currentWord = '';
        this.gestureSequence = [];
        this.currentWordEl.textContent = '';
        this.updateGestureHistory();
        showToast('已清空', 'info');
    }
    
    backspace() {
        if (this.currentWord.length > 0) {
            this.currentWord = this.currentWord.slice(0, -1);
            this.currentWordEl.textContent = this.currentWord;
            
            if (this.gestureSequence.length > 0) {
                this.gestureSequence.pop();
                this.updateGestureHistory();
            }
        }
    }
    
    addSpace() {
        this.currentWord += ' ';
        this.currentWordEl.textContent = this.currentWord;
        this.gestureSequence.push('⎵');
        this.updateGestureHistory();
    }
    
    smoothPredictions(currentPredictions) {
        const predictionObj = {
            values: Array.from(currentPredictions),
            timestamp: Date.now()
        };
        
        this.predictionHistory.push(predictionObj);
        while (this.predictionHistory.length > this.maxHistoryLength) {
            this.predictionHistory.shift();
        }
        
        const numClasses = currentPredictions.length;
        const smoothedValues = new Array(numClasses).fill(0);
        
        const decayFactor = 0.85;
        let totalWeight = 0;
        
        for (let i = 0; i < this.predictionHistory.length; i++) {
            const weight = Math.pow(decayFactor, this.predictionHistory.length - 1 - i);
            const histVals = this.predictionHistory[i].values;
            
            for (let j = 0; j < numClasses; j++) {
                smoothedValues[j] += histVals[j] * weight;
            }
            totalWeight += weight;
        }
        
        for (let j = 0; j < numClasses; j++) {
            smoothedValues[j] /= totalWeight;
        }
        
        const maxIndex = smoothedValues.indexOf(Math.max(...smoothedValues));
        const maxVotes = this.getMajorityVote();
        
        if (maxVotes !== -1 && maxVotes !== maxIndex) {
            const voteConfidence = this.getVoteConfidence(maxVotes);
            if (voteConfidence > 0.5) {
                smoothedValues[maxVotes] = Math.max(smoothedValues[maxVotes], voteConfidence);
            }
        }
        
        const topPredictions = [];
        for (let i = 0; i < smoothedValues.length; i++) {
            topPredictions.push({
                label: this.gestureLabels[i] || `手势${i}`,
                confidence: smoothedValues[i]
            });
        }
        
        topPredictions.sort((a, b) => b.confidence - a.confidence);
        
        return topPredictions;
    }
    
    getMajorityVote() {
        if (this.predictionHistory.length < 3) return -1;
        
        const votes = {};
        this.predictionHistory.forEach(h => {
            const maxIdx = h.values.indexOf(Math.max(...h.values));
            votes[maxIdx] = (votes[maxIdx] || 0) + 1;
        });
        
        const maxVoteCount = Math.max(...Object.values(votes));
        if (maxVoteCount < Math.ceil(this.predictionHistory.length * 0.4)) {
            return -1;
        }
        
        for (const [idx, count] of Object.entries(votes)) {
            if (count === maxVoteCount) {
                return parseInt(idx);
            }
        }
        return -1;
    }
    
    getVoteConfidence(classIndex) {
        if (this.predictionHistory.length === 0) return 0;
        
        let count = 0;
        this.predictionHistory.forEach(h => {
            const maxIdx = h.values.indexOf(Math.max(...h.values));
            if (maxIdx === classIndex) count++;
        });
        
        return count / this.predictionHistory.length;
    }
    
    updatePredictionsDisplay(predictions) {
        if (predictions.length === 0) {
            this.predictionsEl.innerHTML = '<div class="empty-state">暂无预测数据</div>';
            return;
        }
        
        const top5 = predictions.slice(0, 5);
        let html = '';
        
        top5.forEach(pred => {
            const percent = (pred.confidence * 100).toFixed(1);
            html += `
                <div class="prediction-item">
                    <span class="prediction-label">${pred.label}</span>
                    <div class="prediction-bar">
                        <div class="prediction-fill" style="width: ${percent}%"></div>
                    </div>
                    <span class="prediction-percent">${percent}%</span>
                </div>
            `;
        });
        
        this.predictionsEl.innerHTML = html;
    }
    
    captureImage() {
        return tf.tidy(() => {
            let img = tf.browser.fromPixels(this.video);
            
            img = this.normalizeLighting(img);
            
            const resized = tf.image.resizeBilinear(img, [224, 224]);
            const batched = resized.toFloat().div(tf.scalar(127.5)).sub(tf.scalar(1)).expandDims(0);
            return batched;
        });
    }
    
    normalizeLighting(img) {
        return tf.tidy(() => {
            const floatImg = img.toFloat();
            
            const mean = tf.mean(floatImg);
            const std = tf.sqrt(tf.mean(tf.square(floatImg.sub(mean)))).add(tf.scalar(1e-7));
            
            const normalized = floatImg.sub(mean).div(std).mul(tf.scalar(64)).add(tf.scalar(128));
            
            const clipped = tf.clipByValue(normalized, 0, 255);
            
            return clipped.toUint8();
        });
    }
    
    addSample() {
        if (!this.video.srcObject) {
            showToast('请先启动摄像头', 'error');
            return;
        }
        
        const gestureName = this.gestureNameInput.value.trim();
        if (!gestureName) {
            showToast('请输入手势名称', 'error');
            return;
        }
        
        const useAugmentation = this.useAugmentationCheckbox.checked;
        
        const featuresList = tf.tidy(() => {
            const baseImg = this.captureImage();
            const baseFeatures = this.mobileNet.predict(baseImg);
            
            const features = [baseFeatures];
            
            if (useAugmentation) {
                const augmentations = this.generateAugmentedImages();
                augmentations.forEach(augImg => {
                    const feat = this.mobileNet.predict(augImg);
                    features.push(feat);
                });
            }
            
            return features;
        });
        
        if (!this.gestureLabels.includes(gestureName)) {
            this.gestureLabels.push(gestureName);
        }
        
        const labelIndex = this.gestureLabels.indexOf(gestureName);
        
        featuresList.forEach(features => {
            this.trainingData.push({
                features: features,
                label: labelIndex
            });
        });
        
        this.currentSampleCount += featuresList.length;
        this.sampleCountEl.textContent = this.currentSampleCount;
        
        this.updateGestureList();
        this.updateTrainButton();
        
        showToast(`已添加 ${gestureName} 的样本 (含增强共${featuresList.length}个)`, 'success');
    }
    
    generateAugmentedImages() {
        return tf.tidy(() => {
            const original = tf.browser.fromPixels(this.video);
            const augmented = [];
            
            const bright1 = tf.clipByValue(original.toFloat().mul(1.2), 0, 255).toUint8();
            const bright2 = tf.clipByValue(original.toFloat().mul(0.8), 0, 255).toUint8();
            
            const adjusted = this.adjustContrast(original, 1.2);
            const adjustedLow = this.adjustContrast(original, 0.8);
            
            [bright1, bright2, adjusted, adjustedLow].forEach(img => {
                const resized = tf.image.resizeBilinear(img, [224, 224]);
                const batched = resized.toFloat().div(tf.scalar(127.5)).sub(tf.scalar(1)).expandDims(0);
                augmented.push(batched);
            });
            
            return augmented;
        });
    }
    
    adjustContrast(img, factor) {
        return tf.tidy(() => {
            const floatImg = img.toFloat();
            const mean = tf.mean(floatImg);
            const adjusted = floatImg.sub(mean).mul(factor).add(mean);
            return tf.clipByValue(adjusted, 0, 255).toUint8();
        });
    }
    
    updateGestureList() {
        const gestureCounts = {};
        
        this.trainingData.forEach(data => {
            const label = this.gestureLabels[data.label];
            gestureCounts[label] = (gestureCounts[label] || 0) + 1;
        });
        
        if (Object.keys(gestureCounts).length === 0) {
            this.gestureListEl.innerHTML = '<div class="empty-state">暂无手势数据</div>';
            return;
        }
        
        let html = '';
        Object.entries(gestureCounts).forEach(([name, count]) => {
            html += `
                <div class="gesture-card">
                    <div class="gesture-name">${name}</div>
                    <div class="gesture-count">${count} 个样本</div>
                </div>
            `;
        });
        
        this.gestureListEl.innerHTML = html;
    }
    
    updateTrainButton() {
        const uniqueLabels = new Set(this.trainingData.map(d => d.label));
        this.trainModelBtn.disabled = uniqueLabels.size < 2;
    }
    
    async trainModel() {
        if (this.trainingData.length < 10) {
            showToast('至少需要10个样本才能训练', 'error');
            return;
        }
        
        this.trainModelBtn.disabled = true;
        this.trainingStatus.textContent = '准备训练数据...';
        
        const uniqueLabels = new Set(this.trainingData.map(d => d.label));
        const numClasses = uniqueLabels.size;
        
        this.classifier = tf.sequential({
            layers: [
                tf.layers.flatten({
                    inputShape: this.mobileNet.outputs[0].shape.slice(1)
                }),
                tf.layers.batchNormalization(),
                tf.layers.dense({
                    units: 256,
                    activation: 'relu',
                    kernelInitializer: 'varianceScaling',
                    kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
                }),
                tf.layers.dropout({ rate: 0.4 }),
                tf.layers.batchNormalization(),
                tf.layers.dense({
                    units: 128,
                    activation: 'relu',
                    kernelInitializer: 'varianceScaling',
                    kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
                }),
                tf.layers.dropout({ rate: 0.4 }),
                tf.layers.dense({
                    units: numClasses,
                    activation: 'softmax',
                    kernelInitializer: 'varianceScaling'
                })
            ]
        });
        
        this.classifier.compile({
            optimizer: tf.train.adam(0.0001),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });
        
        const xs = tf.concat(this.trainingData.map(d => d.features));
        const labels = this.trainingData.map(d => d.label);
        
        const ys = tf.tidy(() => {
            return tf.oneHot(tf.tensor1d(labels, 'int32'), numClasses);
        });
        
        this.trainingStatus.textContent = '训练中...';
        
        await this.classifier.fit(xs, ys, {
            epochs: 50,
            batchSize: 16,
            validationSplit: 0.2,
            shuffle: true,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    const progress = ((epoch + 1) / 50) * 100;
                    this.progressFill.style.width = `${progress}%`;
                    this.trainingStatus.textContent = `Epoch ${epoch + 1}/50 - 损失: ${logs.loss.toFixed(4)} - 准确率: ${(logs.acc * 100).toFixed(2)}%`;
                }
            }
        });
        
        xs.dispose();
        ys.dispose();
        
        this.saveModelBtn.disabled = false;
        this.exportWeightsBtn.disabled = false;
        this.exportJSONBtn.disabled = false;
        this.trainingStatus.textContent = '训练完成！可以开始识别了';
        showToast('模型训练完成！', 'success');
    }
    
    async saveModel() {
        if (!this.classifier) {
            showToast('没有可保存的模型', 'error');
            return;
        }
        
        try {
            await this.classifier.save('downloads://gesture-model');
            
            const labelsData = JSON.stringify(this.gestureLabels);
            const blob = new Blob([labelsData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'gesture-labels.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showToast('TFJS 模型已保存！', 'success');
        } catch (error) {
            console.error('保存模型失败:', error);
            showToast('保存模型失败', 'error');
        }
    }
    
    async exportWeights() {
        if (!this.classifier) {
            showToast('没有可导出的模型', 'error');
            return;
        }
        
        try {
            const weightsData = {};
            
            this.classifier.layers.forEach((layer, idx) => {
                const weights = layer.getWeights();
                if (weights.length > 0) {
                    const layerWeights = {};
                    weights.forEach((w, i) => {
                        const data = Array.from(w.dataSync());
                        layerWeights[`weight_${i}`] = {
                            shape: w.shape,
                            dtype: w.dtype,
                            data: data
                        };
                    });
                    weightsData[`layer_${idx}_${layer.name}`] = layerWeights;
                }
            });
            
            const exportData = {
                modelType: 'GestureClassifier',
                layers: this.classifier.layers.map(l => l.name),
                labels: this.gestureLabels,
                weights: weightsData
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'gesture-weights-full.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showToast('权重数据已导出！', 'success');
        } catch (error) {
            console.error('导出权重失败:', error);
            showToast('导出权重失败', 'error');
        }
    }
    
    async exportJSONModel() {
        if (!this.classifier) {
            showToast('没有可导出的模型', 'error');
            return;
        }
        
        try {
            const artifacts = await this.classifier.save(tf.io.withSaveHandler(async (artifacts) => {
                return { modelArtifacts: artifacts };
            }));
            
            const modelData = {
                modelTopology: artifacts.modelTopology,
                weightsManifest: artifacts.weightsManifest,
                labels: this.gestureLabels,
                weightData: this.arrayBufferToBase64(artifacts.weightData)
            };
            
            const blob = new Blob([JSON.stringify(modelData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'gesture-model-standalone.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showToast('独立 JSON 模型已导出！', 'success');
        } catch (error) {
            console.error('导出 JSON 失败:', error);
            showToast('导出 JSON 失败', 'error');
        }
    }
    
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    
    async loadCustomModel() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.bin';
        input.multiple = true;
        
        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            const modelFile = files.find(f => f.name.includes('.json') && !f.name.includes('weights') && !f.name.includes('labels'));
            const weightsFile = files.find(f => f.name.includes('.bin'));
            const labelsFile = files.find(f => f.name === 'gesture-labels.json');
            
            const standaloneFile = files.find(f => f.name.includes('standalone'));
            
            if (standaloneFile) {
                try {
                    this.showLoading(true);
                    const jsonText = await standaloneFile.text();
                    const modelData = JSON.parse(jsonText);
                    
                    const weightData = this.base64ToArrayBuffer(modelData.weightData);
                    
                    this.classifier = await tf.loadLayersModel(
                        tf.io.fromMemory({
                            modelTopology: modelData.modelTopology,
                            weightSpecs: modelData.weightsManifest[0].weights,
                            weightData: weightData
                        })
                    );
                    
                    if (modelData.labels) {
                        this.gestureLabels = modelData.labels;
                    }
                    
                    this.saveModelBtn.disabled = false;
                    this.exportWeightsBtn.disabled = false;
                    this.exportJSONBtn.disabled = false;
                    showToast('独立模型加载成功！', 'success');
                    this.showLoading(false);
                    return;
                } catch (e) {
                    console.error('加载独立模型失败:', e);
                }
            }
            
            if (!modelFile || !weightsFile) {
                showToast('请选择 model.json 和 model.weights.bin 文件', 'error');
                return;
            }
            
            try {
                this.showLoading(true);
                
                this.classifier = await tf.loadLayersModel(
                    tf.io.browserFiles([modelFile, weightsFile])
                );
                
                if (labelsFile) {
                    const labelsText = await labelsFile.text();
                    this.gestureLabels = JSON.parse(labelsText);
                }
                
                this.saveModelBtn.disabled = false;
                this.exportWeightsBtn.disabled = false;
                this.exportJSONBtn.disabled = false;
                showToast('模型加载成功！', 'success');
                this.showLoading(false);
                
            } catch (error) {
                console.error('加载模型失败:', error);
                showToast('加载模型失败', 'error');
                this.showLoading(false);
            }
        };
        
        input.click();
    }
    
    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
    
    showLoading(show) {
        if (show) {
            this.loadingOverlay.classList.remove('hidden');
        } else {
            this.loadingOverlay.classList.add('hidden');
        }
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function initApp() {
    if (typeof tf !== 'undefined') {
        new GestureRecognizer();
    } else {
        setTimeout(initApp, 100);
    }
}

window.addEventListener('load', initApp);
