const API_BASE = 'http://localhost:3000/api';
const WS_URL = 'ws://localhost:3000';

let scene, camera, renderer, controls;
let building = null;
let aps = [];
let devices = new Map();
let deviceTrails = new Map();
let apMeshes = [];
let floorMeshes = [];
let heatmapMeshes = [];
let heatmapData = [];
let currentFloor = 'all';
let showTrails = true;
let showApRanges = true;
let showHeatmap = false;
let showLabels = true;
let ws = null;

const floorColors = [
    0x4a90d9,
    0x50c878,
    0xf4a460,
    0x9370db,
    0x20b2aa
];

function init() {
    const container = document.getElementById('canvas-container');
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 50, 200);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(60, 40, 60);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 10;
    controls.maxDistance = 150;

    addLights();
    addGrid();
    loadBuildingData();
    loadAPs();
    loadRecentPositions();
    connectWebSocket();
    setupUI();

    window.addEventListener('resize', onWindowResize);
    animate();
}

function addLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

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
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0x00d4ff, 0.5, 100);
    pointLight.position.set(25, 50, 15);
    scene.add(pointLight);
}

function addGrid() {
    const gridHelper = new THREE.GridHelper(100, 50, 0x0f3460, 0x16213e);
    gridHelper.position.y = -0.1;
    scene.add(gridHelper);
}

function createBuilding(buildingData) {
    floorMeshes.forEach(mesh => scene.remove(mesh));
    floorMeshes = [];

    const { floors, floor_height, width, depth } = buildingData;
    const floorSelector = document.getElementById('floor-selector');
    floorSelector.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'floor-btn all' + (currentFloor === 'all' ? ' active' : '');
    allBtn.textContent = '全部';
    allBtn.onclick = () => selectFloor('all');
    floorSelector.appendChild(allBtn);

    for (let f = 1; f <= floors; f++) {
        const floorBtn = document.createElement('button');
        floorBtn.className = 'floor-btn' + (currentFloor === f ? ' active' : '');
        floorBtn.textContent = `F${f}`;
        floorBtn.onclick = () => selectFloor(f);
        floorSelector.appendChild(floorBtn);

        const floorY = (f - 1) * floor_height;
        
        const floorGeometry = new THREE.BoxGeometry(width, 0.3, depth);
        const floorMaterial = new THREE.MeshPhongMaterial({
            color: floorColors[(f - 1) % floorColors.length],
            transparent: true,
            opacity: currentFloor === 'all' || currentFloor === f ? 0.3 : 0.1
        });
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.position.set(width / 2, floorY, depth / 2);
        floorMesh.receiveShadow = true;
        floorMesh.userData.floor = f;
        scene.add(floorMesh);
        floorMeshes.push(floorMesh);

        const edgesGeometry = new THREE.EdgesGeometry(floorGeometry);
        const edgesMaterial = new THREE.LineBasicMaterial({ 
            color: floorColors[(f - 1) % floorColors.length],
            transparent: true,
            opacity: 0.8
        });
        const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
        edges.position.copy(floorMesh.position);
        scene.add(edges);
        floorMeshes.push(edges);

        const wallsGeometry = new THREE.BoxGeometry(width, floor_height * 0.1, depth);
        const wallsMaterial = new THREE.MeshPhongMaterial({
            color: 0x333355,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });
        const walls = new THREE.Mesh(wallsGeometry, wallsMaterial);
        walls.position.set(width / 2, floorY + floor_height / 2, depth / 2);
        scene.add(walls);
        floorMeshes.push(walls);
    }
}

function createAP(ap) {
    const group = new THREE.Group();
    
    const geometry = new THREE.ConeGeometry(0.5, 1.5, 8);
    const material = new THREE.MeshPhongMaterial({ 
        color: 0xff6b6b,
        emissive: 0xff3333,
        emissiveIntensity: 0.3
    });
    const cone = new THREE.Mesh(geometry, material);
    cone.rotation.x = Math.PI;
    cone.position.y = 0.75;
    cone.castShadow = true;
    group.add(cone);

    const baseGeometry = new THREE.CylinderGeometry(0.6, 0.8, 0.2, 16);
    const baseMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = -0.1;
    base.castShadow = true;
    group.add(base);

    if (showApRanges) {
        const rangeGeometry = new THREE.RingGeometry(2, 2.2, 32);
        const rangeMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff6b6b, 
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.3
        });
        const range = new THREE.Mesh(rangeGeometry, rangeMaterial);
        range.rotation.x = -Math.PI / 2;
        range.position.y = 0.01;
        group.add(range);
    }

    group.position.set(ap.x, ap.z, ap.y);
    group.userData = { ...ap, isAP: true };
    
    return group;
}

