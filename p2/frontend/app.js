const { ipcRenderer } = require('electron');

const canvas = document.getElementById('image-canvas');
const ctx = canvas.getContext('2d');
const imageContainer = document.getElementById('image-container');
const imagePlaceholder = document.getElementById('image-placeholder');
const recognitionContent = document.getElementById('recognition-content');
const candidatesSection = document.getElementById('candidates-section');
const candidatesList = document.getElementById('candidates-list');
const manualEdit = document.getElementById('manual-edit');
const manualInput = document.getElementById('manual-input');
const collationPanel = document.getElementById('collation-panel');
const historyPanel = document.getElementById('history-panel');
const comparisonResult = document.getElementById('comparison-result');
const diffDisplay = document.getElementById('diff-display');
const strokeAnimationPanel = document.getElementById('stroke-animation-panel');
const batchResultsPanel = document.getElementById('batch-results-panel');
const batchList = document.getElementById('batch-list');
const batchSelections = document.getElementById('batch-selections');

let currentImage = null;
let originalImage = null;
let isDrawing = false;
let startX, startY;
let selection = null;
let zoom = 1;
let currentRecognizedText = '';
let currentCollationId = null;
let strokeAnimator = null;
let isBatchMode = false;
let batchResults = [];

document.addEventListener('DOMContentLoaded', () => {
    strokeAnimator = new StrokeAnimation('stroke-canvas');
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('btn-open-image').addEventListener('click', openImage);
    document.getElementById('btn-batch-recognize').addEventListener('click', toggleBatchMode);
    document.getElementById('btn-start-collation').addEventListener('click', toggleCollationPanel);
    document.getElementById('btn-view-history').addEventListener('click', toggleHistoryPanel);
    document.getElementById('btn-zoom-in').addEventListener('click', () => setZoom(zoom * 1.2));
    document.getElementById('btn-zoom-out').addEventListener('click', () => setZoom(zoom / 1.2));
    document.getElementById('btn-reset-zoom').addEventListener('click', () => setZoom(1));
    document.getElementById('btn-confirm-edit').addEventListener('click', confirmManualEdit);
    document.getElementById('btn-compare').addEventListener('click', compareVersions);
    document.getElementById('btn-save-collation').addEventListener('click', saveCollation);
    document.getElementById('btn-export-txt').addEventListener('click', () => exportCollation('txt'));
    document.getElementById('btn-export-tex').addEventListener('click', () => exportCollation('tex'));
    document.getElementById('btn-export-html').addEventListener('click', () => exportCollation('html'));
    
    document.getElementById('btn-stroke-play').addEventListener('click', () => strokeAnimator.play());
    document.getElementById('btn-stroke-pause').addEventListener('click', () => strokeAnimator.pause());
    document.getElementById('btn-stroke-reset').addEventListener('click', () => strokeAnimator.reset());
    document.getElementById('btn-stroke-prev').addEventListener('click', () => strokeAnimator.prevStroke());
    document.getElementById('btn-stroke-next').addEventListener('click', () => strokeAnimator.nextStroke());
    document.getElementById('stroke-speed').addEventListener('input', (e) => strokeAnimator.setSpeed(110 - parseInt(e.target.value)));
    
    document.getElementById('btn-clear-batch').addEventListener('click', clearBatchResults);
    document.getElementById('btn-copy-batch').addEventListener('click', copyBatchText);
    
    document.querySelectorAll('.btn-use-recognition').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.target.dataset.target;
            document.getElementById(`${target}-text`).value = currentRecognizedText;
        });
    });
    
    document.querySelectorAll('.btn-use-batch').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.target.dataset.target;
            const batchText = batchResults.map(r => r.text).join('');
            document.getElementById(`${target}-text`).value = batchText;
        });
    });
    
    canvas.addEventListener('mousedown', startSelection);
    canvas.addEventListener('mousemove', drawSelection);
    canvas.addEventListener('mouseup', endSelection);
    canvas.addEventListener('mouseleave', endSelection);
}

async function openImage() {
    const filePath = await ipcRenderer.invoke('open-image');
    if (filePath) {
        loadImage(filePath);
    }
}

function loadImage(filePath) {
    const img = new Image();
    img.onload = () => {
        originalImage = img;
        currentImage = img;
        imagePlaceholder.style.display = 'none';
        canvas.style.display = 'block';
        setZoom(1);
        drawImage();
        clearBatchResults();
    };
    img.src = filePath;
}

