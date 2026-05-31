const API_BASE = 'http://localhost:8080/api';
let socket = null;
let isSimulationRunning = false;
let isRecording = false;

let scene, camera, renderer, particles = [];
let boxHelper = null;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let cameraDistance = 10;
let cameraRotation = { x: 0.5, y: 0 };
let currentState = null;

let lastStateData = null;
let previousStateData = null;
let interpolationAlpha = 0;
let lastReceiveTime = 0;
let estimatedFPS = 0;
let frameCount = 0;
let lastFPSTime = 0;

let speciesConfigs = [
    { name: 'Ar', count: 200, epsilon: 1.0, sigma: 0.34, mass: 39.95, color: '#00d4ff' },
    { name: 'Xe', count: 100, epsilon: 2.0, sigma: 0.40, mass: 131.29, color: '#ff6b6b' }
];

let rdfChart = null;


function initThreeJS() {
    const canvas = document.getElementById('canvas');
    const container = document.getElementById('canvas-container');
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    
    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    updateCameraPosition();
    
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);
    
    const pointLight = new THREE.PointLight(0x00d4ff, 0.5, 50);
    pointLight.position.set(-5, 5, -5);
    scene.add(pointLight);
    
    const gridHelper = new THREE.GridHelper(20, 20, 0x2d3a4f, 0x1a2538);
    scene.add(gridHelper);
    
    window.addEventListener('resize', onWindowResize);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel);
    
    initRDFChart();
    renderSpeciesList();
    animate();
}

function initRDFChart() {
    const ctx = document.getElementById('rdf-chart').getContext('2d');
    rdfChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'g(r)',
                data: [],
                borderColor: '#00d4ff',
                backgroundColor: 'rgba(0, 212, 255, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: {
                    title: { display: true, text: 'r (nm)', color: '#a8dadc' },
                    ticks: { color: '#a8dadc' },
                    grid: { color: 'rgba(74, 105, 189, 0.3)' }
                },
                y: {
                    title: { display: true, text: 'g(r)', color: '#a8dadc' },
                    ticks: { color: '#a8dadc' },
                    grid: { color: 'rgba(74, 105, 189, 0.3)' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function updateRDFChart(rdf) {
    if (rdfChart && rdf && rdf.r && rdf.r.length > 0) {
        rdfChart.data.labels = rdf.r.map(v => v.toFixed(2));
        rdfChart.data.datasets[0].data = rdf.g;
        rdfChart.update('none');
    }
}

function updateCameraPosition() {
    const x = cameraDistance * Math.sin(cameraRotation.y) * Math.cos(cameraRotation.x);
    const y = cameraDistance * Math.sin(cameraRotation.x);
    const z = cameraDistance * Math.cos(cameraRotation.y) * Math.cos(cameraRotation.x);
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
}

function onWindowResize() {
    const container = document.getElementById('canvas-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function onMouseDown(e) {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
}

function onMouseMove(e) {
    if (!isDragging) return;
    
    const deltaX = e.clientX - previousMousePosition.x;
    const deltaY = e.clientY - previousMousePosition.y;
    
    cameraRotation.y += deltaX * 0.005;
    cameraRotation.x += deltaY * 0.005;
    cameraRotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, cameraRotation.x));
    
    updateCameraPosition();
    previousMousePosition = { x: e.clientX, y: e.clientY };
}

function onMouseUp() {
    isDragging = false;
}

function onWheel(e) {
    e.preventDefault();
    cameraDistance += e.deltaY * 0.01;
    cameraDistance = Math.max(3, Math.min(50, cameraDistance));
    updateCameraPosition();
}

function animate() {
    requestAnimationFrame(animate);
    
    frameCount++;
    const now = performance.now();
    if (now - lastFPSTime >= 1000) {
        estimatedFPS = frameCount;
        frameCount = 0;
        lastFPSTime = now;
        document.getElementById('fps').textContent = estimatedFPS;
    }
    
    if (isSimulationRunning && lastStateData && previousStateData) {
        const timeSinceLastReceive = (now - lastReceiveTime) / 1000;
        interpolationAlpha = Math.min(timeSinceLastReceive / 0.05, 1.0);
        updateInterpolatedPositions(interpolationAlpha);
    }
    
    renderer.render(scene, camera);
}

function createParticles(speciesConfigs) {
    particles.forEach(p => scene.remove(p));
    particles = [];
    
    speciesConfigs.forEach((species, idx) => {
        const color = new THREE.Color(species.color);
        const geometry = new THREE.SphereGeometry(0.15 * (species.sigma / 0.34), 8, 8);
        const material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color.clone().multiplyScalar(0.3),
            shininess: 50
        });
        
        for (let i = 0; i < species.count; i++) {
            const particle = new THREE.Mesh(geometry, material);
            scene.add(particle);
            particles.push(particle);
        }
    });
}

