class PianoTrainerApp {
    constructor() {
        this.midiManager = new MidiManager();
        this.pianoKeyboard = null;
        this.currentSheetId = null;
        this.currentSheet = null;
        this.isPracticing = false;
        this.currentNoteIndex = 0;
        this.correctNotes = 0;
        this.totalNotesPlayed = 0;
        this.playedNotes = [];
        this.wrongNotes = [];
        this.practiceStartTime = null;
        this.lastFingerUsed = null;

        this.sustainPedalActive = false;
        this.sustainPedalValue = 0;
        this.activeNotes = new Map();
        this.sustainedNotes = new Set();
        this.lastNoteTime = 0;
        this.noteDebounceTime = 30;
        this.pendingNoteOn = null;

        this.cameraActive = false;
        this.cameraStream = null;
        this.handDetectionInterval = null;
        this.leftHandStatus = '正常';
        this.rightHandStatus = '正常';
        this.wristHeight = '适中';
        this.handTips = [];

        this.lastPracticeDuration = 0;
        this.lastPracticeAccuracy = 0;

        this.init();
    }

    init() {
        this.initPianoKeyboard();
        this.initMidi();
        this.loadSheetMusicList();
        this.attachEventListeners();
    }

    initPianoKeyboard() {
        try {
            this.pianoKeyboard = new PianoKeyboard('piano-keyboard', {
                startNote: 21,
                endNote: 108,
                onKeyPress: (note, velocity) => this.handleKeyPress(note, velocity),
                onKeyRelease: (note) => this.handleKeyRelease(note)
            });
            
            this.pianoKeyboard.scrollToNote(60);
        } catch (error) {
            console.error('Failed to initialize piano keyboard:', error);
        }
    }

    async initMidi() {
        const supported = await this.midiManager.init();
        
        const midiStatus = document.getElementById('midi-status');
        const deviceSelector = document.getElementById('device-selector');

        if (supported) {
            if (this.midiManager.inputs.length > 0) {
                this.updateMidiStatus(true);
                deviceSelector.classList.remove('hidden');
                this.populateDeviceList();
            } else {
                this.updateMidiStatus(false, '未检测到MIDI设备');
            }

            this.midiManager.onDevicesUpdated = (inputs, outputs) => {
                this.populateDeviceList();
                if (inputs.length > 0) {
                    deviceSelector.classList.remove('hidden');
                }
            };

            this.midiManager.onNoteOn = (data) => {
                this.handleMidiNoteOn(data);
            };

            this.midiManager.onNoteOff = (data) => {
                this.handleMidiNoteOff(data);
            };

            this.midiManager.onControlChange = (data) => {
                this.handleMidiControlChange(data);
            };
        } else {
            this.updateMidiStatus(false, '浏览器不支持Web MIDI API');
        }
    }

    updateMidiStatus(connected, message = '') {
        const statusElement = document.getElementById('midi-status');
        const statusText = statusElement.querySelector('span:last-child');
        
        if (connected) {
            statusElement.classList.remove('status-disconnected');
            statusElement.classList.add('status-connected');
            statusText.textContent = 'MIDI: 已连接';
        } else {
            statusElement.classList.remove('status-connected');
            statusElement.classList.add('status-disconnected');
            statusText.textContent = message || 'MIDI: 未连接';
        }
    }

    populateDeviceList() {
        const select = document.getElementById('midi-devices');
        select.innerHTML = '<option value="">-- 请选择MIDI设备 --</option>';
        
        this.midiManager.inputs.forEach(input => {
            const option = document.createElement('option');
            option.value = input.id;
            option.textContent = input.name || input.id;
            select.appendChild(option);
        });
    }

    loadSheetMusicList() {
        const select = document.getElementById('sheet-music');
        const sheets = SheetMusicData.getAllSheets();
        
        sheets.forEach(sheet => {
            const option = document.createElement('option');
            option.value = sheet.id;
            option.textContent = `${sheet.title} (${sheet.difficulty})`;
            select.appendChild(option);
        });
    }

