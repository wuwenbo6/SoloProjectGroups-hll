const API_BASE = 'http://localhost:5001/api';

let viewer = null;
let currentModelId = null;
let currentModelName = null;
let collisionTree = null;
let serverCollisions = [];
let sunlightResults = null;
let sunPathData = null;

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('canvas-container');
    viewer = new IFCViewer(container);

    loadModelList();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    document.getElementById('uploadBtn').addEventListener('click', handleUpload);
    document.getElementById('mergeBtn').addEventListener('click', handleMerge);
    document.getElementById('simplifyBtn').addEventListener('click', handleSimplify);
    document.getElementById('collisionBtn').addEventListener('click', handleDetectCollisions);
    document.getElementById('deleteBtn').addEventListener('click', handleDelete);

    document.getElementById('simplifyRatio').addEventListener('input', (e) => {
        document.getElementById('ratioValue').textContent = e.target.value;
    });

    document.getElementById('aabbTolerance').addEventListener('input', (e) => {
        document.getElementById('aabbTolValue').textContent = e.target.value;
    });

    document.getElementById('resetView').addEventListener('click', () => viewer.resetView());
    document.getElementById('toggleWireframe').addEventListener('click', () => viewer.toggleWireframe());
    document.getElementById('toggleAxes').addEventListener('click', () => viewer.toggleAxes());

    document.getElementById('exportBcfBtn').addEventListener('click', handleExportBCF);

    document.getElementById('clearanceSlider').addEventListener('input', (e) => {
        document.getElementById('clearanceValue').textContent = e.target.value;
    });
    document.getElementById('optimizePipesBtn').addEventListener('click', handleOptimizePipes);

    document.getElementById('citySelect').addEventListener('change', (e) => {
        const customDiv = document.getElementById('customCoords');
        if (e.target.value === 'custom') {
            customDiv.style.display = 'block';
        } else {
            customDiv.style.display = 'none';
            const [lat, lng] = e.target.value.split(',').map(parseFloat);
            document.getElementById('latitude').value = lat;
            document.getElementById('longitude').value = lng;
        }
    });

    document.getElementById('startHour').addEventListener('change', updateTimeRange);
    document.getElementById('endHour').addEventListener('change', updateTimeRange);

    document.getElementById('analyzeSunlightBtn').addEventListener('click', handleAnalyzeSunlight);
    document.getElementById('showSunPathBtn').addEventListener('click', handleShowSunPath);
    document.getElementById('clearSunlightBtn').addEventListener('click', handleClearSunlight);
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        document.getElementById('fileName').textContent = file.name;
        if (!document.getElementById('modelName').value) {
            document.getElementById('modelName').value = file.name.replace(/\.[^/.]+$/, '');
        }
    }
}

async function handleUpload() {
    const fileInput = document.getElementById('fileInput');
    if (!fileInput.files[0]) {
        alert('请先选择 IFC 文件');
        return;
    }

    const file = fileInput.files[0];
    const name = document.getElementById('modelName').value || file.name;
    const quality = document.getElementById('qualitySelect').value;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    formData.append('quality', quality);

    const qualityLabels = {
        'low': '低精度',
        'medium': '中精度',
        'high': '高精度',
        'ultra': '超高精度',
    };

    showLoading(`正在解析 IFC 文件 (${qualityLabels[quality]})...`);

    try {
        const response = await fetch(`${API_BASE}/models`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || '上传失败');
        }

        const model = await response.json();
        hideLoading();
        loadModelList();
        selectModel(model.id);
    } catch (error) {
        hideLoading();
        alert(`上传失败: ${error.message}`);
        console.error(error);
    }
}