function updateBoxVectors(boxVectors) {
    if (boxHelper) {
        scene.remove(boxHelper);
    }
    
    const boxSize = Math.max(
        boxVectors[0][0],
        boxVectors[1][1],
        boxVectors[2][2]
    );
    
    const geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
    const edges = new THREE.EdgesGeometry(geometry);
    boxHelper = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0x4ecdc4, opacity: 0.5, transparent: true })
    );
    scene.add(boxHelper);
}

function parsePositions(state) {
    if (state.p) {
        const flatPositions = state.p;
        const numParticles = flatPositions.length / 3;
        const positions = [];
        for (let i = 0; i < numParticles; i++) {
            positions.push([
                flatPositions[i * 3],
                flatPositions[i * 3 + 1],
                flatPositions[i * 3 + 2]
            ]);
        }
        return positions;
    }
    return state.positions;
}

function getBoxVectors(state) {
    return state.bv || state.box_vectors;
}

function storeStateForInterpolation(state, positions, boxVectors) {
    const boxSize = Math.max(
        boxVectors[0][0],
        boxVectors[1][1],
        boxVectors[2][2]
    );
    const scale = 6 / boxSize;
    const halfBox = boxSize / 2;
    
    const stateData = {
        positions: new Float32Array(positions.length * 3),
        timestamp: state.t || state.timestamp
    };
    
    for (let i = 0; i < positions.length; i++) {
        stateData.positions[i * 3] = (positions[i][0] - halfBox) * scale;
        stateData.positions[i * 3 + 1] = (positions[i][1] - halfBox) * scale;
        stateData.positions[i * 3 + 2] = (positions[i][2] - halfBox) * scale;
    }
    
    return stateData;
}

