const API_BASE = 'http://localhost:5001/api';
let viewer = null;
let uploadedFiles = [];
let currentTaskData = null;
let currentTransformations = null;

document.addEventListener('DOMContentLoaded', () => {
    viewer = new PointCloudViewer('threeContainer');

    setupEventListeners();
    loadTaskList();
    checkBackendStatus();
});

function setupEventListeners() {
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', handleFileUpload);

    document.getElementById('registerBtn').addEventListener('click', handleRegister);
    document.getElementById('demoBtn').addEventListener('click', handleDemo);
    document.getElementById('demoLoopBtn').addEventListener('click', handleDemoLoopClosure);
    document.getElementById('exportBtn').addEventListener('click', handleExport);
    document.getElementById('refreshTasksBtn').addEventListener('click', loadTaskList);
    document.getElementById('resetViewBtn').addEventListener('click', () => viewer.resetView());
    document.getElementById('toggleHeatmapOverlay').addEventListener('click', () => viewer.toggleHeatmapOverlay());

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            viewer.setView(e.target.dataset.view);
        });
    });
}

async function checkBackendStatus() {
    try {
        const response = await fetch(`${API_BASE}/status`);
        const data = await response.json();
        if (data.status === 'running') {
            updateStatus('后端已连接，就绪');
        }
    } catch (error) {
        updateStatus('无法连接到后端服务器，请确保后端已启动');
        console.error('Backend connection error:', error);
    }
}

function updateStatus(text) {
    document.getElementById('statusText').textContent = text;
}