async function loadModelList() {
    try {
        const response = await fetch(`${API_BASE}/models`);
        const models = await response.json();

        const listEl = document.getElementById('modelList');
        listEl.innerHTML = '';

        if (models.length === 0) {
            listEl.innerHTML = '<div style="color:#a0a0b0;font-size:12px;">暂无模型</div>';
            return;
        }

        models.forEach(model => {
            const item = document.createElement('div');
            item.className = 'model-item' + (model.id === currentModelId ? ' active' : '');
            item.innerHTML = `
                <div class="model-item-name">${model.name}</div>
                <div class="model-item-info">
                    构件: ${model.element_count} | 顶点: ${model.vertex_count} | 面: ${model.face_count}
                </div>
            `;
            item.addEventListener('click', () => selectModel(model.id));
            listEl.appendChild(item);
        });
    } catch (error) {
        console.error('加载模型列表失败:', error);
    }
}

async function selectModel(modelId) {
    currentModelId = modelId;
    loadModelList();

    document.getElementById('modelPanel').style.display = 'block';
    document.getElementById('collisionPanel').style.display = 'block';
    document.getElementById('pipeOptPanel').style.display = 'block';
    document.getElementById('sunlightPanel').style.display = 'block';

    try {
        const [modelResp, geomResp] = await Promise.all([
            fetch(`${API_BASE}/models/${modelId}`),
            fetch(`${API_BASE}/models/${modelId}/geometry`),
        ]);

        const model = await modelResp.json();
        const geometry = await geomResp.json();

        currentModelName = model.name;

        updateModelInfo(model);
        viewer.loadModel(geometry.elements);

        viewer.showAABBs();

        document.getElementById('infoText').textContent =
            `模型: ${model.name} | 构件数: ${model.element_count} | 顶点: ${model.vertex_count} | 面: ${model.face_count}`;

    } catch (error) {
        console.error('加载模型失败:', error);
        alert('加载模型失败');
    }
}

function updateModelInfo(model) {
    const infoEl = document.getElementById('modelInfo');
    const statusMap = {
        'pending': '等待解析',
        'parsing': '解析中',
        'parsed': '已解析',
        'merged': '已合并',
        'simplified': '已简化',
        'error': '错误',
    };
    infoEl.innerHTML = `
        <div><span>名称:</span> <strong>${model.name}</strong></div>
        <div><span>构件数:</span> <strong>${model.element_count}</strong></div>
        <div><span>顶点数:</span> <strong>${model.vertex_count}</strong></div>
        <div><span>面数:</span> <strong>${model.face_count}</strong></div>
        <div><span>状态:</span> <strong>${statusMap[model.status] || model.status}</strong></div>
    `;
}

async function handleMerge() {
    if (!currentModelId) return;

    showLoading('正在合并几何...');

    try {
        const response = await fetch(`${API_BASE}/models/${currentModelId}/merge`, {
            method: 'POST',
        });

        if (!response.ok) throw new Error('合并失败');

        const model = await response.json();
        updateModelInfo(model);

        const geomResp = await fetch(`${API_BASE}/models/${currentModelId}/geometry`);
        const geometry = await geomResp.json();
        viewer.loadModel(geometry.elements);
        viewer.showAABBs();

        hideLoading();
    } catch (error) {
        hideLoading();
        alert(`合并失败: ${error.message}`);
        console.error(error);
    }
}