function drawImage() {
    if (!currentImage) return;
    
    canvas.width = currentImage.width * zoom;
    canvas.height = currentImage.height * zoom;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
    
    if (selection && !isBatchMode) {
        ctx.strokeStyle = '#D2691E';
        ctx.lineWidth = 2;
        ctx.strokeRect(selection.x, selection.y, selection.width, selection.height);
        ctx.fillStyle = 'rgba(210, 105, 30, 0.1)';
        ctx.fillRect(selection.x, selection.y, selection.width, selection.height);
    }
}

function setZoom(newZoom) {
    zoom = Math.max(0.1, Math.min(5, newZoom));
    drawImage();
    updateBatchSelectionPositions();
}

function startSelection(e) {
    if (!currentImage) return;
    
    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    isDrawing = true;
    selection = { x: startX, y: startY, width: 0, height: 0 };
}

function drawSelection(e) {
    if (!isDrawing) return;
    
    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    selection.x = Math.min(startX, currentX);
    selection.y = Math.min(startY, currentY);
    selection.width = Math.abs(currentX - startX);
    selection.height = Math.abs(currentY - startY);
    
    drawImage();
}

async function endSelection(e) {
    if (!isDrawing) return;
    isDrawing = false;
    
    if (selection && selection.width > 10 && selection.height > 10) {
        if (isBatchMode) {
            await addToBatch();
        } else {
            await recognizeSelectedArea();
        }
    }
}

async function recognizeSelectedArea() {
    if (!selection) return;
    
    const x = selection.x / zoom;
    const y = selection.y / zoom;
    const width = selection.width / zoom;
    const height = selection.height / zoom;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(originalImage, x, y, width, height, 0, 0, width, height);
    const imageData = tempCanvas.toDataURL('image/png');
    
    try {
        const result = await ipcRenderer.invoke('recognize-text', imageData, x, y, width, height);
        displayRecognitionResult(result);
    } catch (error) {
        console.error('Recognition failed:', error);
        recognitionContent.innerHTML = '<p class="hint">识别失败，请重试</p>';
    }
}

function displayRecognitionResult(result) {
    currentRecognizedText = result.text;
    
    recognitionContent.innerHTML = `
        <div class="result-text">${result.text}</div>
        <div class="confidence">置信度: ${(result.confidence * 100).toFixed(1)}%</div>
    `;
    
    if (result.candidates && result.candidates.length > 0) {
        candidatesSection.style.display = 'block';
        candidatesList.innerHTML = result.candidates.map((c, i) => `
            <div class="candidate-item" data-char="${c.char}">
                <span class="char">${c.char}</span>
                <span class="conf">${(c.confidence * 100).toFixed(0)}%</span>
            </div>
        `).join('');
        
        candidatesList.querySelectorAll('.candidate-item').forEach(item => {
            item.addEventListener('click', () => {
                const char = item.dataset.char;
                currentRecognizedText = char;
                recognitionContent.innerHTML = `
                    <div class="result-text">${char}</div>
                    <div class="confidence">已选择候选字</div>
                `;
                updateStrokeAnimation(char);
            });
        });
    } else {
        candidatesSection.style.display = 'none';
    }
    
    manualEdit.style.display = 'block';
    manualInput.value = result.text;
    
    updateStrokeAnimation(result.text);
    strokeAnimationPanel.style.display = 'block';
}

function updateStrokeAnimation(char) {
    if (strokeAnimator && strokeAnimator.hasCharacter(char)) {
        strokeAnimator.loadCharacter(char);
        strokeAnimationPanel.style.display = 'block';
    } else if (char.length === 1) {
        strokeAnimationPanel.style.display = 'block';
        document.getElementById('stroke-info').textContent = `暂无「${char}」的笔画数据`;
    }
}

function confirmManualEdit() {
    const text = manualInput.value.trim();
    if (text) {
        currentRecognizedText = text;
        recognitionContent.innerHTML = `
            <div class="result-text">${text}</div>
            <div class="confidence">手动修正</div>
        `;
        updateStrokeAnimation(text.charAt(0));
    }
}

