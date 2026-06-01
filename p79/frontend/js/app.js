class MarchingSquares {
    constructor(grid, gridSize, minX, maxX, minY, maxY) {
        this.grid = grid;
        this.gridSize = gridSize;
        this.minX = minX;
        this.maxX = maxX;
        this.minY = minY;
        this.maxY = maxY;
        this.cellWidth = (maxX - minX) / (gridSize - 1);
        this.cellHeight = (maxY - minY) / (gridSize - 1);
        
        this.lineTable = [
            [], [0, 1], [3, 0], [3, 1], [1, 2], [0, 1, 2, 3], [0, 2], [3, 2],
            [2, 3], [2, 0], [0, 3, 1, 2], [2, 1], [1, 3], [1, 0], [3, 0], []
        ];
    }
    
    getValue(x, y) {
        if (x < 0 || x >= this.gridSize || y < 0 || y >= this.gridSize) return 0;
        return this.grid[y][x];
    }
    
    interpolate(x1, y1, v1, x2, y2, v2, level) {
        if (Math.abs(level - v1) < 0.00001) return { x: x1, y: y1 };
        if (Math.abs(level - v2) < 0.00001) return { x: x2, y: y2 };
        if (Math.abs(v1 - v2) < 0.00001) return { x: x1, y: y1 };
        
        const t = (level - v1) / (v2 - v1);
        return {
            x: x1 + t * (x2 - x1),
            y: y1 + t * (y2 - y1)
        };
    }
    
    vertexInterp(x, y, side, level) {
        let p1, p2;
        switch (side) {
            case 0: p1 = { x: x, y: y, v: this.getValue(x, y) }; p2 = { x: x + 1, y: y, v: this.getValue(x + 1, y) }; break;
            case 1: p1 = { x: x + 1, y: y, v: this.getValue(x + 1, y) }; p2 = { x: x + 1, y: y + 1, v: this.getValue(x + 1, y + 1) }; break;
            case 2: p1 = { x: x, y: y + 1, v: this.getValue(x, y + 1) }; p2 = { x: x + 1, y: y + 1, v: this.getValue(x + 1, y + 1) }; break;
            case 3: p1 = { x: x, y: y, v: this.getValue(x, y) }; p2 = { x: x, y: y + 1, v: this.getValue(x, y + 1) }; break;
        }
        
        const interp = this.interpolate(p1.x, p1.y, p1.v, p2.x, p2.y, p2.v, level);
        return {
            lon: this.minX + interp.x * this.cellWidth,
            lat: this.minY + interp.y * this.cellHeight
        };
    }
    
    contour(level) {
        const contours = [];
        
        for (let y = 0; y < this.gridSize - 1; y++) {
            for (let x = 0; x < this.gridSize - 1; x++) {
                const v0 = this.getValue(x, y);
                const v1 = this.getValue(x + 1, y);
                const v2 = this.getValue(x + 1, y + 1);
                const v3 = this.getValue(x, y + 1);
                
                let index = 0;
                if (v0 >= level) index |= 1;
                if (v1 >= level) index |= 2;
                if (v2 >= level) index |= 4;
                if (v3 >= level) index |= 8;
                
                if (index === 0 || index === 15) continue;
                
                const lines = this.lineTable[index];
                for (let i = 0; i < lines.length; i += 2) {
                    const pt1 = this.vertexInterp(x, y, lines[i], level);
                    const pt2 = this.vertexInterp(x, y, lines[i + 1], level);
                    contours.push([pt1, pt2]);
                }
            }
        }
        
        return contours;
    }
}

class ChaikinSmoothing {
    static smooth(points, iterations = 3) {
        if (points.length < 3) return points;
        
        let result = [...points];
        
        for (let iter = 0; iter < iterations; iter++) {
            const newPoints = [];
            newPoints.push(result[0]);
            
            for (let i = 0; i < result.length - 1; i++) {
                const p0 = result[i];
                const p1 = result[i + 1];
                
                const q = {
                    lon: 0.75 * p0.lon + 0.25 * p1.lon,
                    lat: 0.75 * p0.lat + 0.25 * p1.lat
                };
                const r = {
                    lon: 0.25 * p0.lon + 0.75 * p1.lon,
                    lat: 0.25 * p0.lat + 0.75 * p1.lat
                };
                
                newPoints.push(q, r);
            }
            
            newPoints.push(result[result.length - 1]);
            result = newPoints;
        }
        
        return result;
    }
    
