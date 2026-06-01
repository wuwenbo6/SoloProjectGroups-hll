class H264Player {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.decoder = null;
        this.width = 0;
        this.height = 0;
        this.configured = false;
        this.annexbFrames = [];
        this.pendingFrames = [];
        this.ptsCounter = 0;

        this.initDecoder();
    }

    initDecoder() {
        if (typeof VideoDecoder === 'undefined') {
            console.error('浏览器不支持WebCodecs API (VideoDecoder)');
            console.error('请使用 Chrome 94+, Edge 94+ 或 Safari 15.4+');
            return;
        }

        this.decoder = new VideoDecoder({
            output: (videoFrame) => {
                this.onFrameDecoded(videoFrame);
            },
            error: (error) => {
                console.error('VideoDecoder错误:', error);
            }
        });

        console.log('WebCodecs VideoDecoder初始化成功');
    }

    configure(width, height) {
        if (this.decoder.state === 'closed') {
            this.decoder = new VideoDecoder({
                output: (videoFrame) => {
                    this.onFrameDecoded(videoFrame);
                },
                error: (error) => {
                    console.error('VideoDecoder错误:', error);
                }
            });
        }

        const config = {
            codec: 'avc1.42E01E',
            codedWidth: width,
            codedHeight: height
        };

        if (VideoDecoder.isConfigSupported) {
            VideoDecoder.isConfigSupported(config).then((supported) => {
                if (supported.supported) {
                    this.decoder.configure(config);
                    this.width = width;
                    this.height = height;
                    this.configured = true;
                    console.log(`VideoDecoder配置成功: ${width}x${height}`);
                    this.flushPendingFrames();
                } else {
                    console.error('VideoDecoder配置不支持');
                }
            }).catch((err) => {
                console.error('检查配置支持失败:', err);
            });
        } else {
            this.decoder.configure(config);
            this.width = width;
            this.height = height;
            this.configured = true;
            console.log(`VideoDecoder配置成功: ${width}x${height}`);
            this.flushPendingFrames();
        }
    }

    parseNalu(data) {
        const naluStartCodes = [
            [0, 0, 0, 1],
            [0, 0, 1]
        ];

        const findStartCode = (buffer, offset) => {
            for (let i = offset; i < buffer.length - 3; i++) {
                if (buffer[i] === 0 && buffer[i + 1] === 0) {
                    if (buffer[i + 2] === 0 && buffer[i + 3] === 1) {
                        return { start: i, length: 4 };
                    }
                    if (buffer[i + 2] === 1) {
                        return { start: i, length: 3 };
                    }
                }
            }
            return null;
        };

        const nalus = [];
        let offset = 0;

        while (offset < data.length) {
            const startCode = findStartCode(data, offset);
            if (!startCode) break;

            const naluStart = startCode.start + startCode.length;

            let nextStartCode = findStartCode(data, naluStart);
            let naluEnd;
            if (nextStartCode) {
                naluEnd = nextStartCode.start;
            } else {
                naluEnd = data.length;
            }

            const naluType = (data[naluStart] & 0x1F);
            nalus.push({
                type: naluType,
                data: data.slice(naluStart, naluEnd)
            });

            offset = naluEnd;
        }

        return nalus;
    }

    feed(base64Data) {
        try {
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            this.decode(bytes);
        } catch (e) {
            console.error('数据处理错误:', e);
        }
    }

    decode(data) {
        if (!this.decoder || this.decoder.state === 'closed') return;

        const nalus = this.parseNalu(data);
        if (nalus.length === 0) return;

        let hasSPS = false;
        let hasPPS = false;
        let width = 0;
        let height = 0;

        for (const nalu of nalus) {
            if (nalu.type === 7) {
                hasSPS = true;
                const spsInfo = this.parseSPS(nalu.data);
                if (spsInfo) {
                    width = spsInfo.width;
                    height = spsInfo.height;
                }
            } else if (nalu.type === 8) {
                hasPPS = true;
            }
        }

        if (hasSPS && hasPPS && width > 0 && height > 0) {
            this.configure(width, height);
        }

        if (nalus.length > 0) {
            if (!this.configured) {
                this.pendingFrames.push(data);
                return;
            }

            this.submitForDecoding(data);
        }
    }

    parseSPS(data) {
        try {
            const byteOffset = 1;
            const bitOffset = 0;
            const profileIdc = data[1];
            const levelIdc = data[3];

            const bitReader = new BitReader(data, byteOffset, bitOffset);
            const seqParameterSetId = bitReader.readUE();

            let picWidthInMbsMinus1 = 0;
            let picHeightInMapUnitsMinus1 = 0;
            let frameMbsOnlyFlag = 1;

            if (profileIdc === 100 || profileIdc === 110 ||
                profileIdc === 122 || profileIdc === 244 ||
                profileIdc === 44 || profileIdc === 83 ||
                profileIdc === 86 || profileIdc === 118 ||
                profileIdc === 128 || profileIdc === 138 ||
                profileIdc === 139 || profileIdc === 134 ||
                profileIdc === 135) {

                const chromaFormatIdc = bitReader.readUE();
                if (chromaFormatIdc === 3) {
                    bitReader.readBits(1);
                }
                bitReader.readUE();
                bitReader.readUE();
                bitReader.readBits(1);

                if (bitReader.readBits(1)) {
                    const scalingListCount = (chromaFormatIdc !== 3) ? 8 : 12;
                    for (let i = 0; i < scalingListCount; i++) {
                        if (bitReader.readBits(1)) {
                            if (i < 6) {
                                this.skipScalingList(bitReader, 16);
                            } else {
                                this.skipScalingList(bitReader, 64);
                            }
                        }
                    }
                }
            }

            picWidthInMbsMinus1 = bitReader.readUE();
            picHeightInMapUnitsMinus1 = bitReader.readUE();

            frameMbsOnlyFlag = bitReader.readBits(1);
            if (!frameMbsOnlyFlag) {
                bitReader.readBits(1);
            }
            bitReader.readBits(1);

            const width = (picWidthInMbsMinus1 + 1) * 16;
            const height = (2 - frameMbsOnlyFlag) * (picHeightInMapUnitsMinus1 + 1) * 16;

            return { width, height, profileIdc, levelIdc };
        } catch (e) {
            console.error('SPS解析错误:', e);
            return null;
        }
    }

    skipScalingList(bitReader, size) {
        let lastScale = 8;
        let nextScale = 8;
        for (let i = 0; i < size; i++) {
            if (nextScale !== 0) {
                const delta = bitReader.readSE();
                nextScale = (lastScale + delta + 256) % 256;
            }
            if (nextScale !== 0) {
                lastScale = nextScale;
            }
        }
    }

    submitForDecoding(data) {
        try {
            const chunk = new EncodedVideoChunk({
                type: this.isKeyFrame(data) ? 'key' : 'delta',
                timestamp: this.ptsCounter * 33333,
                data: data
            });

            this.ptsCounter++;
            this.decoder.decode(chunk);
        } catch (e) {
            console.error('提交解码失败:', e);
        }
    }

    isKeyFrame(data) {
        const nalus = this.parseNalu(data);
        for (const nalu of nalus) {
            if (nalu.type === 5) return true;
        }
        return false;
    }

    flushPendingFrames() {
        while (this.pendingFrames.length > 0 && this.configured) {
            const data = this.pendingFrames.shift();
            this.submitForDecoding(data);
        }
    }

    onFrameDecoded(videoFrame) {
        if (videoFrame.codedWidth !== this.width || videoFrame.codedHeight !== this.height) {
            this.width = videoFrame.codedWidth;
            this.height = videoFrame.codedHeight;
            this.canvas.width = this.width;
            this.canvas.height = this.height;
        }

        this.ctx.drawImage(videoFrame, 0, 0, this.width, this.height);
        videoFrame.close();
    }

    reset() {
        if (this.decoder) {
            this.decoder.reset();
        }
        this.configured = false;
        this.pendingFrames = [];
        this.annexbFrames = [];
    }
}