function updateInterpolatedPositions(alpha) {
    if (!lastStateData || !previousStateData || !particles.length) return;
    
    const prev = previousStateData.positions;
    const curr = lastStateData.positions;
    const t = easeInOutCubic(alpha);
    
    for (let i = 0; i < particles.length; i++) {
        const idx = i * 3;
        particles[i].position.set(
            prev[idx] + (curr[idx] - prev[idx]) * t,
            prev[idx + 1] + (curr[idx + 1] - prev[idx + 1]) * t,
            prev[idx + 2] + (curr[idx + 2] - prev[idx + 2]) * t
        );
    }
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

function renderSpeciesList() {
    const listEl = document.getElementById('species-list');
    listEl.innerHTML = '';
    
    speciesConfigs.forEach((species, idx) => {
        const card = document.createElement('div');
        card.className = 'species-card';
        card.style.borderLeftColor = species.color;
        card.innerHTML = `
            <div class="species-header">
                <span class="species-name">${species.name}</span>
                <div class="species-color" style="background: ${species.color};"></div>
            </div>
            <div class="species-controls">
                <div class="species-control">
                    <label>数量</label>
                    <input type="number" value="${species.count}" min="1" onchange="updateSpeciesCount(${idx}, this.value)">
                </div>
                <div class="species-control">
                    <label>颜色</label>
                    <input type="color" value="${species.color}" onchange="updateSpeciesColor(${idx}, this.value)">
                </div>
                <div class="species-control">
                    <label>ε (kJ/mol)</label>
                    <input type="number" value="${species.epsilon}" step="0.1" onchange="updateSpeciesEpsilon(${idx}, this.value)">
                </div>
                <div class="species-control">
                    <label>σ (nm)</label>
                    <input type="number" value="${species.sigma}" step="0.01" onchange="updateSpeciesSigma(${idx}, this.value)">
                </div>
            </div>
            <button class="btn-danger btn-small" style="margin-top: 8px; width: 100%;" onclick="removeSpecies(${idx})">删除</button>
        `;
        listEl.appendChild(card);
    });
}

function addSpecies() {
    const colors = ['#00d4ff', '#ff6b6b', '#4ecdc4', '#ffa726', '#9c27b0', '#ff9800'];
    const names = ['Ne', 'Kr', 'He', 'H2', 'O2', 'N2'];
    
    speciesConfigs.push({
        name: names[speciesConfigs.length % names.length],
        count: 100,
        epsilon: 1.0,
        sigma: 0.34,
        mass: 39.95,
        color: colors[speciesConfigs.length % colors.length]
    });
    
    renderSpeciesList();
}

function removeSpecies(idx) {
    if (speciesConfigs.length > 1) {
        speciesConfigs.splice(idx, 1);
        renderSpeciesList();
    }
}

function updateSpeciesCount(idx, value) {
    speciesConfigs[idx].count = parseInt(value);
}

function updateSpeciesColor(idx, value) {
    speciesConfigs[idx].color = value;
    renderSpeciesList();
}

function updateSpeciesEpsilon(idx, value) {
    speciesConfigs[idx].epsilon = parseFloat(value);
}

function updateSpeciesSigma(idx, value) {
    speciesConfigs[idx].sigma = parseFloat(value);
}

async function applySpeciesConfig() {
    try {
        const response = await fetch(`${API_BASE}/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                species_configs: speciesConfigs,
                rdf_enabled: true
            })
        });
        
        const data = await response.json();
        if (data.status === 'success') {
            previousStateData = null;
            lastStateData = null;
            handleSimulationState(data.state);
            alert('物种配置已应用！');
        }
    } catch (error) {
        console.error('Error applying species config:', error);
        alert('应用配置失败，请确保后端服务已启动。');
    }
}

function initWebSocket() {
    socket = io('http://localhost:8080', { 
        transports: ['websocket', 'polling'],
        upgradeTimeout: 10000,
        pingTimeout: 60000,
        pingInterval: 25000
    });
    
    socket.on('connect', () => {
        console.log('WebSocket connected');
    });
    
    socket.on('simulation_state', (state) => {
        handleSimulationState(state);
    });
    
    socket.on('rdf_data', (rdf) => {
        updateRDFChart(rdf);
    });
    
    socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
    });
    
    socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
    });
}

function handleSimulationState(state) {
    currentState = state;
    
    const positions = parsePositions(state);
    const boxVectors = getBoxVectors(state);
    const numParticles = state.num_particles || (positions ? positions.length : 0);
    const speciesConfigsFromState = state.species_configs;
    
    if (speciesConfigsFromState && particles.length !== numParticles) {
        speciesConfigs = speciesConfigsFromState;
        createParticles(speciesConfigsFromState);
    }
    
    updateBoxVectors(boxVectors);
    
    previousStateData = lastStateData;
    lastStateData = storeStateForInterpolation(state, positions, boxVectors);
    lastReceiveTime = performance.now();
    interpolationAlpha = 0;
    
    if (!previousStateData) {
        previousStateData = lastStateData;
    }
    
    if (state.recording !== undefined) {
        isRecording = state.recording;
        updateStatus();
    }
    
    updateStats(state);
}

function updateStats(state) {
    const stepCount = state.s !== undefined ? state.s : state.step_count;
    const pe = state.pe !== undefined ? state.pe : state.potential_energy;
    const ke = state.ke !== undefined ? state.ke : state.kinetic_energy;
    
    document.getElementById('step-count').textContent = stepCount;
    document.getElementById('potential-energy').textContent = pe.toFixed(2);
    document.getElementById('kinetic-energy').textContent = ke.toFixed(2);
    document.getElementById('total-energy').textContent = (pe + ke).toFixed(2);
}

function updateParameterDisplay(param) {
    const slider = document.getElementById(param);
    const valueInput = document.getElementById(param + '-value');
    valueInput.value = slider.value;
    
    if (isSimulationRunning) {
        debouncedUpdateParameters();
    }
}

function updateParameterFromInput(param) {
    const slider = document.getElementById(param);
    const valueInput = document.getElementById(param + '-value');
    slider.value = valueInput.value;
    
    if (isSimulationRunning) {
        debouncedUpdateParameters();
    }
}

let updateTimeout = null;
function debouncedUpdateParameters() {
    if (updateTimeout) {
        clearTimeout(updateTimeout);
    }
    updateTimeout = setTimeout(updateParameters, 100);
}

async function updateParameters() {
    const temperature = parseFloat(document.getElementById('temperature').value);
    
    try {
        await fetch(`${API_BASE}/parameters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ temperature })
        });
    } catch (error) {
        console.error('Error updating parameters:', error);
    }
}