async function handleSimplify() {
    if (!currentModelId) return;

    const ratio = parseFloat(document.getElementById('simplifyRatio').value);
    showLoading(`正在简化几何 (比例: ${ratio})...`);

    try {
        const response = await fetch(`${API_BASE}/models/${currentModelId}/simplify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ face_ratio: ratio }),
        });

        if (!response.ok) throw new Error('简化失败');

        const model = await response.json();
        updateModelInfo(model);

        const geomResp = await fetch(`${API_BASE}/models/${currentModelId}/geometry`);
        const geometry = await geomResp.json();
        viewer.loadModel(geometry.elements);
        viewer.showAABBs();

        hideLoading();
    } catch (error) {
        hideLoading();
        alert(`简化失败: ${error.message}`);
        console.error(error);
    }
}

async function handleDetectCollisions() {
    if (!currentModelId) return;

    const mode = document.getElementById('collisionMode').value;
    const aabbTol = parseFloat(document.getElementById('aabbTolerance').value);

    const modeLabels = {
        'aabb': '仅 AABB',
        'obb': 'AABB + OBB',
        'precise': '精确三角面',
    };

    showLoading(`正在检测碰撞 (${modeLabels[mode]})...`);

    try {
        const params = new URLSearchParams({
            mode: mode,
            aabb_tolerance: aabbTol.toString(),
        });

        const response = await fetch(`${API_BASE}/models/${currentModelId}/collisions?${params}`);
        const result = await response.json();
        serverCollisions = result.collisions;

        document.getElementById('collisionPanel').style.display = 'block';

        let statsText = '';
        if (result.collision_count > 0) {
            const levels = {};
            result.collisions.forEach(c => {
                levels[c.level] = (levels[c.level] || 0) + 1;
            });
            const levelTexts = [];
            if (levels.mesh) levelTexts.push(`精确: ${levels.mesh}`);
            if (levels.obb) levelTexts.push(`OBB: ${levels.obb}`);
            if (levels.aabb) levelTexts.push(`AABB: ${levels.aabb}`);
            statsText = `共 ${result.collision_count} 处 (${levelTexts.join(', ')})`;
        }
        document.getElementById('collisionStats').textContent = statsText;

        displayCollisions(result.collisions);

        viewer.highlightCollisions(result.collisions);

        const resp = await fetch(`${API_BASE}/models/${currentModelId}/elements`);
        const elements = await resp.json();
        collisionTree = new window.AABBBroadPhase();
        collisionTree.build(elements);

        document.getElementById('infoText').textContent =
            `碰撞检测完成 (${modeLabels[mode]}): 发现 ${result.collision_count} 处碰撞`;

        hideLoading();
    } catch (error) {
        hideLoading();
        alert(`碰撞检测失败: ${error.message}`);
        console.error(error);
    }
}

function displayCollisions(collisions) {
    const listEl = document.getElementById('collisionList');
    listEl.innerHTML = '';

    if (collisions.length === 0) {
        listEl.innerHTML = '<div style="color:#4caf50;font-size:12px;">未检测到碰撞</div>';
        return;
    }

    collisions.forEach((collision, index) => {
        const item = document.createElement('div');
        item.className = 'collision-item';

        let levelBadge = '';
        if (collision.level) {
            const levelText = {
                'aabb': 'AABB',
                'obb': 'OBB',
                'mesh': '精确',
            }[collision.level] || collision.level;
            levelBadge = `<span class="collision-level level-${collision.level}">${levelText}</span>`;
        }

        let intersectInfo = '';
        if (collision.intersection_count) {
            intersectInfo = `<div style="color:#f0a500;font-size:11px;margin-top:4px;">相交三角面: ${collision.intersection_count}</div>`;
        }

        item.innerHTML = `
            <div class="collision-title">碰撞 #${index + 1} ${levelBadge}</div>
            <div class="collision-detail">
                ${collision.element_a.ifc_type}: ${collision.element_a.name}<br>
                ↔<br>
                ${collision.element_b.ifc_type}: ${collision.element_b.name}
                ${intersectInfo}
            </div>
        `;
        item.addEventListener('click', () => {
            document.querySelectorAll('.collision-item').forEach(el => el.classList.remove('highlighted'));
            item.classList.add('highlighted');

            const elementIds = [collision.element_a.id, collision.element_b.id];
            viewer.showAABBs(elementIds);

            viewer.highlightCollisions([collision]);
        });
        listEl.appendChild(item);
    });
}

async function handleDelete() {
    if (!currentModelId) return;

    if (!confirm('确定要删除此模型吗？此操作不可撤销。')) return;

    try {
        await fetch(`${API_BASE}/models/${currentModelId}`, { method: 'DELETE' });

        viewer.clearModel();
        currentModelId = null;
        document.getElementById('modelPanel').style.display = 'none';
        document.getElementById('collisionPanel').style.display = 'none';
        document.getElementById('pipeOptPanel').style.display = 'none';
        document.getElementById('sunlightPanel').style.display = 'none';
        document.getElementById('infoText').textContent = '请上传 IFC 文件开始';

        loadModelList();
    } catch (error) {
        console.error('删除失败:', error);
        alert('删除失败');
    }
}

async function handleExportBCF() {
    if (!currentModelId) return;

    const mode = document.getElementById('collisionMode').value;
    const aabbTol = parseFloat(document.getElementById('aabbTolerance').value);

    showLoading('正在生成 BCF 报告...');

    try {
        const params = new URLSearchParams({
            mode: mode,
            aabb_tolerance: aabbTol,
        });

        const response = await fetch(`${API_BASE}/models/${currentModelId}/collisions/bcf?${params}`);
        if (!response.ok) throw new Error('导出 BCF 失败');

        const data = await response.json();

        if (data.download_url) {
            const link = document.createElement('a');
            link.href = API_BASE.replace('/api', '') + data.download_url;
            link.download = data.bcf_file;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        hideLoading();
        alert(`BCF 报告已生成，包含 ${data.collision_count} 个碰撞问题`);
    } catch (error) {
        hideLoading();
        alert(`导出 BCF 失败: ${error.message}`);
        console.error(error);
    }
}

async function handleOptimizePipes() {
    if (!currentModelId) return;

    const clearance = parseFloat(document.getElementById('clearanceSlider').value);
    const mode = document.getElementById('collisionMode').value;
    const aabbTol = parseFloat(document.getElementById('aabbTolerance').value);

    showLoading('正在进行管线自动避让优化...');

    try {
        const params = new URLSearchParams({
            mode: mode,
            aabb_tolerance: aabbTol,
            clearance: clearance,
        });

        const response = await fetch(`${API_BASE}/models/${currentModelId}/optimize-pipes?${params}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });

        if (!response.ok) throw new Error('管线优化失败');

        const data = await response.json();

        const geomResp = await fetch(`${API_BASE}/models/${currentModelId}/geometry`);
        const geometry = await geomResp.json();
        viewer.loadModel(geometry.elements);

        displayPipeOptResults(data.solutions);

        hideLoading();

        const msg = data.message || `已优化 ${data.optimized_count} 处管线碰撞`;
        if (data.optimized_count > 0) {
            alert(msg);
        } else {
            alert('未检测到需要优化的管线碰撞');
        }
    } catch (error) {
        hideLoading();
        alert(`管线优化失败: ${error.message}`);
        console.error(error);
    }
}

