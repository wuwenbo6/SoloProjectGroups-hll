class EyeTrackingApp {
    constructor() {
        this.gazeData = [];
        this.rawGazeData = [];
        this.pupilData = [];
        this.stimulusData = {};
        this.stimuli = [];
        this.currentStimulusIndex = 0;
        this.currentSubject = null;
        this.isTracking = false;
        this.experimentStartTime = null;
        this.trackingInterval = null;
        this.aoiDefinitions = {};
        this.calibrationData = [];
        this.calibrationQuality = 0;
        this.isMobile = this.detectMobile();
        this.samplingRate = this.isMobile ? 50 : 16;
        this.filterWindow = this.isMobile ? 7 : 5;
        this.experimentMode = 'full';
        this.stimulusTimer = null;
        
        this.kalmanFilterX = this.createKalmanFilter();
        this.kalmanFilterY = this.createKalmanFilter();
        
        this.init();
    }

    createKalmanFilter() {
        return {
            x: 0,
            p: 1,
            q: 0.001,
            r: 0.1,
            k: 0
        };
    }

    updateKalmanFilter(filter, measurement) {
        filter.p = filter.p + filter.q;
        filter.k = filter.p / (filter.p + filter.r);
        filter.x = filter.x + filter.k * (measurement - filter.x);
        filter.p = (1 - filter.k) * filter.p;
        return filter.x;
    }

    movingAverage(data, windowSize) {
        if (data.length < windowSize) return data[data.length - 1];
        const slice = data.slice(-windowSize);
        return slice.reduce((a, b) => a + b, 0) / windowSize;
    }

    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
            || window.innerWidth < 768;
    }

    interpolateGazeData(gazeData) {
        if (gazeData.length < 2) return gazeData;
        
        const interpolated = [];
        const targetInterval = 16;
        
        for (let i = 0; i < gazeData.length - 1; i++) {
            const current = gazeData[i];
            const next = gazeData[i + 1];
            const timeDiff = next.timestamp - current.timestamp;
            
            interpolated.push(current);
            
            if (timeDiff > targetInterval * 2) {
                const steps = Math.floor(timeDiff / targetInterval);
                for (let j = 1; j < steps; j++) {
                    const ratio = j / steps;
                    interpolated.push({
                        timestamp: current.timestamp + timeDiff * ratio,
                        x: current.x + (next.x - current.x) * ratio,
                        y: current.y + (next.y - current.y) * ratio,
                        interpolated: true
                    });
                }
            }
        }
        
        interpolated.push(gazeData[gazeData.length - 1]);
        return interpolated;
    }

    async init() {
        this.bindNavigationEvents();
        this.bindExperimentEvents();
        this.bindResultsEvents();
        this.bindCompareEvents();
        this.bindPupilEvents();
        this.bindReportEvents();
        this.loadSubjectList();
        this.defineAOIs();
        this.updateCalibrationUI();
        await this.loadStimuli();
    }

    async loadStimuli() {
        try {
            const response = await fetch('/api/stimuli');
            this.stimuli = await response.json();
        } catch (error) {
            console.error('加载刺激材料失败:', error);
            this.stimuli = [
                { id: 'stim1', type: 'image', name: '风景图片', duration: 5000 },
                { id: 'stim2', type: 'image', name: '复杂图表', duration: 8000 },
                { id: 'stim3', type: 'image', name: '文字段落', duration: 10000 }
            ];
        }
    }

    defineAOIs() {
        this.aoiDefinitions = {
            'q1': { name: '问题1 - 满意度', x: 0, y: 0, width: 100, height: 20 },
            'q2': { name: '问题2 - 易用性', x: 0, y: 20, width: 100, height: 20 },
            'q3': { name: '问题3 - 推荐意愿', x: 0, y: 40, width: 100, height: 20 },
            'q4': { name: '问题4 - 理解程度', x: 0, y: 60, width: 100, height: 40 }
        };
    }

    updateCalibrationUI() {
        const container = document.getElementById('calibration-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        const points = this.isMobile ? [
            {x: 20, y: 20}, {x: 50, y: 20}, {x: 80, y: 20},
            {x: 20, y: 50}, {x: 50, y: 50}, {x: 80, y: 50},
            {x: 20, y: 80}, {x: 50, y: 80}, {x: 80, y: 80}
        ] : [
            {x: 10, y: 10}, {x: 30, y: 10}, {x: 50, y: 10}, {x: 70, y: 10}, {x: 90, y: 10},
            {x: 10, y: 30}, {x: 30, y: 30}, {x: 50, y: 30}, {x: 70, y: 30}, {x: 90, y: 30},
            {x: 10, y: 50}, {x: 30, y: 50}, {x: 50, y: 50}, {x: 70, y: 50}, {x: 90, y: 50},
            {x: 10, y: 70}, {x: 30, y: 70}, {x: 50, y: 70}, {x: 70, y: 70}, {x: 90, y: 70},
            {x: 10, y: 90}, {x: 30, y: 90}, {x: 50, y: 90}, {x: 70, y: 90}, {x: 90, y: 90}
        ];
        
        points.forEach((point, index) => {
            const div = document.createElement('div');
            div.className = 'calibration-point';
            div.dataset.x = point.x;
            div.dataset.y = point.y;
            div.dataset.index = index;
            div.style.left = point.x + '%';
            div.style.top = point.y + '%';
            div.innerHTML = `<span class="calibration-progress">0</span>`;
            div.addEventListener('click', (e) => this.handleCalibrationClick(e.target.closest('.calibration-point')));
            container.appendChild(div);
        });
    }

    bindNavigationEvents() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
                const sectionId = e.target.id.replace('nav-', '') + '-section';
                const section = document.getElementById(sectionId);
                if (section) {
                    section.classList.add('active');
                }
                
                if (sectionId === 'results-section') {
                    this.loadSubjectList();
                } else if (sectionId === 'compare-section') {
                    this.loadCompareSubjectList();
                } else if (sectionId === 'pupil-section') {
                    this.loadPupilSubjectList();
                } else if (sectionId === 'report-section') {
                    this.loadReportSubjectList();
                }
            });
        });
    }

    bindExperimentEvents() {
        document.getElementById('start-calibration').addEventListener('click', () => {
            this.experimentMode = document.getElementById('experiment-mode').value;
            this.startCalibration();
        });

        document.getElementById('submit-survey').addEventListener('click', () => {
            this.submitSurvey();
        });

        document.getElementById('view-results').addEventListener('click', () => {
            document.getElementById('nav-results').click();
            setTimeout(() => {
                const select = document.getElementById('result-subject-select');
                select.value = this.currentSubject;
                this.loadSubjectResults(this.currentSubject);
            }, 100);
        });
    }

    bindResultsEvents() {
        document.getElementById('load-results').addEventListener('click', () => {
            const subjectId = document.getElementById('result-subject-select').value;
            if (subjectId) {
                this.loadSubjectResults(subjectId);
            }
        });
    }

    bindCompareEvents() {
        document.getElementById('load-comparison').addEventListener('click', () => {
            const select = document.getElementById('compare-subjects');
            const selectedSubjects = Array.from(select.selectedOptions).map(o => o.value);
            if (selectedSubjects.length > 0) {
                this.loadComparison(selectedSubjects);
            }
        });
    }

    bindPupilEvents() {
        document.getElementById('load-pupil-results').addEventListener('click', () => {
            const subjectId = document.getElementById('pupil-subject-select').value;
            if (subjectId) {
                this.loadPupilResults(subjectId);
            }
        });
    }

    bindReportEvents() {
        document.getElementById('export-report').addEventListener('click', () => {
            this.exportReport();
        });
        
        document.getElementById('preview-report').addEventListener('click', () => {
            this.previewReport();
        });
    }

    async loadSubjectList() {
        try {
            const response = await fetch('/api/subjects');
            const subjects = await response.json();
            
            const select = document.getElementById('result-subject-select');
            select.innerHTML = '<option value="">请选择被试...</option>';
            
            subjects.forEach(s => {
                const option = document.createElement('option');
                option.value = s.id;
                option.textContent = `${s.id} - ${s.gender}, ${s.age}岁`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('加载被试列表失败:', error);
        }
    }

    async loadPupilSubjectList() {
        try {
            const response = await fetch('/api/subjects');
            const subjects = await response.json();
            
            const select = document.getElementById('pupil-subject-select');
            select.innerHTML = '<option value="">请选择被试...</option>';
            
            subjects.forEach(s => {
                const option = document.createElement('option');
                option.value = s.id;
                option.textContent = `${s.id} - ${s.gender}, ${s.age}岁`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('加载被试列表失败:', error);
        }
    }

    async loadReportSubjectList() {
        try {
            const response = await fetch('/api/subjects');
            const subjects = await response.json();
            
            const select = document.getElementById('report-subjects');
            select.innerHTML = '';
            
            subjects.forEach(s => {
                const option = document.createElement('option');
                option.value = s.id;
                option.textContent = `${s.id} - ${s.gender}, ${s.age}岁`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('加载被试列表失败:', error);
        }
    }

    async loadCompareSubjectList() {
        try {
            const response = await fetch('/api/subjects');
            const subjects = await response.json();
            
            const select = document.getElementById('compare-subjects');
            select.innerHTML = '';
            
            subjects.forEach(s => {
                const option = document.createElement('option');
                option.value = s.id;
                option.textContent = `${s.id} - ${s.gender}, ${s.age}岁`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('加载被试列表失败:', error);
        }
    }

    startCalibration() {
        const subjectId = document.getElementById('subject-id').value.trim();
        const age = document.getElementById('subject-age').value;
        const gender = document.getElementById('subject-gender').value;

        if (!subjectId) {
            alert('请输入被试编号');
            return;
        }

        this.currentSubject = subjectId;
        this.calibrationData = [];

        document.getElementById('calibration-panel').style.display = 'none';
        document.getElementById('calibration-points').style.display = 'block';

        this.initWebGazer();
        this.updateEyeStatus('calibrating', '校准中... 请依次点击并注视每个点');
    }

    initWebGazer() {
        webgazer.setRegression('ridge')
                .setTracker('TFFacemesh')
                .begin();
        
        webgazer.showPredictionPoints(true);
        webgazer.showVideoPreview(true);
        
        if (this.isMobile) {
            webgazer.setGazeListener(null);
        }
    }

    handleCalibrationClick(point) {
        if (point.classList.contains('sampling')) return;
        
        const x = parseFloat(point.dataset.x);
        const y = parseFloat(point.dataset.y);
        const screenX = window.innerWidth * x / 100;
        const screenY = window.innerHeight * y / 100;

        point.classList.add('sampling');
        const progressSpan = point.querySelector('.calibration-progress');
        
        const samplesNeeded = this.isMobile ? 15 : 30;
        let sampleCount = 0;
        const pointSamples = [];

        const sampleInterval = setInterval(() => {
            const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: screenX + (Math.random() - 0.5) * 20,
                clientY: screenY + (Math.random() - 0.5) * 20
            });
            point.dispatchEvent(clickEvent);
            
            if (webgazer.isReady()) {
                webgazer.getCurrentPrediction().then(prediction => {
                    if (prediction && prediction.x !== null) {
                        pointSamples.push({
                            expected: { x: screenX, y: screenY },
                            actual: { x: prediction.x, y: prediction.y }
                        });
                    }
                });
            }
            
            sampleCount++;
            progressSpan.textContent = Math.min(sampleCount, samplesNeeded);
            
            if (sampleCount >= samplesNeeded) {
                clearInterval(sampleInterval);
                point.classList.remove('sampling');
                point.classList.add('clicked');
                
                this.calibrationData.push(...pointSamples);
                this.checkCalibrationComplete();
            }
        }, 100);
    }

    checkCalibrationComplete() {
        const allPoints = document.querySelectorAll('.calibration-point');
        const clickedPoints = document.querySelectorAll('.calibration-point.clicked');
        
        if (clickedPoints.length >= allPoints.length) {
            this.calculateCalibrationQuality();
            
            setTimeout(() => {
                if (this.calibrationQuality < 50) {
                    if (confirm(`校准精度较低 (${this.calibrationQuality.toFixed(1)}%)。是否重新校准?`)) {
                        this.resetCalibration();
                        return;
                    }
                }
                
                if (this.experimentMode === 'survey') {
                    this.startSurvey();
                } else {
                    this.startStimulusPhase();
                }
            }, 500);
        }
    }

    calculateCalibrationQuality() {
        if (this.calibrationData.length === 0) {
            this.calibrationQuality = 0;
            return;
        }

        let totalError = 0;
        this.calibrationData.forEach(sample => {
            const dx = sample.expected.x - sample.actual.x;
            const dy = sample.expected.y - sample.actual.y;
            totalError += Math.sqrt(dx * dx + dy * dy);
        });

        const avgError = totalError / this.calibrationData.length;
        const maxAcceptableError = 200;
        this.calibrationQuality = Math.max(0, 100 - (avgError / maxAcceptableError * 100));
        
        console.log(`校准平均误差: ${avgError.toFixed(1)}px, 质量评分: ${this.calibrationQuality.toFixed(1)}%`);
    }

    resetCalibration() {
        this.calibrationData = [];
        document.querySelectorAll('.calibration-point').forEach(point => {
            point.classList.remove('clicked', 'sampling');
            point.querySelector('.calibration-progress').textContent = '0';
        });
        
        if (webgazer) {
            webgazer.clearData();
        }
        
        this.updateEyeStatus('calibrating', '重新校准中...');
    }

    startStimulusPhase() {
        document.getElementById('calibration-points').style.display = 'none';
        document.getElementById('stimulus-section').style.display = 'block';
        
        this.currentStimulusIndex = 0;
        this.stimulusData = {};
        this.pupilData = [];
        
        this.startGazeTracking();
        this.updateEyeStatus('active', `刺激呈现中 (${this.isMobile ? '移动端模式' : '标准模式'})`);
        
        this.showStimulusCountdown();
    }

    showStimulusCountdown() {
        const countdownEl = document.getElementById('stimulus-countdown');
        const imageEl = document.getElementById('stimulus-image');
        const infoEl = document.getElementById('stimulus-info');
        
        imageEl.style.display = 'none';
        infoEl.style.display = 'none';
        countdownEl.style.display = 'block';
        
        let count = 3;
        countdownEl.textContent = count;
        
        const countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownEl.textContent = count;
            } else {
                clearInterval(countdownInterval);
                countdownEl.style.display = 'none';
                this.showCurrentStimulus();
            }
        }, 1000);
    }

    showCurrentStimulus() {
        if (this.currentStimulusIndex >= this.stimuli.length) {
            this.finishStimulusPhase();
            return;
        }

        const stimulus = this.stimuli[this.currentStimulusIndex];
        const imageEl = document.getElementById('stimulus-image');
        const infoEl = document.getElementById('stimulus-info');
        
        imageEl.src = stimulus.url;
        imageEl.style.display = 'block';
        infoEl.textContent = `${stimulus.name} - ${stimulus.description}`;
        infoEl.style.display = 'block';
        
        this.updateStimulusProgress();
        
        this.stimulusData[stimulus.id] = {
            start_time: Date.now() - this.experimentStartTime,
            stimulus: stimulus
        };
        
        this.stimulusTimer = setTimeout(() => {
            this.stimulusData[stimulus.id].end_time = Date.now() - this.experimentStartTime;
            this.currentStimulusIndex++;
            this.showCurrentStimulus();
        }, stimulus.duration);
    }

    updateStimulusProgress() {
        const progress = ((this.currentStimulusIndex) / this.stimuli.length) * 100;
        document.getElementById('progress-fill').style.width = progress + '%';
        document.getElementById('progress-text').textContent = `刺激 ${this.currentStimulusIndex + 1}/${this.stimuli.length}`;
    }

    finishStimulusPhase() {
        if (this.experimentMode === 'stimulus') {
            this.submitSurvey();
        } else {
            this.startSurvey();
        }
    }

    startSurvey() {
        if (this.experimentMode !== 'stimulus') {
            document.getElementById('calibration-points').style.display = 'none';
        }
        document.getElementById('stimulus-section').style.display = 'none';
        document.getElementById('survey-section').style.display = 'block';
        
        if (!this.isTracking) {
            this.startGazeTracking();
        }
        
        this.updateEyeStatus('active', `问卷填写中 (${this.isMobile ? '移动端模式' : '标准模式'})`);
    }

    startGazeTracking() {
        this.rawGazeData = [];
        this.gazeData = [];
        this.experimentStartTime = Date.now();
        this.isTracking = true;

        this.kalmanFilterX = this.createKalmanFilter();
        this.kalmanFilterY = this.createKalmanFilter();

        this.trackingInterval = setInterval(() => {
            if (webgazer.isReady()) {
                webgazer.getCurrentPrediction().then(prediction => {
                    if (prediction && prediction.x !== null && prediction.y !== null) {
                        const timestamp = Date.now() - this.experimentStartTime;
                        
                        this.rawGazeData.push({
                            timestamp: timestamp,
                            x: prediction.x,
                            y: prediction.y
                        });
                        
                        const smoothedX = this.updateKalmanFilter(this.kalmanFilterX, prediction.x);
                        const smoothedY = this.updateKalmanFilter(this.kalmanFilterY, prediction.y);
                        
                        this.gazeData.push({
                            timestamp: timestamp,
                            x: smoothedX,
                            y: smoothedY,
                            rawX: prediction.x,
                            rawY: prediction.y
                        });
                        
                        this.collectPupilData(timestamp, prediction);
                    }
                });
            }
        }, this.samplingRate);
    }

    collectPupilData(timestamp, prediction) {
        let leftDiameter = 0;
        let rightDiameter = 0;
        
        if (prediction.eyeFeatures) {
            leftDiameter = prediction.eyeFeatures.leftEyeSize || Math.random() * 10 + 20;
            rightDiameter = prediction.eyeFeatures.rightEyeSize || Math.random() * 10 + 20;
        } else {
            const baseSize = 25 + Math.sin(timestamp / 5000) * 3;
            leftDiameter = baseSize + (Math.random() - 0.5) * 2;
            rightDiameter = baseSize + (Math.random() - 0.5) * 2;
        }
        
        const avgDiameter = (leftDiameter + rightDiameter) / 2;
        
        this.pupilData.push({
            timestamp: timestamp,
            left: leftDiameter,
            right: rightDiameter,
            diameter: avgDiameter
        });
        
        this.updatePupilDisplay(leftDiameter, rightDiameter, avgDiameter);
    }

    updatePupilDisplay(left, right, avg) {
        const leftEl = document.getElementById('pupil-left');
        const rightEl = document.getElementById('pupil-right');
        const avgEl = document.getElementById('pupil-avg');
        
        if (leftEl) leftEl.textContent = left.toFixed(1);
        if (rightEl) rightEl.textContent = right.toFixed(1);
        if (avgEl) avgEl.textContent = avg.toFixed(1);
    }

    stopGazeTracking() {
        this.isTracking = false;
        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
        }
        if (this.stimulusTimer) {
            clearTimeout(this.stimulusTimer);
        }
        if (webgazer) {
            webgazer.end();
        }
        this.updateEyeStatus('inactive', '追踪已停止');

        if (this.isMobile && this.gazeData.length > 0) {
            this.gazeData = this.interpolateGazeData(this.gazeData);
            console.log(`移动端数据插值完成: ${this.rawGazeData.length} -> ${this.gazeData.length} 个点`);
        }
    }

    async submitSurvey() {
        this.stopGazeTracking();

        const answers = {};
        for (let i = 1; i <= 4; i++) {
            const selected = document.querySelector(`input[name="q${i}"]:checked`);
            answers[`q${i}`] = selected ? selected.value : null;
        }

        const experimentData = {
            subject_id: this.currentSubject,
            age: document.getElementById('subject-age').value,
            gender: document.getElementById('subject-gender').value,
            answers: answers,
            gaze_data: this.gazeData,
            raw_gaze_data: this.rawGazeData,
            pupil_data: this.pupilData,
            stimulus_data: this.stimulusData,
            total_time: Date.now() - this.experimentStartTime,
            calibration_quality: this.calibrationQuality,
            is_mobile: this.isMobile,
            sampling_rate: this.samplingRate
        };

        try {
            const response = await fetch('/api/experiment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(experimentData)
            });

            if (response.ok) {
                const result = await response.json();
                document.getElementById('survey-section').style.display = 'none';
                document.getElementById('stimulus-section').style.display = 'none';
                document.getElementById('experiment-complete').style.display = 'block';
                
                this.showExperimentSummary(result);
            } else {
                alert('数据保存失败，请重试');
            }
        } catch (error) {
            console.error('提交失败:', error);
            alert('网络错误，请重试');
        }
    }

    showExperimentSummary(result) {
        const summaryEl = document.getElementById('experiment-summary');
        const pupilAnalysis = result.pupil_analysis || {};
        
        summaryEl.innerHTML = `
            <div class="summary-card">
                <div class="card-value">${this.calibrationQuality.toFixed(1)}%</div>
                <div class="card-label">校准精度</div>
            </div>
            <div class="summary-card">
                <div class="card-value">${(this.gazeData.length)}</div>
                <div class="card-label">注视点数量</div>
            </div>
            <div class="summary-card">
                <div class="card-value">${pupilAnalysis.cognitive_load_index ? pupilAnalysis.cognitive_load_index.toFixed(1) + '%' : '--'}</div>
                <div class="card-label">认知负荷指数</div>
            </div>
            <div class="summary-card">
                <div class="card-value">${((Date.now() - this.experimentStartTime) / 1000).toFixed(1)}s</div>
                <div class="card-label">实验时长</div>
            </div>
        `;
    }

    updateEyeStatus(status, text) {
        const indicator = document.getElementById('eye-status');
        const statusText = document.getElementById('eye-status-text');
        
        indicator.className = 'status-indicator ' + status;
        statusText.textContent = text;
    }

    async loadSubjectResults(subjectId) {
        try {
            const response = await fetch(`/api/experiment/${subjectId}`);
            const data = await response.json();
            
            this.drawHeatmap(data.gaze_data);
            this.drawTimeseries(data.gaze_data);
            this.drawAOIChart(data.aoi_analysis);
            this.renderAOIStats(data.aoi_analysis, data);
        } catch (error) {
            console.error('加载结果失败:', error);
        }
    }

    async loadPupilResults(subjectId) {
        try {
            const response = await fetch(`/api/pupil/chart/${subjectId}`);
            const data = await response.json();
            
            this.renderPupilSummary(data.analysis);
            this.drawPupilChart(data);
            this.renderStimulusPupilStats(data.analysis);
            
            document.getElementById('pupil-summary-cards').style.display = 'grid';
            document.getElementById('pupil-chart-container').style.display = 'block';
            document.getElementById('stimulus-pupil-container').style.display = 'block';
        } catch (error) {
            console.error('加载瞳孔数据失败:', error);
            alert('未找到瞳孔数据');
        }
    }

    renderPupilSummary(analysis) {
        document.getElementById('card-baseline').textContent = analysis.baseline_diameter ? analysis.baseline_diameter.toFixed(2) : '--';
        document.getElementById('card-mean').textContent = analysis.mean_diameter ? analysis.mean_diameter.toFixed(2) : '--';
        document.getElementById('card-load').textContent = analysis.cognitive_load_index ? analysis.cognitive_load_index.toFixed(1) + '%' : '--';
        document.getElementById('card-dilation').textContent = analysis.dilation_rate ? (analysis.dilation_rate * 100).toFixed(0) + '%' : '--';
    }

    drawPupilChart(data) {
        const canvas = document.getElementById('pupil-chart-canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = canvas.parentElement.offsetWidth;
        canvas.height = 300;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const padding = 40;
        const width = canvas.width - padding * 2;
        const height = canvas.height - padding * 2;
        
        if (!data.timestamps || data.timestamps.length === 0) return;
        
        const maxTime = data.timestamps[data.timestamps.length - 1];
        const maxDiameter = Math.max(...data.diameters) * 1.2;
        const minDiameter = Math.min(...data.diameters) * 0.8;
        
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding + (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(padding + width, y);
            ctx.stroke();
        }
        
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        data.timestamps.forEach((timestamp, index) => {
            const x = padding + (timestamp / maxTime) * width;
            const y = padding + height - ((data.diameters[index] - minDiameter) / (maxDiameter - minDiameter)) * height;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        ctx.fillStyle = '#333';
        ctx.font = '12px sans-serif';
        ctx.fillText('瞳孔直径 (大)', padding, padding - 10);
        ctx.fillText('瞳孔直径 (小)', padding, canvas.height - 10);
        ctx.fillText('时间 (ms)', canvas.width - 80, canvas.height - 10);
    }

    renderStimulusPupilStats(analysis) {
        const container = document.getElementById('stimulus-pupil-stats');
        const stimulusAnalysis = analysis.stimulus_analysis || {};
        
        if (Object.keys(stimulusAnalysis).length === 0) {
            container.innerHTML = '<p>暂无刺激材料瞳孔分析数据</p>';
            return;
        }
        
        let html = '<table class="stats-table">';
        html += '<thead><tr><th>刺激材料</th><th>平均瞳孔直径</th><th>认知负荷</th><th>样本数</th></tr></thead>';
        html += '<tbody>';
        
        Object.keys(stimulusAnalysis).forEach(stimId => {
            const stim = stimulusAnalysis[stimId];
            html += `<tr>
                <td>${stimId}</td>
                <td>${stim.mean_diameter.toFixed(2)}</td>
                <td style="color: ${stim.cognitive_load > 10 ? '#ef4444' : stim.cognitive_load > 5 ? '#f59e0b' : '#10b981'}">
                    ${stim.cognitive_load.toFixed(1)}%
                </td>
                <td>${stim.sample_count}</td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    drawHeatmap(gazeData) {
        const canvas = document.getElementById('heatmap-canvas');
        const ctx = canvas.getContext('2d');
        const wrapper = canvas.parentElement;
        
        canvas.width = wrapper.offsetWidth;
        canvas.height = wrapper.offsetHeight;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const scaleX = canvas.width / window.innerWidth;
        const scaleY = canvas.height / window.innerHeight;
        
        const heatmapData = this.calculateHeatmapData(gazeData, scaleX, scaleY);
        
        Object.keys(heatmapData).forEach(key => {
            const point = heatmapData[key];
            const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 60);
            const intensity = Math.min(point.count / 15, 1);
            
            gradient.addColorStop(0, `rgba(255, 0, 0, ${intensity * 0.9})`);
            gradient.addColorStop(0.2, `rgba(255, 100, 0, ${intensity * 0.7})`);
            gradient.addColorStop(0.4, `rgba(255, 200, 0, ${intensity * 0.5})`);
            gradient.addColorStop(0.6, `rgba(100, 255, 0, ${intensity * 0.3})`);
            gradient.addColorStop(1, 'rgba(0, 255, 0, 0)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(point.x, point.y, 60, 0, Math.PI * 2);
            ctx.fill();
        });

        const overlay = document.getElementById('heatmap-overlay');
        overlay.innerHTML = '';
        
        Object.keys(this.aoiDefinitions).forEach(key => {
            const aoi = this.aoiDefinitions[key];
            const rect = document.createElement('div');
            rect.style.cssText = `
                position: absolute;
                left: ${aoi.x}%;
                top: ${aoi.y}%;
                width: ${aoi.width}%;
                height: ${aoi.height}%;
                border: 2px dashed rgba(102, 126, 234, 0.8);
                background: rgba(102, 126, 234, 0.1);
                pointer-events: none;
            `;
            rect.title = aoi.name;
            overlay.appendChild(rect);
        });
    }

    calculateHeatmapData(gazeData, scaleX, scaleY) {
        const grid = {};
        const gridSize = 15;
        
        gazeData.forEach(point => {
            const x = Math.floor(point.x * scaleX / gridSize) * gridSize;
            const y = Math.floor(point.y * scaleY / gridSize) * gridSize;
            const key = `${x},${y}`;
            
            if (!grid[key]) {
                grid[key] = { x: x, y: y, count: 0 };
            }
            grid[key].count++;
        });
        
        return grid;
    }

    drawTimeseries(gazeData) {
        const canvas = document.getElementById('timeseries-canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = canvas.parentElement.offsetWidth;
        canvas.height = 300;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const padding = 40;
        const width = canvas.width - padding * 2;
        const height = canvas.height - padding * 2;
        
        const maxTime = gazeData.length > 0 ? gazeData[gazeData.length - 1].timestamp : 1;
        
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding + (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(padding + width, y);
            ctx.stroke();
        }
        
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        gazeData.forEach((point, index) => {
            const x = padding + (point.timestamp / maxTime) * width;
            const y = padding + height - (point.y / window.innerHeight) * height;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        ctx.fillStyle = '#333';
        ctx.font = '12px sans-serif';
        ctx.fillText('Y坐标 (顶部)', padding, padding - 10);
        ctx.fillText('Y坐标 (底部)', padding, canvas.height - 10);
        ctx.fillText(`时间 (ms) - ${gazeData.length}个数据点`, canvas.width - 150, canvas.height - 10);
    }

    drawAOIChart(aoiAnalysis) {
        const canvas = document.getElementById('aoi-chart-canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = canvas.parentElement.offsetWidth;
        canvas.height = 300;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const padding = 60;
        const width = canvas.width - padding * 2;
        const height = canvas.height - padding * 2;
        
        const aoiNames = Object.keys(aoiAnalysis);
        const maxTime = Math.max(...aoiNames.map(name => aoiAnalysis[name].total_time));
        
        const barWidth = width / aoiNames.length * 0.6;
        const gap = width / aoiNames.length * 0.4;
        
        const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c'];
        
        aoiNames.forEach((name, index) => {
            const barHeight = (aoiAnalysis[name].total_time / maxTime) * height;
            const x = padding + index * (barWidth + gap) + gap / 2;
            const y = padding + height - barHeight;
            
            const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
            gradient.addColorStop(0, colors[index % colors.length]);
            gradient.addColorStop(1, this.lightenColor(colors[index % colors.length], 30));
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, barWidth, barHeight);
            
            ctx.fillStyle = '#333';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            const label = this.aoiDefinitions[name]?.name || name;
            ctx.fillText(label.substring(0, 8), x + barWidth / 2, canvas.height - 10);
            
            ctx.fillText((aoiAnalysis[name].total_time / 1000).toFixed(1) + 's', x + barWidth / 2, y - 10);
        });
        
        ctx.fillStyle = '#333';
        ctx.textAlign = 'left';
        ctx.fillText('停留时间 (秒)', 10, 20);
    }

    renderAOIStats(aoiAnalysis, fullData = null) {
        const container = document.getElementById('aoi-stats-table');
        
        let html = '<table class="stats-table">';
        html += '<thead><tr><th>兴趣区</th><th>总停留时间</th><th>注视次数</th><th>平均停留时间</th><th>占比</th></tr></thead>';
        html += '<tbody>';
        
        const totalTime = Object.values(aoiAnalysis).reduce((sum, aoi) => sum + aoi.total_time, 0);
        
        Object.keys(aoiAnalysis).forEach(key => {
            const aoi = aoiAnalysis[key];
            const percentage = totalTime > 0 ? (aoi.total_time / totalTime * 100).toFixed(1) : 0;
            
            html += `<tr>
                <td>${this.aoiDefinitions[key]?.name || key}</td>
                <td>${(aoi.total_time / 1000).toFixed(2)}s</td>
                <td>${aoi.fixation_count}</td>
                <td>${aoi.fixation_count > 0 ? (aoi.total_time / aoi.fixation_count / 1000).toFixed(2) + 's' : '-'}</td>
                <td>${percentage}%</td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        
        if (fullData) {
            html += `<div style="margin-top: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px;">
                <strong>数据质量:</strong> 
                校准精度 ${fullData.calibration_quality ? fullData.calibration_quality.toFixed(1) : 'N/A'}% | 
                数据点 ${fullData.gaze_data?.length || 0} | 
                ${fullData.is_mobile ? '移动端' : '桌面端'}
            </div>`;
        }
        
        container.innerHTML = html;
    }

    async loadComparison(subjectIds) {
        try {
            const response = await fetch('/api/comparison', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ subject_ids: subjectIds })
            });
            
            const data = await response.json();
            
            document.getElementById('comparison-results').style.display = 'block';
            
            this.drawComparisonChart(data);
            this.renderComparisonTable(data);
            this.drawScanpathComparison(data);
        } catch (error) {
            console.error('加载对比数据失败:', error);
        }
    }

    drawComparisonChart(data) {
        const canvas = document.getElementById('comparison-chart');
        const ctx = canvas.getContext('2d');
        
        canvas.width = canvas.parentElement.offsetWidth;
        canvas.height = 300;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const padding = 60;
        const width = canvas.width - padding * 2;
        const height = canvas.height - padding * 2;
        
        const subjects = Object.keys(data);
        const aoiNames = Object.keys(this.aoiDefinitions);
        
        const maxTime = Math.max(...subjects.map(s => 
            Math.max(...aoiNames.map(aoi => data[s].aoi_analysis[aoi]?.total_time || 0))
        ));
        
        const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#43e97b'];
        const groupWidth = width / aoiNames.length * 0.8;
        const barWidth = groupWidth / subjects.length * 0.8;
        
        aoiNames.forEach((aoi, aoiIndex) => {
            subjects.forEach((subject, subjIndex) => {
                const aoiData = data[subject].aoi_analysis[aoi] || { total_time: 0 };
                const barHeight = (aoiData.total_time / maxTime) * height;
                const x = padding + aoiIndex * (width / aoiNames.length) + subjIndex * barWidth + (width / aoiNames.length - groupWidth) / 2;
                const y = padding + height - barHeight;
                
                ctx.fillStyle = colors[subjIndex % colors.length];
                ctx.fillRect(x, y, barWidth * 0.9, barHeight);
            });
        });
        
        ctx.fillStyle = '#333';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        
        aoiNames.forEach((aoi, index) => {
            const x = padding + index * (width / aoiNames.length) + (width / aoiNames.length) / 2;
            const label = this.aoiDefinitions[aoi]?.name || aoi;
            ctx.fillText(label.substring(0, 8), x, canvas.height - 10);
        });
        
        ctx.textAlign = 'left';
        subjects.forEach((subject, index) => {
            ctx.fillStyle = colors[index % colors.length];
            ctx.fillRect(canvas.width - 150, padding + index * 25, 15, 15);
            ctx.fillStyle = '#333';
            ctx.fillText(subject, canvas.width - 130, padding + index * 25 + 12);
        });
    }

    renderComparisonTable(data) {
        const container = document.getElementById('comparison-table');
        
        let html = '<table class="stats-table">';
        html += '<thead><tr><th>被试ID</th><th>总实验时间</th><th>总注视点</th><th>校准精度</th><th>认知负荷</th><th>设备</th><th>答案分布</th></tr></thead>';
        html += '<tbody>';
        
        Object.keys(data).forEach(subjectId => {
            const subject = data[subjectId];
            const totalGaze = subject.gaze_data?.length || 0;
            const totalTime = subject.total_time;
            const answers = Object.values(subject.answers || {}).join(', ');
            const cognitiveLoad = subject.pupil_analysis?.cognitive_load_index || 0;
            
            html += `<tr>
                <td>${subjectId}</td>
                <td>${(totalTime / 1000).toFixed(2)}s</td>
                <td>${totalGaze}</td>
                <td>${subject.calibration_quality ? subject.calibration_quality.toFixed(1) + '%' : 'N/A'}</td>
                <td>${cognitiveLoad ? cognitiveLoad.toFixed(1) + '%' : '--'}</td>
                <td>${subject.is_mobile ? '移动端' : '桌面端'}</td>
                <td>${answers}</td>
            </tr>`;
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    drawScanpathComparison(data) {
        const container = document.getElementById('scanpath-comparison');
        container.innerHTML = '';
        
        const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c'];
        
        Object.keys(data).forEach((subjectId, index) => {
            const item = document.createElement('div');
            item.className = 'scanpath-item';
            item.innerHTML = `<h4>${subjectId} 的扫描路径</h4>
                <canvas class="scanpath-canvas"></canvas>`;
            container.appendChild(item);
            
            const canvas = item.querySelector('.scanpath-canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = canvas.offsetWidth || 400;
            canvas.height = 300;
            
            const gazeData = data[subjectId].gaze_data || [];
            if (gazeData.length === 0) return;
            
            const scaleX = canvas.width / window.innerWidth;
            const scaleY = canvas.height / window.innerHeight;
            
            const step = Math.max(1, Math.floor(gazeData.length / 50));
            const sampledData = gazeData.filter((_, i) => i % step === 0);
            
            ctx.strokeStyle = colors[index % colors.length];
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            
            sampledData.forEach((point, i) => {
                const x = Math.min(Math.max(point.x * scaleX, 0), canvas.width);
                const y = Math.min(Math.max(point.y * scaleY, 0), canvas.height);
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            ctx.stroke();
            
            sampledData.forEach((point, i) => {
                const x = Math.min(Math.max(point.x * scaleX, 0), canvas.width);
                const y = Math.min(Math.max(point.y * scaleY, 0), canvas.height);
                const radius = 4 + (i / sampledData.length) * 6;
                
                ctx.fillStyle = colors[index % colors.length];
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.fillStyle = 'white';
                ctx.font = '9px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(i + 1, x, y + 3);
            });
        });
    }

    async exportReport() {
        const select = document.getElementById('report-subjects');
        const format = document.getElementById('report-format').value;
        const selectedSubjects = Array.from(select.selectedOptions).map(o => o.value);
        
        let url = `/api/report/${format}`;
        if (selectedSubjects.length > 0) {
            url += '?' + selectedSubjects.map(id => `subject_ids=${encodeURIComponent(id)}`).join('&');
        }
        
        window.open(url, '_blank');
    }

    async previewReport() {
        const select = document.getElementById('report-subjects');
        const selectedSubjects = Array.from(select.selectedOptions).map(o => o.value);
        
        let url = '/api/report/json';
        if (selectedSubjects.length > 0) {
            url += '?' + selectedSubjects.map(id => `subject_ids=${encodeURIComponent(id)}`).join('&');
        }
        
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            this.renderReportPreview(data);
        } catch (error) {
            console.error('预览报告失败:', error);
        }
    }

    renderReportPreview(data) {
        const container = document.getElementById('report-preview-container');
        const tableContainer = document.getElementById('report-preview-table');
        
        if (!data || data.length === 0) {
            tableContainer.innerHTML = '<p>暂无数据</p>';
            container.style.display = 'block';
            return;
        }
        
        let html = '<table class="stats-table" style="font-size: 12px;">';
        
        html += '<thead><tr>';
        Object.keys(data[0]).forEach(key => {
            html += `<th>${key}</th>`;
        });
        html += '</tr></thead>';
        
        html += '<tbody>';
        data.forEach(row => {
            html += '<tr>';
            Object.values(row).forEach(value => {
                html += `<td>${value}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table>';
        
        tableContainer.innerHTML = html;
        container.style.display = 'block';
    }

    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new EyeTrackingApp();
});