function createDevice(position) {
    const group = new THREE.Group();
    
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshPhongMaterial({ 
        color: 0x00ff88,
        emissive: 0x00ff88,
        emissiveIntensity: 0.5
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.castShadow = true;
    group.add(sphere);

    const glowGeometry = new THREE.SphereGeometry(0.7, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff88,
        transparent: true,
        opacity: 0.2
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    group.add(glow);

    const accuracy = position.accuracy || 1;
    const accGeometry = new THREE.RingGeometry(accuracy - 0.1, accuracy, 32);
    const accMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff88, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.3
    });
    const accRing = new THREE.Mesh(accGeometry, accMaterial);
    accRing.rotation.x = -Math.PI / 2;
    accRing.position.y = 0.01;
    group.add(accRing);

    group.position.set(position.x, position.z, position.y);
    group.userData = { ...position, isDevice: true };
    
    return group;
}

function createTrail(points) {
    if (points.length < 2) return null;
    
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(points.length * 3);
    
    points.forEach((p, i) => {
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.z + 0.1;
        positions[i * 3 + 2] = p.y;
    });
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.LineBasicMaterial({ 
        color: 0x4ecdc4, 
        linewidth: 2,
        transparent: true,
        opacity: 0.8
    });
    
    const line = new THREE.Line(geometry, material);
    return line;
}

function selectFloor(floor) {
    currentFloor = floor;
    updateFloorVisibility();
    updateAPVisibility();
    updateDeviceVisibility();
    updateFloorButtons();
    
    if (showHeatmap) {
        loadHeatmapData();
    }
}

function updateFloorVisibility() {
    floorMeshes.forEach(mesh => {
        if (mesh.userData.floor !== undefined) {
            mesh.material.opacity = currentFloor === 'all' || mesh.userData.floor === currentFloor ? 0.3 : 0.05;
        }
    });
}

function updateAPVisibility() {
    apMeshes.forEach(mesh => {
        mesh.visible = currentFloor === 'all' || mesh.userData.floor === currentFloor;
    });
}

function updateDeviceVisibility() {
    devices.forEach((device, id) => {
        device.visible = currentFloor === 'all' || device.userData.floor === currentFloor;
    });
    
    deviceTrails.forEach((trail, id) => {
        if (trail) {
            trail.visible = currentFloor === 'all' || showTrails;
        }
    });
}

function updateFloorButtons() {
    const buttons = document.querySelectorAll('.floor-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent === '全部' && currentFloor === 'all') {
            btn.classList.add('active');
        } else if (btn.textContent === `F${currentFloor}`) {
            btn.classList.add('active');
        }
    });
}

async function loadBuildingData() {
    try {
        const response = await fetch(`${API_BASE}/building`);
        building = await response.json();
        createBuilding(building);
    } catch (error) {
        console.error('Error loading building:', error);
        building = { name: 'Main Building', floors: 5, floor_height: 3.0, width: 50, depth: 30 };
        createBuilding(building);
    }
}

async function loadAPs() {
    try {
        const response = await fetch(`${API_BASE}/aps`);
        aps = await response.json();
        
        apMeshes.forEach(mesh => scene.remove(mesh));
        apMeshes = [];
        
        aps.forEach(ap => {
            const mesh = createAP(ap);
            scene.add(mesh);
            apMeshes.push(mesh);
        });
        
        document.getElementById('ap-count').textContent = aps.length;
        updateAPList();
    } catch (error) {
        console.error('Error loading APs:', error);
    }
}