async function initSimulation() {
    try {
        const response = await fetch(`${API_BASE}/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                species_configs: speciesConfigs,
                rdf_enabled: true
            })
        });
        
        const data = await response.json();
        if (data.status === 'success') {
            previousStateData = null;
            lastStateData = null;
            handleSimulationState(data.state);
            alert('模拟初始化成功！');
        }
    } catch (error) {
        console.error('Error initializing simulation:', error);
        alert('初始化失败，请确保后端服务已启动。');
    }
}

async function startSimulation() {
    if (!currentState) {
        alert('请先初始化模拟！');
        return;
    }
    
    try {
        await fetch(`${API_BASE}/start`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                steps_per_update: 10,
                update_interval: 0.033
            })
        });
        isSimulationRunning = true;
        updateStatus();
    } catch (error) {
        console.error('Error starting simulation:', error);
    }
}

async function stopSimulation() {
    try {
        await fetch(`${API_BASE}/stop`, { method: 'POST' });
        isSimulationRunning = false;
        updateStatus();
    } catch (error) {
        console.error('Error stopping simulation:', error);
    }
}

async function resetSimulation() {
    try {
        const response = await fetch(`${API_BASE}/reset`, { method: 'POST' });
        const data = await response.json();
        if (data.status === 'success') {
            previousStateData = null;
            lastStateData = null;
            handleSimulationState(data.state);
            isSimulationRunning = false;
            updateStatus();
        }
    } catch (error) {
        console.error('Error resetting simulation:', error);
    }
}

function updateStatus() {
    const statusEl = document.getElementById('status');
    if (isRecording) {
        statusEl.textContent = '状态: 录制中...';
        statusEl.className = 'status-recording';
    } else if (isSimulationRunning) {
        statusEl.textContent = '状态: 运行中';
        statusEl.className = 'status-running';
    } else {
        statusEl.textContent = '状态: 已停止';
        statusEl.className = 'status-stopped';
    }
}

async function startRecording() {
    if (!currentState) {
        alert('请先初始化模拟！');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/record/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (data.status === 'success') {
            isRecording = true;
            updateStatus();
            alert('开始录制轨迹！');
        }
    } catch (error) {
        console.error('Error starting recording:', error);
    }
}

async function stopRecording() {
    try {
        await fetch(`${API_BASE}/record/stop`, { method: 'POST' });
        isRecording = false;
        updateStatus();
        refreshTrajectories();
        alert('录制已停止！');
    } catch (error) {
        console.error('Error stopping recording:', error);
    }
}

async function refreshTrajectories() {
    try {
        const response = await fetch(`${API_BASE}/trajectories`);
        const data = await response.json();
        
        const listEl = document.getElementById('trajectory-list');
        listEl.innerHTML = '';
        
        if (data.files.length === 0) {
            listEl.innerHTML = '<div class="trajectory-item">暂无轨迹文件</div>';
            return;
        }
        
        data.files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'trajectory-item';
            item.innerHTML = `
                <span>${file.name} (${file.size_mb} MB)</span>
                <div class="trajectory-actions">
                    <button class="btn-primary btn-small" onclick="downloadTrajectory('${file.name}')">下载</button>
                    <button class="btn-danger btn-small" onclick="deleteTrajectory('${file.name}')">删除</button>
                </div>
            `;
            listEl.appendChild(item);
        });
    } catch (error) {
        console.error('Error refreshing trajectories:', error);
    }
}

async function downloadTrajectory(filename) {
    window.open(`${API_BASE}/trajectories/${filename}`, '_blank');
}

async function deleteTrajectory(filename) {
    if (!confirm(`确定删除 ${filename}？`)) return;
    
    try {
        await fetch(`${API_BASE}/trajectories/${filename}`, { method: 'DELETE' });
        refreshTrajectories();
    } catch (error) {
        console.error('Error deleting trajectory:', error);
    }
}

async function resetRDF() {
    try {
        await fetch(`${API_BASE}/rdf/reset`, { method: 'POST' });
        if (rdfChart) {
            rdfChart.data.labels = [];
            rdfChart.data.datasets[0].data = [];
            rdfChart.update();
        }
    } catch (error) {
        console.error('Error resetting RDF:', error);
    }
}

async function saveConfig() {
    const name = document.getElementById('config-name').value || '未命名配置';
    const temperature = parseFloat(document.getElementById('temperature').value);
    
    try {
        await fetch(`${API_BASE}/configs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name, 
                temperature, 
                pressure: 1.0, 
                epsilon: speciesConfigs[0]?.epsilon || 1.0,
                sigma: speciesConfigs[0]?.sigma || 0.34,
                num_particles: speciesConfigs.reduce((sum, s) => sum + s.count, 0)
            })
        });
        document.getElementById('config-name').value = '';
        loadConfigs();
    } catch (error) {
        console.error('Error saving config:', error);
    }
}