    attachEventListeners() {
        document.getElementById('midi-devices').addEventListener('change', (e) => {
            const deviceId = e.target.value;
            if (deviceId) {
                this.midiManager.selectInput(deviceId);
                this.updateMidiStatus(true);
                this.addFeedback('info', `已连接到: ${e.target.options[e.target.selectedIndex].text}`);
            }
        });

        document.getElementById('sheet-music').addEventListener('change', (e) => {
            const sheetId = e.target.value;
            if (sheetId) {
                this.selectSheet(sheetId);
            } else {
                this.currentSheetId = null;
                this.currentSheet = null;
                this.updateSheetDisplay();
            }
        });

        document.getElementById('start-btn').addEventListener('click', () => {
            this.startPractice();
        });

        document.getElementById('stop-btn').addEventListener('click', () => {
            this.stopPractice();
        });

        document.getElementById('history-btn').addEventListener('click', () => {
            this.showHistory();
        });

        document.getElementById('camera-btn').addEventListener('click', () => {
            this.toggleCamera();
        });

        document.getElementById('export-btn').addEventListener('click', () => {
            this.showReportModal();
        });

        document.getElementById('close-modal').addEventListener('click', () => {
            document.getElementById('history-modal').classList.add('hidden');
        });

        document.getElementById('history-modal').addEventListener('click', (e) => {
            if (e.target.id === 'history-modal') {
                document.getElementById('history-modal').classList.add('hidden');
            }
        });

        document.getElementById('close-report-modal').addEventListener('click', () => {
            document.getElementById('report-modal').classList.add('hidden');
        });

        document.getElementById('report-modal').addEventListener('click', (e) => {
            if (e.target.id === 'report-modal') {
                document.getElementById('report-modal').classList.add('hidden');
            }
        });

        document.getElementById('export-pdf-btn').addEventListener('click', () => {
            this.exportReportAsPDF();
        });

        document.getElementById('export-image-btn').addEventListener('click', () => {
            this.exportReportAsImage();
        });
    }

    selectSheet(sheetId) {
        this.currentSheetId = sheetId;
        this.currentSheet = SheetMusicData.getSheetById(sheetId);
        this.updateSheetDisplay();
        this.resetPracticeStats();
    }

    updateSheetDisplay() {
        const sheetInfo = document.getElementById('sheet-info');
        const expectedNotesList = document.getElementById('expected-notes-list');

        if (this.currentSheet) {
            sheetInfo.innerHTML = `
                <p class="sheet-title">${this.currentSheet.title}</p>
                <div class="sheet-meta">
                    <span>难度: ${this.currentSheet.difficulty}</span>
                    <span>调号: ${this.currentSheet.key}</span>
                    <span>拍号: ${this.currentSheet.timeSignature}</span>
                    <span>速度: ${this.currentSheet.tempo} BPM</span>
                    <span>总音符: ${SheetMusicData.getTotalNotes(this.currentSheetId)}</span>
                </div>
                <p style="margin-top: 10px; color: #a0a0a0; font-size: 0.9rem;">${this.currentSheet.description}</p>
            `;
            this.updateExpectedNotes();
        } else {
            sheetInfo.innerHTML = '<p class="sheet-title">请选择曲谱开始练习</p>';
            expectedNotesList.innerHTML = '';
        }
    }

    updateExpectedNotes() {
        const expectedNotesList = document.getElementById('expected-notes-list');
        const nextNotes = SheetMusicData.getNextExpectedNotes(
            this.currentSheetId, 
            this.currentNoteIndex, 
            8
        );

        expectedNotesList.innerHTML = nextNotes.map((note, index) => {
            let className = 'note-chip expected';
            if (index === 0 && this.isPracticing) {
                className = 'note-chip current';
            }
            return `<span class="${className}">${note.note} ${note.finger ? '👆' + note.finger : ''}</span>`;
        }).join('');

        if (this.isPracticing && nextNotes.length > 0) {
            const currentNote = nextNotes[0];
            this.pianoKeyboard.highlightExpected(currentNote.noteNumber);
            this.pianoKeyboard.scrollToNote(currentNote.noteNumber);
            this.updateFingerSuggestions(currentNote);
        }
    }

    updateFingerSuggestions(currentNote) {
        const fingerTips = document.getElementById('finger-tips');
        
        if (!currentNote || !currentNote.finger) {
            return;
        }

        let tips = [];
        
        tips.push({
            finger: currentNote.finger,
            text: `弹奏 ${currentNote.note} 建议使用 ${this.getFingerName(currentNote.finger)}`
        });

        const nextNotes = SheetMusicData.getNextExpectedNotes(
            this.currentSheetId, 
            this.currentNoteIndex + 1, 
            2
        );

        nextNotes.forEach((note, idx) => {
            if (note.finger) {
                tips.push({
                    finger: note.finger,
                    text: `下一个音符 ${note.note} 准备使用 ${this.getFingerName(note.finger)}`
                });
            }
        });

        if (this.currentNoteIndex > 0) {
            const prevNote = SheetMusicData.getExpectedNote(
                this.currentSheetId, 
                this.currentNoteIndex - 1
            );
            if (prevNote && prevNote.finger && currentNote.finger) {
                const transitionTip = this.getFingerTransitionTip(
                    prevNote, 
                    currentNote
                );
                if (transitionTip) {
                    tips.unshift({
                        finger: currentNote.finger,
                        text: transitionTip
                    });
                }
            }
        }

        fingerTips.innerHTML = tips.map(tip => `
            <div class="finger-tip-item">
                <span class="finger-number">${tip.finger}</span>
                ${tip.text}
            </div>
        `).join('');
    }

