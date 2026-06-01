const { ipcRenderer, shell } = require('electron');

let videoList = [];
let currentAnalysisResult = null;
let currentVideoPath = null;
let currentVideoId = null;

document.addEventListener('DOMContentLoaded', () => {
    initElements();
    loadVideoList();
});

function initElements() {
    const uploadArea = document.getElementById('uploadArea');
    const selectBtn = document.getElementById('selectBtn');
    const closePreview = document.getElementById('closePreview');
    const closeKeyframes = document.getElementById('closeKeyframes');

    selectBtn.addEventListener('click', handleSelectVideo);

    uploadArea.addEventListener('click', handleSelectVideo);
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleVideoFile(files[0].path);
        }
    });

    closePreview.addEventListener('click', () => {
        document.getElementById('previewModal').classList.add('hidden');
    });

    closeKeyframes.addEventListener('click', () => {
        document.getElementById('keyframesModal').classList.add('hidden');
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal && modal.id !== 'processingModal') {
                modal.classList.add('hidden');
            }
        });
    });
}

async function loadVideoList() {
    videoList = await ipcRenderer.invoke('db-get-all-videos');
    renderVideoList();
}

function renderVideoList() {
    const container = document.getElementById('videoList');
    
    if (videoList.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无视频，请上传视频开始处理</div>';
        return;
    }

    container.innerHTML = videoList.map(video => createVideoCard(video)).join('');
    
    attachCardEventListeners();
}

function createVideoCard(video) {
    const statusText = getStatusText(video.status);
    const statusClass = `status-${video.status}`;
    
    const hasAnalysis = video.status === 'analyzed' || video.status === 'summarized';
    const hasSummary = video.status === 'summarized';

    const objectTags = createObjectTags(video.analysis_result);

    return `
        <div class="video-card" data-id="${video.id}">
            <div class="video-thumbnail">
                ${video.thumbnail ? `<img src="data:image/jpeg;base64,${video.thumbnail}" alt="缩略图">` : '🎬'}
            </div>
            <div class="video-info">
                <h3>${video.filename}</h3>
                <div class="video-meta">
                    ${video.duration ? `<span>时长: ${formatDuration(video.duration)}</span>` : ''}
                    ${video.file_size ? `<span>大小: ${formatFileSize(video.file_size)}</span>` : ''}
                    ${video.fps ? `<span>${video.fps.toFixed(1)} FPS</span>` : ''}
                </div>
                ${objectTags}
                <span class="video-status ${statusClass}">${statusText}</span>
            </div>
            <div class="video-actions">
                <button class="btn-small btn-analyze" data-action="analyze" data-id="${video.id}" 
                    ${video.status !== 'uploaded' ? 'disabled' : ''}>
                    分析视频
                </button>
                <button class="btn-small btn-preview" data-action="preview" data-id="${video.id}"
                    ${!hasAnalysis ? 'disabled' : ''}>
                    预览
                </button>
                <button class="btn-small btn-keyframes" data-action="keyframes" data-id="${video.id}"
                    ${!hasAnalysis ? 'disabled' : ''}>
                    关键帧
                </button>
                <button class="btn-small btn-generate" data-action="generate" data-id="${video.id}"
                    ${!hasAnalysis ? 'disabled' : ''}>
                    生成摘要
                </button>
                <button class="btn-small btn-export" data-action="export" data-id="${video.id}"
                    ${!hasSummary ? 'disabled' : ''}>
                    导出
                </button>
                <button class="btn-small btn-delete" data-action="delete" data-id="${video.id}">
                    删除
                </button>
            </div>
        </div>
    `;
}

