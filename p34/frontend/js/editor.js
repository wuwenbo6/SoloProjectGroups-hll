let editorState = {
    currentTool: 'select',
    parts: [],
    selectedPartId: null,
    isDrawing: false,
    startPoint: null,
    currentPoints: [],
    nextPartId: 1,
    scale: 1,
    offsetX: 0,
    offsetY: 0
};

const colors = [
    '#667eea', '#764ba2', '#f093fb', '#f5576c',
    '#4facfe', '#00f2fe', '#43e97b', '#fa709a',
    '#fee140', '#30cfd0', '#667eea', '#a8edea'
];

function initEditor() {
    setupToolButtons();
    setupCanvasEvents();
    setupTabs();
    setupButtons();
    renderPartsList();
    addSampleParts();
}

function addSampleParts() {
    const samples = [
        { id: 'part1', points: [[50, 50], [150, 50], [150, 100], [50, 100]], quantity: 3 },
        { id: 'part2', points: [[200, 50], [300, 80], [250, 150]], quantity: 2 },
        { id: 'part3', points: [[350, 50], [450, 50], [450, 150], [400, 150], [400, 100], [350, 100]], quantity: 1 }
    ];
    
    samples.forEach(sample => {
        editorState.parts.push({
            id: sample.id,
            name: `零件${editorState.nextPartId++}`,
            points: sample.points,
            quantity: sample.quantity,
            color: colors[editorState.parts.length % colors.length]
        });
    });
    
    renderEditorParts();
    renderPartsList();
    updatePartCount();
}

function setupToolButtons() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            editorState.currentTool = btn.dataset.tool;
            
            if (editorState.currentTool !== 'select') {
                clearSelection();
            }
        });
    });
}

function setupCanvasEvents() {
    const svg = document.getElementById('editor-canvas');
    
    svg.addEventListener('mousedown', handleMouseDown);
    svg.addEventListener('mousemove', handleMouseMove);
    svg.addEventListener('mouseup', handleMouseUp);
    svg.addEventListener('dblclick', handleDoubleClick);
}

function getMousePos(e) {
    const svg = document.getElementById('editor-canvas');
    const rect = svg.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function handleMouseDown(e) {
    const pos = getMousePos(e);
    
    if (editorState.currentTool === 'select') {
        if (e.target.classList.contains('part-shape')) {
            selectPart(e.target.dataset.partId);
        } else {
            clearSelection();
        }
        return;
    }
    
    if (editorState.currentTool === 'delete' && e.target.classList.contains('part-shape')) {
        deletePart(e.target.dataset.partId);
        return;
    }
    
    editorState.isDrawing = true;
    editorState.startPoint = pos;
    editorState.currentPoints = [pos];
}

function handleMouseMove(e) {
    const pos = getMousePos(e);
    document.getElementById('mouse-pos').textContent = `位置: ${Math.round(pos.x)}, ${Math.round(pos.y)}`;
    
    if (!editorState.isDrawing) return;
    
    if (editorState.currentTool === 'polygon') {
        updatePolygonPreview();
    } else if (editorState.currentTool === 'freehand') {
        editorState.currentPoints.push(pos);
        updateFreehandPreview();
    }
}

function handleMouseUp(e) {
    if (!editorState.isDrawing) return;
    
    const pos = getMousePos(e);
    
    switch (editorState.currentTool) {
        case 'rectangle':
            createRectangle(pos);
            break;
        case 'circle':
            createCircle(pos);
            break;
        case 'polygon':
            editorState.currentPoints.push(pos);
            break;
        case 'freehand':
            finishFreehand();
            break;
    }
    
    editorState.isDrawing = false;
    editorState.currentPoints = [];
    clearPreview();
}

function handleDoubleClick(e) {
    if (editorState.currentTool === 'polygon' && editorState.currentPoints.length >= 3) {
        finishPolygon();
    }
}

function createRectangle(endPos) {
    const start = editorState.startPoint;
    const points = [
        [start.x, start.y],
        [endPos.x, start.y],
        [endPos.x, endPos.y],
        [start.x, endPos.y]
    ];
    
    addNewPart(points);
}

function createCircle(endPos) {
    const start = editorState.startPoint;
    const radius = Math.sqrt(
        Math.pow(endPos.x - start.x, 2) + 
        Math.pow(endPos.y - start.y, 2)
    );
    
    const points = [];
    const segments = 32;
    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push([
            start.x + radius * Math.cos(angle),
            start.y + radius * Math.sin(angle)
        ]);
    }
    
    addNewPart(points);
}

function finishPolygon() {
    editorState.isDrawing = false;
    addNewPart(editorState.currentPoints.map(p => [p.x, p.y]));
    editorState.currentPoints = [];
    clearPreview();
}