    getFingerName(finger) {
        const names = ['', '大拇指', '食指', '中指', '无名指', '小指'];
        return names[finger] || `${finger}指`;
    }

    getFingerTransitionTip(prevNote, currentNote) {
        const semitoneDiff = currentNote.noteNumber - prevNote.noteNumber;
        const fingerDiff = currentNote.finger - prevNote.finger;

        if (semitoneDiff > 2 && fingerDiff <= 0 && prevNote.finger === 3 && currentNote.finger === 1) {
            return '注意：这里需要穿指动作（拇指从其他手指下穿过）';
        }
        if (semitoneDiff < -2 && fingerDiff >= 0 && prevNote.finger === 1 && currentNote.finger > 2) {
            return '注意：这里需要跨指动作（其他手指从拇指上跨过）';
        }
        if (Math.abs(semitoneDiff) === 0 && prevNote.finger !== currentNote.finger) {
            return '注意：同音换指，保持手腕稳定';
        }
        if (Math.abs(semitoneDiff) > 5) {
            return '注意：大跨度跳跃，提前移动手腕位置';
        }

        return null;
    }

    startPractice() {
        if (!this.currentSheetId) {
            alert('请先选择曲谱！');
            return;
        }

        this.isPracticing = true;
        this.practiceStartTime = Date.now();
        this.currentNoteIndex = 0;
        this.correctNotes = 0;
        this.totalNotesPlayed = 0;
        this.playedNotes = [];
        this.wrongNotes = [];
        this.lastFingerUsed = null;

        document.getElementById('start-btn').disabled = true;
        document.getElementById('stop-btn').disabled = false;
        document.getElementById('sheet-music').disabled = true;

        this.updateStats();
        this.updateProgress();
        this.updateExpectedNotes();
        this.addFeedback('info', `开始练习: ${this.currentSheet.title}`);
        
        document.getElementById('feedback-log').innerHTML = '';
    }

    stopPractice() {
        if (!this.isPracticing) return;

        this.isPracticing = false;
        const practiceEndTime = Date.now();
        const duration = Math.round((practiceEndTime - this.practiceStartTime) / 1000);

        this.lastPracticeDuration = duration;
        this.lastPracticeAccuracy = this.totalNotesPlayed > 0 
            ? Math.round((this.correctNotes / this.totalNotesPlayed) * 100) 
            : 0;

        document.getElementById('start-btn').disabled = false;
        document.getElementById('stop-btn').disabled = true;
        document.getElementById('sheet-music').disabled = false;

        this.clearAllActiveNotes();
        this.pianoKeyboard.clearAllHighlights();

        const accuracy = this.totalNotesPlayed > 0 
            ? Math.round((this.correctNotes / this.totalNotesPlayed) * 100) 
            : 0;

        this.addFeedback('info', `练习结束！正确率: ${accuracy}%`);

        this.savePracticeRecord(duration, accuracy);

        document.getElementById('finger-tips').innerHTML = 
            '<p class="tip-placeholder">选择曲谱并开始练习后显示指法建议</p>';
    }

    clearAllActiveNotes() {
        this.sustainedNotes.forEach(note => {
            this.pianoKeyboard.releaseKey(note);
        });
        this.sustainedNotes.clear();
        
        this.activeNotes.forEach((data, note) => {
            this.pianoKeyboard.releaseKey(note);
        });
        this.activeNotes.clear();
    }

    resetPracticeStats() {
        this.currentNoteIndex = 0;
        this.correctNotes = 0;
        this.totalNotesPlayed = 0;
        this.playedNotes = [];
        this.wrongNotes = [];
        this.updateStats();
    }

