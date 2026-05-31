import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AGV } from './agv.js';
import { ShelfManager } from './shelves.js';
import { WaypointNavigator } from './waypoint.js';
import { RFIDScanner } from './rfid.js';
import { ROSBridge } from './rosbridge.js';
import { InventoryManager } from './inventory.js';
import { MultiAGVManager } from './multiAGVManager.js';

class Simulator {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.clock = new THREE.Clock();
        
        this.agv = null;
        this.shelfManager = null;
        this.waypointNavigator = null;
        this.rfidScanner = null;
        this.rosBridge = null;
        this.inventoryManager = null;
        this.multiAGVManager = null;
        this.lastReportId = null;
        
        this.keyState = {};
        this.speed = 1.0;
        this.isInventoryActive = false;
        this.useMultiAGV = true;
        
        this.init();
    }
    
    init() {
        this.initScene();
        this.initLighting();
        this.initGround();
        this.initShelves();
        this.initMultiAGV();
        this.initROS();
        this.initControls();
        this.initEventListeners();
        this.animate();
    }
    
    initScene() {
        const container = document.getElementById('canvas-container');
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        this.scene.fog = new THREE.Fog(0x1a1a2e, 50, 150);
        
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(30, 25, 30);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);
        
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 0, 0);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
    }
    
    initLighting() {
        const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        directionalLight.shadow.camera.left = -100;
        directionalLight.shadow.camera.right = 100;
        directionalLight.shadow.camera.top = 100;
        directionalLight.shadow.camera.bottom = -100;
        this.scene.add(directionalLight);
        
        const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x362d1b, 0.4);
        this.scene.add(hemisphereLight);
    }
    
    initGround() {
        const gridHelper = new THREE.GridHelper(100, 100, 0x444466, 0x333355);
        this.scene.add(gridHelper);
        
        const groundGeometry = new THREE.PlaneGeometry(200, 200);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a4a,
            roughness: 0.8,
            metalness: 0.2
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }
    
    initShelves() {
        this.shelfManager = new ShelfManager(this.scene);
        this.shelfManager.createDefaultLayout();
        this.updateTagCount();
    }
    
    initMultiAGV() {
        this.multiAGVManager = new MultiAGVManager(this.scene, this.shelfManager);
        
        const robot1 = this.multiAGVManager.createRobot('AGV-001', -5, 0, 0);
        const robot2 = this.multiAGVManager.createRobot('AGV-002', 5, 0, 1);
        
        this.agv = robot1.agv;
        this.waypointNavigator = robot1.navigator;
        this.rfidScanner = robot1.rfidScanner;
        
        this.updateRobotList();
        this.updateRobotCount();
    }
    
    initROS() {
        this.rosBridge = new ROSBridge();
        this.rosBridge.connect();
        
        this.rosBridge.on('cmd_vel', (data) => {
            const selectedRobot = this.multiAGVManager?.getSelectedRobot();
            if (selectedRobot) {
                selectedRobot.agv.setVelocity(data.linear.x, data.angular.z);
            }
        });
        
        this.rosBridge.on('connected', () => {
            document.getElementById('ros-status').textContent = '已连接';
            document.getElementById('ros-status').className = 'status-connected';
        });
        
        this.rosBridge.on('disconnected', () => {
            document.getElementById('ros-status').textContent = '未连接';
            document.getElementById('ros-status').className = 'status-disconnected';
        });
    }
    
    initControls() {
        this.initKeyboardControls();
        this.initButtonControls();
        this.initSliderControls();
        this.initLayoutControls();
        this.initInventoryControls();
        this.initMultiAGVControls();
    }
    
    initMultiAGVControls() {
        document.getElementById('btn-add-robot').addEventListener('click', () => {
            const count = this.multiAGVManager.getRobotCount();
            const id = `AGV-00${count + 1}`;
            const startX = (count % 4 - 1.5) * 4;
            const startZ = Math.floor(count / 4) * 3 - 3;
            
            this.multiAGVManager.createRobot(id, startX, startZ, count);
            this.updateRobotList();
            this.updateRobotCount();
        });
        
        document.getElementById('btn-remove-robot').addEventListener('click', () => {
            const selectedRobot = this.multiAGVManager.getSelectedRobot();
            if (selectedRobot && this.multiAGVManager.getRobotCount() > 1) {
                this.multiAGVManager.removeRobot(selectedRobot.id);
                const newSelected = this.multiAGVManager.getSelectedRobot();
                if (newSelected) {
                    this.agv = newSelected.agv;
                    this.waypointNavigator = newSelected.navigator;
                    this.rfidScanner = newSelected.rfidScanner;
                }
                this.updateRobotList();
                this.updateRobotCount();
                this.updateWaypointList();
            }
        });
        
        document.getElementById('btn-start-auto').addEventListener('click', () => {
            this.isInventoryActive = true;
            this.multiAGVManager.startAutoInventory();
            this.updateAGVStatus('scanning');
        });
        
        document.getElementById('btn-stop-auto').addEventListener('click', () => {
            this.isInventoryActive = false;
            this.multiAGVManager.stopAutoInventory();
            this.updateAGVStatus('idle');
        });
        
        document.getElementById('btn-export-pdf').addEventListener('click', () => {
            if (this.lastReportId) {
                window.open(`/api/reports/${this.lastReportId}/export?format=pdf`, '_blank');
            } else {
                alert('请先生成报告！');
            }
        });
        
        document.getElementById('btn-export-excel').addEventListener('click', () => {
            if (this.lastReportId) {
                window.open(`/api/reports/${this.lastReportId}/export?format=xlsx`, '_blank');
            } else {
                alert('请先生成报告！');
            }
        });
    }
    
    initKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            this.keyState[e.key.toLowerCase()] = true;
            this.keyState[e.code] = true;
        });
        
        document.addEventListener('keyup', (e) => {
            this.keyState[e.key.toLowerCase()] = false;
            this.keyState[e.code] = false;
        });
    }
    
    initButtonControls() {
        document.getElementById('btn-forward').addEventListener('mousedown', () => this.keyState['w'] = true);
        document.getElementById('btn-forward').addEventListener('mouseup', () => this.keyState['w'] = false);
        document.getElementById('btn-forward').addEventListener('mouseleave', () => this.keyState['w'] = false);
        
        document.getElementById('btn-backward').addEventListener('mousedown', () => this.keyState['s'] = true);
        document.getElementById('btn-backward').addEventListener('mouseup', () => this.keyState['s'] = false);
        document.getElementById('btn-backward').addEventListener('mouseleave', () => this.keyState['s'] = false);
        
        document.getElementById('btn-left').addEventListener('mousedown', () => this.keyState['a'] = true);
        document.getElementById('btn-left').addEventListener('mouseup', () => this.keyState['a'] = false);
        document.getElementById('btn-left').addEventListener('mouseleave', () => this.keyState['a'] = false);
        
        document.getElementById('btn-right').addEventListener('mousedown', () => this.keyState['d'] = true);
        document.getElementById('btn-right').addEventListener('mouseup', () => this.keyState['d'] = false);
        document.getElementById('btn-right').addEventListener('mouseleave', () => this.keyState['d'] = false);
        
        document.getElementById('btn-stop').addEventListener('click', () => this.agv.stop());
        
        document.getElementById('btn-add-waypoint').addEventListener('click', () => {
            const pos = this.agv.getPosition();
            const success = this.waypointNavigator.addWaypoint(pos.x, pos.z);
            if (!success) {
                alert('无法在此位置添加航点：距离书架太近！');
            }
            this.updateWaypointList();
        });
        
        document.getElementById('btn-clear-waypoints').addEventListener('click', () => {
            this.waypointNavigator.clearWaypoints();
            this.updateWaypointList();
        });
        
        document.getElementById('btn-start-navigation').addEventListener('click', () => {
            this.waypointNavigator.startNavigation(this.speed);
            this.updateAGVStatus('moving');
        });
        
        document.getElementById('btn-stop-navigation').addEventListener('click', () => {
            this.waypointNavigator.stopNavigation();
            this.updateAGVStatus('idle');
        });
    }
    
    initSliderControls() {
        const speedSlider = document.getElementById('speed-slider');
        const speedValue = document.getElementById('speed-value');
        
        speedSlider.addEventListener('input', (e) => {
            this.speed = parseFloat(e.target.value);
            speedValue.textContent = this.speed.toFixed(1);
        });
    }
    
    initLayoutControls() {
        document.getElementById('layout-file').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const layout = JSON.parse(event.target.result);
                        this.shelfManager.loadLayout(layout);
                        this.updateTagCount();
                        alert('布局导入成功！');
                    } catch (err) {
                        alert('布局文件格式错误！');
                    }
                };
                reader.readAsText(file);
            }
        });
        
        document.getElementById('btn-export-layout').addEventListener('click', () => {
            const layout = this.shelfManager.exportLayout();
            const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'shelf-layout.json';
            a.click();
            URL.revokeObjectURL(url);
        });
        
        document.getElementById('btn-load-default').addEventListener('click', () => {
            this.shelfManager.createDefaultLayout();
            this.updateTagCount();
        });
    }
    
    initInventoryControls() {
        document.getElementById('btn-start-inventory').addEventListener('click', () => {
            this.isInventoryActive = true;
            const selectedRobot = this.multiAGVManager.getSelectedRobot();
            if (selectedRobot) {
                selectedRobot.rfidScanner.startScanning();
                selectedRobot.status = 'scanning';
            }
            this.updateAGVStatus('scanning');
        });
        
        document.getElementById('btn-stop-inventory').addEventListener('click', () => {
            this.isInventoryActive = false;
            const selectedRobot = this.multiAGVManager.getSelectedRobot();
            if (selectedRobot) {
                selectedRobot.rfidScanner.stopScanning();
                selectedRobot.status = 'idle';
            }
            this.updateAGVStatus('idle');
        });
        
        document.getElementById('btn-generate-report').addEventListener('click', async () => {
            const allTags = this.shelfManager.getAllTags();
            const scannedIds = new Set(this.multiAGVManager.getAllScannedTags());
            
            const scannedTags = [];
            const missingTags = [];
            
            allTags.forEach(tag => {
                if (scannedIds.has(tag.id)) {
                    scannedTags.push({
                        id: tag.id,
                        metadata: tag.metadata
                    });
                } else {
                    missingTags.push({
                        id: tag.id,
                        metadata: tag.metadata,
                        expectedPosition: tag.position
                    });
                }
            });
            
            const report = {
                reportId: `report_${Date.now()}`,
                startTime: Date.now() - 60000,
                endTime: Date.now(),
                stats: {
                    total: allTags.length,
                    scanned: scannedTags.length,
                    missing: missingTags.length,
                    scanRate: allTags.length > 0 ? (scannedTags.length / allTags.length * 100).toFixed(2) : 0
                },
                scannedTags: scannedTags,
                missingTags: missingTags,
                scanRecords: []
            };
            
            try {
                const response = await fetch('/api/report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(report)
                });
                const result = await response.json();
                if (result.success) {
                    this.lastReportId = result.report_id;
                    alert(`报告已生成！\n已读取: ${scannedTags.length}\n缺失: ${missingTags.length}\n报告ID: ${result.report_id}`);
                }
            } catch (err) {
                console.log('后端未连接，报告数据:', report);
                alert('报告数据已生成（后端未连接）\n' + 
                      `已读取: ${scannedTags.length}\n` +
                      `缺失: ${missingTags.length}`);
            }
            this.updateInventoryStats();
        });
    }
    
    initEventListeners() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        this.rfidScanner.on('tagScanned', (tag) => {
            this.inventoryManager.recordTagScan(tag);
            this.updateInventoryStats();
            
            this.rosBridge.publish('/rfid_tag', {
                tag_id: tag.id,
                position: tag.position,
                timestamp: Date.now()
            });
        });
    }
    
    handleKeyboardInput(delta) {
        if (this.waypointNavigator.isNavigating) return;
        
        let linear = 0;
        let angular = 0;
        
        if (this.keyState['w'] || this.keyState['arrowup']) linear = this.speed;
        if (this.keyState['s'] || this.keyState['arrowdown']) linear = -this.speed;
        if (this.keyState['a'] || this.keyState['arrowleft']) angular = 2;
        if (this.keyState['d'] || this.keyState['arrowright']) angular = -2;
        
        if (linear !== 0 || angular !== 0) {
            const shelves = this.shelfManager.shelves;
            const moved = this.agv.move(linear, angular, delta, shelves);
            if (moved && !this.isInventoryActive) {
                this.updateAGVStatus('moving');
            } else if (!moved) {
                this.updateAGVStatus('idle');
            }
        } else if (!this.waypointNavigator.isNavigating) {
            if (!this.isInventoryActive) {
                this.updateAGVStatus('idle');
            }
        }
    }
    
    updateWaypointList() {
        const list = document.getElementById('waypoint-list');
        list.innerHTML = '';
        
        this.waypointNavigator.waypoints.forEach((wp, index) => {
            const item = document.createElement('div');
            item.className = 'waypoint-item';
            item.innerHTML = `
                <span>#${index + 1}: (${wp.x.toFixed(1)}, ${wp.z.toFixed(1)})</span>
                <button class="delete-btn" data-index="${index}">×</button>
            `;
            list.appendChild(item);
        });
        
        list.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.waypointNavigator.removeWaypoint(index);
                this.updateWaypointList();
            });
        });
    }
    
    updateStatusBar() {
        const pos = this.agv.getPosition();
        const rot = this.agv.getRotation();
        
        document.getElementById('pos-x').textContent = pos.x.toFixed(2);
        document.getElementById('pos-y').textContent = pos.y.toFixed(2);
        document.getElementById('pos-z').textContent = pos.z.toFixed(2);
        document.getElementById('rotation').textContent = (rot * 180 / Math.PI).toFixed(1);
    }
    
    updateAGVStatus(status) {
        const statusEl = document.getElementById('agv-status');
        switch (status) {
            case 'idle':
                statusEl.textContent = '待机';
                statusEl.className = 'status-idle';
                break;
            case 'moving':
                statusEl.textContent = '移动中';
                statusEl.className = 'status-moving';
                break;
            case 'scanning':
                statusEl.textContent = '扫描中';
                statusEl.className = 'status-scanning';
                break;
        }
    }
    
    updateInventoryStats() {
        const stats = this.multiAGVManager.getCombinedInventoryStats();
        document.getElementById('tag-count').textContent = stats.scanned;
        document.getElementById('missing-count').textContent = stats.missing;
        document.getElementById('total-tags').textContent = stats.total;
    }
    
    updateTagCount() {
        const stats = this.multiAGVManager.getCombinedInventoryStats();
        document.getElementById('total-tags').textContent = stats.total;
    }
    
    updateRobotCount() {
        document.getElementById('robot-count').textContent = this.multiAGVManager.getRobotCount();
    }
    
    updateRobotList() {
        const list = document.getElementById('robot-list');
        list.innerHTML = '';
        
        const selectedRobot = this.multiAGVManager.getSelectedRobot();
        
        this.multiAGVManager.getAllRobots().forEach(robot => {
            const item = document.createElement('div');
            item.className = `robot-item ${robot.id === selectedRobot?.id ? 'selected' : ''}`;
            item.innerHTML = `
                <span>
                    <span class="robot-status ${robot.status}"></span>
                    ${robot.id}
                </span>
                <button class="select-btn" data-id="${robot.id}">选中</button>
            `;
            list.appendChild(item);
        });
        
        list.querySelectorAll('.select-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const robotId = e.target.dataset.id;
                this.multiAGVManager.selectRobot(robotId);
                const selected = this.multiAGVManager.getSelectedRobot();
                if (selected) {
                    this.agv = selected.agv;
                    this.waypointNavigator = selected.navigator;
                    this.rfidScanner = selected.rfidScanner;
                }
                this.updateRobotList();
                this.updateWaypointList();
            });
        });
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const delta = this.clock.getDelta();
        
        this.handleKeyboardInput(delta);
        this.multiAGVManager.update(delta);
        
        if (this.waypointNavigator.isNavigating && !this.waypointNavigator.isMoving) {
            this.updateAGVStatus(this.isInventoryActive ? 'scanning' : 'idle');
        }
        
        this.rosBridge.publish('/odom', {
            position: this.agv.getPosition(),
            orientation: { yaw: this.agv.getRotation() },
            timestamp: Date.now()
        });
        
        this.controls.update();
        this.updateStatusBar();
        this.updateInventoryStats();
        this.updateRobotList();
        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new Simulator();
});