function showLoading(text = '处理中...') {
    document.getElementById('loadingOverlay').style.display = 'flex';
    document.getElementById('loadingText').textContent = text;
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

async function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    showLoading('正在上传文件...');
    uploadedFiles = [];

    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    try {
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            uploadedFiles = data.files;
            displayFileList(data.files);
            updateStatus(`已上传 ${data.count} 个文件`);
        } else {
            updateStatus('文件上传失败: ' + (data.error || '未知错误'));
        }
    } catch (error) {
        updateStatus('上传失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

function displayFileList(files) {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';

    files.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.innerHTML = `
            <span class="file-name">${file.filename}</span>
            <span class="file-size">${formatFileSize(file.size)}</span>
        `;
        fileList.appendChild(div);
    });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function handleRegister() {
    if (uploadedFiles.length < 2) {
        alert('请至少上传2个点云文件用于配准');
        return;
    }

    const taskName = document.getElementById('taskName').value || `NDT_Task_${Date.now()}`;
    const voxelSize = parseFloat(document.getElementById('voxelSize').value);
    const distanceThreshold = parseFloat(document.getElementById('distanceThreshold').value);
    const maxIterations = parseInt(document.getElementById('maxIterations').value);
    const useNDT = document.getElementById('useNDT').checked;
    const useLoopClosure = document.getElementById('useLoopClosure').checked;
    const loopClosureThreshold = parseFloat(document.getElementById('loopClosureThreshold').value);

    showLoading('正在执行 NDT 配准...');
    updateStatus('配准处理中...');

    const filePaths = uploadedFiles.map(f => f.path);

    if (filePaths.length >= 3) {
        const requestData = {
            task_name: taskName,
            file_paths: filePaths,
            params: {
                voxel_size: voxelSize,
                distance_threshold: distanceThreshold,
                max_iterations: maxIterations,
                use_loop_closure: useLoopClosure,
                loop_closure_fitness_threshold: loopClosureThreshold
            }
        };

        try {
            const response = await fetch(`${API_BASE}/register/optimized`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });
            const data = await response.json();

            if (data.success) {
                handleMultiStationResult(data);
            } else {
                updateStatus('配准失败: ' + (data.error || '未知错误'));
            }
        } catch (error) {
            updateStatus('请求失败: ' + error.message);
        } finally {
            hideLoading();
        }
    } else {
        const requestData = {
            task_name: taskName,
            source_path: filePaths[0],
            target_path: filePaths[1],
            params: {
                voxel_size: voxelSize,
                distance_threshold: distanceThreshold,
                max_iterations: maxIterations,
                use_ndt: useNDT,
                use_multi_scale: true,
                min_fitness_threshold: 0.3
            }
        };

        try {
            const response = await fetch(`${API_BASE}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });
            const data = await response.json();

            if (data.success) {
                handleRegistrationResult(data);
            } else {
                updateStatus('配准失败: ' + (data.error || '未知错误'));
            }
        } catch (error) {
            updateStatus('请求失败: ' + error.message);
        } finally {
            hideLoading();
        }
    }
}

async function handleDemo() {
    showLoading('正在生成演示数据并执行配准...');
    updateStatus('演示模式: 生成点云数据...');

    try {
        const response = await fetch(`${API_BASE}/demo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();

        if (data.success) {
            handleRegistrationResult(data);
            updateStatus('演示配准完成');
        } else {
            updateStatus('演示失败: ' + (data.error || '未知错误'));
        }
    } catch (error) {
        updateStatus('演示请求失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function handleRegistrationResult(data) {
    currentTaskData = data;

    viewer.clearAll();

    const sourceUrl = data.source_json.replace(/.*?\/outputs\//, `${API_BASE}/outputs/`);
    const targetUrl = data.target_json.replace(/.*?\/outputs\//, `${API_BASE}/outputs/`);
    const mergedUrl = data.merged_json.replace(/.*?\/outputs\//, `${API_BASE}/outputs/`);
    const transformedUrl = data.transformed_source_json.replace(/.*?\/outputs\//, `${API_BASE}/outputs/`);

    showLoading('加载点云数据...');

    try {
        await viewer.loadFromJson(sourceUrl, 'source', 0x4a9eff, 0.03);
        await viewer.loadFromJson(targetUrl, 'target', 0xff9133, 0.03);
        await viewer.loadFromJson(mergedUrl, 'merged', 0x66ff66, 0.02);
        await viewer.loadFromJson(transformedUrl, 'transformed', 0xff6666, 0.03);

        if (data.heatmap) {
            viewer.createHeatmap(data.heatmap);
        }

        viewer.setView('both');
        viewer.resetView();
        displayResults(data);
        updateStatus(`配准完成 - Fitness: ${data.result.fitness.toFixed(4)}`);
        loadTaskList();
    } catch (error) {
        updateStatus('加载点云失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

function displayResults(data) {
    const resultPanel = document.getElementById('resultPanel');
    const heatmapPanel = document.getElementById('heatmapPanel');

    resultPanel.style.display = 'block';
    heatmapPanel.style.display = 'block';

    const result = data.result || data;

    document.getElementById('fitnessValue').textContent = result.fitness.toFixed(4);
    document.getElementById('rmseValue').textContent = result.inlier_rmse.toFixed(4);
    document.getElementById('corrValue').textContent = result.correspondence_set_size.toLocaleString();
    document.getElementById('sourcePoints').textContent = result.source_points.toLocaleString();
    document.getElementById('targetPoints').textContent = result.target_points.toLocaleString();
    document.getElementById('mergedPoints').textContent = (result.source_points + result.target_points).toLocaleString();

    const overlapBefore = result.overlap_before !== undefined ? result.overlap_before :
        (data.heatmap && data.heatmap.overlap_ratio_before);
    const overlapAfter = result.overlap_after !== undefined ? result.overlap_after :
        (data.heatmap && data.heatmap.overlap_ratio_after);

    if (overlapBefore !== undefined) {
        document.getElementById('overlapBefore').textContent = (overlapBefore * 100).toFixed(1) + '%';
    }
    if (overlapAfter !== undefined) {
        document.getElementById('overlapAfter').textContent = (overlapAfter * 100).toFixed(1) + '%';
    }

    const warnings = result.warnings || data.warnings || [];
    const warningsPanel = document.getElementById('warningsPanel');
    const warningsList = document.getElementById('warningsList');
    if (warnings.length > 0) {
        warningsPanel.style.display = 'block';
        warningsList.innerHTML = '';
        warnings.forEach(w => {
            const li = document.createElement('li');
            li.textContent = w;
            warningsList.appendChild(li);
        });
    } else {
        warningsPanel.style.display = 'none';
    }

    const history = result.registration_history || [];
    const historyPanel = document.getElementById('registrationHistory');
    const historyList = document.getElementById('historyList');
    if (history.length > 0) {
        historyPanel.style.display = 'block';
        historyList.innerHTML = '';
        let prevFitness = 0;
        history.forEach((h, idx) => {
            const div = document.createElement('div');
            div.className = 'history-item';
            const improved = h.fitness > prevFitness;
            div.innerHTML = `
                <span class="history-stage">${h.stage}</span>
                <span class="history-fitness ${improved ? 'improved' : ''}">F: ${h.fitness.toFixed(4)} | RMSE: ${h.inlier_rmse.toFixed(4)}</span>
            `;
            historyList.appendChild(div);
            prevFitness = h.fitness;
        });
    } else {
        historyPanel.style.display = 'none';
    }

    const matrix = result.transformation;
    let matrixHtml = '<table class="matrix-table">';
    for (let i = 0; i < 4; i++) {
        matrixHtml += '<tr>';
        for (let j = 0; j < 4; j++) {
            matrixHtml += `<td>${matrix[i][j].toFixed(4)}</td>`;
        }
        matrixHtml += '</tr>';
    }
    matrixHtml += '</table>';
    document.getElementById('transformationMatrix').innerHTML = matrixHtml;

    if (data.heatmap) {
        renderHeatmapCanvas(data.heatmap);
        document.getElementById('minOverlap').textContent = data.heatmap.min_overlap.toFixed(2);
        document.getElementById('maxOverlap').textContent = data.heatmap.max_overlap.toFixed(2);
    }
}

function renderHeatmapCanvas(heatmapData) {
    const canvas = document.getElementById('heatmapCanvas');
    const ctx = canvas.getContext('2d');
    const resolution = heatmapData.resolution || 64;
    const heatmap = heatmapData.heatmap;

    const imageData = ctx.createImageData(resolution, resolution);

    for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
            const idx = (y * resolution + x) * 4;
            const value = heatmap[y][x];
            const rgb = getHeatColor(value);
            imageData.data[idx] = rgb[0];
            imageData.data[idx + 1] = rgb[1];
            imageData.data[idx + 2] = rgb[2];
            imageData.data[idx + 3] = value > 0.01 ? 255 : 255;
        }
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = resolution;
    tempCanvas.height = resolution;
    tempCanvas.getContext('2d').putImageData(imageData, 0, 0);

    canvas.width = 300;
    canvas.height = 300;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, 300, 300);
    ctx.drawImage(tempCanvas, 0, 0, 300, 300);

    const legendCanvas = document.createElement('canvas');
    legendCanvas.width = 256;
    legendCanvas.height = 20;
    const legendCtx = legendCanvas.getContext('2d');
    const legendData = legendCtx.createImageData(256, 20);
    for (let x = 0; x < 256; x++) {
        const rgb = getHeatColor(x / 255);
        for (let y = 0; y < 20; y++) {
            const idx = (y * 256 + x) * 4;
            legendData.data[idx] = rgb[0];
            legendData.data[idx + 1] = rgb[1];
            legendData.data[idx + 2] = rgb[2];
            legendData.data[idx + 3] = 255;
        }
    }
    legendCtx.putImageData(legendData, 0, 0);
}

function getHeatColor(value) {
    value = Math.max(0, Math.min(1, value));
    let r, g, b;

    if (value < 0.25) {
        r = 0;
        g = Math.floor(value / 0.25 * 255);
        b = 255;
    } else if (value < 0.5) {
        r = 0;
        g = 255;
        b = Math.floor(255 - (value - 0.25) / 0.25 * 255);
    } else if (value < 0.75) {
        r = Math.floor((value - 0.5) / 0.25 * 255);
        g = 255;
        b = 0;
    } else {
        r = 255;
        g = Math.floor(255 - (value - 0.75) / 0.25 * 255);
        b = 0;
    }

    return [r, g, b];
}

async function loadTaskList() {
    try {
        const response = await fetch(`${API_BASE}/tasks`);
        const data = await response.json();
        const taskList = document.getElementById('taskList');
        taskList.innerHTML = '';

        if (data.tasks.length === 0) {
            taskList.innerHTML = '<p class="empty">暂无任务记录</p>';
            return;
        }

        data.tasks.slice(0, 10).forEach(task => {
            const div = document.createElement('div');
            div.className = `task-item status-${task.status}`;
            div.innerHTML = `
                <div class="task-info">
                    <span class="task-name">${task.task_name}</span>
                    <span class="task-status">${getStatusLabel(task.status)}</span>
                </div>
                <div class="task-meta">
                    <span>ID: ${task.id}</span>
                    <span>${task.created_at}</span>
                </div>
            `;
            div.addEventListener('click', () => loadTask(task.id));
            taskList.appendChild(div);
        });
    } catch (error) {
        console.error('Failed to load task list:', error);
    }
}

function getStatusLabel(status) {
    const labels = {
        'pending': '等待中',
        'processing': '处理中',
        'completed': '已完成',
        'failed': '失败'
    };
    return labels[status] || status;
}

async function loadTask(taskId) {
    showLoading('加载任务数据...');

    try {
        const response = await fetch(`${API_BASE}/tasks/${taskId}`);
        const data = await response.json();

        if (data.task && data.task.status === 'completed') {
            const sourceUrl = `${API_BASE}/outputs/task_${taskId}_source.json`;
            const targetUrl = `${API_BASE}/outputs/task_${taskId}_target.json`;
            const mergedUrl = `${API_BASE}/outputs/task_${taskId}_merged.json`;
            const transformedUrl = `${API_BASE}/outputs/task_${taskId}_transformed.json`;

            viewer.clearAll();

            await viewer.loadFromJson(sourceUrl, 'source', 0x4a9eff, 0.03);
            await viewer.loadFromJson(targetUrl, 'target', 0xff9133, 0.03);
            await viewer.loadFromJson(mergedUrl, 'merged', 0x66ff66, 0.02);
            await viewer.loadFromJson(transformedUrl, 'transformed', 0xff6666, 0.03);

            if (data.heatmap) {
                viewer.createHeatmap(data.heatmap);
            }

            viewer.setView('both');
            viewer.resetView();

            if (data.params && data.params.length > 0) {
                const params = data.params[0];
                document.getElementById('resultPanel').style.display = 'block';
                document.getElementById('heatmapPanel').style.display = 'block';
                document.getElementById('fitnessValue').textContent = params.fitness.toFixed(4);
                document.getElementById('rmseValue').textContent = params.inlier_rmse.toFixed(4);
                document.getElementById('corrValue').textContent = params.correspondence_set_size.toLocaleString();

                const overlapBefore = params.overlap_before !== undefined ? params.overlap_before :
                    (data.heatmap && data.heatmap.overlap_ratio_before);
                const overlapAfter = params.overlap_after !== undefined ? params.overlap_after :
                    (data.heatmap && data.heatmap.overlap_ratio_after);

                if (overlapBefore !== undefined && overlapBefore !== null) {
                    document.getElementById('overlapBefore').textContent = (overlapBefore * 100).toFixed(1) + '%';
                }
                if (overlapAfter !== undefined && overlapAfter !== null) {
                    document.getElementById('overlapAfter').textContent = (overlapAfter * 100).toFixed(1) + '%';
                }

                const warnings = params.warnings || [];
                const warningsPanel = document.getElementById('warningsPanel');
                const warningsList = document.getElementById('warningsList');
                if (warnings.length > 0) {
                    warningsPanel.style.display = 'block';
                    warningsList.innerHTML = '';
                    warnings.forEach(w => {
                        const li = document.createElement('li');
                        li.textContent = w;
                        warningsList.appendChild(li);
                    });
                } else {
                    warningsPanel.style.display = 'none';
                }

                const history = params.registration_history || [];
                const historyPanel = document.getElementById('registrationHistory');
                const historyList = document.getElementById('historyList');
                if (history.length > 0) {
                    historyPanel.style.display = 'block';
                    historyList.innerHTML = '';
                    let prevFitness = 0;
                    history.forEach((h, idx) => {
                        const div = document.createElement('div');
                        div.className = 'history-item';
                        const improved = h.fitness > prevFitness;
                        div.innerHTML = `
                            <span class="history-stage">${h.stage}</span>
                            <span class="history-fitness ${improved ? 'improved' : ''}">F: ${h.fitness.toFixed(4)} | RMSE: ${h.inlier_rmse.toFixed(4)}</span>
                        `;
                        historyList.appendChild(div);
                        prevFitness = h.fitness;
                    });
                } else {
                    historyPanel.style.display = 'none';
                }

                if (params.transformation_matrix) {
                    const matrix = params.transformation_matrix;
                    let matrixHtml = '<table class="matrix-table">';
                    for (let i = 0; i < 4; i++) {
                        matrixHtml += '<tr>';
                        for (let j = 0; j < 4; j++) {
                            matrixHtml += `<td>${matrix[i][j].toFixed(4)}</td>`;
                        }
                        matrixHtml += '</tr>';
                    }
                    matrixHtml += '</table>';
                    document.getElementById('transformationMatrix').innerHTML = matrixHtml;
                }
            }

            updateStatus(`已加载任务: ${data.task.task_name}`);
        } else {
            updateStatus(`任务状态: ${data.task ? data.task.status : '未找到'}`);
        }
    } catch (error) {
        updateStatus('加载任务失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function handleDemoLoopClosure() {
    showLoading('正在生成多站演示数据并执行闭环配准...');
    updateStatus('闭环演示模式: 生成点云数据...');

    try {
        const response = await fetch(`${API_BASE}/demo/loop-closure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();

        if (data.success) {
            handleMultiStationResult(data);
            updateStatus('闭环配准演示完成');
        } else {
            updateStatus('演示失败: ' + (data.error || '未知错误'));
        }
    } catch (error) {
        updateStatus('演示请求失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function handleMultiStationResult(data) {
    currentTaskData = data;
    currentTransformations = data.transformations;

    viewer.clearAll();

    showLoading('加载点云数据...');

    try {
        const taskId = data.task_id;
        const sourceUrl = `${API_BASE}/outputs/task_${taskId}_source.json`;
        const targetUrl = `${API_BASE}/outputs/task_${taskId}_target.json`;

        await viewer.loadFromJson(sourceUrl, 'source', 0x4a9eff, 0.03);
        await viewer.loadFromJson(targetUrl, 'target', 0xff9133, 0.03);

        if (data.heatmap) {
            viewer.createHeatmap(data.heatmap);
        }

        viewer.setView('both');
        viewer.resetView();
        displayMultiStationResults(data);
        updateStatus(`多站配准完成 - 平均Fitness: ${data.quality_assessment.avg_fitness.toFixed(4)}`);
        loadTaskList();
        document.getElementById('exportBtn').disabled = false;
    } catch (error) {
        updateStatus('加载点云失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

function displayMultiStationResults(data) {
    const resultPanel = document.getElementById('resultPanel');
    const heatmapPanel = document.getElementById('heatmapPanel');
    const loopClosurePanel = document.getElementById('loopClosurePanel');
    const qualityPanel = document.getElementById('qualityPanel');

    resultPanel.style.display = 'block';
    heatmapPanel.style.display = 'block';

    const qa = data.quality_assessment;
    document.getElementById('fitnessValue').textContent = qa.avg_fitness.toFixed(4);
    document.getElementById('rmseValue').textContent = qa.avg_rmse.toFixed(4);
    document.getElementById('corrValue').textContent = '-';
    document.getElementById('sourcePoints').textContent = data.num_stations + ' 站';
    document.getElementById('targetPoints').textContent = '-';
    document.getElementById('mergedPoints').textContent = (data.total_points || 0).toLocaleString();

    const overlapBefore = data.heatmap && data.heatmap.overlap_ratio_before;
    const overlapAfter = data.heatmap && data.heatmap.overlap_ratio_after;
    if (overlapBefore !== undefined && overlapBefore !== null) {
        document.getElementById('overlapBefore').textContent = (overlapBefore * 100).toFixed(1) + '%';
    }
    if (overlapAfter !== undefined && overlapAfter !== null) {
        document.getElementById('overlapAfter').textContent = (overlapAfter * 100).toFixed(1) + '%';
    }

    const warnings = data.warnings || [];
    const warningsPanel = document.getElementById('warningsPanel');
    const warningsList = document.getElementById('warningsList');
    if (warnings.length > 0) {
        warningsPanel.style.display = 'block';
        warningsList.innerHTML = '';
        warnings.forEach(w => {
            const li = document.createElement('li');
            li.textContent = w;
            warningsList.appendChild(li);
        });
    } else {
        warningsPanel.style.display = 'none';
    }

    if (data.loop_closure) {
        loopClosurePanel.style.display = 'block';
        const lc = data.loop_closure;
        const lcInfo = document.getElementById('loopClosureInfo');
        if (lc.detected) {
            lcInfo.innerHTML = `
                <div class="lc-success">
                    <span class="lc-label">✅ 闭环检测成功</span>
                    <div class="lc-details">
                        <span>连接: 站 ${lc.from_station} → 站 ${lc.to_station}</span>
                        <span>Fitness: ${lc.fitness.toFixed(4)}</span>
                        <span>RMSE: ${lc.inlier_rmse.toFixed(4)}</span>
                    </div>
                </div>
            `;
        } else {
            lcInfo.innerHTML = `
                <div class="lc-fail">
                    <span class="lc-label">⚠️ 未检测到闭环</span>
                    <div class="lc-details">
                        <span>Fitness: ${lc.fitness.toFixed(4)}</span>
                        <span>阈值: ${(data.metrics && data.metrics.voxel_size ? data.metrics.voxel_size : 0.3).toFixed(2)}</span>
                    </div>
                </div>
            `;
        }
    } else {
        loopClosurePanel.style.display = 'none';
    }

    if (data.quality_assessment && data.quality_assessment.assessments) {
        qualityPanel.style.display = 'block';
        const qi = document.getElementById('qualityInfo');
        let html = `<div class="quality-summary">
            <span class="quality-grade grade-${data.quality_assessment.overall_grade}">${data.quality_assessment.overall_grade}</span>
            <span>平均 Fitness: ${qa.avg_fitness.toFixed(4)}</span>
            <span>平均 RMSE: ${qa.avg_rmse.toFixed(4)}</span>
        </div>`;
        html += '<div class="quality-pairs">';
        data.quality_assessment.assessments.forEach(a => {
            const grade = a.quality_grade || 'Unknown';
            html += `
                <div class="quality-pair">
                    <span class="pair-label">${a.pair}</span>
                    <span class="quality-grade grade-${grade}">${grade}</span>
                    <span>F: ${a.fitness.toFixed(4)}</span>
                    <span>RMSE: ${a.inlier_rmse.toFixed(4)}</span>
                </div>
            `;
        });
        html += '</div>';
        qi.innerHTML = html;
    } else {
        qualityPanel.style.display = 'none';
    }

    if (data.transformations && data.transformations.length > 0) {
        const matrix = data.transformations[0];
        let matrixHtml = '<table class="matrix-table">';
        for (let i = 0; i < 4; i++) {
            matrixHtml += '<tr>';
            for (let j = 0; j < 4; j++) {
                matrixHtml += `<td>${matrix[i][j].toFixed(4)}</td>`;
            }
            matrixHtml += '</tr>';
        }
        matrixHtml += '</table>';
        document.getElementById('transformationMatrix').innerHTML = matrixHtml;
    }

    if (data.heatmap) {
        renderHeatmapCanvas(data.heatmap);
        document.getElementById('minOverlap').textContent = data.heatmap.min_overlap.toFixed(2);
        document.getElementById('maxOverlap').textContent = data.heatmap.max_overlap.toFixed(2);
    }

    document.getElementById('exportBtn').disabled = false;
}

async function handleExport() {
    if (!currentTaskData || !currentTransformations) {
        alert('请先执行配准后再导出');
        return;
    }

    const format = document.getElementById('exportFormat').value;
    const ascii = document.getElementById('exportAscii').checked;
    const downsample = document.getElementById('exportDownsample').checked;
    const voxelSize = downsample ? parseFloat(document.getElementById('voxelSize').value) : null;

    const exportStatus = document.getElementById('exportStatus');
    exportStatus.textContent = '正在导出...';
    exportStatus.className = 'export-status exporting';

    let filePaths = [];
    if (uploadedFiles.length >= 2) {
        filePaths = uploadedFiles.map(f => f.path);
    } else if (currentTaskData.task_name && currentTaskData.task_name.startsWith('NDT_Demo')) {
        filePaths = [
            'uploads/demo/demo_station1.ply',
            'uploads/demo/demo_station2.ply'
        ];
    }

    if (filePaths.length < 2) {
        alert('无法找到文件路径，请重新上传');
        exportStatus.textContent = '错误: 无法找到文件路径';
        exportStatus.className = 'export-status error';
        return;
    }

    const outputName = `export_${Date.now()}`;

    try {
        const response = await fetch(`${API_BASE}/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_paths: filePaths,
                transformations: currentTransformations,
                format: format,
                ascii: ascii,
                voxel_size: voxelSize,
                output_name: outputName
            })
        });
        const data = await response.json();

        if (data.success) {
            const exp = data.export;
            exportStatus.innerHTML = `
                <span class="export-success">✅ 导出成功!</span>
                <div>文件: ${exp.file_name}</div>
                <div>大小: ${exp.file_size_mb.toFixed(2)} MB</div>
                <div>点数: ${exp.num_points.toLocaleString()}</div>
                <a href="${data.download_url}" download>点击下载</a>
            `;
            exportStatus.className = 'export-status success';
        } else {
            exportStatus.textContent = '导出失败: ' + (data.error || '未知错误');
            exportStatus.className = 'export-status error';
        }
    } catch (error) {
        exportStatus.textContent = '导出请求失败: ' + error.message;
        exportStatus.className = 'export-status error';
    }
}