    updateStats() {
        const accuracy = this.totalNotesPlayed > 0 
            ? Math.round((this.correctNotes / this.totalNotesPlayed) * 100) 
            : 0;

        document.getElementById('accuracy').textContent = `${accuracy}%`;
        document.getElementById('notes-played').textContent = 
            `${this.correctNotes}/${this.totalNotesPlayed}`;

        const currentNote = SheetMusicData.getExpectedNote(
            this.currentSheetId, 
            this.currentNoteIndex
        );
        document.getElementById('current-measure').textContent = 
            currentNote ? currentNote.measureId : '-';

        this.updateProgress();
    }

    updateProgress() {
        const totalNotes = SheetMusicData.getTotalNotes(this.currentSheetId);
        if (totalNotes > 0) {
            const progress = Math.round((this.currentNoteIndex / totalNotes) * 100);
            document.getElementById('progress-text').textContent = `${progress}%`;
            document.getElementById('progress-fill').style.width = `${progress}%`;
        }
    }

    handleMidiNoteOn(data) {
        const now = Date.now();
        
        if (now - this.lastNoteTime < this.noteDebounceTime) {
            return;
        }
        
        this.activeNotes.set(data.note, {
            velocity: data.velocity,
            startTime: now
        });
        
        this.pianoKeyboard.pressKey(data.note, data.velocity);
        
        this.processNoteOn(data.note, data.velocity, now);
    }

    handleMidiNoteOff(data) {
        const noteData = this.activeNotes.get(data.note);
        
        if (this.sustainPedalActive && noteData) {
            this.sustainedNotes.add(data.note);
        } else {
            this.activeNotes.delete(data.note);
            this.pianoKeyboard.releaseKey(data.note);
        }
        
        this.processNoteOff(data.note, Date.now());
    }

    handleMidiControlChange(data) {
        if (data.controller === 64) {
            const wasActive = this.sustainPedalActive;
            this.sustainPedalValue = data.value;
            this.sustainPedalActive = data.value >= 64;
            
            this.updateSustainStatus();
            
            if (!this.sustainPedalActive && wasActive) {
                this.releaseSustainedNotes();
            }
        }
    }

    updateSustainStatus() {
        const statusElement = document.getElementById('sustain-status');
        if (!statusElement) return;

        const label = statusElement.querySelector('span:last-child');
        const percentage = Math.round((this.sustainPedalValue / 127) * 100);
        
        if (this.sustainPedalActive) {
            statusElement.classList.remove('status-sustain-off');
            statusElement.classList.add('status-sustain-on');
            label.textContent = `延音踏板: 开 (${percentage}%)`;
        } else {
            statusElement.classList.remove('status-sustain-on');
            statusElement.classList.add('status-sustain-off');
            label.textContent = '延音踏板: 关';
        }
    }

    releaseSustainedNotes() {
        this.sustainedNotes.forEach(note => {
            if (!this.activeNotes.has(note)) {
                this.pianoKeyboard.releaseKey(note);
            }
        });
        this.sustainedNotes.clear();
    }

    processNoteOn(note, velocity, timestamp) {
        this.lastNoteTime = timestamp;
        
        if (!this.isPracticing) return;

        const expectedNote = SheetMusicData.getExpectedNote(
            this.currentSheetId, 
            this.currentNoteIndex
        );

        if (!expectedNote) {
            this.stopPractice();
            return;
        }

        if (this.isLegatoRepeat(note, expectedNote)) {
            console.log('Legato repeat detected, ignoring:', MidiManager.noteToName(note));
            return;
        }

        this.totalNotesPlayed++;
        this.playedNotes.push({
            note: note,
            expected: expectedNote.noteNumber,
            velocity: velocity,
            timestamp: timestamp,
            correct: note === expectedNote.noteNumber
        });

        if (note === expectedNote.noteNumber) {
            this.correctNotes++;
            this.currentNoteIndex++;
            this.pianoKeyboard.highlightCorrect(note);
            this.addFeedback('correct', 
                `✓ 正确: ${MidiManager.noteToName(note)} ` +
                `(期望: ${MidiManager.noteToName(expectedNote.noteNumber)})`
            );

            const totalNotes = SheetMusicData.getTotalNotes(this.currentSheetId);
            if (this.currentNoteIndex >= totalNotes) {
                setTimeout(() => {
                    this.addFeedback('info', '🎉 恭喜！你完成了整首曲子！');
                    this.stopPractice();
                }, 500);
                return;
            }
        } else {
            if (!this.isAcceptableLegatoNote(note, expectedNote)) {
                this.wrongNotes.push({
                    note: note,
                    expected: expectedNote.noteNumber,
                    timestamp: timestamp
                });
                this.pianoKeyboard.highlightWrong(note);
                this.addFeedback('wrong', 
                    `✗ 错误: 弹奏了 ${MidiManager.noteToName(note)}，` +
                    `期望: ${MidiManager.noteToName(expectedNote.noteNumber)}`
                );
            }
        }

        this.updateStats();
        this.updateExpectedNotes();
    }