function createObjectTags(analysisResult) {
    if (!analysisResult || !analysisResult.object_timelines) {
        return '';
    }

    const classes = { person: 0, car: 0, unknown: 0 };
    
    for (const objId in analysisResult.object_timelines) {
        const obj = analysisResult.object_timelines[objId];
        const cls = obj.class || 'unknown';
        classes[cls] = (classes[cls] || 0) + 1;
    }

    let tags = '';
    if (classes.person > 0) {
        tags += `<span class="object-tag tag-person">👤 人 x${classes.person}</span>`;
    }
    if (classes.car > 0) {
        tags += `<span class="object-tag tag-car">🚗 车 x${classes.car}</span>`;
    }
    if (classes.unknown > 0) {
        tags += `<span class="object-tag tag-unknown">❓ 未知 x${classes.unknown}</span>`;
    }

    return tags ? `<div class="object-tags">${tags}</div>` : '';
}

function attachCardEventListeners() {
    document.querySelectorAll('.video-card button[data-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const action = btn.dataset.action;
            const videoId = btn.dataset.id;
            const video = videoList.find(v => v.id === videoId);
            
            if (!video) return;

            switch (action) {
                case 'analyze':
                    await handleAnalyzeVideo(video);
                    break;
                case 'preview':
                    await handlePreviewVideo(video);
                    break;
                case 'keyframes':
                    await handleKeyframesVideo(video);
                    break;
                case 'generate':
                    await handleGenerateSummary(video);
                    break;
                case 'export':
                    await handleExportSummary(video);
                    break;
                case 'delete':
                    await handleDeleteVideo(videoId);
                    break;
            }
        });
    });
}

async function handleSelectVideo() {
    const result = await ipcRenderer.invoke('select-video');
    if (result) {
        await handleVideoFile(result.path);
    }
}

async function handleVideoFile(filePath) {
    console.log('Selected video:', filePath);
    
    const uploadResult = await ipcRenderer.invoke('api-upload', filePath);
    
    if (uploadResult.error) {
        alert('上传失败: ' + uploadResult.error);
        return;
    }

    const videoId = uploadResult.video_id;
    
    await ipcRenderer.invoke('db-add-video', {
        id: videoId,
        filename: uploadResult.filename,
        original_path: filePath,
        stored_path: uploadResult.video_path,
        status: 'uploaded'
    });

    await loadVideoList();
}

async function handleAnalyzeVideo(video) {
    const videoPath = video.stored_path || video.original_path;
    
    showProcessingModal('正在分析视频...');
    
    try {
        const analyzeResult = await ipcRenderer.invoke('api-analyze', videoPath, video.id);
        const taskId = analyzeResult.task_id;
        
        await pollTaskProgress(taskId, 'analysis');
        
        const result = await ipcRenderer.invoke('api-result', taskId);
        
        await ipcRenderer.invoke('db-update-analysis', video.id, result);
        
        hideProcessingModal();
        await loadVideoList();
        
        alert('视频分析完成！');
    } catch (error) {
        hideProcessingModal();
        alert('分析失败: ' + error.message);
    }
}

async function handlePreviewVideo(video) {
    const videoPath = video.stored_path || video.original_path;
    const analysisResult = video.analysis_result;

    showProcessingModal('正在生成预览...');
    
    try {
        const previewResult = await ipcRenderer.invoke('api-preview', videoPath, analysisResult, 6);
        
        hideProcessingModal();
        showPreviewModal(video, previewResult, analysisResult);
    } catch (error) {
        hideProcessingModal();
        alert('预览生成失败: ' + error.message);
    }
}