async function loadRecentPositions() {
    try {
        const response = await fetch(`${API_BASE}/positions/recent?limit=50`);
        const positions = await response.json();
        
        const devicePositions = new Map();
        positions.forEach(pos => {
            if (!devicePositions.has(pos.device_id)) {
                devicePositions.set(pos.device_id, []);
            }
            devicePositions.get(pos.device_id).push(pos);
        });
        
        devicePositions.forEach((posList, deviceId) => {
            updateDevicePosition(deviceId, posList[posList.length - 1]);
            updateDeviceTrail(deviceId, posList);
        });
        
        document.getElementById('device-count').textContent = devices.size;
        updateTrailList();
    } catch (error) {
        console.error('Error loading positions:', error);
    }
}

function updateDevicePosition(deviceId, position) {
    let device = devices.get(deviceId);
    
    if (!device) {
        device = createDevice(position);
        scene.add(device);
        devices.set(deviceId, device);
    } else {
        scene.remove(device);
        device = createDevice(position);
        scene.add(device);
        devices.set(deviceId, device);
    }
    
    device.visible = currentFloor === 'all' || device.userData.floor === currentFloor;
    document.getElementById('device-count').textContent = devices.size;
}

function updateDeviceTrail(deviceId, positions) {
    let trail = deviceTrails.get(deviceId);
    
    if (trail) {
        scene.remove(trail);
    }
    
    trail = createTrail(positions);
    if (trail) {
        scene.add(trail);
        deviceTrails.set(deviceId, trail);
    }
}

function connectWebSocket() {
    const statusDot = document.getElementById('status-dot');
    const connectionText = document.getElementById('connection-text');
    
    try {
        ws = new WebSocket(WS_URL);
        
        ws.onopen = () => {
            statusDot.className = 'status-dot connected';
            connectionText.textContent = '已连接';
        };
        
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (e) {
                console.error('Error parsing WS message:', e);
            }
        };
        
        ws.onclose = () => {
            statusDot.className = 'status-dot disconnected';
            connectionText.textContent = '已断开';
            setTimeout(connectWebSocket, 3000);
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    } catch (error) {
        console.error('Error connecting to WebSocket:', error);
        statusDot.className = 'status-dot disconnected';
        connectionText.textContent = '连接失败';
    }
}

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'position_update':
            updateDevicePosition(data.position.device_id, data.position);
            
            fetch(`${API_BASE}/history/${data.position.device_id}?limit=50`)
                .then(res => res.json())
                .then(history => {
                    updateDeviceTrail(data.position.device_id, history);
                    updateTrailList();
                });
            break;
            
        case 'ap_updated':
            loadAPs();
            break;
    }
}

function updateAPList() {
    const list = document.getElementById('ap-list');
    list.innerHTML = '';
    
    aps.forEach(ap => {
        const item = document.createElement('div');
        item.className = 'ap-item';
        item.innerHTML = `
            <div>
                <div class="ap-name">${ap.name || ap.id}</div>
                <div class="ap-pos">F${ap.floor} · (${ap.x.toFixed(1)}, ${ap.y.toFixed(1)})</div>
                <div class="ap-bssid">${ap.bssid}</div>
            </div>
        `;
        list.appendChild(item);
    });
}

function updateTrailList() {
    const list = document.getElementById('trail-list');
    list.innerHTML = '';
    
    devices.forEach((device, deviceId) => {
        const item = document.createElement('div');
        item.className = 'trail-item';
        item.innerHTML = `
            <div class="device-id">${deviceId.substring(0, 12)}...</div>
            <div class="device-pos">F${device.userData.floor} · (${device.userData.x.toFixed(1)}, ${device.userData.y.toFixed(1)})</div>
        `;
        list.insertBefore(item, list.firstChild);
    });
}

function createHeatmap() {
    heatmapMeshes.forEach(mesh => scene.remove(mesh));
    heatmapMeshes = [];

    if (!showHeatmap || heatmapData.length === 0) return;

    const maxCount = Math.max(...heatmapData.map(d => d.count));
    const cellSize = 2;

    heatmapData.forEach(point => {
        const intensity = point.count / maxCount;
        const color = getHeatmapColor(intensity);
        
        const geometry = new THREE.CircleGeometry(cellSize / 2, 16);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.3 + intensity * 0.4,
            side: THREE.DoubleSide
        });
        
        const circle = new THREE.Mesh(geometry, material);
        circle.rotation.x = -Math.PI / 2;
        circle.position.set(point.x, 0.05, point.y);
        
        if (currentFloor === 'all') {
            circle.visible = true;
        }
        heatmapMeshes.push(circle);
        scene.add(circle);
    });

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255, 0, 0, 0.6)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 0, 0.4)');
    gradient.addColorStop(0.7, 'rgba(0, 255, 0, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    
    const texture = new THREE.CanvasTexture(canvas);
}

