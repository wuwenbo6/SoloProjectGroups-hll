let selectedFile = null;

const uploadBox = document.getElementById('uploadBox');
const fileInput = document.getElementById('fileInput');
const convertBtn = document.getElementById('convertBtn');
const formatPdf = document.getElementById('formatPdf');
const formatHtml = document.getElementById('formatHtml');
const enableWatermark = document.getElementById('enableWatermark');
const enableThumbnail = document.getElementById('enableThumbnail');
const watermarkConfig = document.getElementById('watermarkConfig');
const watermarkText = document.getElementById('watermarkText');
const watermarkOpacity = document.getElementById('watermarkOpacity');
const opacityValue = document.getElementById('opacityValue');
const watermarkFontSize = document.getElementById('watermarkFontSize');
const watermarkRotation = document.getElementById('watermarkRotation');
const watermarkSpacing = document.getElementById('watermarkSpacing');
const jobsList = document.getElementById('jobsList');
const queuedCount = document.getElementById('queuedCount');
const processingCount = document.getElementById('processingCount');

uploadBox.addEventListener('click', () => fileInput.click());

uploadBox.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadBox.classList.add('dragover');
});

uploadBox.addEventListener('dragleave', () => {
  uploadBox.classList.remove('dragover');
});

uploadBox.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadBox.classList.remove('dragover');
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

enableWatermark.addEventListener('change', () => {
  watermarkConfig.style.display = enableWatermark.checked ? 'block' : 'none';
});

watermarkOpacity.addEventListener('input', () => {
  opacityValue.textContent = watermarkOpacity.value;
});

function handleFileSelect(file) {
  const allowedExtensions = ['.odt', '.docx', '.doc'];
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  
  if (!allowedExtensions.includes(ext)) {
    alert('请上传 ODT、DOCX 或 DOC 格式的文件');
    return;
  }

  selectedFile = file;
  updateUploadBoxUI(file);
  convertBtn.disabled = false;
}

function updateUploadBoxUI(file) {
  const fileSize = (file.size / 1024 / 1024).toFixed(2);
  uploadBox.classList.add('has-file');
  uploadBox.innerHTML = `
    <div class="upload-icon">📄</div>
    <p class="upload-text">${file.name}</p>
    <div class="file-info">文件大小: ${fileSize} MB</div>
  `;
}

convertBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  const formats = [];
  if (formatPdf.checked) formats.push('pdf');
  if (formatHtml.checked) formats.push('html');

  if (formats.length === 0) {
    alert('请至少选择一种输出格式');
    return;
  }

  const formData = new FormData();
  formData.append('document', selectedFile);
  formData.append('formats', formats.join(','));
  formData.append('createThumbnail', enableThumbnail.checked);

  if (enableWatermark.checked) {
    formData.append('watermarkEnabled', true);
    formData.append('watermarkText', watermarkText.value);
    formData.append('watermarkOpacity', watermarkOpacity.value);
    formData.append('watermarkFontSize', watermarkFontSize.value);
    formData.append('watermarkRotation', watermarkRotation.value);
    formData.append('watermarkSpacing', watermarkSpacing.value);
  }

  try {
    const response = await fetch('/api/convert', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (response.ok) {
      resetUploadBox();
      loadJobs();
      startPolling(result.jobId);
    } else {
      alert('转换失败: ' + result.error);
    }
  } catch (error) {
    alert('上传失败: ' + error.message);
  }
});

function resetUploadBox() {
  selectedFile = null;
  fileInput.value = '';
  convertBtn.disabled = true;
  uploadBox.classList.remove('has-file');
  uploadBox.innerHTML = `
    <div class="upload-icon">⬆️</div>
    <p class="upload-text">拖拽文件到此处，或点击选择文件</p>
    <p class="upload-hint">支持 ODT, DOCX, DOC 格式，最大 500MB</p>
    <input type="file" id="fileInput" accept=".odt,.docx,.doc" hidden>
  `;
  document.getElementById('fileInput').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  });
}

const pollingJobs = new Set();

function startPolling(jobId) {
  if (pollingJobs.has(jobId)) return;
  pollingJobs.add(jobId);

  const poll = async () => {
    try {
      const response = await fetch(`/api/status/${jobId}`);
      const data = await response.json();

      loadJobs();
      updateQueueStatus();

      if (data.status === 'completed' || data.status === 'failed') {
        pollingJobs.delete(jobId);
        return;
      }

      setTimeout(poll, 2000);
    } catch (error) {
      pollingJobs.delete(jobId);
    }
  };

  poll();
}

