import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class SimulationVisualizer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.vehicles = new Map();
        this.paths = new Map();
        this.conflicts = new Map();
        this.vehicleColors = [0x00d9ff, 0xe94560, 0xffa500, 0x00ff88, 0x9b59b6, 0x1abc9c];
        this.ws = null;
        this.statistics = {
            vehicleCount: 0,
            totalConflicts: 0,
            criticalConflicts: 0
        };
        this.localModeVehicles = new Set();
        this.failureMode = false;
        
        this.init();
        this.connectWebSocket();
        this.animate();
    }
    
    init() {
        const container = document.getElementById('canvas-container');
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        
        this.camera = new THREE.PerspectiveCamera(
            60,
            container.clientWidth / container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(80, 80, 80);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);
        
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        this.createGround();
        this.createGrid();
        this.addLights();
        
        window.addEventListener('resize', () => this.onResize());
        
        document.getElementById('toggle-ros2').addEventListener('click', () => {
            if (this.ws) {
                this.ws.send(JSON.stringify({ action: 'toggle_ros2_bridge' }));
            }
        });
        
        document.getElementById('toggle-failure').addEventListener('click', () => {
            this.failureMode = !this.failureMode;
            const btn = document.getElementById('toggle-failure');
            btn.textContent = `模拟断网: ${this.failureMode ? '开' : '关'}`;
            btn.classList.toggle('active', this.failureMode);
            
            if (this.ws) {
                this.ws.send(JSON.stringify({ action: 'simulate_failure', enable: this.failureMode }));
            }
        });
        
        document.getElementById('replan-all').addEventListener('click', () => {
            if (this.ws) {
                for (let i = 0; i < 6; i++) {
                    const vehicleId = `vehicle_${String(i).padStart(3, '0')}`;
                    this.ws.send(JSON.stringify({ action: 'trigger_replan', vehicle_id: vehicleId, reason: 'manual' }));
                }
                this.logEvent('控制', '手动触发所有车辆重规划');
            }
        });
        
        document.getElementById('export-csv').addEventListener('click', () => {
            window.open('/api/export/csv', '_blank');
            this.logEvent('导出', '正在导出CSV诊断日志...');
        });
        
        document.getElementById('export-json').addEventListener('click', () => {
            window.open('/api/export/json', '_blank');
            this.logEvent('导出', '正在导出JSON诊断日志...');
        });
    }
    
    createGround() {
        const groundGeometry = new THREE.PlaneGeometry(200, 200);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d3436,
            roughness: 0.9,
            metalness: 0.1
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }
    
    createGrid() {
        const gridHelper = new THREE.GridHelper(200, 50, 0x444444, 0x333333);
        this.scene.add(gridHelper);
    }
    
    addLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
    }
    
    createVehicle(vehicleId, colorIndex) {
        const group = new THREE.Group();
        
        const bodyGeometry = new THREE.BoxGeometry(4, 1.5, 2);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: this.vehicleColors[colorIndex % this.vehicleColors.length],
            metalness: 0.5,
            roughness: 0.3
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.75;
        body.castShadow = true;
        group.add(body);
        
        const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
        const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        
        const wheelPositions = [
            [-1.5, 0.4, 1], [1.5, 0.4, 1],
            [-1.5, 0.4, -1], [1.5, 0.4, -1]
        ];
        
        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.position.set(...pos);
            wheel.rotation.z = Math.PI / 2;
            group.add(wheel);
        });
        
        const lightGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffaa });
        
        [-1.8, -1.8].forEach((x, i) => {
            const light = new THREE.Mesh(lightGeometry, headlightMaterial);
            light.position.set(x, 1, i === 0 ? 0.8 : -0.8);
            group.add(light);
        });
        
        this.vehicles.set(vehicleId, group);
        this.scene.add(group);
        
        return group;
    }
    
    createPath(vehicleId, waypoints, colorIndex) {
        if (this.paths.has(vehicleId)) {
            this.scene.remove(this.paths.get(vehicleId));
        }
        
        const points = waypoints.map(wp => 
            new THREE.Vector3(wp.position.x, 0.1, wp.position.y)
        );
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: this.vehicleColors[colorIndex % this.vehicleColors.length],
            opacity: 0.5,
            transparent: true
        });
        
        const line = new THREE.Line(geometry, material);
        this.paths.set(vehicleId, line);
        this.scene.add(line);
    }
    
    createConflictMarker(conflictId, position, severity) {
        const geometry = new THREE.RingGeometry(1, 3, 32);
        const material = new THREE.MeshBasicMaterial({
            color: severity === 'critical' ? 0xe94560 : 0xffa500,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        
        const ring = new THREE.Mesh(geometry, material);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(position.x, 0.2, position.y);
        
        const pulse = { scale: 1, ring };
        this.conflicts.set(conflictId, pulse);
        this.scene.add(ring);
        
        setTimeout(() => {
            if (this.conflicts.has(conflictId)) {
                this.scene.remove(ring);
                this.conflicts.delete(conflictId);
            }
        }, 5000);
    }
    
    updateVehicle(vehicleId, data) {
        let vehicle;
        if (this.vehicles.has(vehicleId)) {
            vehicle = this.vehicles.get(vehicleId);
        } else {
            const colorIndex = parseInt(vehicleId.split('_')[1]) || 0;
            vehicle = this.createVehicle(vehicleId, colorIndex);
        }
        
        vehicle.position.set(
            data.position.x,
            0,
            data.position.y
        );
        
        vehicle.rotation.y = data.orientation.yaw;
    }
    
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            document.getElementById('connection-status').innerHTML = 
                '<span class="status-connected">✓ 已连接</span>';
            this.logEvent('系统', 'WebSocket连接成功');
        };
        
        this.ws.onclose = () => {
            document.getElementById('connection-status').innerHTML = 
                '<span class="status-disconnected">✗ 已断开</span>';
            this.logEvent('系统', 'WebSocket连接断开，3秒后重连...');
            setTimeout(() => this.connectWebSocket(), 3000);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };
    }
    
    handleMessage(message) {
        switch (message.type) {
            case 'initial_state':
                this.statistics.vehicleCount = message.data.vehicles.length;
                this.updateStatistics();
                this.logEvent('系统', `初始化完成，${message.data.vehicles.length}辆车在线`);
                break;
                
            case 'vehicle_state':
                this.updateVehicle(message.data.vehicle_id, message.data);
                this.updateVehicleInfo(message.data);
                this.updateLocalModeStatus(message.data.vehicle_id, message.data.is_local_mode);
                break;
                
            case 'vehicle_path':
                const colorIndex = parseInt(message.data.vehicle_id.split('_')[1]) || 0;
                this.createPath(message.data.vehicle_id, message.data.waypoints, colorIndex);
                break;
                
            case 'path_replan':
                const reason = message.data.replan_reason || 'unknown';
                const isLocal = message.data.is_local_replan ? ' [本地]' : '';
                this.logEvent('重规划', `${message.data.vehicle_id}${isLocal}: ${reason}`);
                const replanColorIndex = parseInt(message.data.vehicle_id.split('_')[1]) || 0;
                this.createPath(message.data.vehicle_id, message.data.waypoints, replanColorIndex);
                break;
                
            case 'conflict_alert':
                this.statistics.totalConflicts++;
                if (message.data.severity === 'critical') {
                    this.statistics.criticalConflicts++;
                }
                this.updateStatistics();
                this.createConflictMarker(
                    message.data.alert_id,
                    message.data.conflict_position,
                    message.data.severity
                );
                this.addConflictAlert(message.data);
                this.logEvent('冲突', `检测到${message.data.severity === 'critical' ? '严重' : '警告'}冲突`);
                break;
                
            case 'conflict_resolution':
                const actions = message.data.actions.map(a => 
                    `${a.vehicle_id}: ${a.action === 'slow_down' ? '减速' : '变道'}`
                ).join(', ');
                this.logEvent('消解', `冲突 ${message.data.conflict_id.substring(9, 17)}: ${actions}`);
                break;
                
            case 'failure_mode':
                if (message.data.enabled) {
                    this.logEvent('模拟', '通信故障模式已启动');
                } else {
                    this.logEvent('模拟', '通信故障模式已关闭，恢复正常');
                }
                break;
                
            case 'ros2_bridge_status':
                const btn = document.getElementById('toggle-ros2');
                if (message.data.enabled) {
                    btn.classList.add('active');
                    btn.textContent = 'ROS2桥接: 开';
                } else {
                    btn.classList.remove('active');
                    btn.textContent = 'ROS2桥接: 关';
                }
                break;
                
            case 'statistics':
                this.statistics.totalConflicts = message.data.total_conflicts;
                this.statistics.criticalConflicts = message.data.critical_conflicts;
                this.statistics.vehicleCount = message.data.active_vehicles;
                this.updateStatistics();
                break;
        }
    }

    updateLocalModeStatus(vehicleId, isLocalMode) {
        if (isLocalMode) {
            this.localModeVehicles.add(vehicleId);
        } else {
            this.localModeVehicles.delete(vehicleId);
        }
        
        const statusEl = document.getElementById('local-mode-status');
        if (this.localModeVehicles.size > 0) {
            statusEl.style.background = '#ffa500';
            statusEl.querySelector('.stat-value').style.color = '#000';
            statusEl.querySelector('.stat-value').textContent = 
                `${this.localModeVehicles.size} 辆车进入本地决策模式`;
        } else {
            statusEl.style.background = '#2d3436';
            statusEl.querySelector('.stat-value').style.color = '#00ff88';
            statusEl.querySelector('.stat-value').textContent = '所有车辆正常通信';
        }
    }
    
    updateStatistics() {
        document.getElementById('vehicle-count').textContent = this.statistics.vehicleCount;
        document.getElementById('total-conflicts').textContent = this.statistics.totalConflicts;
        document.getElementById('critical-conflicts').textContent = this.statistics.criticalConflicts;
    }
    
    updateVehicleInfo(state) {
        const list = document.getElementById('vehicles-list');
        const id = state.vehicle_id;
        const priority = state.priority || 0;
        const isLocalMode = state.is_local_mode;
        
        let item = document.querySelector(`[data-vehicle="${id}"]`);
        if (!item) {
            item = document.createElement('div');
            item.className = 'vehicle-info';
            item.dataset.vehicle = id;
            list.appendChild(item);
            
            this.logEvent('发现', `车辆 ${id} 已连接 (优先级: ${priority})');
        }
        
        const localModeBadge = isLocalMode ? '<span class="local-mode">本地</span>' : '';
        
        item.innerHTML = `
            <div class="vehicle-id">${id} <span style="font-size:0.8rem;color:#888;">[P${priority}]</span>${localModeBadge}</div>
            <div>位置: (${state.position.x.toFixed(1)}, ${state.position.y.toFixed(1)})</div>
            <div>速度: ${state.velocity.toFixed(2)} m/s</div>
        `;
    }
    
    addConflictAlert(conflict) {
        const list = document.getElementById('conflicts-list');
        
        const item = document.createElement('div');
        item.className = `conflict-alert ${conflict.severity}`;
        item.innerHTML = `
            <div><strong>${conflict.severity === 'critical' ? '严重' : '警告'}</strong></div>
            <div>车辆: ${conflict.vehicle_ids.join(', ')}</div>
            <div>位置: (${conflict.conflict_position.x.toFixed(1)}, ${conflict.conflict_position.y.toFixed(1)})</div>
        `;
        
        list.insertBefore(item, list.firstChild);
        
        while (list.children.length > 5) {
            list.removeChild(list.lastChild);
        }
    }
    
    logEvent(type, message) {
        const log = document.getElementById('event-log');
        const time = new Date().toLocaleTimeString();
        
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `<span class="log-time">[${time}]</span> [${type}] ${message}`;
        
        log.insertBefore(entry, log.firstChild);
        
        while (log.children.length > 20) {
            log.removeChild(log.lastChild);
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.conflicts.forEach((pulse) => {
            pulse.scale += 0.02;
            if (pulse.scale > 2) pulse.scale = 1;
            pulse.ring.scale.set(pulse.scale, pulse.scale, 1);
            pulse.ring.material.opacity = 1 - (pulse.scale - 1) / 1;
        });
        
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
    
    onResize() {
        const container = document.getElementById('canvas-container');
        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }
}

new SimulationVisualizer();
