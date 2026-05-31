const { ipcRenderer } = require('electron');

let currentImagePath = null;
let currentImageName = null;
let currentResult = null;
let deletedParticles = [];
let mode = 'select';
let sizeChart = null;
let circularityChart = null;
let isDrawing = false;
let drawingPoints = [];
let nextParticleId = 10000;
let scaleFactor = 1.0;
let isCalibrating = false;
let calStartPoint = null;
let calEndPoint = null;
let originalImage = null;

const canvas = document.getElementById('imageCanvas');
const ctx = canvas.getContext('2d');
const placeholder = document.getElementById('placeholder');
const loadingOverlay = document.getElementById('loadingOverlay');
const historyModal = document.getElementById('historyModal');

function initCharts() {
    const sizeCtx = document.getElementById('sizeChart').getContext('2d');
    const circularityCtx = document.getElementById('circularityChart').getContext('2d');

    sizeChart = new Chart(sizeCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: '颗粒数量',
                data: [],
                backgroundColor: 'rgba(102, 126, 234, 0.7)',
                borderColor: 'rgba(102, 126, 234, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            },
            plugins: {
                title: {
                    display: false
                }
            }
        }
    });

    circularityChart = new Chart(circularityCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: '颗粒数量',
                data: [],
                backgroundColor: 'rgba(118, 75, 162, 0.7)',
                borderColor: 'rgba(118, 75, 162, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function updateCharts(particles) {
    const areas = particles.map(p => p.area);
    const circularities = particles.map(p => p.circularity);

    if (areas.length > 0) {
        const areaBins = {};
        const binSize = Math.ceil((Math.max(...areas) - Math.min(...areas)) / 10) || 100;
        areas.forEach(area => {
            const bin = Math.floor(area / binSize) * binSize;
            areaBins[bin] = (areaBins[bin] || 0) + 1;
        });

        const areaLabels = Object.keys(areaBins).sort((a, b) => a - b).map(k => `${k}-${parseInt(k) + binSize}`);
        const areaData = areaLabels.map(label => areaBins[label.split('-')[0]]);

        sizeChart.data.labels = areaLabels;
        sizeChart.data.datasets[0].data = areaData;
        sizeChart.update();
    }

    const circBins = {};
    for (let i = 0; i < 10; i++) {
        circBins[(i * 0.1).toFixed(1)] = 0;
    }
    circularities.forEach(c => {
        const bin = Math.floor(c * 10) / 10;
        const key = bin.toFixed(1);
        if (circBins[key] !== undefined) {
            circBins[key]++;
        }
    });

    circularityChart.data.labels = Object.keys(circBins);
    circularityChart.data.datasets[0].data = Object.values(circBins);
    circularityChart.update();
}

function loadImageToCanvas(imageSrc, callback) {
    const img = new Image();
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        placeholder.style.display = 'none';
        originalImage = img;
        if (callback) callback();
    };
    img.src = imageSrc;
}

function drawParticle(particle, color = '#00ff00', lineWidth = 2) {
    if (!particle.contour || particle.contour.length === 0) return;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(particle.contour[0][0], particle.contour[0][1]);
    for (let i = 1; i < particle.contour.length; i++) {
        ctx.lineTo(particle.contour[i][0], particle.contour[i][1]);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(particle.centroid.x, particle.centroid.y, 3, 0, Math.PI * 2);
    ctx.fill();
}

function redrawAllParticles() {
    if (!currentResult) return;
    
    const img = new Image();
    img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        currentResult.particles.forEach(particle => {
            drawParticle(particle, '#00ff00');
        });
    };
    img.src = `data:image/png;base64,${currentResult.annotated_image}`;
}