function finishFreehand() {
    if (editorState.currentPoints.length >= 3) {
        addNewPart(editorState.currentPoints.map(p => [p.x, p.y]));
    }
}

function updatePolygonPreview() {
}

function updateFreehandPreview() {
}

function clearPreview() {
}

function addNewPart(points) {
    const part = {
        id: `part${editorState.nextPartId++}`,
        name: `零件${editorState.parts.length + 1}`,
        points: points,
        quantity: 1,
        color: colors[editorState.parts.length % colors.length]
    };
    
    editorState.parts.push(part);
    renderEditorParts();
    renderPartsList();
    updatePartCount();
}

function deletePart(partId) {
    editorState.parts = editorState.parts.filter(p => p.id !== partId);
    renderEditorParts();
    renderPartsList();
    updatePartCount();
}

function selectPart(partId) {
    clearSelection();
    editorState.selectedPartId = partId;
    
    const shape = document.querySelector(`.part-shape[data-part-id="${partId}"]`);
    if (shape) {
        shape.classList.add('selected');
    }
}

function clearSelection() {
    editorState.selectedPartId = null;
    document.querySelectorAll('.part-shape').forEach(s => s.classList.remove('selected'));
}

function renderEditorParts() {
    const group = document.getElementById('editor-parts');
    group.innerHTML = '';
    
    editorState.parts.forEach(part => {
        const pathData = pointsToPath(part.points);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('class', 'part-shape');
        path.setAttribute('data-part-id', part.id);
        path.style.fill = part.color + '40';
        path.style.stroke = part.color;
        group.appendChild(path);
    });
}

function pointsToPath(points) {
    if (!points || points.length === 0) return '';
    return 'M ' + points.map(p => `${p[0]},${p[1]}`).join(' L ') + ' Z';
}

function renderPartsList() {
    const list = document.getElementById('parts-list');
    
    if (editorState.parts.length === 0) {
        list.innerHTML = '<p class="empty-hint">暂无零件，请绘制</p>';
        return;
    }
    
    list.innerHTML = editorState.parts.map(part => `
        <div class="part-item">
            <span class="part-name" style="color: ${part.color}">${part.name}</span>
            <input type="number" class="part-quantity-input" 
                   data-part-id="${part.id}" value="${part.quantity}" 
                   min="1" style="width: 50px; padding: 2px 4px;">
        </div>
    `).join('');
    
    document.querySelectorAll('.part-quantity-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const part = editorState.parts.find(p => p.id === e.target.dataset.partId);
            if (part) {
                part.quantity = parseInt(e.target.value) || 1;
            }
        });
    });
}

function updatePartCount() {
    const total = editorState.parts.reduce((sum, p) => sum + p.quantity, 0);
    document.getElementById('part-count').textContent = `零件数: ${total}`;
}

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });
}

function setupButtons() {
    document.getElementById('btn-run-nesting').addEventListener('click', runNestingProcess);
    document.getElementById('btn-clear-parts').addEventListener('click', clearParts);
    document.getElementById('btn-save-solution').addEventListener('click', saveCurrentSolution);
    document.getElementById('btn-download-gcode').addEventListener('click', downloadCurrentGCode);
    document.getElementById('btn-download-dxf').addEventListener('click', downloadCurrentDXF);
    document.getElementById('btn-copy-gcode').addEventListener('click', copyGCode);
    document.getElementById('btn-solutions').addEventListener('click', toggleSolutionsPanel);
    document.getElementById('btn-export-svg').addEventListener('click', exportSVG);
}