function getHeatmapColor(intensity) {
    if (intensity > 0.8) return 0xff0000;
    if (intensity > 0.6) return 0xff6600;
    if (intensity > 0.4) return 0xffff00;
    if (intensity > 0.2) return 0x66ff00;
    return 0x00ff00;
}

async function loadHeatmapData() {
    try {
        const hours = document.getElementById('heatmap-hours').value;
        const floorParam = currentFloor === 'all' ? '' : `&floor=${currentFloor}`;
        const response = await fetch(`${API_BASE}/heatmap?hours=${hours}${floorParam}`);
        heatmapData = await response.json();
        
        if (showHeatmap) {
            createHeatmap();
        }
    } catch (error) {
        console.error('Error loading heatmap:', error);
    }
}

async function loadDeviceList() {
    try {
        const response = await fetch(`${API_BASE}/devices`);
        const devices = await response.json();
        
        const select = document.getElementById('export-device');
        select.innerHTML = '<option value="">全部设备</option>';
        
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device;
            option.textContent = device.substring(0, 20) + '...';
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading devices:', error);
    }
}

function exportGPX() {
    const deviceId = document.getElementById('export-device').value;
    const param = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : '';
    
    const link = document.createElement('a');
    link.href = `${API_BASE}/export/gpx${param}`;
    link.download = `track_${Date.now()}.gpx`;
    link.click();
}

function setupUI() {
    document.getElementById('toggle-trails').onclick = function() {
        showTrails = !showTrails;
        this.classList.toggle('active');
        deviceTrails.forEach(trail => {
            if (trail) trail.visible = showTrails;
        });
    };

    document.getElementById('toggle-ap-ranges').onclick = function() {
        showApRanges = !showApRanges;
        this.classList.toggle('active');
        loadAPs();
    };

    document.getElementById('toggle-heatmap').onclick = function() {
        showHeatmap = !showHeatmap;
        this.classList.toggle('active');
        
        if (showHeatmap) {
            loadHeatmapData();
        } else {
            heatmapMeshes.forEach(mesh => scene.remove(mesh));
            heatmapMeshes = [];
        }
    };

    document.getElementById('refresh-heatmap-btn').onclick = function() {
        loadHeatmapData();
    };

    document.getElementById('export-gpx-btn').onclick = function() {
        exportGPX();
    };

    document.getElementById('toggle-labels').onclick = function() {
        showLabels = !showLabels;
        this.classList.toggle('active');
    };

    document.getElementById('init-demo-btn').onclick = async function() {
        try {
            const response = await fetch(`${API_BASE}/init-demo-data`, { method: 'POST' });
            const result = await response.json();
            alert(result.message);
            loadAPs();
            loadDeviceList();
            startSimulation();
        } catch (error) {
            console.error('Error init demo data:', error);
            alert('初始化失败');
        }
    };

    loadDeviceList();
}

function startSimulation() {
    let t = 0;
    const simulateDevice = () => {
        t += 0.05;
        const x = 25 + Math.sin(t) * 15;
        const y = 15 + Math.cos(t * 0.7) * 10;
        
        const posData = {
            type: 'position_update',
            position: {
                device_id: 'simulated-device-001',
                x: x,
                y: y,
                z: 0,
                floor: 1,
                accuracy: 0.5 + Math.random() * 0.5,
                created_at: new Date().toISOString()
            }
        };
        
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(posData));
        }
        
        updateDevicePosition(posData.position.device_id, posData.position);
        
        setTimeout(simulateDevice, 500);
    };
    
    simulateDevice();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    
    const time = Date.now() * 0.001;
    apMeshes.forEach((mesh, i) => {
        mesh.children[0].rotation.y = time + i;
    });
    
    renderer.render(scene, camera);
}

init();