function showPreviewModal(video, previewResult, analysisResult) {
    const modal = document.getElementById('previewModal');
    const body = document.getElementById('previewBody');
    const title = document.getElementById('previewTitle');
    
    title.textContent = `预览: ${video.filename}`;
    
    let framesHtml = '';
    if (previewResult.frames && previewResult.frames.length > 0) {
        framesHtml = `
            <h4 style="margin-bottom: 15px;">关键帧预览</h4>
            <div class="preview-frames">
                ${previewResult.frames.map(frame => `
                    <div class="preview-frame">
                        <img src="data:image/jpeg;base64,${frame}" alt="预览帧">
                    </div>
                `).join('')}
            </div>
        `;
    }

    const motionIntervals = analysisResult.motion_intervals || [];
    const totalMotionDuration = motionIntervals.reduce((sum, iv) => sum + iv.duration, 0);
    const compressionRatio = video.duration > 0 ? (totalMotionDuration / video.duration * 100).toFixed(1) : 0;

    const objectTags = createObjectTags(analysisResult);

    body.innerHTML = `
        ${framesHtml}
        <div class="summary-info">
            <h4>分析结果</h4>
            ${objectTags}
            <div class="summary-stats" style="margin-top: 15px;">
                <div class="stat-item">
                    <div class="stat-value">${formatDuration(video.duration)}</div>
                    <div class="stat-label">原视频时长</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${formatDuration(totalMotionDuration)}</div>
                    <div class="stat-label">运动片段总时长</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${motionIntervals.length}</div>
                    <div class="stat-label">运动片段数量</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${compressionRatio}%</div>
                    <div class="stat-label">预计压缩率</div>
                </div>
            </div>
        </div>
        <div class="preview-actions">
            <button class="btn-primary" onclick="generateFromPreview('${video.id}')">生成摘要视频</button>
            <button class="btn-small btn-keyframes" style="background: #9C27B0; color: white;" onclick="showKeyframesFromPreview('${video.id}')">查看关键帧</button>
        </div>
    `;
    
    modal.classList.remove('hidden');
}

window.generateFromPreview = async function(videoId) {
    document.getElementById('previewModal').classList.add('hidden');
    const video = videoList.find(v => v.id === videoId);
    if (video) {
        await handleGenerateSummary(video);
    }
};

window.showKeyframesFromPreview = function(videoId) {
    document.getElementById('previewModal').classList.add('hidden');
    const video = videoList.find(v => v.id === videoId);
    if (video) {
        handleKeyframesVideo(video);
    }
};

async function handleKeyframesVideo(video) {
    const analysisResult = video.analysis_result;
    
    if (!analysisResult || !analysisResult.keyframes) {
        alert('没有关键帧数据');
        return;
    }

    showKeyframesModal(video, analysisResult.keyframes);
}

function showKeyframesModal(video, keyframes) {
    const modal = document.getElementById('keyframesModal');
    const body = document.getElementById('keyframesBody');
    const title = document.getElementById('keyframesTitle');
    
    title.textContent = `关键帧: ${video.filename} (共 ${keyframes.length} 帧)`;
    
    const keyframesHtml = keyframes.map((kf, index) => `
        <div class="keyframe-item" data-index="${index}">
            <img src="data:image/jpeg;base64,${kf.image_base64}" alt="关键帧 ${index + 1}">
            <div class="keyframe-info">
                <span class="frame-num">帧 ${kf.frame}</span>
                <span class="object-count">${kf.object_count} 个目标</span>
            </div>
        </div>
    `).join('');

    body.innerHTML = `
        <div class="keyframes-grid">
            ${keyframesHtml}
        </div>
        <div class="keyframes-actions">
            <button class="btn-primary" onclick="exportKeyframes('${video.id}')">导出全部关键帧</button>
        </div>
    `;
    
    modal.classList.remove('hidden');
}

window.exportKeyframes = async function(videoId) {
    const video = videoList.find(v => v.id === videoId);
    if (!video || !video.analysis_result) {
        alert('没有关键帧数据');
        return;
    }

    const outputDir = await ipcRenderer.invoke('select-folder-dialog');
    if (!outputDir) {
        return;
    }

    showProcessingModal('正在导出关键帧...');
    
    try {
        const result = await ipcRenderer.invoke('api-export-keyframes', video.analysis_result, outputDir);
        
        hideProcessingModal();
        
        if (result.success) {
            if (confirm(`成功导出 ${result.count} 个关键帧！\n是否打开输出文件夹？`)) {
                shell.openPath(result.output_dir);
            }
        } else {
            alert('导出失败: ' + (result.error || '未知错误'));
        }
    } catch (error) {
        hideProcessingModal();
        alert('导出失败: ' + error.message);
    }
};

