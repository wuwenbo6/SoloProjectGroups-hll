let currentRecordId = null;
let selectedFile = null;

const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const recognizeBtn = document.getElementById('recognizeBtn');
const clearBtn = document.getElementById('clearBtn');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const loadingOverlay = document.getElementById('loadingOverlay');
const resultsSection = document.getElementById('resultsSection');
const historyList = document.getElementById('historyList');

uploadArea.addEventListener('click', () => fileInput.click());
uploadBtn.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

clearBtn.addEventListener('click', () => {
    selectedFile = null;
    fileInfo.style.display = 'none';
    recognizeBtn.disabled = true;
    fileInput.value = '';
});

recognizeBtn.addEventListener('click', recognizeCircuit);

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

document.getElementById('downloadNetlist').addEventListener('click', () => {
    if (currentRecordId) {
        window.open(`/api/netlist/${currentRecordId}`, '_blank');
    }
});

document.getElementById('exportSchBtn').addEventListener('click', () => {
    if (currentRecordId) {
        window.open(`/api/kicad/sch/${currentRecordId}`, '_blank');
    }
});

document.getElementById('exportPcbBtn').addEventListener('click', () => {
    if (currentRecordId) {
        window.open(`/api/kicad/pcb/${currentRecordId}`, '_blank');
    }
});

document.getElementById('exportProjectBtn').addEventListener('click', () => {
    if (currentRecordId) {
        window.open(`/api/kicad/project/${currentRecordId}`, '_blank');
    }
});

function handleFileSelect(file) {
    if (!file.type.startsWith('image/')) {
        alert('请选择图片文件');
        return;
    }
    selectedFile = file;
    fileName.textContent = file.name;
    fileInfo.style.display = 'flex';
    recognizeBtn.disabled = false;
}

