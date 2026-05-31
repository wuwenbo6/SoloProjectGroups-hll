let map;
let nodeLayer = L.layerGroup();
let linkLayer = L.layerGroup();
let heatmapLayer = null;
let contourLayer = L.layerGroup();
let currentSimulationId = null;
let heatmapData = {};
let timestamps = [];
let isPlaying = false;
let playInterval = null;
let currentTimeIndex = 0;

function initMap() {
    map = L.map('map').setView([39.913, 116.408], 15);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    
    contourLayer.addTo(map);
    linkLayer.addTo(map);
    nodeLayer.addTo(map);
    
    loadNetwork();
    loadSimulations();
    loadSubcatchments();
    loadLinks();
}

function loadNetwork() {
    fetch('/api/network')
        .then(response => response.json())
        .then(data => {
            nodeLayer.clearLayers();
            linkLayer.clearLayers();
            
            data.features.forEach(feature => {
                if (feature.properties.type === 'node') {
                    const marker = L.circleMarker(
                        [feature.geometry.coordinates[1], feature.geometry.coordinates[0]],
                        {
                            radius: 8,
                            fillColor: getNodeColor(feature.properties.node_type),
                            color: '#000',
                            weight: 1,
                            opacity: 1,
                            fillOpacity: 0.8
                        }
                    );
                    
                    const popupContent = `
                        <div class="info-popup">
                            <h4>节点: ${feature.properties.id}</h4>
                            <p><strong>类型:</strong> ${feature.properties.node_type}</p>
                            <p><strong>井底高程:</strong> ${feature.properties.invert_elev} m</p>
                            <p><strong>最大水深:</strong> ${feature.properties.max_depth} m</p>
                        </div>
                    `;
                    marker.bindPopup(popupContent);
                    marker.on('click', () => showNodeData(feature.properties.id));
                    nodeLayer.addLayer(marker);
                } else if (feature.properties.type === 'link') {
                    const coords = feature.geometry.coordinates.map(c => [c[1], c[0]]);
                    const line = L.polyline(coords, {
                        color: '#333',
                        weight: 4,
                        opacity: 0.8
                    });
                    
                    const popupContent = `
                        <div class="info-popup">
                            <h4>管道: ${feature.properties.id}</h4>
                            <p><strong>类型:</strong> ${feature.properties.link_type}</p>
                            <p><strong>长度:</strong> ${feature.properties.length} m</p>
                            <p><strong>糙率:</strong> ${feature.properties.roughness}</p>
                        </div>
                    `;
                    line.bindPopup(popupContent);
                    linkLayer.addLayer(line);
                }
            });
        })
        .catch(error => console.error('加载管网数据失败:', error));
}

function getNodeColor(type) {
    const colors = {
        'JUNCTION': '#4285F4',
        'OUTFALL': '#EA4335',
        'STORAGE': '#FBBC05'
    };
    return colors[type] || '#4285F4';
}

function runSimulation() {
    const simName = document.getElementById('simName').value || '暴雨模拟';
    
    fetch('/api/simulate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: simName })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('模拟完成!');
            currentSimulationId = data.simulation_id;
            loadSimulations();
            loadHeatmapData(currentSimulationId);
        } else {
            alert('模拟失败: ' + (data.error || '未知错误'));
        }
    })
    .catch(error => {
        console.error('模拟错误:', error);
        alert('模拟请求失败');
    });
}

function loadSimulations() {
    fetch('/api/simulations')
        .then(response => response.json())
        .then(data => {
            const simList = document.getElementById('simList');
            
            if (data.length === 0) {
                simList.innerHTML = '<p style="color: #999; font-size: 13px;">暂无模拟记录</p>';
                return;
            }
            
            simList.innerHTML = data.map(sim => `
                <div class="sim-item ${sim.id === currentSimulationId ? 'active' : ''}" 
                     onclick="selectSimulation(${sim.id})">
                    <div><strong>${sim.name}</strong></div>
                    <div style="font-size: 12px; color: #666;">
                        ${new Date(sim.created_at).toLocaleString()}
                    </div>
                    <span class="status-badge status-${sim.status}">${getStatusText(sim.status)}</span>
                </div>
            `).join('');
        })
        .catch(error => console.error('加载模拟列表失败:', error));
}

function getStatusText(status) {
    const texts = {
        'pending': '等待中',
        'running': '运行中',
        'completed': '已完成',
        'failed': '失败'
    };
    return texts[status] || status;
}

function selectSimulation(simId) {
    currentSimulationId = simId;
    loadSimulations();
    loadHeatmapData(simId);
}