function toggleBatchMode() {
    isBatchMode = !isBatchMode;
    const btn = document.getElementById('btn-batch-recognize');
    
    if (isBatchMode) {
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
        btn.textContent = '退出批量';
        batchResultsPanel.style.display = 'block';
    } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        btn.textContent = '批量识别';
    }
    
    selection = null;
    drawImage();
}

async function addToBatch() {
    if (!selection) return;
    
    const x = selection.x / zoom;
    const y = selection.y / zoom;
    const width = selection.width / zoom;
    const height = selection.height / zoom;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(originalImage, x, y, width, height, 0, 0, width, height);
    const imageData = tempCanvas.toDataURL('image/png');
    
    try {
        const result = await ipcRenderer.invoke('recognize-text', imageData, x, y, width, height);
        
        const batchItem = {
            id: Date.now(),
            text: result.text,
            confidence: result.confidence,
            x: selection.x,
            y: selection.y,
            width: selection.width,
            height: selection.height,
            candidates: result.candidates
        };
        
        batchResults.push(batchItem);
        updateBatchDisplay();
        addBatchSelectionBox(batchItem);
        
    } catch (error) {
        console.error('Batch recognition failed:', error);
    }
    
    selection = null;
    drawImage();
}

function updateBatchDisplay() {
    batchList.innerHTML = batchResults.map((item, index) => `
        <div class="batch-item" data-id="${item.id}">
            <span class="char">${item.text}</span>
            <span class="conf">${(item.confidence * 100).toFixed(0)}%</span>
            <span class="remove" data-id="${item.id}">×</span>
        </div>
    `).join('');
    
    document.getElementById('batch-count').textContent = `已识别: ${batchResults.length} 字`;
    
    batchList.querySelectorAll('.remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeBatchItem(parseInt(btn.dataset.id));
        });
    });
    
    batchList.querySelectorAll('.batch-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = parseInt(item.dataset.id);
            const batchItem = batchResults.find(b => b.id === id);
            if (batchItem) {
                currentRecognizedText = batchItem.text;
                recognitionContent.innerHTML = `
                    <div class="result-text">${batchItem.text}</div>
                    <div class="confidence">置信度: ${(batchItem.confidence * 100).toFixed(1)}%</div>
                `;
                updateStrokeAnimation(batchItem.text);
            }
        });
    });
}

function addBatchSelectionBox(item) {
    const box = document.createElement('div');
    box.className = 'batch-selection-box';
    box.dataset.id = item.id;
    box.style.left = item.x + 'px';
    box.style.top = item.y + 'px';
    box.style.width = item.width + 'px';
    box.style.height = item.height + 'px';
    box.innerHTML = `<span class="label">${item.text}</span>`;
    
    box.addEventListener('click', () => {
        removeBatchItem(item.id);
    });
    
    batchSelections.appendChild(box);
}

function updateBatchSelectionPositions() {
    const boxes = batchSelections.querySelectorAll('.batch-selection-box');
    boxes.forEach(box => {
        const id = parseInt(box.dataset.id);
        const item = batchResults.find(b => b.id === id);
        if (item) {
            box.style.left = (item.x * zoom) + 'px';
            box.style.top = (item.y * zoom) + 'px';
            box.style.width = (item.width * zoom) + 'px';
            box.style.height = (item.height * zoom) + 'px';
        }
    });
}

function removeBatchItem(id) {
    batchResults = batchResults.filter(item => item.id !== id);
    const box = batchSelections.querySelector(`[data-id="${id}"]`);
    if (box) box.remove();
    updateBatchDisplay();
}

function clearBatchResults() {
    batchResults = [];
    batchSelections.innerHTML = '';
    updateBatchDisplay();
}

function copyBatchText() {
    const text = batchResults.map(r => r.text).join('');
    navigator.clipboard.writeText(text).then(() => {
        alert('已复制到剪贴板');
    });
}

function toggleCollationPanel() {
    collationPanel.style.display = collationPanel.style.display === 'none' ? 'block' : 'none';
    historyPanel.style.display = 'none';
}

async function toggleHistoryPanel() {
    historyPanel.style.display = historyPanel.style.display === 'none' ? 'block' : 'none';
    collationPanel.style.display = 'none';
    
    if (historyPanel.style.display === 'block') {
        await loadHistory();
    }
}