function updateStatistics() {
    if (!currentResult) return;

    const particles = currentResult.particles;
    document.getElementById('totalCount').textContent = particles.length;
    
    if (particles.length > 0) {
        const avgArea = particles.reduce((sum, p) => sum + p.area, 0) / particles.length;
        const avgCirc = particles.reduce((sum, p) => sum + p.circularity, 0) / particles.length;
        
        const unit = scaleFactor !== 1.0 ? ' nm²' : ' px²';
        document.getElementById('avgArea').textContent = avgArea.toFixed(2) + unit;
        document.getElementById('avgCircularity').textContent = avgCirc.toFixed(4);
    } else {
        document.getElementById('avgArea').textContent = '-';
        document.getElementById('avgCircularity').textContent = '-';
    }

    updateCharts(particles);
}

document.getElementById('uploadBtn').addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('show-open-dialog', {
        properties: ['openFile'],
        filters: [
            { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'tiff'] }
        ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        currentImagePath = result.filePaths[0];
        currentImageName = currentImagePath.split('/').pop();
        document.getElementById('imageName').textContent = currentImageName;
        document.getElementById('analyzeBtn').disabled = false;
        document.getElementById('calibrateBtn').disabled = false;
        
        loadImageToCanvas(currentImagePath);
    }
});

document.getElementById('minArea').addEventListener('input', (e) => {
    document.getElementById('minAreaValue').textContent = e.target.value;
});

document.getElementById('maxArea').addEventListener('input', (e) => {
    document.getElementById('maxAreaValue').textContent = e.target.value;
});

document.getElementById('fgThreshold').addEventListener('input', (e) => {
    document.getElementById('fgThresholdValue').textContent = e.target.value;
});

document.getElementById('analyzeBtn').addEventListener('click', async () => {
    if (!currentImagePath) return;

    loadingOverlay.classList.remove('hidden');
    
    try {
        const minArea = parseInt(document.getElementById('minArea').value);
        const maxArea = parseInt(document.getElementById('maxArea').value);
        const fgThreshold = parseFloat(document.getElementById('fgThreshold').value);
        const useAdaptive = document.getElementById('useAdaptive').checked;
        
        currentResult = await ipcRenderer.invoke('analyze-image', 
            currentImagePath, minArea, maxArea, fgThreshold, useAdaptive, scaleFactor);
        
        if (currentResult.error) {
            alert(currentResult.error);
            return;
        }

        deletedParticles = [];
        loadImageToCanvas(`data:image/png;base64,${currentResult.annotated_image}`, () => {
            updateStatistics();
        });

        document.getElementById('saveBtn').disabled = false;
        document.getElementById('exportBtn').disabled = false;
    } catch (error) {
        console.error('Analysis error:', error);
        alert('分析失败: ' + error.message);
    } finally {
        loadingOverlay.classList.add('hidden');
    }
});

document.getElementById('calibrateBtn').addEventListener('click', () => {
    if (!currentImagePath) {
        alert('请先上传图像');
        return;
    }
    
    isCalibrating = true;
    calStartPoint = null;
    calEndPoint = null;
    document.getElementById('calibrationHint').classList.remove('hidden');
    document.getElementById('calibrationHint').textContent = '请在图像上点击两点绘制标尺线，然后输入实际距离';
    document.getElementById('calibrateBtn').textContent = '取消校准';
    
    if (originalImage) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(originalImage, 0, 0);
    }
});

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (isCalibrating) {
        if (!calStartPoint) {
            calStartPoint = { x, y };
            ctx.fillStyle = '#ff6b6b';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
        } else if (!calEndPoint) {
            calEndPoint = { x, y };
            const distance = Math.sqrt(
                Math.pow(calEndPoint.x - calStartPoint.x, 2) + 
                Math.pow(calEndPoint.y - calStartPoint.y, 2)
            );
            
            ctx.fillStyle = '#ff6b6b';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = '#ff6b6b';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(calStartPoint.x, calStartPoint.y);
            ctx.lineTo(calEndPoint.x, calEndPoint.y);
            ctx.stroke();
            ctx.setLineDash([]);
            
            document.getElementById('calPixelDistance').textContent = distance.toFixed(2) + ' px';
            document.getElementById('applyCalibration').disabled = false;
            document.getElementById('calibrationHint').textContent = '请输入实际距离并点击"应用校准"';
            
            isCalibrating = false;
            document.getElementById('calibrateBtn').textContent = '重新校准';
        }
        return;
    }

    if (!currentResult) return;

    if (mode === 'delete') {
        const particleIndex = findParticleAtPoint(x, y);
        if (particleIndex !== -1) {
            const deleted = currentResult.particles.splice(particleIndex, 1)[0];
            deletedParticles.push(deleted);
            document.getElementById('undoBtn').disabled = false;
            redrawAllParticles();
            updateStatistics();
        }
    } else if (mode === 'add') {
        isDrawing = true;
        drawingPoints = [[x, y]];
    } else if (mode === 'select') {
        showParticleInfo(x, y, e.clientX, e.clientY);
    }
});