function loadHeatmapData(simId) {
    fetch(`/api/simulations/${simId}/heatmap`)
        .then(response => response.json())
        .then(data => {
            heatmapData = data;
            timestamps = Object.keys(data).sort();
            
            const slider = document.getElementById('timeSlider');
            slider.max = timestamps.length - 1;
            slider.value = 0;
            currentTimeIndex = 0;
            
            if (timestamps.length > 0) {
                updateTimeDisplay(timestamps[0]);
                updateHeatmap(timestamps[0]);
            }
        })
        .catch(error => console.error('加载热力图数据失败:', error));
}

function updateHeatmap(timestamp) {
    if (heatmapLayer) {
        map.removeLayer(heatmapLayer);
        heatmapLayer = null;
    }
    
    if (!document.getElementById('heatmapToggle').checked) {
        return;
    }
    
    const data = heatmapData[timestamp] || [];
    
    if (data.length === 0) return;
    
    const heatPoints = data.map(d => [
        d.lat,
        d.lng,
        d.intensity * 0.8 + 0.2
    ]);
    
    heatmapLayer = L.heatLayer(heatPoints, {
        radius: 35,
        blur: 25,
        maxZoom: 18,
        gradient: {
            0.2: 'blue',
            0.4: 'cyan',
            0.6: 'lime',
            0.8: 'yellow',
            1.0: 'red'
        }
    }).addTo(map);
}

function updateInundationContours(timestamp) {
    contourLayer.clearLayers();
    
    if (!document.getElementById('contourToggle').checked || !currentSimulationId) {
        return;
    }
    
    fetch(`/api/simulations/${currentSimulationId}/inundation?timestamp=${encodeURIComponent(timestamp)}&resolution=60`)
        .then(response => response.json())
        .then(data => {
            if (!data.contours || data.contours.length === 0) return;
            
            data.contours.forEach(contour => {
                contour.polygons.forEach(polygon => {
                    if (polygon.length >= 3) {
                        const poly = L.polygon(polygon, {
                            color: contour.color,
                            weight: 1,
                            fillColor: contour.color,
                            fillOpacity: 0.35,
                            smoothFactor: 1.5
                        });
                        poly.bindPopup(`<strong>淹没水深: ${contour.level} m</strong>`);
                        contourLayer.addLayer(poly);
                    }
                });
            });
        })
        .catch(error => console.error('加载等值面失败:', error));
}

function updateTime() {
    const slider = document.getElementById('timeSlider');
    currentTimeIndex = parseInt(slider.value);
    
    if (timestamps[currentTimeIndex]) {
        updateTimeDisplay(timestamps[currentTimeIndex]);
        updateHeatmap(timestamps[currentTimeIndex]);
        updateInundationContours(timestamps[currentTimeIndex]);
    }
}

function updateTimeDisplay(timestamp) {
    const time = new Date(timestamp);
    document.getElementById('timeDisplay').textContent = 
        time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function togglePlay() {
    isPlaying = !isPlaying;
    const btn = document.getElementById('playBtn');
    
    if (isPlaying) {
        btn.textContent = '⏸️ 暂停';
        playInterval = setInterval(() => {
            currentTimeIndex++;
            if (currentTimeIndex >= timestamps.length) {
                currentTimeIndex = 0;
            }
            document.getElementById('timeSlider').value = currentTimeIndex;
            updateTime();
        }, 500);
    } else {
        btn.textContent = '▶️ 播放';
        if (playInterval) {
            clearInterval(playInterval);
            playInterval = null;
        }
    }
}

function toggleHeatmap() {
    const isChecked = document.getElementById('heatmapToggle').checked;
    
    if (isChecked && timestamps[currentTimeIndex]) {
        updateHeatmap(timestamps[currentTimeIndex]);
    } else if (heatmapLayer) {
        map.removeLayer(heatmapLayer);
        heatmapLayer = null;
    }
}

function toggleContour() {
    const isChecked = document.getElementById('contourToggle').checked;
    
    if (isChecked && timestamps[currentTimeIndex] && currentSimulationId) {
        updateInundationContours(timestamps[currentTimeIndex]);
    } else {
        contourLayer.clearLayers();
    }
}

function showNodeData(nodeId) {
    if (!currentSimulationId) {
        document.getElementById('realtimeData').innerHTML = 
            '<p style="color: #666; font-size: 13px;">请先选择一个模拟结果</p>';
        return;
    }
    
    fetch(`/api/simulations/${currentSimulationId}/nodes?node_id=${nodeId}`)
        .then(response => response.json())
        .then(data => {
            if (data.length === 0) {
                document.getElementById('realtimeData').innerHTML = 
                    '<p style="color: #999; font-size: 13px;">暂无数据</p>';
                return;
            }
            
            const latest = data[data.length - 1];
            const maxDepth = Math.max(...data.map(d => d.depth));
            const totalFlooding = data.reduce((sum, d) => sum + (d.flooding || 0), 0);
            
            document.getElementById('realtimeData').innerHTML = `
                <div style="font-size: 13px;">
                    <p><strong>节点:</strong> ${nodeId}</p>
                    <p><strong>当前水深:</strong> ${latest.depth.toFixed(3)} m</p>
                    <p><strong>最大水深:</strong> ${maxDepth.toFixed(3)} m</p>
                    <p><strong>总溢流量:</strong> ${totalFlooding.toFixed(3)} m³</p>
                    <p><strong>当前入流:</strong> ${latest.total_inflow.toFixed(3)} m³/s</p>
                </div>
            `;
        })
        .catch(error => {
            console.error('加载节点数据失败:', error);
            document.getElementById('realtimeData').innerHTML = 
                '<p style="color: red; font-size: 13px;">数据加载失败</p>';
        });
}

function loadSubcatchments() {
    fetch('/api/subcatchments')
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('subcatchmentSelect');
            data.forEach(sub => {
                const option = document.createElement('option');
                option.value = sub.id;
                option.textContent = `${sub.id} (面积: ${sub.area} ha)`;
                option.dataset.area = sub.area;
                select.appendChild(option);
            });
        })
        .catch(error => console.error('加载汇水区失败:', error));
}