    static smoothPolygon(points, iterations = 3) {
        if (points.length < 3) return points;
        
        let result = [...points];
        
        for (let iter = 0; iter < iterations; iter++) {
            const newPoints = [];
            const n = result.length;
            
            for (let i = 0; i < n; i++) {
                const p0 = result[i];
                const p1 = result[(i + 1) % n];
                
                const q = {
                    lon: 0.75 * p0.lon + 0.25 * p1.lon,
                    lat: 0.75 * p0.lat + 0.25 * p1.lat
                };
                const r = {
                    lon: 0.25 * p0.lon + 0.75 * p1.lon,
                    lat: 0.25 * p0.lat + 0.75 * p1.lat
                };
                
                newPoints.push(q, r);
            }
            
            result = newPoints;
        }
        
        return result;
    }
}

class ContourBuilder {
    static buildPolygons(lineSegments, tolerance = 0.000001) {
        const polygons = [];
        const segments = [...lineSegments];
        
        while (segments.length > 0) {
            const polygon = [];
            let current = segments.shift();
            polygon.push(current[0], current[1]);
            
            let found = true;
            let attempts = 0;
            const maxAttempts = segments.length + 10;
            
            while (found && attempts < maxAttempts) {
                found = false;
                attempts++;
                
                const lastPoint = polygon[polygon.length - 1];
                
                for (let i = 0; i < segments.length; i++) {
                    const seg = segments[i];
                    
                    if (this.distance(lastPoint, seg[0]) < tolerance) {
                        polygon.push(seg[1]);
                        segments.splice(i, 1);
                        found = true;
                        break;
                    } else if (this.distance(lastPoint, seg[1]) < tolerance) {
                        polygon.push(seg[0]);
                        segments.splice(i, 1);
                        found = true;
                        break;
                    }
                }
            }
            
            if (polygon.length >= 3) {
                const simplified = this.simplifyPolygon(polygon);
                if (simplified.length >= 3) {
                    polygons.push(simplified);
                }
            }
        }
        
        return polygons;
    }
    
    static distance(p1, p2) {
        const dx = p1.lon - p2.lon;
        const dy = p1.lat - p2.lat;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    static simplifyPolygon(points, tolerance = 0.0000005) {
        if (points.length <= 3) return points;
        
        const result = [points[0]];
        
        for (let i = 1; i < points.length - 1; i++) {
            const d = this.perpendicularDistance(
                points[i],
                result[result.length - 1],
                points[i + 1]
            );
            if (d > tolerance) {
                result.push(points[i]);
            }
        }
        
        result.push(points[points.length - 1]);
        
        return result;
    }
    
    static perpendicularDistance(point, lineStart, lineEnd) {
        const dx = lineEnd.lon - lineStart.lon;
        const dy = lineEnd.lat - lineStart.lat;
        const len = Math.sqrt(dx * dx + dy * dy);
        
        if (len === 0) return this.distance(point, lineStart);
        
        const t = Math.max(0, Math.min(1, 
            ((point.lon - lineStart.lon) * dx + (point.lat - lineStart.lat) * dy) / (len * len)
        ));
        
        const proj = {
            lon: lineStart.lon + t * dx,
            lat: lineStart.lat + t * dy
        };
        
        return this.distance(point, proj);
    }
}

class FloodSimulationApp {
    constructor() {
        this.map = null;
        this.depthPointsLayer = null;
        this.contourLayer = null;
        this.nodesLayer = null;
        this.buildingsLayer = null;
        this.routesLayer = null;
        this.safeZonesLayer = null;
        this.startMarker = null;
        
        this.currentData = null;
        this.currentDamageData = null;
        this.currentRouteData = null;
        this.opacity = 0.7;
        this.mapClickEnabled = false;
        
        this.initMap();
        this.bindEvents();
        this.initTabs();
    }
    