async function runNestingProcess() {
    if (editorState.parts.length === 0) {
        alert('请先创建零件');
        return;
    }
    
    showLoading('正在计算排样...');
    
    try {
        const result = await runNesting(
            editorState.parts,
            parseFloat(document.getElementById('sheet-width').value),
            parseFloat(document.getElementById('sheet-height').value),
            {
                populationSize: parseInt(document.getElementById('population-size').value),
                generations: parseInt(document.getElementById('generations').value),
                mutationRate: 0.2,
                safeDistance: parseFloat(document.getElementById('safe-distance').value),
                enableCommonEdge: document.getElementById('enable-common-edge').checked,
                commonEdgeTolerance: parseFloat(document.getElementById('common-edge-tolerance').value),
                enableHeatZone: document.getElementById('enable-heat-zone').checked,
                heatZoneDistance: parseFloat(document.getElementById('heat-zone-distance').value),
                heatPenalty: parseFloat(document.getElementById('heat-penalty').value)
            }
        );
        
        setCurrentResult(result);
        displayNestingResult(result);
        
        document.querySelector('[data-tab="result"]').click();
        
    } catch (error) {
        alert('排样计算失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

function displayNestingResult(result) {
    const nesting = result.nesting;
    const tsp = result.tsp;
    const commonEdge = result.common_edge;
    
    document.getElementById('stat-utilization').textContent = nesting.utilization.toFixed(1) + '%';
    document.getElementById('stat-waste').textContent = nesting.waste.toFixed(1) + '%';
    document.getElementById('stat-distance').textContent = tsp.total_travel_distance.toFixed(1) + ' mm';
    document.getElementById('stat-parts').textContent = `${nesting.parts_placed}/${nesting.total_parts}`;
    
    if (commonEdge) {
        document.getElementById('stat-common-edges').textContent = commonEdge.savings.total_common_edges;
        document.getElementById('stat-savings').textContent = commonEdge.savings.savings.toFixed(1) + ' mm';
    } else {
        document.getElementById('stat-common-edges').textContent = '0';
        document.getElementById('stat-savings').textContent = '0 mm';
    }
    
    document.getElementById('stat-conflicts').textContent = tsp.conflicts_resolved || 0;
    document.getElementById('stat-heat-violations').textContent = tsp.heat_zone_violations || 0;
    
    renderResultCanvas(nesting, tsp, commonEdge);
    renderAnimationCanvas(nesting, tsp);
    
    document.getElementById('gcode-display').textContent = result.gcode;
}

function renderResultCanvas(nesting, tsp, commonEdge) {
    const svg = document.getElementById('result-canvas');
    const content = document.getElementById('result-content');
    
    const width = nesting.sheet_width;
    const height = nesting.sheet_height;
    const scale = Math.min(600 / width, 600 / height);
    
    svg.setAttribute('viewBox', `0 0 ${width * scale} ${height * scale}`);
    svg.setAttribute('width', width * scale);
    svg.setAttribute('height', height * scale);
    
    content.innerHTML = '';
    
    const sheet = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    sheet.setAttribute('x', 0);
    sheet.setAttribute('y', 0);
    sheet.setAttribute('width', width * scale);
    sheet.setAttribute('height', height * scale);
    sheet.setAttribute('fill', '#f8f9fa');
    sheet.setAttribute('stroke', '#333');
    sheet.setAttribute('stroke-width', 2);
    content.appendChild(sheet);
    
    tsp.placements.forEach((placement, idx) => {
        const scaledPoints = placement.points.map(p => [p[0] * scale, p[1] * scale]);
        const pathData = pointsToPath(scaledPoints);
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('class', 'result-part');
        path.style.fill = colors[idx % colors.length] + '60';
        content.appendChild(path);
        
        const centerX = scaledPoints.reduce((s, p) => s + p[0], 0) / scaledPoints.length;
        const centerY = scaledPoints.reduce((s, p) => s + p[1], 0) / scaledPoints.length;
        
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', centerX);
        text.setAttribute('y', centerY);
        text.setAttribute('class', 'order-marker');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.textContent = placement.cutting_order + 1;
        content.appendChild(text);
    });
    
    if (commonEdge && commonEdge.common_edges) {
        commonEdge.common_edges.forEach(ce => {
            const coords = ce.edge_coords;
            if (coords && coords.length >= 2) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', coords[0][0] * scale);
                line.setAttribute('y1', coords[0][1] * scale);
                line.setAttribute('x2', coords[1][0] * scale);
                line.setAttribute('y2', coords[1][1] * scale);
                line.setAttribute('class', 'common-edge-line');
                line.setAttribute('stroke', '#ff4444');
                line.setAttribute('stroke-width', '3');
                line.setAttribute('stroke-dasharray', '5,5');
                content.appendChild(line);
            }
        });
    }
}

function renderAnimationCanvas(nesting, tsp) {
    const svg = document.getElementById('animation-canvas');
    const content = document.getElementById('animation-content');
    
    const width = nesting.sheet_width;
    const height = nesting.sheet_height;
    const scale = Math.min(600 / width, 600 / height);
    
    svg.setAttribute('viewBox', `0 0 ${width * scale} ${height * scale}`);
    svg.setAttribute('width', width * scale);
    svg.setAttribute('height', height * scale);
    
    content.innerHTML = '';
    
    const sheet = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    sheet.setAttribute('x', 0);
    sheet.setAttribute('y', 0);
    sheet.setAttribute('width', width * scale);
    sheet.setAttribute('height', height * scale);
    sheet.setAttribute('fill', '#f8f9fa');
    sheet.setAttribute('stroke', '#333');
    sheet.setAttribute('stroke-width', 2);
    content.appendChild(sheet);
    
    const partsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    partsGroup.id = 'animation-parts';
    
    const pathGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    pathGroup.id = 'animation-paths';
    
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    head.setAttribute('r', 6);
    head.setAttribute('class', 'cutting-head');
    head.id = 'cutting-head';
    head.style.display = 'none';
    
    tsp.placements.forEach((placement, idx) => {
        const scaledPoints = placement.points.map(p => [p[0] * scale, p[1] * scale]);
        const pathData = pointsToPath(scaledPoints);
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('class', 'result-part');
        path.style.fill = colors[idx % colors.length] + '30';
        path.style.stroke = colors[idx % colors.length];
        path.style.strokeDasharray = '1000';
        path.style.strokeDashoffset = '1000';
        path.dataset.order = placement.cutting_order;
        partsGroup.appendChild(path);
    });
    
    content.appendChild(partsGroup);
    content.appendChild(pathGroup);
    content.appendChild(head);
}

function clearParts() {
    if (confirm('确定要清空所有零件吗？')) {
        editorState.parts = [];
        editorState.selectedPartId = null;
        renderEditorParts();
        renderPartsList();
        updatePartCount();
    }
}

async function saveCurrentSolution() {
    const name = document.getElementById('solution-name').value.trim();
    if (!name) {
        alert('请输入方案名称');
        return;
    }
    
    const result = getCurrentResult();
    if (!result) {
        alert('没有可保存的排样结果');
        return;
    }
    
    try {
        await saveSolution(name, result);
        alert('方案保存成功！');
        loadSolutions();
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}

function downloadCurrentGCode() {
    const result = getCurrentResult();
    if (!result) {
        alert('没有可下载的G代码');
        return;
    }
    
    const blob = new Blob([result.gcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cutting.gcode';
    a.click();
    URL.revokeObjectURL(url);
}

function downloadCurrentDXF() {
    const result = getCurrentResult();
    if (!result || !result.dxf) {
        alert('没有可下载的DXF文件');
        return;
    }
    
    const blob = new Blob([result.dxf], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nesting.dxf';
    a.click();
    URL.revokeObjectURL(url);
}

function copyGCode() {
    const gcode = document.getElementById('gcode-display').textContent;
    navigator.clipboard.writeText(gcode).then(() => {
        alert('G代码已复制到剪贴板');
    });
}

function toggleSolutionsPanel() {
    const panel = document.getElementById('solutions-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    loadSolutions();
}

async function loadSolutions() {
    try {
        const solutions = await listSolutions();
        renderSolutionsList(solutions);
    } catch (error) {
        console.error('加载方案失败:', error);
    }
}

function renderSolutionsList(solutions) {
    const list = document.getElementById('solutions-list');
    
    if (!solutions || solutions.length === 0) {
        list.innerHTML = '<p class="empty-hint">暂无保存的方案</p>';
        return;
    }
    
    list.innerHTML = solutions.map(sol => `
        <div class="solution-item" data-id="${sol.id}">
            <div class="solution-name">${sol.name}</div>
            <div class="solution-info">
                板材: ${sol.sheet_width}x${sol.sheet_height}mm | 
                利用率: ${sol.utilization?.toFixed(1)}% |
                ${new Date(sol.created_at).toLocaleString()}
            </div>
            <div class="solution-actions">
                <button class="btn btn-small btn-primary" onclick="loadSolution(${sol.id})">加载</button>
                <button class="btn btn-small btn-danger" onclick="removeSolution(${sol.id})">删除</button>
            </div>
        </div>
    `).join('');
}

async function loadSolution(solutionId) {
    try {
        const sol = await getSolution(solutionId);
        
        const result = {
            nesting: {
                sheet_width: sol.sheet_width,
                sheet_height: sol.sheet_height,
                utilization: sol.utilization,
                waste: sol.waste,
                parts_placed: sol.placements.length,
                total_parts: sol.placements.length
            },
            tsp: {
                total_travel_distance: sol.cutting_path_length,
                placements: sol.placements,
                cutting_order: sol.placements.map((_, i) => i)
            },
            gcode: sol.gcode
        };
        
        setCurrentResult(result);
        displayNestingResult(result);
        
        document.querySelector('[data-tab="result"]').click();
        document.getElementById('solutions-panel').style.display = 'none';
        
    } catch (error) {
        alert('加载方案失败: ' + error.message);
    }
}

async function removeSolution(solutionId) {
    if (!confirm('确定要删除此方案吗？')) return;
    
    try {
        await deleteSolution(solutionId);
        loadSolutions();
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

function exportSVG() {
    const svg = document.getElementById('editor-canvas');
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'parts.svg';
    a.click();
    URL.revokeObjectURL(url);
}

function showLoading(text) {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}