document.getElementById('calDistance').addEventListener('input', (e) => {
    if (calStartPoint && calEndPoint && e.target.value) {
        const pixelDistance = Math.sqrt(
            Math.pow(calEndPoint.x - calStartPoint.x, 2) + 
            Math.pow(calEndPoint.y - calStartPoint.y, 2)
        );
        const actualDistance = parseFloat(e.target.value);
        if (actualDistance > 0) {
            const calculatedScale = actualDistance / pixelDistance;
            document.getElementById('scaleValue').textContent = calculatedScale.toFixed(4);
        }
    }
});

document.getElementById('applyCalibration').addEventListener('click', () => {
    const actualDistance = parseFloat(document.getElementById('calDistance').value);
    if (!actualDistance || actualDistance <= 0) {
        alert('请输入有效的实际距离');
        return;
    }
    
    const pixelDistance = Math.sqrt(
        Math.pow(calEndPoint.x - calStartPoint.x, 2) + 
        Math.pow(calEndPoint.y - calStartPoint.y, 2)
    );
    
    scaleFactor = actualDistance / pixelDistance;
    document.getElementById('scaleValue').textContent = scaleFactor.toFixed(4);
    document.getElementById('calibrationHint').textContent = '校准完成！1像素 = ' + scaleFactor.toFixed(4) + ' nm';
    
    setTimeout(() => {
        document.getElementById('calibrationHint').classList.add('hidden');
    }, 3000);
});

document.getElementById('selectMode').addEventListener('click', () => {
    mode = 'select';
    updateModeButtons();
});

document.getElementById('deleteMode').addEventListener('click', () => {
    mode = 'delete';
    updateModeButtons();
});

document.getElementById('addMode').addEventListener('click', () => {
    mode = 'add';
    updateModeButtons();
});

function updateModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(mode + 'Mode').classList.add('active');
}

canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing || mode !== 'add') return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    drawingPoints.push([x, y]);
    
    ctx.strokeStyle = '#0000ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(drawingPoints[drawingPoints.length - 2][0], drawingPoints[drawingPoints.length - 2][1]);
    ctx.lineTo(x, y);
    ctx.stroke();
});

canvas.addEventListener('mouseup', () => {
    if (isDrawing && mode === 'add' && drawingPoints.length > 3) {
        addNewParticle();
    }
    isDrawing = false;
    drawingPoints = [];
});

function findParticleAtPoint(x, y) {
    for (let i = 0; i < currentResult.particles.length; i++) {
        const particle = currentResult.particles[i];
        const dx = x - particle.centroid.x;
        const dy = y - particle.centroid.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 30) {
            return i;
        }
    }
    return -1;
}