class BitReader {
    constructor(data, byteOffset = 0, bitOffset = 0) {
        this.data = data;
        this.byteOffset = byteOffset;
        this.bitOffset = bitOffset;
    }

    readBits(numBits) {
        let value = 0;
        for (let i = 0; i < numBits; i++) {
            value = (value << 1) | this.readBit();
        }
        return value;
    }

    readBit() {
        const byte = this.data[this.byteOffset];
        const bit = (byte >> (7 - this.bitOffset)) & 1;

        this.bitOffset++;
        if (this.bitOffset === 8) {
            this.bitOffset = 0;
            this.byteOffset++;
        }

        return bit;
    }

    readUE() {
        let leadingZeros = 0;
        while (!this.readBit()) {
            leadingZeros++;
        }

        if (leadingZeros === 0) return 0;

        let value = 1;
        for (let i = 0; i < leadingZeros; i++) {
            value = (value << 1) | this.readBit();
        }

        return value - 1;
    }

    readSE() {
        const value = this.readUE();
        if (value & 1) {
            return (value + 1) / 2;
        } else {
            return -value / 2;
        }
    }
}

class WaypointManager {
    constructor(map, droneController) {
        this.map = map;
        this.droneController = droneController;
        this.waypoints = [];
        this.markers = [];
        this.polyline = null;
        this.currentMission = null;
        this.missionPaused = false;

        this.initMap();
        this.initEventListeners();
    }