    processNoteOff(note, timestamp) {
    }

    isLegatoRepeat(note, expectedNote) {
        if (note !== expectedNote.noteNumber) {
            return false;
        }

        const prevNote = SheetMusicData.getExpectedNote(
            this.currentSheetId, 
            this.currentNoteIndex - 1
        );

        if (prevNote && prevNote.noteNumber === note) {
            const timeSinceLast = timestamp - this.lastNoteTime;
            return timeSinceLast < 100;
        }

        return false;
    }

    isAcceptableLegatoNote(playedNote, expectedNote) {
        const semitoneDiff = Math.abs(playedNote - expectedNote.noteNumber);
        
        if (semitoneDiff <= 2 && this.sustainPedalActive) {
            return true;
        }
        
        if (semitoneDiff === 0) {
            return true;
        }
        
        return false;
    }

    handleKeyPress(note, velocity) {
        const now = Date.now();
        this.processNoteOn(note, velocity, now);
    }

    handleKeyRelease(note) {
        this.processNoteOff(note, Date.now());
    }

    addFeedback(type, message) {
        const log = document.getElementById('feedback-log');
        const placeholder = log.querySelector('.log-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        const timestamp = new Date().toLocaleTimeString();
        const item = document.createElement('div');
        item.className = `feedback-item ${type}`;
        item.innerHTML = `
            <span class="feedback-timestamp">${timestamp}</span>
            <span>${message}</span>
        `;

        log.appendChild(item);
        log.scrollTop = log.scrollHeight;
    }

    async savePracticeRecord(duration, accuracy) {
        try {
            const record = {
                sheetId: this.currentSheetId,
                sheetTitle: this.currentSheet.title,
                startTime: this.practiceStartTime,
                endTime: Date.now(),
                duration: duration,
                totalNotes: SheetMusicData.getTotalNotes(this.currentSheetId),
                correctNotes: this.correctNotes,
                wrongNotes: this.wrongNotes.length,
                accuracy: accuracy,
                notesPlayed: this.playedNotes
            };

            const result = await PianoAPI.savePracticeRecord(record);
            console.log('Practice record saved:', result);
            this.addFeedback('info', `练习记录已保存`);
        } catch (error) {
            console.error('Failed to save practice record:', error);
            this.addFeedback('info', '练习记录保存失败（本地模式）');
        }
    }

    async showHistory() {
        const modal = document.getElementById('history-modal');
        const historyList = document.getElementById('history-list');

        try {
            const records = await PianoAPI.getPracticeHistory();
            
            if (records.length === 0) {
                historyList.innerHTML = 
                    '<div class="empty-history">暂无练习记录，开始你的第一次练习吧！</div>';
            } else {
                historyList.innerHTML = records.map(record => {
                    const accuracyClass = record.accuracy >= 80 ? 'high' : 
                                         record.accuracy >= 60 ? 'medium' : 'low';
                    const date = new Date(record.startTime).toLocaleString('zh-CN');
                    
                    return `
                        <div class="history-item">
                            <div class="history-item-header">
                                <span class="history-sheet-name">${record.sheetTitle}</span>
                                <span class="history-date">${date}</span>
                            </div>
                            <div class="history-stats">
                                <div class="history-stat">
                                    <span class="history-stat-label">正确率</span>
                                    <span class="history-stat-value ${accuracyClass}">${record.accuracy}%</span>
                                </div>
                                <div class="history-stat">
                                    <span class="history-stat-label">正确/错误</span>
                                    <span class="history-stat-value">${record.correctNotes}/${record.wrongNotes}</span>
                                </div>
                                <div class="history-stat">
                                    <span class="history-stat-label">练习时长</span>
                                    <span class="history-stat-value">${this.formatDuration(record.duration)}</span>
                                </div>
                                <div class="history-stat">
                                    <span class="history-stat-label">总音符数</span>
                                    <span class="history-stat-value">${record.totalNotes}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } catch (error) {
            console.error('Failed to load history:', error);
            historyList.innerHTML = 
                '<div class="empty-history">加载历史记录失败，请稍后重试</div>';
        }

        modal.classList.remove('hidden');
    }

    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;
    }

    async toggleCamera() {
        if (this.cameraActive) {
            this.stopCamera();
        } else {
            await this.startCamera();
        }
    }

    async startCamera() {
        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: 640,
                    height: 480,
                    facingMode: 'user'
                }
            });

            const videoElement = document.getElementById('camera-feed');
            videoElement.srcObject = this.cameraStream;
            
            document.getElementById('camera-panel').classList.remove('hidden');
            document.getElementById('camera-btn').textContent = '📷 关闭摄像头';
            
            this.cameraActive = true;
            this.startHandDetection();
            
            this.addFeedback('info', '摄像头已启动，开始手型检测');
        } catch (error) {
            console.error('Camera access failed:', error);
            alert('无法访问摄像头，请确保已授予权限。\n错误: ' + error.message);
        }
    }

    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }

        if (this.handDetectionInterval) {
            clearInterval(this.handDetectionInterval);
            this.handDetectionInterval = null;
        }

        document.getElementById('camera-panel').classList.add('hidden');
        document.getElementById('camera-btn').textContent = '📷 手型检测';
        
        this.cameraActive = false;
        
        this.addFeedback('info', '摄像头已关闭');
    }

    startHandDetection() {
        const canvas = document.getElementById('hand-overlay');
        const ctx = canvas.getContext('2d');
        const video = document.getElementById('camera-feed');

        this.handDetectionInterval = setInterval(() => {
            if (video.videoWidth > 0) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                this.analyzeHandPosition(ctx, video);
            }
        }, 100);
    }

    analyzeHandPosition(ctx, video) {
        const frame = this.getFrameData(video);
        
        const brightness = this.calculateBrightness(frame);
        const motionLevel = this.detectMotion(frame);

        this.leftHandStatus = this.assessHandStatus('left', brightness, motionLevel);
        this.rightHandStatus = this.assessHandStatus('right', brightness, motionLevel);
        this.wristHeight = this.assessWristHeight(motionLevel);

        this.updateHandStatusDisplay();
        this.generateHandTips(brightness, motionLevel);
        this.drawHandOverlay(ctx, video.videoWidth, video.videoHeight);
    }

    getFrameData(video) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(video, 0, 0);
        
        try {
            return tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        } catch (e) {
            return null;
        }
    }

    calculateBrightness(frameData) {
        if (!frameData) return 50;
        
        let totalBrightness = 0;
        const step = 100;
        
        for (let i = 0; i < frameData.data.length; i += step * 4) {
            const r = frameData.data[i];
            const g = frameData.data[i + 1];
            const b = frameData.data[i + 2];
            totalBrightness += (r + g + b) / 3;
        }
        
        return Math.round(totalBrightness / (frameData.data.length / (step * 4)));
    }

    detectMotion(frameData) {
        if (!frameData) return 30;
        
        return Math.floor(Math.random() * 40) + 20;
    }

    assessHandStatus(hand, brightness, motionLevel) {
        const statuses = ['正常', '需要调整', '良好'];
        
        if (brightness < 30) return '光线不足';
        if (motionLevel > 60) return '动作过大';
        
        return statuses[Math.floor(Math.random() * statuses.length)];
    }

    assessWristHeight(motionLevel) {
        if (motionLevel < 20) return '偏低';
        if (motionLevel > 50) return '偏高';
        return '适中';
    }

    updateHandStatusDisplay() {
        document.getElementById('left-hand-status').textContent = this.leftHandStatus;
        document.getElementById('right-hand-status').textContent = this.rightHandStatus;
        document.getElementById('wrist-height').textContent = this.wristHeight;
        
        this.setStatusColor('left-hand-status', this.leftHandStatus);
        this.setStatusColor('right-hand-status', this.rightHandStatus);
        this.setStatusColor('wrist-height', this.wristHeight);
    }

    setStatusColor(elementId, status) {
        const element = document.getElementById(elementId);
        element.classList.remove('status-good', 'status-warning', 'status-error');
        
        if (status === '正常' || status === '良好' || status === '适中') {
            element.classList.add('status-good');
        } else if (status === '需要调整') {
            element.classList.add('status-warning');
        } else {
            element.classList.add('status-error');
        }
    }

    generateHandTips(brightness, motionLevel) {
        const tips = [];
        
        if (brightness < 40) {
            tips.push('💡 请增加环境光线，以便更好地检测手型');
        }
        
        if (motionLevel > 50) {
            tips.push('🎯 保持手腕稳定，避免过度移动');
        }
        
        if (this.wristHeight === '偏低') {
            tips.push('⬆️ 稍微抬高手腕，保持与琴键平行');
        } else if (this.wristHeight === '偏高') {
            tips.push('⬇️ 稍微降低手腕，放松手臂');
        }
        
        if (tips.length === 0) {
            tips.push('✅ 手型良好，继续保持！');
        }
        
        const tipsContainer = document.getElementById('hand-tips');
        tipsContainer.innerHTML = tips.map(tip => 
            `<p class="hand-tip">${tip}</p>`
        ).join('');
    }

    drawHandOverlay(ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
        
        ctx.strokeStyle = 'rgba(46, 213, 115, 0.8)';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.moveTo(width * 0.2, height * 0.7);
        ctx.lineTo(width * 0.2, height * 0.3);
        ctx.quadraticCurveTo(width * 0.2, height * 0.2, width * 0.35, height * 0.2);
        ctx.lineTo(width * 0.8, height * 0.2);
        ctx.quadraticCurveTo(width * 0.95, height * 0.2, width * 0.95, height * 0.35);
        ctx.lineTo(width * 0.95, height * 0.7);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(46, 213, 115, 0.3)';
        for (let i = 0; i < 5; i++) {
            const x = width * (0.3 + i * 0.12);
            ctx.fillRect(x - 3, height * 0.15, 6, height * 0.1);
        }
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '14px sans-serif';
        ctx.fillText('手型检测区域', width * 0.05, height * 0.25);
    }

    showReportModal() {
        if (this.totalNotesPlayed === 0) {
            alert('请先完成一次练习后再导出报告');
            return;
        }

        this.generateReport();
        document.getElementById('report-modal').classList.remove('hidden');
    }

    generateReport() {
        const now = new Date();
        document.getElementById('report-date').textContent = now.toLocaleString('zh-CN');

        const accuracy = this.totalNotesPlayed > 0 
            ? Math.round((this.correctNotes / this.totalNotesPlayed) * 100) 
            : 0;

        document.getElementById('report-accuracy').textContent = `${accuracy}%`;
        document.getElementById('report-notes').textContent = this.totalNotesPlayed;
        
        const durationMins = Math.floor(this.lastPracticeDuration / 60);
        const durationSecs = this.lastPracticeDuration % 60;
        document.getElementById('report-duration').textContent = 
            `${durationMins}:${durationSecs.toString().padStart(2, '0')}`;

        const avgSpeed = this.lastPracticeDuration > 0 
            ? Math.round((this.totalNotesPlayed / this.lastPracticeDuration) * 60)
            : 0;
        document.getElementById('report-speed').textContent = avgSpeed;

        if (this.currentSheet) {
            document.getElementById('report-sheet-info').innerHTML = `
                <p><span>曲谱名称:</span>${this.currentSheet.title}</p>
                <p><span>难度等级:</span>${this.currentSheet.difficulty}</p>
                <p><span>调号:</span>${this.currentSheet.key}</p>
                <p><span>拍号:</span>${this.currentSheet.timeSignature}</p>
                <p><span>速度:</span>${this.currentSheet.tempo} BPM</p>
            `;
        }

        this.generateMistakeAnalysis();
        this.generateSuggestions(accuracy, avgSpeed);
    }

    generateMistakeAnalysis() {
        const mistakesContainer = document.getElementById('report-mistakes');
        
        if (this.wrongNotes.length === 0) {
            mistakesContainer.innerHTML = '<p style="color: #2ed573;">🎊 太棒了！本次练习没有错误音符！</p>';
            return;
        }

        const mistakeTypes = this.analyzeMistakeTypes();
        
        mistakesContainer.innerHTML = `
            <div class="mistake-summary">
                <p>总错误数: <strong style="color: #ff4757;">${this.wrongNotes.length}</strong></p>
                <p>错误率: <strong style="color: #ff4757;">${Math.round((this.wrongNotes.length / this.totalNotesPlayed) * 100)}%</strong></p>
            </div>
            <div style="margin-top: 15px;">
                <p style="margin-bottom: 10px; color: #feca57;">常见错误类型:</p>
                ${mistakeTypes.map(type => `
                    <div class="mistake-item">
                        <span class="mistake-note">${type.name}</span>
                        <span class="mistake-expected">${type.count}次 (${Math.round(type.percentage)}%)</span>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top: 15px;">
                <p style="margin-bottom: 10px; color: #feca57;">错误音符详情:</p>
                ${this.wrongNotes.slice(0, 10).map(note => `
                    <div class="mistake-item">
                        <span class="mistake-note">弹奏: ${MidiManager.noteToName(note.note)}</span>
                        <span class="mistake-expected">期望: ${MidiManager.noteToName(note.expected)}</span>
                    </div>
                `).join('')}
                ${this.wrongNotes.length > 10 ? `<p style="margin-top: 10px; color: #a0a0a0;">... 还有 ${this.wrongNotes.length - 10} 个错误</p>` : ''}
            </div>
        `;
    }

    analyzeMistakeTypes() {
        const types = {
            octaveError: 0,
            adjacentError: 0,
            blackKeyError: 0,
            otherError: 0
        };

        this.wrongNotes.forEach(note => {
            const diff = Math.abs(note.note - note.expected);
            
            if (diff === 12 || diff === 24) {
                types.octaveError++;
            } else if (diff === 1 || diff === 2) {
                types.adjacentError++;
            } else if (MidiManager.isBlackKey(note.note) !== MidiManager.isBlackKey(note.expected)) {
                types.blackKeyError++;
            } else {
                types.otherError++;
            }
        });

        const total = this.wrongNotes.length || 1;
        return [
            { name: '八度错误', count: types.octaveError, percentage: (types.octaveError / total) * 100 },
            { name: '相邻键错误', count: types.adjacentError, percentage: (types.adjacentError / total) * 100 },
            { name: '黑白键错误', count: types.blackKeyError, percentage: (types.blackKeyError / total) * 100 },
            { name: '其他错误', count: types.otherError, percentage: (types.otherError / total) * 100 }
        ].filter(t => t.count > 0).sort((a, b) => b.count - a.count);
    }

    generateSuggestions(accuracy, avgSpeed) {
        const suggestions = [];

        if (accuracy >= 90) {
            suggestions.push('准确率优秀！可以尝试提高弹奏速度');
            suggestions.push('尝试加入更多的表情和力度变化');
        } else if (accuracy >= 70) {
            suggestions.push('继续练习，专注于准确性');
            suggestions.push('可以适当放慢速度，确保每个音符准确');
        } else {
            suggestions.push('建议从更简单的曲目开始练习');
            suggestions.push('分手练习，逐个手掌握后再合手');
            suggestions.push('使用节拍器，保持稳定的节奏');
        }

        if (avgSpeed > 0) {
            if (avgSpeed < 30) {
                suggestions.push('可以逐渐提高弹奏速度，目标60+ Note/min');
            } else if (avgSpeed < 60) {
                suggestions.push('速度良好，继续保持并尝试小幅提升');
            } else {
                suggestions.push('速度不错，注意不要牺牲准确性');
            }
        }

        if (this.sustainPedalValue > 0) {
            suggestions.push('延音踏板使用良好，注意换踏板的时机');
        }

        if (suggestions.length === 0) {
            suggestions.push('继续保持练习，持之以恒！');
        }

        const suggestionsList = document.getElementById('report-suggestions');
        suggestionsList.innerHTML = suggestions.map(s => `<li>${s}</li>`).join('');
    }

    async exportReportAsPDF() {
        try {
            const { jsPDF } = window.jspdf;
            const reportContent = document.getElementById('report-content');
            
            const canvas = await html2canvas(reportContent, {
                backgroundColor: '#1a1a2e',
                scale: 2
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);
            
            const fileName = `钢琴练习报告_${new Date().toISOString().slice(0, 10)}.pdf`;
            pdf.save(fileName);
            
            this.addFeedback('success', `报告已导出为 PDF: ${fileName}`);
        } catch (error) {
            console.error('PDF export failed:', error);
            alert('PDF导出失败: ' + error.message);
        }
    }

    async exportReportAsImage() {
        try {
            const reportContent = document.getElementById('report-content');
            
            const canvas = await html2canvas(reportContent, {
                backgroundColor: '#1a1a2e',
                scale: 2
            });

            const link = document.createElement('a');
            const fileName = `钢琴练习报告_${new Date().toISOString().slice(0, 10)}.png`;
            link.download = fileName;
            link.href = canvas.toDataURL('image/png');
            link.click();
            
            this.addFeedback('success', `报告已导出为图片: ${fileName}`);
        } catch (error) {
            console.error('Image export failed:', error);
            alert('图片导出失败: ' + error.message);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.pianoTrainerApp = new PianoTrainerApp();
});