function showParticleInfo(x, y, screenX, screenY) {
    const particleIndex = findParticleAtPoint(x, y);
    if (particleIndex === -1) return;
    
    const particle = currentResult.particles[particleIndex];
    const unit = scaleFactor !== 1.0 ? ' nm' : ' px';
    const areaUnit = scaleFactor !== 1.0 ? ' nm²' : ' px²';
    
    let infoDiv = document.querySelector('.particle-info');
    if (!infoDiv) {
        infoDiv = document.createElement('div');
        infoDiv.className = 'particle-info';
        document.querySelector('.image-container').appendChild(infoDiv);
    }
    
    infoDiv.innerHTML = `
        ID: ${particle.id}<br>
        面积: ${particle.area.toFixed(2)}${areaUnit}<br>
        周长: ${particle.perimeter.toFixed(2)}${unit}<br>
        圆形度: ${particle.circularity.toFixed(4)}
    `;
    
    const container = document.querySelector('.image-container').getBoundingClientRect();
    infoDiv.style.left = (screenX - container.left + 10) + 'px';
    infoDiv.style.top = (screenY - container.top + 10) + 'px';
    infoDiv.style.display = 'block';
    
    setTimeout(() => {
        infoDiv.style.display = 'none';
    }, 3000);
}

function addNewParticle() {
    const contour = drawingPoints.map(p => [Math.round(p[0]), Math.round(p[1])]);
    
    let area_px = 0;
    let perimeter_px = 0;
    let cx = 0, cy = 0;
    
    for (let i = 0; i < contour.length; i++) {
        const j = (i + 1) % contour.length;
        area_px += contour[i][0] * contour[j][1];
        area_px -= contour[j][0] * contour[i][1];
        
        const dx = contour[j][0] - contour[i][0];
        const dy = contour[j][1] - contour[i][1];
        perimeter_px += Math.sqrt(dx * dx + dy * dy);
        
        cx += contour[i][0];
        cy += contour[i][1];
    }
    area_px = Math.abs(area_px / 2);
    cx = Math.round(cx / contour.length);
    cy = Math.round(cy / contour.length);
    
    const area = area_px * scaleFactor * scaleFactor;
    const perimeter = perimeter_px * scaleFactor;
    const circularity = perimeter > 0 ? 4 * Math.PI * (area / (perimeter * perimeter)) : 0;
    
    const newParticle = {
        id: nextParticleId++,
        area: area,
        area_px: area_px,
        perimeter: perimeter,
        perimeter_px: perimeter_px,
        circularity: circularity,
        centroid: { x: cx, y: cy },
        contour: contour
    };
    
    currentResult.particles.push(newParticle);
    redrawAllParticles();
    updateStatistics();
}

document.getElementById('undoBtn').addEventListener('click', () => {
    if (deletedParticles.length > 0) {
        const particle = deletedParticles.pop();
        currentResult.particles.push(particle);
        if (deletedParticles.length === 0) {
            document.getElementById('undoBtn').disabled = true;
        }
        redrawAllParticles();
        updateStatistics();
    }
});

document.getElementById('saveBtn').addEventListener('click', async () => {
    if (!currentResult) return;
    
    try {
        const analysisId = await ipcRenderer.invoke('save-analysis', currentImageName, currentImagePath, currentResult);
        alert(`结果已保存！分析ID: ${analysisId}`);
    } catch (error) {
        console.error('Save error:', error);
        alert('保存失败: ' + error.message);
    }
});

document.getElementById('exportBtn').addEventListener('click', async () => {
    if (!currentResult) return;
    
    const result = await ipcRenderer.invoke('show-save-dialog', {
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
        defaultPath: `${currentImageName.replace(/\.[^/.]+$/, '')}_分析结果.xlsx`
    });

    if (!result.canceled) {
        try {
            await ipcRenderer.invoke('export-excel', result.filePath, currentResult);
            alert('导出成功！');
        } catch (error) {
            console.error('Export error:', error);
            alert('导出失败: ' + error.message);
        }
    }
});

document.getElementById('historyBtn').addEventListener('click', async () => {
    const analyses = await ipcRenderer.invoke('get-analyses');
    const tbody = document.getElementById('historyBody');
    tbody.innerHTML = '';
    
    analyses.forEach(analysis => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(analysis.created_at).toLocaleString()}</td>
            <td>${analysis.image_name}</td>
            <td>${analysis.total_count}</td>
            <td>${analysis.avg_area ? analysis.avg_area.toFixed(2) : '-'}</td>
            <td>
                <button onclick="deleteAnalysis(${analysis.id})" class="btn" style="width:auto;padding:0.25rem 0.5rem;font-size:0.8rem;">删除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    historyModal.classList.add('show');
});