    initMap() {
        this.map.setView([39.9042, 116.4074], 18);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);

        this.map.on('click', (e) => {
            this.addWaypoint(e.latlng);
        });

        this.homeMarker = L.marker([39.9042, 116.4074], {
            icon: L.divIcon({
                className: 'home-marker',
                html: '🏠',
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            })
        }).addTo(this.map);

        this.homeMarker.bindPopup('起飞点');
    }

    initEventListeners() {
        document.getElementById('startMissionBtn').addEventListener('click', () => this.startMission());
        document.getElementById('pauseMissionBtn').addEventListener('click', () => this.pauseMission());
        document.getElementById('stopMissionBtn').addEventListener('click', () => this.stopMission());
        document.getElementById('clearWaypointsBtn').addEventListener('click', () => this.clearWaypoints());
    }

    addWaypoint(latlng) {
        const altitude = parseFloat(document.getElementById('waypointAltitude').value) || 2;
        const speed = parseFloat(document.getElementById('waypointSpeed').value) || 0.5;
        const delay = parseFloat(document.getElementById('waypointDelay').value) || 1;

        const waypoint = {
            id: Date.now(),
            lat: latlng.lat,
            lng: latlng.lng,
            altitude: altitude,
            speed: speed,
            delay: delay,
            index: this.waypoints.length + 1
        };

        this.waypoints.push(waypoint);

        const marker = L.marker([latlng.lat, latlng.lng], {
            icon: L.divIcon({
                className: 'waypoint-marker',
                html: `<div class="wp-marker-content">${waypoint.index}</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            }),
            draggable: true
        }).addTo(this.map);

        marker.on('click', () => this.removeWaypoint(waypoint.id));
        marker.on('dragend', (e) => {
            const newLatLng = e.target.getLatLng();
            waypoint.lat = newLatLng.lat;
            waypoint.lng = newLatLng.lng;
            this.updatePolyline();
            this.updateWaypointList();
        });

        marker.bindPopup(`
            <div class="waypoint-popup">
                <strong>航点 ${waypoint.index}</strong><br>
                纬度: ${waypoint.lat.toFixed(6)}<br>
                经度: ${waypoint.lng.toFixed(6)}<br>
                高度: ${waypoint.altitude}m<br>
                速度: ${waypoint.speed}m/s<br>
                停留: ${waypoint.delay}s<br>
                <small>点击删除，拖拽移动</small>
            </div>
        `);

        this.markers.push(marker);
        this.updatePolyline();
        this.updateWaypointList();
    }

    removeWaypoint(id) {
        const index = this.waypoints.findIndex(w => w.id === id);
        if (index !== -1) {
            this.waypoints.splice(index, 1);
            this.map.removeLayer(this.markers[index]);
            this.markers.splice(index, 1);

            this.waypoints.forEach((wp, i) => {
                wp.index = i + 1;
                this.markers[i].setIcon(L.divIcon({
                    className: 'waypoint-marker',
                    html: `<div class="wp-marker-content">${wp.index}</div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                }));
            });

            this.updatePolyline();
            this.updateWaypointList();
        }
    }

    clearWaypoints() {
        this.waypoints = [];
        this.markers.forEach(marker => this.map.removeLayer(marker));
        this.markers = [];
        if (this.polyline) {
            this.map.removeLayer(this.polyline);
            this.polyline = null;
        }
        this.updateWaypointList();
        this.stopMission();
    }

    updatePolyline() {
        if (this.polyline) {
            this.map.removeLayer(this.polyline);
        }

        if (this.waypoints.length > 0) {
            const homeLatLng = this.homeMarker.getLatLng();
            const latlngs = [[homeLatLng.lat, homeLatLng.lng]];
            this.waypoints.forEach(wp => latlngs.push([wp.lat, wp.lng]));

            this.polyline = L.polyline(latlngs, {
                color: '#00d4ff',
                weight: 3,
                opacity: 0.8,
                dashArray: '10, 10'
            }).addTo(this.map);
        }
    }

    updateWaypointList() {
        const listEl = document.getElementById('waypointList');
        if (this.waypoints.length === 0) {
            listEl.innerHTML = '<p class="empty-hint">暂无航点，请在地图上点击添加</p>';
            return;
        }

        let html = '';
        this.waypoints.forEach((wp, index) => {
            html += `
                <div class="waypoint-item">
                    <span class="wp-index">${wp.index}</span>
                    <div class="wp-info">
                        <span>高度: ${wp.altitude}m</span>
                        <span>速度: ${wp.speed}m/s</span>
                    </div>
                    <button class="wp-delete-btn" onclick="waypointManager.removeWaypoint(${wp.id})">×</button>
                </div>
            `;
        });
        listEl.innerHTML = html;
    }

    async startMission() {
        if (this.waypoints.length === 0) {
            this.droneController.showErrorMessage('请先添加航点');
            return;
        }

        if (this.missionPaused) {
            this.missionPaused = false;
            this.updateMissionStatus('运行中');
            return;
        }

        this.currentMission = {
            waypoints: [...this.waypoints],
            currentIndex: 0,
            paused: false
        };

        this.updateMissionStatus('运行中');
        this.updateMissionProgress();

        this.droneController.sendCommand('takeoff');
        await this.sleep(3000);

        await this.executeMission();
    }

    async executeMission() {
        if (!this.currentMission || this.missionPaused) return;

        while (this.currentMission.currentIndex < this.currentMission.waypoints.length) {
            if (this.missionPaused) {
                await this.sleep(500);
                continue;
            }

            const waypoint = this.currentMission.waypoints[this.currentMission.currentIndex];
            await this.flyToWaypoint(waypoint);

            this.currentMission.currentIndex++;
            this.updateMissionProgress();

            await this.sleep(waypoint.delay * 1000);
        }

        this.updateMissionStatus('完成');
        this.droneController.sendCommand('land');
        this.currentMission = null;
    }

    async flyToWaypoint(waypoint) {
        const homeLatLng = this.homeMarker.getLatLng();
        const currentLat = homeLatLng.lat;
        const currentLng = homeLatLng.lng;

        const targetLat = waypoint.lat;
        const targetLng = waypoint.lng;
        const targetAlt = waypoint.altitude;
        const speed = waypoint.speed;

        const distance = this.calculateDistance(currentLat, currentLng, targetLat, targetLng);
        const estimatedTime = (distance / speed) * 1000;

        const bearing = this.calculateBearing(currentLat, currentLng, targetLat, targetLng);

        const pitch = Math.min(0.5, speed);
        const roll = 0;
        const gaz = 0;
        const yaw = Math.sin(bearing * Math.PI / 180) * 0.5;

        const startTime = Date.now();
        const updateInterval = 100;

        return new Promise((resolve) => {
            const moveInterval = setInterval(() => {
                if (!this.currentMission || this.missionPaused) {
                    clearInterval(moveInterval);
                    resolve();
                    return;
                }

                this.droneController.sendCommand('move', {
                    roll: roll,
                    pitch: pitch,
                    gaz: gaz,
                    yaw: yaw
                });

                if (Date.now() - startTime >= estimatedTime) {
                    clearInterval(moveInterval);
                    this.droneController.sendCommand('hover');
                    resolve();
                }
            }, updateInterval);
        });
    }

    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    calculateBearing(lat1, lng1, lat2, lng2) {
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
        const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
                  Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
        const bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    }

    pauseMission() {
        this.missionPaused = !this.missionPaused;
        this.updateMissionStatus(this.missionPaused ? '暂停' : '运行中');
        this.droneController.sendCommand('hover');
    }

    stopMission() {
        this.currentMission = null;
        this.missionPaused = false;
        this.updateMissionStatus('空闲');
        this.updateMissionProgress();
        this.droneController.sendCommand('hover');
    }

    updateMissionStatus(status) {
        const statusEl = document.getElementById('missionStatus');
        statusEl.textContent = status;
        statusEl.className = `status-${status.toLowerCase()}`;
    }

    updateMissionProgress() {
        const progressEl = document.getElementById('missionProgress');
        if (this.currentMission) {
            progressEl.textContent = `${this.currentMission.currentIndex}/${this.currentMission.waypoints.length}`;
        } else {
            progressEl.textContent = '0/0';
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

class DroneController {
    constructor() {
        this.ws = null;
        this.player = null;
        this.waypointManager = null;
        this.status = 'disconnected';
        this.flying = false;
        this.navData = null;
        this.outdoorMode = false;
        this.flyStartTime = null;
        this.flyTimeInterval = null;
        this.lastCommandReject = null;
        this.batteryVoltage = 0;
        this.batteryPercent = 0;

        this.initElements();
        this.initPlayer();
        this.initWebSocket();
        this.initControls();
        this.initTabs();
        this.initMap();
    }

    initElements() {
        this.canvas = document.getElementById('videoCanvas');
        this.statusEl = document.getElementById('status');
        this.batteryEl = document.getElementById('battery');
        this.batteryPercentEl = document.getElementById('batteryPercent');
        this.altitudeEl = document.getElementById('altitude');
        this.speedEl = document.getElementById('speed');
        this.flyTimeEl = document.getElementById('flyTime');
        this.flyingStatusEl = document.getElementById('flyingStatus');
        this.batteryInfoEl = document.getElementById('batteryInfo');
        this.batteryVoltageEl = document.getElementById('batteryVoltage');
        this.videoOverlay = document.getElementById('videoOverlay');
        this.outdoorModeEl = document.getElementById('outdoorMode');
        this.controlStateEl = document.getElementById('controlState');
        this.errorMessageEl = document.getElementById('errorMessage');

        this.takeoffBtn = document.getElementById('takeoffBtn');
        this.landBtn = document.getElementById('landBtn');
        this.emergencyBtn = document.getElementById('emergencyBtn');
        this.calibrateBtn = document.getElementById('calibrateBtn');

        this.rollValueEl = document.getElementById('rollValue');
        this.pitchValueEl = document.getElementById('pitchValue');
        this.gazValueEl = document.getElementById('gazValue');
        this.yawValueEl = document.getElementById('yawValue');

        this.rollSlider = document.getElementById('roll');
        this.pitchSlider = document.getElementById('pitch');
        this.gazSlider = document.getElementById('gaz');
        this.yawSlider = document.getElementById('yaw');

        this.resetBtn = document.getElementById('resetBtn');
    }

    initPlayer() {
        this.player = new H264Player(this.canvas);
    }

    initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.status = 'connected';
            this.updateStatus();
            console.log('WebSocket已连接');
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleMessage(msg);
            } catch (e) {
                console.error('消息解析错误:', e);
            }
        };

        this.ws.onclose = () => {
            this.status = 'disconnected';
            this.updateStatus();
            console.log('WebSocket已断开');
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket错误:', error);
        };
    }

    handleMessage(msg) {
        switch (msg.type) {
            case 'video':
                if (this.videoOverlay) {
                    this.videoOverlay.style.display = 'none';
                }
                this.player.feed(msg.data);
                break;
            case 'nav':
                this.handleNavData(msg.data);
                break;
            case 'status':
                if (msg.data.connected) {
                    console.log('服务器已连接到无人机');
                }
                break;
            case 'command_rejected':
                this.handleCommandRejected(msg.data);
                break;
        }
    }

    handleNavData(data) {
        this.navData = data;
        this.flying = data.flying;
        this.outdoorMode = data.outdoorMode || false;

        if (data.batteryVoltage) {
            this.batteryVoltage = data.batteryVoltage;
            this.batteryPercent = data.batteryPercent || this.estimateBatteryPercent(data.batteryVoltage);

            if (this.batteryVoltageEl) {
                this.batteryVoltageEl.textContent = this.batteryVoltage.toFixed(2) + ' V';
            }
            if (this.batteryPercentEl) {
                this.batteryPercentEl.textContent = this.batteryPercent.toFixed(0) + '%';
            }
        }

        if (data.batteryTooLow) {
            this.batteryEl.textContent = 'LOW';
            this.batteryEl.className = 'battery-low';
            this.batteryInfoEl.textContent = '低电量';
        } else {
            this.batteryEl.textContent = 'OK';
            this.batteryEl.className = 'battery-ok';
            this.batteryInfoEl.textContent = '正常';
        }

        this.flyingStatusEl.textContent = this.flying ? '飞行中' : '地面';

        if (this.outdoorModeEl) {
            this.outdoorModeEl.textContent = this.outdoorMode ? '是' : '否';
            this.outdoorModeEl.className = this.outdoorMode ? 'status-connected' : 'battery-low';
        }

        if (this.controlStateEl && data.controlStateName) {
            this.controlStateEl.textContent = data.controlStateName;
        }

        this.updateStatus();
    }

    estimateBatteryPercent(voltage) {
        const maxVoltage = 4.2;
        const minVoltage = 3.2;
        return Math.max(0, Math.min(100, ((voltage - minVoltage) / (maxVoltage - minVoltage)) * 100));
    }

    handleCommandRejected(data) {
        this.lastCommandReject = data;
        console.warn(`命令被拒绝: ${data.action} - ${data.reason}`);

        if (this.errorMessageEl) {
            this.errorMessageEl.textContent = `命令被拒绝: ${data.reason}`;
            this.errorMessageEl.style.display = 'block';

            setTimeout(() => {
                if (this.errorMessageEl) {
                    this.errorMessageEl.style.display = 'none';
                }
            }, 3000);
        }

        if (data.action === 'takeoff') {
            this.flying = false;
            this.stopFlyTimeCounter();
            this.updateStatus();
        }
    }

    initControls() {
        this.takeoffBtn.addEventListener('click', () => this.takeoff());
        this.landBtn.addEventListener('click', () => this.land());
        this.emergencyBtn.addEventListener('click', () => this.emergency());
        this.calibrateBtn.addEventListener('click', () => this.calibrate());
        this.resetBtn.addEventListener('click', () => this.resetControls());

        const sendMove = () => {
            const roll = parseFloat(this.rollSlider.value);
            const pitch = parseFloat(this.pitchSlider.value);
            const gaz = parseFloat(this.gazSlider.value);
            const yaw = parseFloat(this.yawSlider.value);

            this.rollValueEl.textContent = roll.toFixed(2);
            this.pitchValueEl.textContent = pitch.toFixed(2);
            this.gazValueEl.textContent = gaz.toFixed(2);
            this.yawValueEl.textContent = yaw.toFixed(2);

            this.sendMove(roll, pitch, gaz, yaw);
        };

        this.rollSlider.addEventListener('input', sendMove);
        this.pitchSlider.addEventListener('input', sendMove);
        this.gazSlider.addEventListener('input', sendMove);
        this.yawSlider.addEventListener('input', sendMove);

        this.initKeyboardControls();
    }

    initKeyboardControls() {
        const keyState = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            w: false,
            s: false,
            a: false,
            d: false
        };

        document.addEventListener('keydown', (e) => {
            if (keyState.hasOwnProperty(e.key)) {
                keyState[e.key] = true;
                e.preventDefault();
            }
            if (e.key === ' ') {
                e.preventDefault();
                if (this.flying) {
                    this.land();
                } else {
                    this.takeoff();
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (keyState.hasOwnProperty(e.key)) {
                keyState[e.key] = false;
                e.preventDefault();
            }
        });

        const updateFromKeyboard = () => {
            let roll = parseFloat(this.rollSlider.value);
            let pitch = parseFloat(this.pitchSlider.value);
            let gaz = parseFloat(this.gazSlider.value);
            let yaw = parseFloat(this.yawSlider.value);

            if (keyState.ArrowLeft) roll = -0.5;
            else if (keyState.ArrowRight) roll = 0.5;
            else roll = 0;

            if (keyState.ArrowUp) pitch = -0.5;
            else if (keyState.ArrowDown) pitch = 0.5;
            else pitch = 0;

            if (keyState.w) gaz = 0.5;
            else if (keyState.s) gaz = -0.5;
            else gaz = 0;

            if (keyState.a) yaw = -0.5;
            else if (keyState.d) yaw = 0.5;
            else yaw = 0;

            this.rollSlider.value = roll;
            this.pitchSlider.value = pitch;
            this.gazSlider.value = gaz;
            this.yawSlider.value = yaw;

            this.rollValueEl.textContent = roll.toFixed(2);
            this.pitchValueEl.textContent = pitch.toFixed(2);
            this.gazValueEl.textContent = gaz.toFixed(2);
            this.yawValueEl.textContent = yaw.toFixed(2);

            this.sendMove(roll, pitch, gaz, yaw);
        };

        setInterval(updateFromKeyboard, 100);
    }

    sendCommand(action, params = {}) {
        if (!this.canSendCommand(action)) {
            console.warn(`命令 ${action} 被拒绝：本地前置检查失败`);
            return false;
        }

        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action, ...params }));
            return true;
        }
        return false;
    }

    canSendCommand(action) {
        if (this.ws.readyState !== WebSocket.OPEN) {
            console.warn('WebSocket未连接');
            return false;
        }

        if (!this.outdoorMode && this.navData) {
            console.warn(`命令 ${action} 被拒绝：非露天模式`);
            this.showErrorMessage('非露天模式，命令被拒绝');
            return false;
        }

        if (this.navData && this.navData.batteryTooLow) {
            console.warn(`命令 ${action} 被拒绝：电池电量过低`);
            this.showErrorMessage('电池电量过低，命令被拒绝');
            return false;
        }

        if (this.navData && this.navData.angleEmergency) {
            console.warn(`命令 ${action} 被拒绝：角度紧急状态`);
            this.showErrorMessage('角度紧急状态，命令被拒绝');
            return false;
        }

        return true;
    }

    showErrorMessage(message) {
        if (this.errorMessageEl) {
            this.errorMessageEl.textContent = message;
            this.errorMessageEl.style.display = 'block';

            setTimeout(() => {
                if (this.errorMessageEl) {
                    this.errorMessageEl.style.display = 'none';
                }
            }, 3000);
        }
    }

    takeoff() {
        this.sendCommand('takeoff');
        this.flying = true;
        this.flyStartTime = Date.now();
        this.startFlyTimeCounter();
        this.updateStatus();
    }

    land() {
        this.sendCommand('land');
        this.flying = false;
        this.stopFlyTimeCounter();
        this.updateStatus();
    }

    emergency() {
        this.sendCommand('emergency');
        this.flying = false;
        this.stopFlyTimeCounter();
        this.updateStatus();
    }

    calibrate() {
        this.sendCommand('calibrate');
    }

    sendMove(roll, pitch, gaz, yaw) {
        this.sendCommand('move', { roll, pitch, gaz, yaw });
    }

    resetControls() {
        this.rollSlider.value = 0;
        this.pitchSlider.value = 0;
        this.gazSlider.value = 0;
        this.yawSlider.value = 0;

        this.rollValueEl.textContent = '0.00';
        this.pitchValueEl.textContent = '0.00';
        this.gazValueEl.textContent = '0.00';
        this.yawValueEl.textContent = '0.00';

        this.sendCommand('hover');
    }

    startFlyTimeCounter() {
        if (this.flyTimeInterval) return;

        this.flyTimeInterval = setInterval(() => {
            if (this.flyStartTime) {
                const elapsed = Math.floor((Date.now() - this.flyStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                this.flyTimeEl.textContent =
                    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    stopFlyTimeCounter() {
        if (this.flyTimeInterval) {
            clearInterval(this.flyTimeInterval);
            this.flyTimeInterval = null;
        }
    }

    updateStatus() {
        if (this.status === 'connected') {
            this.statusEl.textContent = this.flying ? '飞行中' : '已连接';
            this.statusEl.className = this.flying ? 'status-flying' : 'status-connected';
        } else {
            this.statusEl.textContent = '已断开';
            this.statusEl.className = 'status-disconnected';
        }
    }

    initTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;

                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                btn.classList.add('active');
                document.getElementById(`tab-${tabId}`).classList.add('active');

                if (tabId === 'waypoints' && this.waypointManager) {
                    setTimeout(() => {
                        this.waypointManager.map.invalidateSize();
                    }, 100);
                }
            });
        });
    }

    initMap() {
        setTimeout(() => {
            const map = L.map('map', {
                center: [39.9042, 116.4074],
                zoom: 18
            });

            this.waypointManager = new WaypointManager(map, this);
            window.waypointManager = this.waypointManager;
        }, 500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.drone = new DroneController();
});