    initMap() {
        this.map = L.map('map').setView([39.9, 116.4], 13);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(this.map);
        
        this.depthPointsLayer = L.layerGroup().addTo(this.map);
        this.contourLayer = L.layerGroup().addTo(this.map);
        this.nodesLayer = L.layerGroup().addTo(this.map);
        this.buildingsLayer = L.layerGroup().addTo(this.map);
        this.routesLayer = L.layerGroup().addTo(this.map);
        this.safeZonesLayer = L.layerGroup().addTo(this.map);
        
        this.map.on('click', (e) => this.onMapClick(e));
    }
    
    initTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }
    
    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`tab-${tabName}`).classList.add('active');
        
        if (tabName === 'evacuation') {
            this.mapClickEnabled = true;
            this.loadSafeZones();
        } else {
            this.mapClickEnabled = false;
        }
    }
    
    onMapClick(e) {
        if (!this.mapClickEnabled) return;
        
        if (this.startMarker) {
            this.map.removeLayer(this.startMarker);
        }
        
        this.startMarker = L.marker([e.latlng.lat, e.latlng.lng], {
            icon: L.divIcon({
                className: 'start-marker',
                html: '<div style="background: #e74c3c; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(this.map);
        
        document.getElementById('startLon').value = e.latlng.lng.toFixed(6);
        document.getElementById('startLat').value = e.latlng.lat.toFixed(6);
    }
    
    bindEvents() {
        document.getElementById('btnSimulate').addEventListener('click', () => this.runSimulation());
        document.getElementById('btnClear').addEventListener('click', () => this.clearLayers());
        document.getElementById('btnExportPdf').addEventListener('click', () => this.exportPdf());
        document.getElementById('btnAssessDamage').addEventListener('click', () => this.assessDamage());
        document.getElementById('btnFindRoute').addEventListener('click', () => this.findEvacuationRoutes());
        document.getElementById('btnClearRoutes').addEventListener('click', () => this.clearRoutes());
        
        document.getElementById('showPoints').addEventListener('change', (e) => {
            this.toggleLayer(this.depthPointsLayer, e.target.checked);
        });
        
        document.getElementById('showContour').addEventListener('change', (e) => {
            this.toggleLayer(this.contourLayer, e.target.checked);
        });
        
        document.getElementById('showNodes').addEventListener('change', (e) => {
            this.toggleLayer(this.nodesLayer, e.target.checked);
        });
        
        document.getElementById('showBuildings').addEventListener('change', (e) => {
            this.toggleLayer(this.buildingsLayer, e.target.checked);
        });
        
        document.getElementById('showSafeZones').addEventListener('change', (e) => {
            this.toggleLayer(this.safeZonesLayer, e.target.checked);
        });
        
        document.getElementById('showRoutes').addEventListener('change', (e) => {
            this.toggleLayer(this.routesLayer, e.target.checked);
        });
        
        document.getElementById('opacitySlider').addEventListener('input', (e) => {
            this.opacity = e.target.value / 100;
            document.getElementById('opacityValue').textContent = `${e.target.value}%`;
            this.updateOpacity();
        });
    }
    
    toggleLayer(layer, visible) {
        if (visible) {
            this.map.addLayer(layer);
        } else {
            this.map.removeLayer(layer);
        }
    }
    
    updateOpacity() {
        this.contourLayer.eachLayer((layer) => {
            if (layer.setStyle) {
                layer.setStyle({ fillOpacity: this.opacity * 0.5, opacity: this.opacity });
            }
        });
        
        this.depthPointsLayer.eachLayer((layer) => {
            if (layer.setStyle) {
                layer.setStyle({ opacity: this.opacity, fillOpacity: this.opacity });
            }
        });
        
        this.buildingsLayer.eachLayer((layer) => {
            if (layer.setStyle) {
                layer.setStyle({ opacity: this.opacity * 0.8, fillOpacity: this.opacity * 0.6 });
            }
        });
    }
    
    async runSimulation() {
        const returnPeriod = parseInt(document.getElementById('returnPeriod').value);
        
        this.showLoading(true);
        
        try {
            const response = await fetch('/api/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ return_period: returnPeriod })
            });
            
            const result = await response.json();
            
            if (result.error) {
                alert('错误: ' + result.error);
                return;
            }
            
            this.currentData = result.data;
            this.renderResults(this.currentData);
            this.updateStats(this.currentData);
            
        } catch (error) {
            console.error('Simulation error:', error);
            alert('模拟失败: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }
    
    async assessDamage() {
        if (!this.currentData) {
            alert('请先运行模拟！');
            return;
        }
        
        const returnPeriod = this.currentData.return_period;
        this.showLoading(true);
        
        try {
            const response = await fetch(`/api/damage-assessment/${returnPeriod}`);
            const result = await response.json();
            
            if (result.error) {
                alert('错误: ' + result.error);
                return;
            }
            
            this.currentDamageData = result.damage_assessment;
            this.renderBuildings(this.currentDamageData.buildings);
            this.updateDamageStats(this.currentDamageData);
            
        } catch (error) {
            console.error('Damage assessment error:', error);
            alert('损失评估失败: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }
    
    async findEvacuationRoutes() {
        if (!this.currentData) {
            alert('请先运行模拟！');
            return;
        }
        
        const lon = parseFloat(document.getElementById('startLon').value);
        const lat = parseFloat(document.getElementById('startLat').value);
        
        if (isNaN(lon) || isNaN(lat)) {
            alert('请输入有效的坐标！');
            return;
        }
        
        if (!this.startMarker) {
            this.startMarker = L.marker([lat, lon], {
                icon: L.divIcon({
                    className: 'start-marker',
                    html: '<div style="background: #e74c3c; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                })
            }).addTo(this.map);
        }
        
        this.showLoading(true);
        
        try {
            const response = await fetch('/api/evacuation-route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    return_period: this.currentData.return_period,
                    lon: lon,
                    lat: lat
                })
            });
            
            const result = await response.json();
            
            if (result.error) {
                alert('错误: ' + result.error);
                return;
            }
            
            this.currentRouteData = result.evacuation_data;
            this.renderRoutes(this.currentRouteData);
            this.updateRouteStats(this.currentRouteData);
            
        } catch (error) {
            console.error('Route finding error:', error);
            alert('路径规划失败: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }
    
    async exportPdf() {
        if (!this.currentData) {
            alert('请先运行模拟！');
            return;
        }
        
        const returnPeriod = this.currentData.return_period;
        this.showLoading(true);
        
        try {
            const response = await fetch(`/api/export-pdf/${returnPeriod}`);
            
            if (!response.ok) {
                throw new Error('Export failed');
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `flood_risk_report_${returnPeriod}yr.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('PDF export error:', error);
            alert('PDF导出失败: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }
    
    async loadSafeZones() {
        try {
            const response = await fetch('/api/safe-zones');
            const result = await response.json();
            
            if (result.safe_zones) {
                this.renderSafeZones(result.safe_zones);
            }
        } catch (error) {
            console.error('Safe zones load error:', error);
        }
    }
    
    renderResults(data) {
        this.clearLayers();
        
        if (data.depth_points && data.depth_points.length > 0) {
            this.renderContour(data.depth_points);
            this.renderDepthPoints(data.depth_points);
        }
        
        if (data.nodes && data.nodes.length > 0) {
            this.renderNodes(data.nodes);
        }
        
        this.fitBoundsToData();
    }
    
    getColor(depth) {
        const colors = [
            { limit: 0.1, color: '#ffffcc' },
            { limit: 0.3, color: '#c7e9b4' },
            { limit: 0.5, color: '#7fcdbb' },
            { limit: 1.0, color: '#41b6c4' },
            { limit: 2.0, color: '#2c7fb8' },
            { limit: Infinity, color: '#253494' }
        ];
        
        for (const { limit, color } of colors) {
            if (depth <= limit) {
                return color;
            }
        }
        return '#253494';
    }
    
    getBuildingColor(type) {
        const colors = {
            residential: '#ff6b6b',
            commercial: '#ffd93d',
            industrial: '#6bcb77',
            public: '#4d96ff'
        };
        return colors[type] || '#999';
    }
    
    renderDepthPoints(depthPoints) {
        depthPoints.forEach(point => {
            const color = this.getColor(point.depth);
            const radius = Math.min(6 + point.depth * 4, 15);
            
            const marker = L.circleMarker([point.lat, point.lon], {
                radius: radius,
                fillColor: color,
                color: '#fff',
                weight: 1,
                opacity: this.opacity,
                fillOpacity: this.opacity
            });
            
            const elevText = point.elevation ? `<p>高程: ${point.elevation.toFixed(2)} m</p>` : '';
            
            marker.bindPopup(`
                <div class="depth-popup">
                    <h4>水深点</h4>
                    <p>坐标: ${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}</p>
                    <p>水深: <span class="value">${point.depth.toFixed(2)} m</span></p>
                    ${elevText}
                </div>
            `);
            
            this.depthPointsLayer.addLayer(marker);
        });
    }
    
    renderContour(depthPoints) {
        const levels = [0.1, 0.3, 0.5, 1.0, 2.0];
        const colors = ['#ffffcc', '#c7e9b4', '#7fcdbb', '#41b6c4', '#2c7fb8', '#253494'];
        
        const lons = depthPoints.map(p => p.lon);
        const lats = depthPoints.map(p => p.lat);
        
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        
        const gridSize = 60;
        const grid = this.createInterpolationGrid(depthPoints, gridSize, minLon, maxLon, minLat, maxLat);
        
        const ms = new MarchingSquares(grid, gridSize, minLon, maxLon, minLat, maxLat);
        
        for (let levelIdx = levels.length - 1; levelIdx >= 0; levelIdx--) {
            const level = levels[levelIdx];
            const color = colors[levelIdx + 1];
            
            const lineSegments = ms.contour(level);
            const polygons = ContourBuilder.buildPolygons(lineSegments, 0.000002);
            
            polygons.forEach(polygon => {
                const smoothed = ChaikinSmoothing.smoothPolygon(polygon, 3);
                
                if (smoothed.length >= 3) {
                    const latLngs = smoothed.map(p => [p.lat, p.lon]);
                    
                    const polygonLayer = L.polygon(latLngs, {
                        fillColor: color,
                        color: color,
                        weight: 2,
                        fillOpacity: this.opacity * 0.45,
                        opacity: this.opacity * 0.8,
                        smoothFactor: 1.0
                    });
                    
                    polygonLayer.bindPopup(`
                        <div class="depth-popup">
                            <h4>淹没区域</h4>
                            <p>水深 >= <span class="value">${level.toFixed(1)} m</span></p>
                        </div>
                    `);
                    
                    this.contourLayer.addLayer(polygonLayer);
                }
            });
        }
    }
    
    createInterpolationGrid(depthPoints, gridSize, minLon, maxLon, minLat, maxLat) {
        const grid = [];
        const cellWidth = (maxLon - minLon) / (gridSize - 1);
        const cellHeight = (maxLat - minLat) / (gridSize - 1);
        
        for (let i = 0; i < gridSize; i++) {
            grid[i] = [];
            for (let j = 0; j < gridSize; j++) {
                const lon = minLon + j * cellWidth;
                const lat = minLat + i * cellHeight;
                grid[i][j] = this.idwInterpolation(lon, lat, depthPoints);
            }
        }
        
        return grid;
    }
    
    idwInterpolation(lon, lat, depthPoints, power = 2.5, maxDist = 0.02) {
        let totalWeight = 0;
        let weightedSum = 0;
        let minDist = Infinity;
        let minDepth = 0;
        
        depthPoints.forEach(point => {
            const dx = lon - point.lon;
            const dy = lat - point.lat;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < minDist) {
                minDist = dist;
                minDepth = point.depth;
            }
            
            if (dist < maxDist) {
                const weight = 1.0 / Math.pow(dist + 0.00001, power);
                totalWeight += weight;
                weightedSum += weight * point.depth;
            }
        });
        
        if (totalWeight === 0) {
            return minDepth * Math.exp(-minDist * 300);
        }
        
        const distanceDecay = Math.exp(-minDist * 400);
        return (weightedSum / totalWeight) * distanceDecay;
    }
    
    renderNodes(nodes) {
        nodes.forEach(node => {
            const marker = L.circleMarker([node.lat, node.lon], {
                radius: 7,
                fillColor: '#ff6b6b',
                color: '#c92a2a',
                weight: 2,
                opacity: 0.9,
                fillOpacity: 0.7
            });
            
            const maxFlood = node.max_flooding || node.flooding || 0;
            const maxDepth = node.max_depth || node.depth || 0;
            const elevation = node.elevation || 'N/A';
            const elevText = typeof elevation === 'number' ? elevation.toFixed(2) : elevation;
            
            marker.bindPopup(`
                <div class="depth-popup">
                    <h4>${node.node_id}</h4>
                    <p>高程: ${elevText} m</p>
                    <p>最大水深: <span class="value">${maxDepth.toFixed(2)} m</span></p>
                    <p>溢流量: <span class="value">${maxFlood.toFixed(2)} m³/s</span></p>
                </div>
            `);
            
            this.nodesLayer.addLayer(marker);
        });
    }
    
    renderBuildings(buildings) {
        this.buildingsLayer.clearLayers();
        
        buildings.forEach(building => {
            const color = this.getBuildingColor(building.building_type);
            const size = 8 + Math.min(building.damage_ratio * 10, 12);
            
            const marker = L.circleMarker([building.lat, building.lon], {
                radius: size,
                fillColor: color,
                color: '#fff',
                weight: 2,
                opacity: this.opacity * 0.8,
                fillOpacity: this.opacity * 0.6
            });
            
            marker.bindPopup(`
                <div class="depth-popup">
                    <h4>${building.building_name}</h4>
                    <p>类型: ${building.building_type_name}</p>
                    <p>面积: ${building.area.toFixed(0)} ㎡</p>
                    <p>楼层: ${building.floors} 层</p>
                    <p>水深: <span class="value">${building.water_depth.toFixed(2)} m</span></p>
                    <p>损失率: <span class="value">${(building.damage_ratio * 100).toFixed(1)}%</span></p>
                    <p>经济损失: <span class="value">¥ ${building.economic_loss.toLocaleString()}</span></p>
                </div>
            `);
            
            this.buildingsLayer.addLayer(marker);
        });
    }
    
    renderSafeZones(safeZones) {
        this.safeZonesLayer.clearLayers();
        
        safeZones.forEach(sz => {
            const marker = L.circleMarker([sz.lat, sz.lon], {
                radius: 12,
                fillColor: '#00b894',
                color: '#00796b',
                weight: 3,
                opacity: 0.9,
                fillOpacity: 0.7
            });
            
            marker.bindPopup(`
                <div class="depth-popup">
                    <h4>🏟️ ${sz.name}</h4>
                    <p>容纳人数: <span class="value">${sz.capacity.toLocaleString()} 人</span></p>
                </div>
            `);
            
            this.safeZonesLayer.addLayer(marker);
        });
    }
    
    renderRoutes(routeData) {
        this.routesLayer.clearLayers();
        document.getElementById('routeList').innerHTML = '';
        
        if (!routeData || !routeData.routes) return;
        
        const routeColors = ['#007bff', '#28a745', '#ffc107', '#6f42c1'];
        
        routeData.routes.forEach((route, index) => {
            const color = routeColors[index % routeColors.length];
            const latLngs = route.path.map(p => [p.lat, p.lon]);
            
            const polyline = L.polyline(latLngs, {
                color: color,
                weight: index === 0 ? 6 : 4,
                opacity: index === 0 ? 0.9 : 0.5,
                dashArray: index === 0 ? '' : '10, 10'
            });
            
            polyline.bindPopup(`
                <div class="depth-popup">
                    <h4>🚶 至 ${route.safe_zone_name}</h4>
                    <p>距离: <span class="value">${route.path_length.toFixed(2)} km</span></p>
                    <p>预计时间: <span class="value">${Math.round(route.estimated_time_min)} 分钟</span></p>
                </div>
            `);
            
            this.routesLayer.addLayer(polyline);
            
            const routeItem = document.createElement('div');
            routeItem.className = `route-item ${index === 0 ? 'active' : ''}`;
            routeItem.innerHTML = `
                <div class="route-name" style="color: ${color}">
                    ${index === 0 ? '⭐ ' : ''}${route.safe_zone_name}
                </div>
                <div class="route-info">
                    ${route.path_length.toFixed(2)} km | ${Math.round(route.estimated_time_min)} 分钟
                </div>
            `;
            routeItem.addEventListener('click', () => {
                document.querySelectorAll('.route-item').forEach(item => item.classList.remove('active'));
                routeItem.classList.add('active');
            });
            
            document.getElementById('routeList').appendChild(routeItem);
        });
    }
    
    clearRoutes() {
        this.routesLayer.clearLayers();
        if (this.startMarker) {
            this.map.removeLayer(this.startMarker);
            this.startMarker = null;
        }
        document.getElementById('routeList').innerHTML = '';
        
        document.getElementById('statDest').textContent = '-';
        document.getElementById('statDist').textContent = '-';
        document.getElementById('statTime').textContent = '-';
        document.getElementById('statCapacity').textContent = '-';
    }
    
    fitBoundsToData() {
        const allLayers = [
            ...this.depthPointsLayer.getLayers(),
            ...this.nodesLayer.getLayers(),
            ...this.contourLayer.getLayers()
        ];
        
        if (allLayers.length > 0) {
            const group = L.featureGroup(allLayers);
            this.map.fitBounds(group.getBounds().pad(0.12));
        }
    }
    
    clearLayers() {
        this.depthPointsLayer.clearLayers();
        this.contourLayer.clearLayers();
        this.nodesLayer.clearLayers();
        this.buildingsLayer.clearLayers();
        this.routesLayer.clearLayers();
        this.safeZonesLayer.clearLayers();
        
        if (this.startMarker) {
            this.map.removeLayer(this.startMarker);
            this.startMarker = null;
        }
        
        this.currentData = null;
        this.currentDamageData = null;
        this.currentRouteData = null;
        
        document.getElementById('statPeriod').textContent = '-';
        document.getElementById('statPoints').textContent = '-';
        document.getElementById('statNodes').textContent = '-';
        document.getElementById('statMaxDepth').textContent = '-';
        
        document.getElementById('statBuildings').textContent = '-';
        document.getElementById('statAffected').textContent = '-';
        document.getElementById('statSevere').textContent = '-';
        document.getElementById('statTotalLoss').textContent = '-';
        
        document.getElementById('statDest').textContent = '-';
        document.getElementById('statDist').textContent = '-';
        document.getElementById('statTime').textContent = '-';
        document.getElementById('statCapacity').textContent = '-';
        document.getElementById('routeList').innerHTML = '';
    }
    
    updateStats(data) {
        document.getElementById('statPeriod').textContent = `${data.return_period}年一遇`;
        document.getElementById('statPoints').textContent = data.depth_points?.length || 0;
        document.getElementById('statNodes').textContent = data.nodes?.length || 0;
        
        const maxDepth = data.depth_points?.reduce((max, p) => Math.max(max, p.depth), 0) || 0;
        document.getElementById('statMaxDepth').textContent = `${maxDepth.toFixed(2)} m`;
    }
    
    updateDamageStats(data) {
        document.getElementById('statBuildings').textContent = data.building_count;
        document.getElementById('statAffected').textContent = `${data.affected_count} (${(data.affected_count/data.building_count*100).toFixed(0)}%)`;
        document.getElementById('statSevere').textContent = data.severely_affected;
        document.getElementById('statTotalLoss').textContent = `¥ ${data.total_loss.toLocaleString()}`;
    }
    
    updateRouteStats(data) {
        if (!data || !data.recommended_route) return;
        
        const rec = data.recommended_route;
        document.getElementById('statDest').textContent = rec.safe_zone_name;
        document.getElementById('statDist').textContent = `${rec.path_length.toFixed(2)} km`;
        document.getElementById('statTime').textContent = `${Math.round(rec.estimated_time_min)} 分钟`;
        document.getElementById('statCapacity').textContent = `${rec.capacity.toLocaleString()} 人`;
    }
    
    showLoading(show) {
        document.getElementById('loading').style.display = show ? 'flex' : 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new FloodSimulationApp();
});