document.querySelector('.close').addEventListener('click', () => {
    historyModal.classList.remove('show');
});

window.addEventListener('click', (e) => {
    if (e.target === historyModal) {
        historyModal.classList.remove('show');
    }
});

window.deleteAnalysis = async (id) => {
    if (confirm('确定要删除这条记录吗？')) {
        await ipcRenderer.invoke('delete-analysis', id);
        document.getElementById('historyBtn').click();
    }
};

let analysisMethod = 'watershed';
let batchMethod = 'watershed';
let imagejScriptType = 'macro';
let batchFolderPath = null;
let batchOutputPath = null;

document.getElementById('methodWatershed').addEventListener('click', () => {
    analysisMethod = 'watershed';
    document.getElementById('methodWatershed').classList.add('active');
    document.getElementById('methodUNet').classList.remove('active');
});

document.getElementById('methodUNet').addEventListener('click', () => {
    analysisMethod = 'unet';
    document.getElementById('methodUNet').classList.add('active');
    document.getElementById('methodWatershed').classList.remove('active');
});

const originalAnalyzeBtnHandler = document.getElementById('analyzeBtn').onclick;
document.getElementById('analyzeBtn').replaceWith(document.getElementById('analyzeBtn').cloneNode(true));
document.getElementById('analyzeBtn').addEventListener('click', async () => {
    if (!currentImagePath) return;

    loadingOverlay.classList.remove('hidden');
    document.getElementById('loadingText').textContent = analysisMethod === 'unet' ? 'U-Net分割中...' : '分析中...';
    
    try {
        const minArea = parseInt(document.getElementById('minArea').value);
        const maxArea = parseInt(document.getElementById('maxArea').value);
        
        let result;
        if (analysisMethod === 'unet') {
            result = await ipcRenderer.invoke('analyze-image-unet', 
                currentImagePath, minArea, maxArea, scaleFactor, false);
        } else {
            const fgThreshold = parseFloat(document.getElementById('fgThreshold').value);
            const useAdaptive = document.getElementById('useAdaptive').checked;
            result = await ipcRenderer.invoke('analyze-image', 
                currentImagePath, minArea, maxArea, fgThreshold, useAdaptive, scaleFactor);
        }
        
        currentResult = result;
        if (currentResult.error) {
            alert(currentResult.error);
            return;
        }

        deletedParticles = [];
        loadImageToCanvas(`data:image/png;base64,${currentResult.annotated_image}`, () => {
            updateStatistics();
        });

        document.getElementById('saveBtn').disabled = false;
        document.getElementById('exportBtn').disabled = false;
        document.getElementById('exportImageJBtn').disabled = false;
    } catch (error) {
        console.error('Analysis error:', error);
        alert('分析失败: ' + error.message);
    } finally {
        loadingOverlay.classList.add('hidden');
    }
});

const batchModal = document.getElementById('batchModal');
const imagejModal = document.getElementById('imagejModal');

document.getElementById('batchBtn').addEventListener('click', () => {
    batchModal.classList.add('show');
});

document.querySelector('.close-batch').addEventListener('click', () => {
    batchModal.classList.remove('show');
});

document.getElementById('selectFolderBtn').addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('show-open-dialog', {
        properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        batchFolderPath = result.filePaths[0];
        document.getElementById('folderPath').textContent = batchFolderPath;
        document.getElementById('startBatchBtn').disabled = false;
    }
});

document.getElementById('selectOutputBtn').addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('show-open-dialog', {
        properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        batchOutputPath = result.filePaths[0];
        document.getElementById('outputPath').textContent = batchOutputPath;
    }
});

document.getElementById('batchMinAreaSlider').addEventListener('input', (e) => {
    document.getElementById('batchMinArea').textContent = e.target.value;
});