document.getElementById('subcatchmentSelect').addEventListener('change', function() {
    const selected = this.options[this.selectedIndex];
    if (selected && selected.dataset.area) {
        document.getElementById('subArea').value = selected.dataset.area;
    }
});

function updateSubcatchmentArea() {
    const subId = document.getElementById('subcatchmentSelect').value;
    const newArea = parseFloat(document.getElementById('subArea').value);
    
    if (!subId || isNaN(newArea)) {
        alert('请选择汇水区并输入有效的面积');
        return;
    }
    
    fetch('/api/parameters/subcatchment/area', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            subcatchment_id: subId,
            area: newArea
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('汇水区面积更新成功!');
            loadSubcatchments();
        } else {
            alert('更新失败: ' + (data.message || data.error));
        }
    })
    .catch(error => {
        console.error('更新汇水区面积失败:', error);
        alert('更新请求失败');
    });
}

function loadLinks() {
    fetch('/api/links')
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('linkSelect');
            data.forEach(link => {
                const option = document.createElement('option');
                option.value = link.id;
                option.textContent = `${link.id} (糙率: ${link.roughness})`;
                option.dataset.roughness = link.roughness;
                select.appendChild(option);
            });
        })
        .catch(error => console.error('加载管道失败:', error));
}

document.getElementById('linkSelect').addEventListener('change', function() {
    const selected = this.options[this.selectedIndex];
    if (selected && selected.dataset.roughness) {
        document.getElementById('roughness').value = selected.dataset.roughness;
    }
});

function updateRoughness() {
    const linkId = document.getElementById('linkSelect').value;
    const newRoughness = parseFloat(document.getElementById('roughness').value);
    
    if (!linkId || isNaN(newRoughness)) {
        alert('请选择管道并输入有效的糙率');
        return;
    }
    
    fetch('/api/parameters/link/roughness', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            link_id: linkId,
            roughness: newRoughness
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('管道糙率更新成功!');
            loadLinks();
        } else {
            alert('更新失败: ' + (data.message || data.error));
        }
    })
    .catch(error => {
        console.error('更新管道糙率失败:', error);
        alert('更新请求失败');
    });
}

function runLIDComparison() {
    const subcatchmentId = document.getElementById('lidSubcatchment').value;
    const areaRatio = parseFloat(document.getElementById('lidAreaRatio').value);
    const thickness = parseFloat(document.getElementById('lidThickness').value);
    const resultDiv = document.getElementById('lidResult');
    
    resultDiv.innerHTML = '<p style="color: #666;">正在运行LID对比模拟...</p>';
    
    fetch('/api/lid/comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: '透水铺装对比',
            subcatchment_id: subcatchmentId,
            area_ratio: areaRatio,
            pavement_thickness: thickness,
            void_ratio: 0.4,
            permeability: 100
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const comp = data.comparison;
            resultDiv.innerHTML = `
                <div style="background: #e8f5e9; padding: 10px; border-radius: 5px;">
                    <p><strong>✅ 对比完成!</strong></p>
                    <p>淹没减少: <span style="color: #2e7d32; font-weight: bold;">${comp.flooding_reduction.toFixed(1)}%</span></p>
                    <p>流量减少: <span style="color: #2e7d32; font-weight: bold;">${comp.flow_reduction.toFixed(1)}%</span></p>
                    <p>基准总淹没: ${comp.baseline_total_flooding.toFixed(2)} m³</p>
                    <p>LID总淹没: ${comp.lid_total_flooding.toFixed(2)} m³</p>
                    <p style="font-size: 11px; color: #666; margin-top: 5px;">
                        基准ID: ${data.baseline_id} | LID ID: ${data.lid_id}
                    </p>
                </div>
            `;
            loadSimulations();
        } else {
            resultDiv.innerHTML = `<p style="color: red;">错误: ${data.error || '模拟失败'}</p>`;
        }
    })
    .catch(error => {
        resultDiv.innerHTML = `<p style="color: red;">请求失败</p>`;
    });
}