function displayPipeOptResults(solutions) {
    const container = document.getElementById('pipeOptResults');
    container.innerHTML = '';

    if (solutions.length === 0) {
        container.innerHTML = '<div style="color:#4caf50;font-size:12px;">无需优化</div>';
        return;
    }

    solutions.forEach((sol, idx) => {
        const item = document.createElement('div');
        item.className = 'opt-item';

        const offsetType = sol.offset_type === 'vertical' ? '竖向避让' : '水平避让';

        item.innerHTML = `
            <div>#${idx + 1}: ${sol.name}</div>
            <div class="opt-detail">
                与 ${sol.clash_with_name} 碰撞<br>
                方式: ${offsetType}<br>
                偏移距离: ${sol.offset_distance_m.toFixed(3)}m<br>
                过渡段长度: ${sol.transition_length_m.toFixed(2)}m
            </div>
        `;
        container.appendChild(item);
    });
}

function updateTimeRange() {
    const start = parseInt(document.getElementById('startHour').value);
    const end = parseInt(document.getElementById('endHour').value);
    document.getElementById('timeRange').textContent = `${start}:00 - ${end}:00`;
}

async function handleAnalyzeSunlight() {
    if (!currentModelId) return;

    let latitude, longitude;
    const cityVal = document.getElementById('citySelect').value;
    if (cityVal === 'custom') {
        latitude = parseFloat(document.getElementById('latitude').value);
        longitude = parseFloat(document.getElementById('longitude').value);
    } else {
        [latitude, longitude] = cityVal.split(',').map(parseFloat);
    }

    const day = parseInt(document.getElementById('daySelect').value);
    const startHour = parseInt(document.getElementById('startHour').value);
    const endHour = parseInt(document.getElementById('endHour').value);

    showLoading('正在进行日照分析...');

    try {
        const params = new URLSearchParams({
            latitude: latitude,
            longitude: longitude,
            day: day,
            start_hour: startHour,
            end_hour: endHour,
            step: 1.0,
        });

        const response = await fetch(`${API_BASE}/models/${currentModelId}/sunlight?${params}`);
        if (!response.ok) throw new Error('日照分析失败');

        const data = await response.json();

        sunlightResults = data;
        sunPathData = data.sun_path;

        viewer.applySunlightColors(data.results);

        displaySunlightResults(data);

        document.getElementById('showSunPathBtn').style.display = 'inline-block';
        document.getElementById('clearSunlightBtn').style.display = 'inline-block';

        hideLoading();

        const summary = data.summary;
        alert(`日照分析完成\n平均日照: ${summary.avg_hours} 小时\n` +
              `优秀: ${summary.excellent_count} | 良好: ${summary.good_count} | 一般: ${summary.moderate_count} | 较差: ${summary.poor_count} | 无日照: ${summary.none_count}`);
    } catch (error) {
        hideLoading();
        alert(`日照分析失败: ${error.message}`);
        console.error(error);
    }
}