async function compareVersions() {
    const texts = [
        document.getElementById('version1-text').value.trim(),
        document.getElementById('version2-text').value.trim(),
        document.getElementById('version3-text').value.trim()
    ].filter(t => t);
    
    if (texts.length < 2) {
        alert('请至少输入两个版本的文本进行对比');
        return;
    }
    
    try {
        const result = await ipcRenderer.invoke('compare-versions', texts);
        displayComparisonResult(result);
    } catch (error) {
        console.error('Comparison failed:', error);
        alert('对比失败，请重试');
    }
}

function displayComparisonResult(result) {
    comparisonResult.style.display = 'block';
    
    let html = '<div style="margin-bottom: 16px;">';
    
    result.versions.forEach((ver, idx) => {
        const displayText = ver.aligned || ver.text;
        html += `<div style="margin-bottom: 8px;"><strong>版本${idx + 1}:</strong> `;
        
        for (let i = 0; i < displayText.length; i++) {
            const char = displayText[i];
            const isDiff = result.differences.some(d => d.position === i);
            if (isDiff) {
                const diffInfo = result.differences.find(d => d.position === i);
                const tooltip = diffInfo.versions.map((v, vi) => `版本${vi + 1}: ${v || '(空)'}`).join('\\n');
                const gapClass = diffInfo.is_gap ? 'diff-gap' : '';
                html += `<span class="diff-char diff-${idx + 1} ${gapClass}">${char}<span class="diff-tooltip">${tooltip}</span></span>`;
            } else if (char === '□') {
                html += `<span style="color: #ccc;">${char}</span>`;
            } else {
                html += char;
            }
        }
        
        if (ver.edit_distance !== undefined) {
            html += ` <span style="font-size: 12px; color: #888;">(编辑距离: ${ver.edit_distance})</span>`;
        }
        
        html += '</div>';
    });
    
    html += '</div>';
    
    if (result.differences.length > 0) {
        html += '<div><strong>差异位置:</strong><ul>';
        result.differences.forEach(diff => {
            const gapNote = diff.is_gap ? ' [含空位]' : '';
            html += `<li>位置 ${diff.position + 1}${gapNote}: ${diff.versions.map((v, i) => `版本${i + 1}=${v || '(空)'}`).join(', ')}</li>`;
        });
        html += '</ul></div>';
        
        if (result.alignment_method) {
            html += `<p style="font-size: 12px; color: #888; margin-top: 8px;">对齐算法: ${result.alignment_method}</p>`;
        }
    } else {
        html += '<p style="color: #666;">所有版本内容完全一致</p>';
    }
    
    diffDisplay.innerHTML = html;
}

async function saveCollation() {
    const note = document.getElementById('collation-note').value.trim();
    const texts = [
        document.getElementById('version1-text').value.trim(),
        document.getElementById('version2-text').value.trim(),
        document.getElementById('version3-text').value.trim()
    ].filter(t => t);
    
    const data = {
        title: `校勘记录 - ${new Date().toLocaleString()}`,
        versions: texts,
        note: note,
        created_at: new Date().toISOString()
    };
    
    try {
        const result = await ipcRenderer.invoke('save-collation', data);
        currentCollationId = result.id;
        alert('校勘记录已保存');
    } catch (error) {
        console.error('Save failed:', error);
        alert('保存失败，请重试');
    }
}

async function exportCollation(format) {
    if (!currentCollationId) {
        alert('请先保存校勘记录');
        return;
    }
    
    try {
        const result = await ipcRenderer.invoke('export-collation', currentCollationId, format);
        if (result.success) {
            alert(`已导出到: ${result.path}`);
        }
    } catch (error) {
        console.error('Export failed:', error);
        alert('导出失败，请重试');
    }
}

async function loadHistory() {
    try {
        const collations = await ipcRenderer.invoke('get-collations');
        const historyList = document.getElementById('history-list');
        
        if (collations.length === 0) {
            historyList.innerHTML = '<p class="hint">暂无校勘记录</p>';
            return;
        }
        
        historyList.innerHTML = collations.map(c => `
            <div class="history-item" data-id="${c.id}">
                <div class="title">${c.title}</div>
                <div class="date">${new Date(c.created_at).toLocaleString()}</div>
                <div class="preview">${c.note || '无校勘记'}</div>
            </div>
        `).join('');
        
        historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                loadCollation(id);
            });
        });
    } catch (error) {
        console.error('Load history failed:', error);
    }
}

function loadCollation(id) {
    console.log('Loading collation:', id);
}