async function loadConfigs() {
    try {
        const response = await fetch(`${API_BASE}/configs`);
        const data = await response.json();
        
        const listEl = document.getElementById('config-list');
        listEl.innerHTML = '';
        
        data.configs.forEach(config => {
            const item = document.createElement('div');
            item.className = 'config-item';
            item.innerHTML = `
                <div class="config-name">${config.name}</div>
                <div style="font-size: 0.75rem; color: #a8dadc; margin-top: 3px;">
                    T: ${config.temperature}K | N: ${config.num_particles}
                </div>
                <div class="config-actions">
                    <button class="btn-primary" onclick="loadConfig(${config.id})">加载</button>
                    <button class="btn-danger" onclick="deleteConfig(${config.id})">删除</button>
                </div>
            `;
            listEl.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading configs:', error);
    }
}

async function loadConfig(configId) {
    try {
        const response = await fetch(`${API_BASE}/configs/${configId}/load`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.status === 'success') {
            const state = data.state;
            document.getElementById('temperature').value = state.temperature;
            document.getElementById('temperature-value').value = state.temperature;
            
            previousStateData = null;
            lastStateData = null;
            handleSimulationState(data.state);
            isSimulationRunning = false;
            updateStatus();
        }
    } catch (error) {
        console.error('Error loading config:', error);
    }
}

async function deleteConfig(configId) {
    if (!confirm('确定删除此配置？')) return;
    
    try {
        await fetch(`${API_BASE}/configs/${configId}`, { method: 'DELETE' });
        loadConfigs();
    } catch (error) {
        console.error('Error deleting config:', error);
    }
}

window.addEventListener('load', () => {
    initThreeJS();
    initWebSocket();
    loadConfigs();
    refreshTrajectories();
});