function displaySunlightResults(data) {
    const container = document.getElementById('sunlightResults');
    container.innerHTML = '';

    const summaryDiv = document.createElement('div');
    summaryDiv.style.cssText = 'background:#0f0f1e;padding:10px;border-radius:6px;margin-bottom:10px;';
    const s = data.summary;
    summaryDiv.innerHTML = `
        <div style="font-size:12px;color:#a0a0b0;margin-bottom:6px;">分析统计</div>
        <div style="font-size:20px;font-weight:600;color:#4caf50;">${s.avg_hours}h</div>
        <div style="font-size:11px;color:#a0a0b0;margin-top:4px;">
            🟢${s.excellent_count} 🟡${s.good_count} 🟠${s.moderate_count} 🔴${s.poor_count + s.none_count}
        </div>
    `;
    container.appendChild(summaryDiv);

    const sorted = [...data.results].sort((a, b) => b.total_hours - a.total_hours);
    const topResults = sorted.slice(0, 10);

    topResults.forEach(r => {
        const item = document.createElement('div');
        item.className = `sun-item sun-level-${r.exposure_level}`;

        const levelLabels = {
            'excellent': '优秀',
            'good': '良好',
            'moderate': '一般',
            'poor': '较差',
            'none': '无日照',
        };
        const levelLabel = levelLabels[r.exposure_level] || r.exposure_level;

        item.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="font-weight:600;">${r.name || r.ifc_type}</div>
                <span class="sun-hours">${r.total_hours}h</span>
            </div>
            <div class="sun-detail">
                ${r.ifc_type}<br>
                阴影遮挡率: ${(r.shadow_ratio * 100).toFixed(1)}%<br>
                最大辐照度: ${r.max_irradiance} W/m²
            </div>
            <span class="sun-level" style="background:${r.color}20;color:${r.color};">${levelLabel}</span>
        `;
        container.appendChild(item);
    });
}

function handleShowSunPath() {
    if (!sunPathData) return;

    let center = new THREE.Vector3(0, 0, 0);
    if (viewer.meshes.length > 0) {
        viewer.meshes.forEach(item => {
            const aabb = item.mesh.userData.aabb;
            if (aabb) {
                center.add(aabb.min).add(aabb.max);
            }
        });
        center.multiplyScalar(1 / (viewer.meshes.length * 2));
    }

    viewer.showSunPath(sunPathData, center);
}

function handleClearSunlight() {
    viewer.clearSunlight();
    document.getElementById('sunlightResults').innerHTML = '';
    document.getElementById('showSunPathBtn').style.display = 'none';
    document.getElementById('clearSunlightBtn').style.display = 'none';
    sunlightResults = null;
    sunPathData = null;
}

function showLoading(text) {
    document.getElementById('loading-overlay').classList.remove('hidden');
    document.getElementById('loadingText').textContent = text;
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}
