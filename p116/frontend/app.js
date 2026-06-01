class SatelliteTracker {
    constructor() {
        this.viewer = null;
        this.selectedSatellite = null;
        this.trackedEntities = [];
        this.trackingInterval = null;
        this.isTracking = false;
        this.satelliteEntity = null;
        this.sampledPosition = null;
        this.lastUpdateTime = null;
        this.init();
    }

    init() {
        this.initCesium();
        this.bindEvents();
        this.loadSatelliteList();
        this.updateCollisionDropdowns();
    }

    initCesium() {
        Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWE1OWUxNy1mMWZiLTQzYjYtYTQ0OS1kMWFjYmFkNjc5YzciLCJpZCI6OTYyMCwic2NvcGVzIjpbImFzciIsImdjIl0sImlhdCI6MTUzNDc0NTY0MX0.Fx2Zgu7dXHnRrK3qfJtqG9nKqf0p8bK9bKp9bKp9bK';
        
        this.viewer = new Cesium.Viewer('cesiumContainer', {
            animation: true,
            timeline: true,
            baseLayerPicker: true,
            geocoder: true,
            homeButton: true,
            sceneModePicker: true,
            navigationHelpButton: false,
            fullscreenButton: true,
            imageryProvider: new Cesium.OpenStreetMapImageryProvider({
                url: 'https://a.tile.openstreetmap.org/'
            })
        });

        this.viewer.scene.globe.enableLighting = true;
        this.viewer.clock.shouldAnimate = true;
    }

    bindEvents() {
        document.getElementById('loadSampleBtn').addEventListener('click', () => this.loadSampleData());
        document.getElementById('addTleBtn').addEventListener('click', () => this.addTle());
        document.getElementById('showOrbitBtn').addEventListener('click', () => this.showOrbit());
        document.getElementById('showGroundTrackBtn').addEventListener('click', () => this.showGroundTrack());
        document.getElementById('toggleTrackBtn').addEventListener('click', () => this.toggleTracking());
        document.getElementById('predictBtn').addEventListener('click', () => this.predictPasses());
        document.getElementById('exportKmlBtn').addEventListener('click', () => this.exportKml());
        document.getElementById('showStarlinkBtn').addEventListener('click', () => this.showConstellation('starlink'));
        document.getElementById('showIssBtn').addEventListener('click', () => this.showConstellation('iss'));
        document.getElementById('showGpsBtn').addEventListener('click', () => this.showConstellation('gps'));
        document.getElementById('checkCollisionBtn').addEventListener('click', () => this.checkCollision());
    }

    async loadSatelliteList() {
        try {
            const response = await fetch('/api/tles');
            const satellites = await response.json();
            this.renderSatelliteList(satellites);
            this.updateCollisionDropdowns();
        } catch (error) {
            console.error('Failed to load satellites:', error);
        }
    }

    renderSatelliteList(satellites) {
        const container = document.getElementById('satelliteList');
        container.innerHTML = '';

        if (satellites.length === 0) {
            container.innerHTML = '<div style="color: rgba(255,255,255,0.4); text-align: center; padding: 20px;">暂无卫星数据</div>';
            return;
        }

        satellites.forEach(sat => {
            const item = document.createElement('div');
            item.className = 'satellite-item';
            if (this.selectedSatellite && this.selectedSatellite.norad_id === sat.norad_id) {
                item.classList.add('active');
            }
            item.innerHTML = `
                <div class="name">${sat.name}</div>
                <div class="norad">NORAD: ${sat.norad_id}</div>
                ${sat.description ? `<div class="desc">${sat.description}</div>` : ''}
            `;
            item.addEventListener('click', () => this.selectSatellite(sat));
            container.appendChild(item);
        });
    }

    async selectSatellite(satellite) {
        this.selectedSatellite = satellite;
        
        document.querySelectorAll('.satellite-item').forEach(item => item.classList.remove('active'));
        event.currentTarget.classList.add('active');

        document.getElementById('satelliteInfoSection').style.display = 'block';

        try {
            const response = await fetch(`/api/satellite/${satellite.norad_id}/info`);
            const info = await response.json();
            await this.renderSatelliteInfo(info);
        } catch (error) {
            console.error('Failed to load satellite info:', error);
        }

        this.loadSatelliteList();
    }

    async renderSatelliteInfo(info) {
        const container = document.getElementById('satelliteInfo');
        const pos = info.current_position || {};
        
        let error24h = null;
        try {
            const errorResponse = await fetch(`/api/satellite/${info.norad_id}/prediction-error?hours=24`);
            const errorData = await errorResponse.json();
            error24h = errorData.prediction_error;
        } catch(e) {
            console.log('Could not fetch prediction error');
        }
        
        let errorInfo = '';
        if (error24h) {
            const color = this.getConfidenceColor(error24h.confidence);
            const label = this.getConfidenceLabel(error24h.confidence);
            errorInfo = `
            <div class="info-row">
                <span class="label">24h预报置信度</span>
                <span class="value" style="color: ${color};">${label} (${(error24h.confidence * 100).toFixed(0)}%)</span>
            </div>
            <div class="info-row">
                <span class="label">24h位置误差</span>
                <span class="value">±${error24h.total_error_km.toFixed(1)} km</span>
            </div>
            `;
        }
        
        container.innerHTML = `
            <div class="info-row">
                <span class="label">名称</span>
                <span class="value">${info.name}</span>
            </div>
            <div class="info-row">
                <span class="label">NORAD ID</span>
                <span class="value">${info.norad_id}</span>
            </div>
            <div class="info-row">
                <span class="label">轨道倾角</span>
                <span class="value">${info.inclination.toFixed(2)}°</span>
            </div>
            <div class="info-row">
                <span class="label">升交点赤经</span>
                <span class="value">${info.raan.toFixed(2)}°</span>
            </div>
            <div class="info-row">
                <span class="label">偏心率</span>
                <span class="value">${info.eccentricity.toFixed(6)}</span>
            </div>
            <div class="info-row">
                <span class="label">轨道周期</span>
                <span class="value">${(info.period / 60).toFixed(2)} 分钟</span>
            </div>
            ${pos.latitude !== undefined ? `
            <div class="info-row">
                <span class="label">当前纬度</span>
                <span class="value">${pos.latitude.toFixed(4)}°</span>
            </div>
            <div class="info-row">
                <span class="label">当前经度</span>
                <span class="value">${pos.longitude.toFixed(4)}°</span>
            </div>
            <div class="info-row">
                <span class="label">当前高度</span>
                <span class="value">${pos.altitude.toFixed(2)} km</span>
            </div>
            ` : ''}
            ${errorInfo}
        `;
    }

    async loadSampleData() {
        try {
            const btn = document.getElementById('loadSampleBtn');
            btn.innerHTML = '<span class="loading"></span> 加载中...';
            
            const response = await fetch('/api/init/sample', { method: 'POST' });
            const result = await response.json();
            
            alert(result.message);
            this.loadSatelliteList();
        } catch (error) {
            alert('加载示例数据失败');
        } finally {
            document.getElementById('loadSampleBtn').innerHTML = '加载示例卫星';
        }
    }

    async addTle() {
        const noradId = document.getElementById('noradId').value.trim();
        const name = document.getElementById('satName').value.trim();
        const line1 = document.getElementById('tleLine1').value.trim();
        const line2 = document.getElementById('tleLine2').value.trim();

        if (!noradId || !name || !line1 || !line2) {
            alert('请填写所有字段');
            return;
        }

        try {
            const response = await fetch('/api/tles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ norad_id: noradId, name, line1, line2 })
            });
            
            const result = await response.json();
            alert(result.message);
            
            document.getElementById('noradId').value = '';
            document.getElementById('satName').value = '';
            document.getElementById('tleLine1').value = '';
            document.getElementById('tleLine2').value = '';
            
            this.loadSatelliteList();
        } catch (error) {
            alert('添加TLE失败');
        }
    }

    clearTrackedEntities() {
        this.trackedEntities.forEach(entity => {
            this.viewer.entities.remove(entity);
        });
        this.trackedEntities = [];
        if (this.satelliteEntity) {
            this.viewer.entities.remove(this.satelliteEntity);
            this.satelliteEntity = null;
        }
        this.sampledPosition = null;
    }

    createOrGetSatelliteEntity(name) {
        if (this.satelliteEntity) {
            return this.satelliteEntity;
        }

        this.sampledPosition = new Cesium.SampledPositionProperty();
        this.sampledPosition.setInterpolationOptions({
            interpolationDegree: 2,
            interpolationAlgorithm: Cesium.LagrangePolynomialApproximation
        });

        this.satelliteEntity = this.viewer.entities.add({
            name: name,
            position: this.sampledPosition,
            point: {
                pixelSize: 12,
                color: Cesium.Color.RED,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 3
            },
            label: {
                text: name,
                font: 'bold 14pt sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new Cesium.Cartesian2(0, -35)
            },
            path: {
                show: true,
                leadTime: 0,
                trailTime: 60,
                width: 3,
                resolution: 1,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.4,
                    color: Cesium.Color.CYAN
                })
            }
        });

        return this.satelliteEntity;
    }

    async showOrbit() {
        if (!this.selectedSatellite) return;

        this.clearTrackedEntities();

        try {
            const response = await fetch(`/api/satellite/${this.selectedSatellite.norad_id}/orbit?points=360`);
            const data = await response.json();
            
            const positions = data.orbit_path.map(p => 
                Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude, p.altitude * 1000)
            );

            const orbitEntity = this.viewer.entities.add({
                name: `${data.name} 轨道`,
                polyline: {
                    positions: positions,
                    width: 2,
                    material: Cesium.Color.RED.withAlpha(0.7),
                    arcType: Cesium.ArcType.NONE
                }
            });

            this.trackedEntities.push(orbitEntity);

            this.createOrGetSatelliteEntity(data.name);
            await this.updateSampledPosition(data.name);

            this.viewer.zoomTo(orbitEntity);
        } catch (error) {
            console.error('Failed to show orbit:', error);
        }
    }

    async showGroundTrack() {
        if (!this.selectedSatellite) return;

        this.clearTrackedEntities();

        try {
            const response = await fetch(`/api/satellite/${this.selectedSatellite.norad_id}/groundtrack?duration=180&interval=30`);
            const data = await response.json();
            
            const positions = data.ground_track.map(p => 
                Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude, 10000)
            );

            const groundTrackEntity = this.viewer.entities.add({
                name: `${data.name} 地面轨迹`,
                polyline: {
                    positions: positions,
                    width: 3,
                    material: new Cesium.PolylineGlowMaterialProperty({
                        glowPower: 0.3,
                        color: Cesium.Color.CYAN
                    })
                }
            });

            this.trackedEntities.push(groundTrackEntity);

            data.ground_track.forEach((p, i) => {
                if (i % 10 === 0) {
                    const point = this.viewer.entities.add({
                        position: Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude, 20000),
                        point: {
                            pixelSize: 5,
                            color: Cesium.Color.CYAN.withAlpha(0.8)
                        }
                    });
                    this.trackedEntities.push(point);
                }
            });

            this.createOrGetSatelliteEntity(data.name);
            await this.updateSampledPosition(data.name);
            this.viewer.zoomTo(groundTrackEntity);
        } catch (error) {
            console.error('Failed to show ground track:', error);
        }
    }

    async updateSampledPosition(name) {
        if (!this.selectedSatellite || !this.sampledPosition) return;

// #region debug-point H4:smooth-update
fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"tle-orbit-smoothing-bug",runId:"post-fix",hypothesisId:"H4",location:"app.js:310",msg:"[DEBUG] updateSampledPosition called",data:{noradId:this.selectedSatellite.norad_id,sampleCount:this.sampledPosition.samples.length},ts:Date.now()})}).catch(()=>{});
// #endregion

        try {
            const now = Cesium.JulianDate.now();
            const positionsAhead = 30;
            const intervalSeconds = 2;

            for (let i = 0; i < positionsAhead; i++) {
                const time = Cesium.JulianDate.addSeconds(now, i * intervalSeconds, new Cesium.JulianDate());
                const jsDate = Cesium.JulianDate.toDate(time);
                const isoTime = jsDate.toISOString();
                
                const response = await fetch(`/api/satellite/${this.selectedSatellite.norad_id}/position?time=${encodeURIComponent(isoTime)}`);
                const data = await response.json();
                const pos = data.lla;
                
                const cartesian = Cesium.Cartesian3.fromDegrees(pos.longitude, pos.latitude, pos.altitude * 1000);
                this.sampledPosition.addSample(time, cartesian);
            }

            this.lastUpdateTime = new Date();

// #region debug-point H4:smooth-update
fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"tle-orbit-smoothing-bug",runId:"post-fix",hypothesisId:"H4",location:"app.js:335",msg:"[DEBUG] Sampled positions added",data:{count:positionsAhead,totalSamples:this.sampledPosition.samples.length},ts:Date.now()})}).catch(()=>{});
// #endregion

        } catch (error) {
            console.error('Failed to update sampled position:', error);
        }
    }

    async updateSatellitePosition() {
        if (!this.selectedSatellite) return;

        try {
            this.createOrGetSatelliteEntity(this.selectedSatellite.name);
            await this.updateSampledPosition(this.selectedSatellite.name);
        } catch (error) {
            console.error('Failed to update satellite position:', error);
        }
    }

    toggleTracking() {
        if (!this.selectedSatellite) return;

        this.isTracking = !this.isTracking;
        const btn = document.getElementById('toggleTrackBtn');

        if (this.isTracking) {
            btn.innerHTML = '停止跟踪';
            btn.classList.remove('btn-info');
            btn.classList.add('btn-danger');
            
            this.showOrbit();
            
            this.trackingInterval = setInterval(() => {
                this.updateSatellitePositionRealtime();
            }, 25000);
        } else {
            btn.innerHTML = '实时跟踪';
            btn.classList.remove('btn-danger');
            btn.classList.add('btn-info');
            
            if (this.trackingInterval) {
                clearInterval(this.trackingInterval);
                this.trackingInterval = null;
            }
        }
    }

    async updateSatellitePositionRealtime() {
        if (!this.selectedSatellite || !this.isTracking) return;

// #region debug-point H1:smooth-realtime
fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"tle-orbit-smoothing-bug",runId:"post-fix",hypothesisId:"H1",location:"app.js:380",msg:"[DEBUG] updateSatellitePositionRealtime (smooth mode)",data:{hasEntity:!!this.satelliteEntity,hasSampled:!!this.sampledPosition},ts:Date.now()})}).catch(()=>{});
// #endregion

        try {
            this.createOrGetSatelliteEntity(this.selectedSatellite.name);
            
            if (!this.lastUpdateTime || (new Date() - this.lastUpdateTime) > 20000) {
                await this.updateSampledPosition(this.selectedSatellite.name);
            }
        } catch (error) {
            console.error('Failed to update satellite position:', error);
        }
    }

    async predictPasses() {
        if (!this.selectedSatellite) {
            alert('请先选择一颗卫星');
            return;
        }

        const lat = parseFloat(document.getElementById('obsLat').value);
        const lon = parseFloat(document.getElementById('obsLon').value);
        const alt = parseFloat(document.getElementById('obsAlt').value);
        const hours = parseInt(document.getElementById('predictHours').value);
        const minElev = parseFloat(document.getElementById('minElevation').value);

        if (isNaN(lat) || isNaN(lon)) {
            alert('请输入有效的观测点坐标');
            return;
        }

        try {
            const btn = document.getElementById('predictBtn');
            btn.innerHTML = '<span class="loading"></span> 计算中...';

            const response = await fetch(
                `/api/satellite/${this.selectedSatellite.norad_id}/passes?lat=${lat}&lon=${lon}&alt=${alt}&hours=${hours}&min_elev=${minElev}`
            );
            const data = await response.json();
            
            this.renderPasses(data.passes);
            
            this.showObserverPoint(lat, lon, alt);
        } catch (error) {
            alert('预报失败');
            console.error(error);
        } finally {
            document.getElementById('predictBtn').innerHTML = '预报过境';
        }
    }

    getConfidenceColor(confidence) {
        if (confidence >= 0.8) return '#00b894';
        if (confidence >= 0.6) return '#00d9ff';
        if (confidence >= 0.4) return '#fdcb6e';
        return '#e94560';
    }

    getConfidenceLabel(confidence) {
        if (confidence >= 0.8) return '高';
        if (confidence >= 0.6) return '较高';
        if (confidence >= 0.4) return '中等';
        return '低';
    }

    renderPasses(passes) {
        const container = document.getElementById('passesList');
        
        if (passes.length === 0) {
            container.innerHTML = '<div style="color: rgba(255,255,255,0.4); text-align: center; padding: 20px;">预报时段内无过境</div>';
            return;
        }

        container.innerHTML = '';
        passes.slice(0, 10).forEach((pass, index) => {
            const item = document.createElement('div');
            item.className = 'pass-item';
            
            const startTime = new Date(pass.start_time).toLocaleString('zh-CN');
            const duration = (pass.duration / 60).toFixed(1);
            
            let errorInfo = '';
            if (pass.prediction_error) {
                const error = pass.prediction_error;
                const color = this.getConfidenceColor(error.confidence);
                const label = this.getConfidenceLabel(error.confidence);
                errorInfo = `
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 11px; color: rgba(255,255,255,0.5);">预报置信度:</span>
                            <span style="font-weight: 600; color: ${color};">
                                ${label} (${(error.confidence * 100).toFixed(0)}%)
                            </span>
                        </div>
                        <div style="font-size: 10px; color: rgba(255,255,255,0.4); margin-top: 4px;">
                            位置误差: ±${error.total_error_km.toFixed(1)} km | 
                            沿轨: ±${error.along_track_error_km.toFixed(1)} km
                        </div>
                    </div>
                `;
            }
            
            item.innerHTML = `
                <div class="pass-time">过境 #${index + 1}: ${startTime}</div>
                <div class="pass-details">
                    <span>⏱️ ${duration} 分钟</span>
                    <span>📐 ${pass.max_elevation.toFixed(1)}°</span>
                    <span>↗️ ${pass.start_azimuth.toFixed(0)}°</span>
                    <span>↘️ ${pass.end_azimuth.toFixed(0)}°</span>
                </div>
                ${errorInfo}
            `;
            
            item.addEventListener('click', () => this.showPassGroundTrack(pass));
            container.appendChild(item);
        });
    }

    showObserverPoint(lat, lon, alt) {
        const observerEntity = this.viewer.entities.add({
            name: '观测点',
            position: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
            point: {
                pixelSize: 12,
                color: Cesium.Color.GREEN,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2
            },
            label: {
                text: '观测点',
                font: '12pt sans-serif',
                fillColor: Cesium.Color.GREEN,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new Cesium.Cartesian2(0, -25)
            },
            ellipse: {
                semiMinorAxis: 50000,
                semiMajorAxis: 50000,
                height: 1000,
                material: Cesium.Color.GREEN.withAlpha(0.2),
                outline: true,
                outlineColor: Cesium.Color.GREEN
            }
        });

        this.trackedEntities.push(observerEntity);
    }

    showPassGroundTrack(pass) {
        const positions = pass.points.map(p => 
            Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude, 300000)
        );

        const passTrack = this.viewer.entities.add({
            name: '过境轨迹',
            polyline: {
                positions: positions,
                width: 4,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.4,
                    color: Cesium.Color.GOLD
                })
            }
        });

        this.trackedEntities.push(passTrack);

        const maxPos = pass.points.reduce((max, p) => p.elevation > max.elevation ? p : max);
        const maxPoint = this.viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(maxPos.longitude, maxPos.latitude, 400000),
            point: {
                pixelSize: 12,
                color: Cesium.Color.GOLD
            }
        });

        this.trackedEntities.push(maxPoint);
        this.viewer.zoomTo(passTrack);
    }

    async exportKml() {
        if (!this.selectedSatellite) {
            alert('请先选择一颗卫星');
            return;
        }
        
        const duration = 180;
        const interval = 30;
        const noradId = this.selectedSatellite.norad_id;
        
        const url = `/api/export/kml/${noradId}?duration=${duration}&interval=${interval}&orbit=true`;
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${noradId}_orbit.kml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    async showConstellation(name) {
        this.clearTrackedEntities();
        
        try {
            const response = await fetch(`/api/constellation/${name}`);
            const data = await response.json();
            
            const constellationColors = {
                'starlink': Cesium.Color.CYAN,
                'iss': Cesium.Color.YELLOW,
                'gps': Cesium.Color.GREEN
            };
            
            const color = constellationColors[name] || Cesium.Color.WHITE;
            
            const infoDiv = document.getElementById('constellationInfo');
            infoDiv.innerHTML = `<div style="color: rgba(255,255,255,0.7); font-size: 12px;">共找到 ${data.count} 颗卫星</div>`;
            
            for (const sat of data.satellites) {
                try {
                    const orbitResponse = await fetch(`/api/satellite/${sat.norad_id}/orbit?points=180`);
                    const orbitData = await orbitResponse.json();
                    
                    if (orbitData.orbit_path && orbitData.orbit_path.length > 0) {
                        const positions = orbitData.orbit_path.map(p => 
                            Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude, p.altitude * 1000)
                        );
                        
                        const orbitEntity = this.viewer.entities.add({
                            name: sat.name,
                            polyline: {
                                positions: positions,
                                width: 1,
                                material: color.withAlpha(0.5),
                                arcType: Cesium.ArcType.NONE
                            }
                        });
                        
                        this.trackedEntities.push(orbitEntity);
                    }
                } catch (e) {
                    console.log(`Failed to load orbit for ${sat.norad_id}: ${e}`);
                }
            }
            
            if (this.trackedEntities.length > 0) {
                this.viewer.zoomTo(this.trackedEntities[0]);
            }
            
        } catch (error) {
            console.error('Failed to load constellation:', error);
            alert('加载星座数据失败');
        }
    }

    async checkCollision() {
        const satA = document.getElementById('satA').value;
        const satB = document.getElementById('satB').value;
        const hours = parseInt(document.getElementById('collisionHours').value) || 24;
        const threshold = parseFloat(document.getElementById('thresholdKm').value) || 5;
        
        if (!satA || !satB) {
            alert('请选择两颗卫星');
            return;
        }
        
        if (satA === satB) {
            alert('请选择不同的卫星');
            return;
        }
        
        const resultsDiv = document.getElementById('collisionResults');
        resultsDiv.innerHTML = '<div style="color: rgba(255,255,255,0.6);">正在计算...</div>';
        
        try {
            const url = `/api/collision/check?sat_a=${satA}&sat_b=${satB}&hours=${hours}&threshold=${threshold}`;
            const response = await fetch(url);
            const data = await response.json();
            
            this.renderCollisionResults(data);
            
        } catch (error) {
            console.error('Failed to check collision:', error);
            resultsDiv.innerHTML = '<div style="color: #e94560;">检查失败</div>';
        }
    }

    renderCollisionResults(data) {
        const resultsDiv = document.getElementById('collisionResults');
        
        let html = `
            <div style="margin-bottom: 10px; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 4px;">
                <div style="font-size: 12px; color: rgba(255,255,255,0.7);">
                    ${data.satellite_a.name} ↔ ${data.satellite_b.name}
                </div>
                <div style="font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 4px;">
                    最近距离: ${data.summary.min_distance_km.toFixed(2)} km
                </div>
            </div>
        `;
        
        if (data.approaches.total_approaches > 0) {
            html += `<div style="color: #e94560; font-weight: bold; margin-bottom: 10px;">
                ⚠️ 发现 ${data.approaches.total_approaches} 次接近事件
            </div>`;
            
            data.approaches.approaches.forEach((approach, idx) => {
                const startTime = new Date(approach.start_time).toLocaleString('zh-CN');
                html += `
                    <div style="padding: 8px; margin-bottom: 8px; background: rgba(233, 69, 96, 0.2); border-left: 3px solid #e94560; border-radius: 4px;">
                        <div style="font-size: 12px; font-weight: bold;">接近 #${idx + 1}</div>
                        <div style="font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 4px;">
                            开始: ${startTime}
                        </div>
                        <div style="font-size: 11px; color: rgba(255,255,255,0.7);">
                            持续: ${approach.duration_minutes.toFixed(1)} 分钟
                        </div>
                        <div style="font-size: 11px; color: #e94560; font-weight: bold;">
                            最近: ${approach.min_distance_km.toFixed(2)} km
                        </div>
                    </div>
                `;
            });
        } else {
            html += `<div style="color: #00b894; padding: 10px; text-align: center;">
                ✅ 未发现接近事件 (阈值: ${data.approaches.threshold_km} km)
            </div>`;
        }
        
        resultsDiv.innerHTML = html;
    }

    async updateCollisionDropdowns() {
        try {
            const response = await fetch('/api/tles');
            const tles = await response.json();
            
            const satA = document.getElementById('satA');
            const satB = document.getElementById('satB');
            
            satA.innerHTML = '<option value="">选择卫星A</option>';
            satB.innerHTML = '<option value="">选择卫星B</option>';
            
            for (const tle of tles) {
                const optionA = document.createElement('option');
                optionA.value = tle.norad_id;
                optionA.textContent = `${tle.name} (${tle.norad_id})`;
                satA.appendChild(optionA);
                
                const optionB = document.createElement('option');
                optionB.value = tle.norad_id;
                optionB.textContent = `${tle.name} (${tle.norad_id})`;
                satB.appendChild(optionB);
            }
        } catch (error) {
            console.error('Failed to update dropdowns:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SatelliteTracker();
});