async function handleGenerateSummary(video) {
    const videoPath = video.stored_path || video.original_path;
    const analysisResult = video.analysis_result;
    
    showProcessingModal('正在生成摘要视频...');
    
    try {
        const summaryResult = await ipcRenderer.invoke('api-generate-summary', 
            videoPath, analysisResult, video.id, 'summary.mp4');
        const taskId = summaryResult.task_id;
        
        await pollTaskProgress(taskId, 'summary');
        
        const result = await ipcRenderer.invoke('api-result', taskId);
        
        if (result.success) {
            await ipcRenderer.invoke('db-update-summary', video.id, result.output_path);
            
            hideProcessingModal();
            await loadVideoList();
            
            alert(`摘要生成完成！\n原时长: ${formatDuration(result.original_duration)}\n摘要时长: ${formatDuration(result.summary_duration)}\n压缩率: ${(result.compression_ratio * 100).toFixed(1)}%`);
        } else {
            hideProcessingModal();
            alert('生成失败: ' + (result.message || '未知错误'));
        }
    } catch (error) {
        hideProcessingModal();
        alert('生成失败: ' + error.message);
    }
}

async function handleExportSummary(video) {
    if (!video.summary_path) {
        alert('请先生成摘要视频');
        return;
    }

    const defaultName = video.filename.replace(/\.[^/.]+$/, '') + '_summary.mp4';
    const targetPath = await ipcRenderer.invoke('save-dialog', defaultName);
    
    if (targetPath) {
        const result = await ipcRenderer.invoke('api-export', video.summary_path, targetPath);
        if (result.success) {
            alert('导出成功！\n保存位置: ' + targetPath);
        } else {
            alert('导出失败: ' + (result.error || '未知错误'));
        }
    }
}

async function handleDeleteVideo(videoId) {
    if (confirm('确定要删除这个视频吗？')) {
        await ipcRenderer.invoke('db-delete-video', videoId);
        await loadVideoList();
    }
}

async function pollTaskProgress(taskId, stage) {
    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            try {
                const progress = await ipcRenderer.invoke('api-progress', taskId);
                
                if (progress.status === 'completed') {
                    clearInterval(interval);
                    resolve();
                } else if (progress.status === 'error') {
                    clearInterval(interval);
                    reject(new Error(progress.error || '处理失败'));
                } else if (progress.status === 'processing') {
                    updateProgress(progress.progress, stage);
                }
            } catch (error) {
                clearInterval(interval);
                reject(error);
            }
        }, 500);
    });
}

function showProcessingModal(statusText) {
    const modal = document.getElementById('processingModal');
    document.getElementById('processingStatus').textContent = statusText;
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('progressText').textContent = '0%';
    modal.classList.remove('hidden');
}

function hideProcessingModal() {
    document.getElementById('processingModal').classList.add('hidden');
}

function updateProgress(percent, stage) {
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    const status = document.getElementById('processingStatus');
    
    fill.style.width = `${percent}%`;
    text.textContent = `${percent.toFixed(0)}%`;
    
    if (stage === 'analysis') {
        status.textContent = '正在分析视频，检测移动目标...';
    } else if (stage === 'summary') {
        status.textContent = '正在生成摘要视频...';
    }
}

function getStatusText(status) {
    const statusMap = {
        'uploaded': '已上传',
        'analyzing': '分析中',
        'analyzed': '已分析',
        'summarized': '已生成摘要'
    };
    return statusMap[status] || status;
}

function formatDuration(seconds) {
    if (!seconds) return '0秒';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
        return `${hrs}小时${mins}分${secs}秒`;
    } else if (mins > 0) {
        return `${mins}分${secs}秒`;
    } else {
        return `${secs}秒`;
    }
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