function runCalibration() {
    const name = document.getElementById('calibName').value;
    const iterations = parseInt(document.getElementById('calibIterations').value);
    const paramArea = document.getElementById('paramArea').checked;
    const paramRoughness = document.getElementById('paramRoughness').checked;
    const resultDiv = document.getElementById('calibResult');
    
    if (!paramArea && !paramRoughness) {
        alert('请至少选择一个待率定参数');
        return;
    }
    
    resultDiv.innerHTML = '<p style="color: #666;">SCE-UA率定进行中...(可能需要几分钟)</p>';
    
    const parameters = [];
    if (paramArea) {
        parameters.push({
            name: 'area',
            type: 'subcatchment',
            min: 5,
            max: 20,
            subcatchment_id: 'S1'
        });
    }
    if (paramRoughness) {
        parameters.push({
            name: 'roughness',
            type: 'link',
            min: 0.01,
            max: 0.03,
            link_id: 'C1'
        });
    }
    
    fetch('/api/calibration/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: name,
            n_iterations: iterations,
            n_pop: 10,
            parameters: parameters
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            resultDiv.innerHTML = `
                <div style="background: #e3f2fd; padding: 10px; border-radius: 5px;">
                    <p><strong>✅ 率定完成!</strong></p>
                    <p>最优适应度: <span style="color: #1565c0; font-weight: bold;">${data.best_fitness.toFixed(4)}</span></p>
                    <p style="font-size: 11px; color: #666;">
                        率定ID: ${data.calibration_id}
                    </p>
                </div>
            `;
        } else {
            resultDiv.innerHTML = `<p style="color: red;">错误: ${data.error || '率定失败'}</p>`;
        }
    })
    .catch(error => {
        resultDiv.innerHTML = `<p style="color: red;">请求失败</p>`;
    });
}

function exportAnimation() {
    if (!currentSimulationId) {
        alert('请先选择一个模拟结果');
        return;
    }
    
    const format = document.getElementById('animFormat').value;
    const fps = parseInt(document.getElementById('animFps').value);
    const resultDiv = document.getElementById('animResult');
    
    resultDiv.innerHTML = '<p style="color: #666;">正在生成动画...</p>';
    
    fetch(`/api/animation/export/${currentSimulationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            format: format,
            fps: fps
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            resultDiv.innerHTML = `
                <div style="background: #f3e5f5; padding: 10px; border-radius: 5px;">
                    <p><strong>✅ 导出成功!</strong></p>
                    <p>文件名: ${data.filename}</p>
                    <p>帧数: ${data.n_frames}</p>
                    <p>时长: ${data.duration.toFixed(1)}秒</p>
                    <a href="/api/animation/download/${data.filename}" target="_blank" 
                       style="display: inline-block; margin-top: 5px; padding: 5px 10px; 
                              background: #7b1fa2; color: white; text-decoration: none; 
                              border-radius: 4px; font-size: 12px;">
                        ⬇️ 下载动画
                    </a>
                </div>
            `;
        } else {
            resultDiv.innerHTML = `<p style="color: red;">错误: ${data.error || '导出失败'}</p>`;
        }
    })
    .catch(error => {
        resultDiv.innerHTML = `<p style="color: red;">请求失败: ${error.message}</p>`;
    });
}

function listAnimations() {
    const listDiv = document.getElementById('animList');
    
    fetch('/api/animation/list')
        .then(response => response.json())
        .then(files => {
            if (files.length === 0) {
                listDiv.innerHTML = '<p style="color: #999;">暂无导出的动画</p>';
                return;
            }
            
            listDiv.innerHTML = files.map(f => `
                <div style="padding: 5px; border-bottom: 1px solid #eee; font-size: 11px;">
                    <strong>${f.filename}</strong>
                    <br>大小: ${(f.size / 1024 / 1024).toFixed(2)} MB
                    <br><a href="/api/animation/download/${f.filename}" target="_blank">下载</a>
                </div>
            `).join('');
        })
        .catch(error => {
            listDiv.innerHTML = '<p style="color: red;">加载失败</p>';
        });
}

window.onload = initMap;