document.getElementById('batchMaxAreaSlider').addEventListener('input', (e) => {
    document.getElementById('batchMaxArea').textContent = e.target.value;
});

document.getElementById('batchMethodWatershed').addEventListener('click', () => {
    batchMethod = 'watershed';
    document.getElementById('batchMethodWatershed').classList.add('active');
    document.getElementById('batchMethodUNet').classList.remove('active');
});

document.getElementById('batchMethodUNet').addEventListener('click', () => {
    batchMethod = 'unet';
    document.getElementById('batchMethodUNet').classList.add('active');
    document.getElementById('batchMethodWatershed').classList.remove('active');
});

document.getElementById('startBatchBtn').addEventListener('click', async () => {
    if (!batchFolderPath) return;

    document.getElementById('batchProgress').classList.remove('hidden');
    document.getElementById('startBatchBtn').disabled = true;
    
    try {
        const minArea = parseInt(document.getElementById('batchMinAreaSlider').value);
        const maxArea = parseInt(document.getElementById('batchMaxAreaSlider').value);
        
        const summary = await ipcRenderer.invoke('batch-process', 
            batchFolderPath, minArea, maxArea, 0.5, false, scaleFactor, batchMethod, batchOutputPath);
        
        document.getElementById('batchProgressText').textContent = 
            `${summary.total_images}/${summary.total_images} - 总计: ${summary.total_particles} 颗粒`;
        document.getElementById('progressFill').style.width = '100%';
        
        alert(`批量处理完成！\n处理图像: ${summary.total_images}\n总颗粒数: ${summary.total_particles}\n平均每图: ${summary.avg_particles_per_image.toFixed(1)}`);
        
        if (batchOutputPath) {
            alert(`结果已保存到: ${batchOutputPath}/batch_summary.json`);
        }
    } catch (error) {
        console.error('Batch error:', error);
        alert('批量处理失败: ' + error.message);
    } finally {
        setTimeout(() => {
            document.getElementById('batchProgress').classList.add('hidden');
            document.getElementById('progressFill').style.width = '0%';
            document.getElementById('startBatchBtn').disabled = false;
        }, 2000);
    }
});

document.getElementById('exportImageJBtn').addEventListener('click', () => {
    if (!currentResult) return;
    imagejModal.classList.add('show');
});

document.querySelector('.close-imagej').addEventListener('click', () => {
    imagejModal.classList.remove('show');
});

document.getElementById('ijMacro').addEventListener('click', () => {
    imagejScriptType = 'macro';
    document.getElementById('ijMacro').classList.add('active');
    document.getElementById('ijScript').classList.remove('active');
});

document.getElementById('ijScript').addEventListener('click', () => {
    imagejScriptType = 'script';
    document.getElementById('ijScript').classList.add('active');
    document.getElementById('ijMacro').classList.remove('active');
});

document.getElementById('confirmExportIJ').addEventListener('click', async () => {
    if (!currentResult) return;
    
    const ext = imagejScriptType === 'macro' ? 'ijm' : 'groovy';
    const result = await ipcRenderer.invoke('show-save-dialog', {
        filters: [{ name: 'ImageJ', extensions: [ext] }],
        defaultPath: `${currentImageName.replace(/\.[^/.]+$/, '')}_analysis.${ext}`
    });

    if (!result.canceled) {
        try {
            currentResult.image_path = currentImagePath;
            await ipcRenderer.invoke('export-imagej', currentResult, result.filePath, imagejScriptType);
            alert('ImageJ脚本导出成功！');
            imagejModal.classList.remove('show');
        } catch (error) {
            console.error('ImageJ export error:', error);
            alert('导出失败: ' + error.message);
        }
    }
});

window.addEventListener('click', (e) => {
    if (e.target === batchModal) {
        batchModal.classList.remove('show');
    }
    if (e.target === imagejModal) {
        imagejModal.classList.remove('show');
    }
    if (e.target === historyModal) {
        historyModal.classList.remove('show');
    }
});

initCharts();