async function loadJobs() {
  try {
    const response = await fetch('/api/conversions');
    const jobs = await response.json();
    renderJobs(jobs);
  } catch (error) {
    console.error('Failed to load jobs:', error);
  }
}

function renderJobs(jobs) {
  if (jobs.length === 0) {
    jobsList.innerHTML = '<div class="empty-state">暂无转换任务</div>';
    return;
  }

  jobsList.innerHTML = jobs.map(job => {
    const statusClass = `status-${job.status}`;
    const statusText = getStatusText(job.status);
    const icon = getFileIcon(job.original_filename);
    const canPreview = job.status === 'completed';
    const canDownload = job.status === 'completed';
    const createdAt = new Date(job.created_at).toLocaleString('zh-CN');
    const formats = Array.isArray(job.formats) ? job.formats.join(', ').toUpperCase() : job.formats;
    const hasThumbnail = job.thumbnail_path;
    const hasWatermark = job.watermark_config?.enabled;

    const downloadButtons = job.formats && canDownload
      ? job.formats.map(format => `
          <button class="job-btn btn-download" onclick="downloadJob('${job.id}', '${format}')">
            下载 ${format.toUpperCase()}
          </button>
        `).join('')
      : '';

    const previewButtons = job.formats && canPreview
      ? job.formats.map(format => `
          <button class="job-btn btn-preview" onclick="previewJob('${job.id}', '${format}')">
            预览 ${format.toUpperCase()}
          </button>
        `).join('')
      : '';

    const thumbnailHtml = hasThumbnail
      ? `<img class="job-thumbnail" src="/api/thumbnail/${job.id}" alt="缩略图">`
      : `<div class="job-icon">${icon}</div>`;

    const tagsHtml = [];
    if (hasWatermark) tagsHtml.push('<span class="tag tag-watermark">💧 水印</span>');
    if (hasThumbnail) tagsHtml.push('<span class="tag tag-thumb">🖼️ 缩略图</span>');

    return `
      <div class="job-item" data-job-id="${job.id}">
        ${thumbnailHtml}
        <div class="job-info">
          <div class="job-filename">${job.original_filename}</div>
          <div class="job-meta">
            格式: ${formats} | ${createdAt}
            ${tagsHtml.length > 0 ? `<br>${tagsHtml.join(' ')}` : ''}
            ${job.error_message ? `<br><span style="color: #c53030;">错误: ${job.error_message}</span>` : ''}
          </div>
        </div>
        <div class="job-status ${statusClass}">${statusText}</div>
        <div class="job-actions">
          ${previewButtons}
          ${downloadButtons}
          <button class="job-btn btn-delete" onclick="deleteJob('${job.id}')">删除</button>
        </div>
      </div>
    `;
  }).join('');
}

function getStatusText(status) {
  const statusMap = {
    'pending': '等待中',
    'queued': '排队中',
    'processing': '处理中',
    'completed': '已完成',
    'failed': '失败'
  };
  return statusMap[status] || status;
}

function getFileIcon(filename) {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.') + 1);
  const iconMap = {
    'odt': '📝',
    'docx': '📄',
    'doc': '📄',
    'pdf': '📕',
    'html': '🌐'
  };
  return iconMap[ext] || '📁';
}

window.previewJob = function(jobId, format) {
  window.open(`/api/preview/${jobId}/${format}`, '_blank');
};

window.downloadJob = function(jobId, format = 'pdf') {
  window.location.href = `/api/download/${jobId}/${format}`;
};

window.deleteJob = async function(jobId) {
  if (!confirm('确定要删除此转换任务吗？')) return;

  try {
    await fetch(`/api/conversions/${jobId}`, { method: 'DELETE' });
    loadJobs();
  } catch (error) {
    alert('删除失败: ' + error.message);
  }
};

async function updateQueueStatus() {
  try {
    const response = await fetch('/api/queue/status');
    const data = await response.json();
    queuedCount.textContent = data.queued;
    processingCount.textContent = data.processing;
  } catch (error) {
    console.error('Failed to update queue status:', error);
  }
}

loadJobs();
updateQueueStatus();
setInterval(updateQueueStatus, 5000);