async function recognizeCircuit() {
    if (!selectedFile) return;

    loadingOverlay.style.display = 'flex';
    
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
        const response = await fetch('/api/recognize', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        
        if (result.success) {
            displayResults(result);
            currentRecordId = result.record_id;
            loadHistory();
        } else {
            alert('识别失败: ' + (result.message || '未知错误'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('识别失败，请重试');
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

function displayResults(result) {
    resultsSection.style.display = 'block';
    
    document.getElementById('originalImage').src = result.original_path;
    document.getElementById('resultImage').src = result.visualization_path;
    document.getElementById('errorImage').src = result.error_highlight_path;
    
    const components = result.components;
    document.getElementById('compCount').textContent = components.length;
    document.getElementById('resistorCount').textContent = components.filter(c => c.type === 'RESISTOR').length;
    document.getElementById('capacitorCount').textContent = components.filter(c => c.type === 'CAPACITOR').length;
    document.getElementById('icCount').textContent = components.filter(c => c.type === 'IC').length;
    
    const componentsList = document.getElementById('componentsList');
    componentsList.innerHTML = components.map(comp => `
        <div class="component-card">
            <div class="component-type ${comp.type}">
                ${getTypeIcon(comp.type)} ${getTypeName(comp.type)}
            </div>
            <div class="component-details">
                <p><strong>位置:</strong> (${comp.x}, ${comp.y})</p>
                <p><strong>尺寸:</strong> ${comp.width} × ${comp.height}</p>
                <p><strong>引脚数:</strong> ${comp.pin_count}</p>
                ${comp.rotation_angle ? `<p><strong>旋转角度:</strong> ${comp.rotation_angle}°</p>` : ''}
                ${comp.text ? `<p><strong>识别文字:</strong> ${comp.text}</p>` : ''}
                ${comp.pin_positions ? `
                <p><strong>引脚详情:</strong></p>
                <ul style="margin: 5px 0 0 20px; font-size: 0.85rem;">
                    ${comp.pin_positions.slice(0, 8).map(pin => 
                        `<li>${pin.side} #${pin.pin_number || '?'}: (${pin.position[0]}, ${pin.position[1]})</li>`
                    ).join('')}
                </ul>
                ` : ''}
            </div>
            <div class="confidence-bar">
                <div class="confidence-fill" style="width: ${comp.confidence * 100}%"></div>
            </div>
            <p style="text-align: right; margin-top: 5px; color: #666; font-size: 0.85rem;">
                置信度: ${(comp.confidence * 100).toFixed(1)}%
            </p>
        </div>
    `).join('');
    
    document.getElementById('netlistContent').textContent = result.spice_netlist;
    
    drawConnectionGraph(result.components, result.connections);
    
    displayRoutingSuggestions(result.routing_suggestions);
    
    displayErrors(result.validation);
}

function displayRoutingSuggestions(routing) {
    document.getElementById('totalWireLength').textContent = routing.total_wire_length;
    document.getElementById('totalVias').textContent = routing.total_vias;
    document.getElementById('routeCount').textContent = routing.suggestions.length;
    
    const routingList = document.getElementById('routingList');
    routingList.innerHTML = routing.suggestions.slice(0, 10).map(route => `
        <div class="routing-item">
            <div class="routing-header">
                <span class="routing-title">
                    ${getTypeIcon(route.from_type)} ${route.from_type} #${route.from_component} 
                    → 
                    ${getTypeIcon(route.to_type)} ${route.to_type} #${route.to_component}
                </span>
                <span class="routing-score">质量: ${(route.quality_score * 100).toFixed(0)}%</span>
            </div>
            <div class="routing-details">
                <div><strong>起点:</strong> (${route.from_terminal[0]}, ${route.from_terminal[1]})</div>
                <div><strong>终点:</strong> (${route.to_terminal[0]}, ${route.to_terminal[1]})</div>
                <div><strong>线长:</strong> ${route.wire_length}px</div>
                <div><strong>过孔:</strong> ${route.via_count}个</div>
                <div><strong>路径点数:</strong> ${route.path.length}</div>
            </div>
        </div>
    `).join('');
}

function displayErrors(validation) {
    const errorSummary = document.getElementById('errorSummary');
    if (validation.total_errors > 0 || validation.total_warnings > 0) {
        errorSummary.style.display = 'block';
        document.getElementById('errorCount').textContent = validation.total_errors;
        document.getElementById('warningCount').textContent = validation.total_warnings;
    } else {
        errorSummary.style.display = 'none';
    }
    
    const errorList = document.getElementById('errorList');
    if (validation.errors.length === 0) {
        errorList.innerHTML = `
            <div style="text-align: center; padding: 60px; color: #11998e;">
                <div style="font-size: 4rem; margin-bottom: 20px;">✅</div>
                <h3>未检测到错误</h3>
                <p>电路图识别结果良好</p>
            </div>
        `;
    } else {
        errorList.innerHTML = validation.errors.map(error => `
            <div class="error-item ${error.severity}">
                <div class="error-type">
                    ${error.severity === 'error' ? '❌' : '⚠️'} ${error.type}
                </div>
                <div class="error-message">${error.message}</div>
                <div class="error-position">
                    位置: (${error.position ? error.position[0] : '?'}, ${error.position ? error.position[1] : '?'})
                    ${error.component_id ? ` | 元件: #${error.component_id}` : ''}
                    ${error.confidence ? ` | 置信度: ${(error.confidence * 100).toFixed(1)}%` : ''}
                </div>
            </div>
        `).join('');
    }
}

function getTypeIcon(type) {
    const icons = {
        'RESISTOR': '⚡',
        'CAPACITOR': '🔋',
        'IC': '💾',
        'UNKNOWN': '❓'
    };
    return icons[type] || '❓';
}

function getTypeName(type) {
    const names = {
        'RESISTOR': '电阻',
        'CAPACITOR': '电容',
        'IC': '集成电路',
        'UNKNOWN': '未知'
    };
    return names[type] || type;
}

function drawConnectionGraph(components, connections) {
    const canvas = document.getElementById('connectionGraph');
    const ctx = canvas.getContext('2d');
    
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 80;
    
    const compMap = {};
    components.forEach((comp, i) => {
        const angle = (2 * Math.PI * i) / components.length - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        compMap[comp.id] = { ...comp, x, y };
    });
    
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    connections.forEach(conn => {
        const from = compMap[conn.from];
        const to = compMap[conn.to];
        if (from && to) {
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
        }
    });
    
    Object.values(compMap).forEach(comp => {
        const colors = {
            'RESISTOR': '#11998e',
            'CAPACITOR': '#e74c3c',
            'IC': '#667eea',
            'UNKNOWN': '#95a5a6'
        };
        const color = colors[comp.type] || '#95a5a6';
        
        ctx.beginPath();
        ctx.arc(comp.x, comp.y, 25, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(getTypeIcon(comp.type), comp.x, comp.y);
        
        ctx.fillStyle = '#333';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${getTypeName(comp.type)} ${comp.id}`, comp.x, comp.y + 40);
    });
}

async function loadHistory() {
    try {
        const response = await fetch('/api/records');
        const result = await response.json();
        
        if (result.success && result.records.length > 0) {
            historyList.innerHTML = result.records.map(record => `
                <div class="history-item" onclick="loadRecord(${record.id})">
                    <div class="history-info">
                        <h4>${record.filename}</h4>
                        <p>${new Date(record.created_at).toLocaleString('zh-CN')}</p>
                    </div>
                    <div class="history-stats">
                        <span>🔧 ${record.component_count} 元件</span>
                        <span>🔗 ${record.wiring_count} 连线</span>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

async function loadRecord(recordId) {
    try {
        loadingOverlay.style.display = 'flex';
        const response = await fetch(`/api/records/${recordId}`);
        const result = await response.json();
        
        if (result.success) {
            const record = result.record;
            const mockResult = {
                record_id: record.id,
                original_path: record.original_path,
                visualization_path: '/' + record.visualization_path,
                components: record.components,
                connections: [],
                spice_netlist: record.spice_netlist
            };
            
            displayResults(mockResult);
            currentRecordId = recordId;
        }
    } catch (error) {
        console.error('Error loading record:', error);
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

loadHistory();
window.addEventListener('resize', () => {
    if (currentRecordId) {
        loadRecord(currentRecordId);
    }
});
