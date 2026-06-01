const { ftpAPI } = window;

let isConnected = false;
let currentPath = '/';
let currentFiles = [];
let uploadResumeMode = false;

const elements = {
  host: document.getElementById('host'),
  port: document.getElementById('port'),
  sftpPort: document.getElementById('sftpPort'),
  user: document.getElementById('user'),
  password: document.getElementById('password'),
  secure: document.getElementById('secure'),
  sftpFallback: document.getElementById('sftpFallback'),
  connectBtn: document.getElementById('connectBtn'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  connectionStatus: document.getElementById('connectionStatus'),
  currentPath: document.getElementById('currentPath'),
  goBackBtn: document.getElementById('goBackBtn'),
  fileList: document.getElementById('fileList'),
  uploadBtn: document.getElementById('uploadBtn'),
  resumeUploadBtn: document.getElementById('resumeUploadBtn'),
  createDirBtn: document.getElementById('createDirBtn'),
  mirrorSyncBtn: document.getElementById('mirrorSyncBtn'),
  fileInput: document.getElementById('fileInput'),
  mirrorDirInput: document.getElementById('mirrorDirInput'),
  progressList: document.getElementById('progressList'),
  logArea: document.getElementById('logArea')
};

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${type}`;
  logEntry.textContent = `[${timestamp}] ${message}`;
  elements.logArea.appendChild(logEntry);
  elements.logArea.scrollTop = elements.logArea.scrollHeight;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

function updateConnectionStatus(connected) {
  isConnected = connected;
  if (connected) {
    elements.connectionStatus.className = 'status connected';
    elements.connectionStatus.textContent = '已连接';
    elements.connectBtn.disabled = true;
    elements.disconnectBtn.disabled = false;
    elements.uploadBtn.disabled = false;
    elements.resumeUploadBtn.disabled = false;
    elements.createDirBtn.disabled = false;
    elements.mirrorSyncBtn.disabled = false;
    elements.host.disabled = true;
    elements.port.disabled = true;
    elements.sftpPort.disabled = true;
    elements.user.disabled = true;
    elements.password.disabled = true;
    elements.secure.disabled = true;
    elements.sftpFallback.disabled = true;
  } else {
    elements.connectionStatus.className = 'status disconnected';
    elements.connectionStatus.textContent = '未连接';
    elements.connectBtn.disabled = false;
    elements.disconnectBtn.disabled = true;
    elements.uploadBtn.disabled = true;
    elements.resumeUploadBtn.disabled = true;
    elements.createDirBtn.disabled = true;
    elements.mirrorSyncBtn.disabled = true;
    elements.host.disabled = false;
    elements.port.disabled = false;
    elements.sftpPort.disabled = false;
    elements.user.disabled = false;
    elements.password.disabled = false;
    elements.secure.disabled = false;
    elements.sftpFallback.disabled = false;
  }
}

function updateCurrentPath(path) {
  currentPath = path;
  elements.currentPath.textContent = path;
  elements.goBackBtn.disabled = path === '/';
}

async function loadFileList(path) {
  if (!isConnected) return;
  
  const result = await ftpAPI.list(path);
  if (result.success) {
    currentFiles = result.data;
    renderFileList(result.data);
    updateCurrentPath(path);
    log(`已加载目录: ${path}`, 'info');
  } else {
    log(`加载目录失败: ${result.message}`, 'error');
  }
}

function renderFileList(files) {
  if (files.length === 0) {
    elements.fileList.innerHTML = '<div class="empty-state">目录为空</div>';
    return;
  }

  const folders = files.filter(f => f.type === 2).sort((a, b) => a.name.localeCompare(b.name));
  const fileItems = files.filter(f => f.type !== 2).sort((a, b) => a.name.localeCompare(b.name));
  const sortedFiles = [...folders, ...fileItems];

  elements.fileList.innerHTML = sortedFiles.map(file => {
    const isFolder = file.type === 2;
    const icon = isFolder ? '📁' : '📄';
    const size = isFolder ? '-' : formatBytes(file.size);
    const date = file.modifiedAt ? new Date(file.modifiedAt).toLocaleString() : '-';
    
    return `
      <div class="file-item" data-name="${file.name}" data-type="${file.type}">
        <span class="file-icon">${icon}</span>
        <span class="file-name">${file.name}</span>
        <span class="file-size">${size}</span>
        <span class="file-date">${date}</span>
        <span class="file-actions">
          ${!isFolder ? `
            <button class="btn btn-small btn-success" onclick="downloadFile('${file.name}')">下载</button>
            <button class="btn btn-small btn-warning" onclick="resumeDownloadFile('${file.name}')">续传下载</button>
          ` : ''}
          <button class="btn btn-small btn-danger" onclick="deleteItem('${file.name}', ${isFolder})">删除</button>
        </span>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.file-item[data-type="2"]').forEach(item => {
    item.addEventListener('dblclick', () => {
      const folderName = item.dataset.name;
      const newPath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;
      loadFileList(newPath);
    });
  });
}

async function connect() {
  const config = {
    host: elements.host.value,
    port: parseInt(elements.port.value),
    sftpPort: parseInt(elements.sftpPort.value),
    user: elements.user.value,
    password: elements.password.value,
    secure: elements.secure.checked,
    sftpFallback: elements.sftpFallback.checked
  };

  if (!config.host) {
    log('请输入主机地址', 'error');
    return;
  }

  log('正在连接...', 'info');
  const result = await ftpAPI.connect(config);
  
  if (result.success) {
    updateConnectionStatus(true);
    log(result.message, 'success');
    if (result.protocol) {
      log(`使用协议: ${result.protocol}`, 'info');
    }
    loadFileList('/');
  } else {
    log(`连接失败: ${result.message}`, 'error');
  }
}

async function disconnect() {
  log('正在断开连接...', 'info');
  const result = await ftpAPI.disconnect();
  
  if (result.success) {
    updateConnectionStatus(false);
    log(result.message, 'success');
    elements.fileList.innerHTML = '<div class="empty-state">请先连接到FTP服务器</div>';
    updateCurrentPath('/');
  } else {
    log(`断开连接失败: ${result.message}`, 'error');
  }
}

function goBack() {
  if (currentPath === '/') return;
  const parts = currentPath.split('/').filter(Boolean);
  parts.pop();
  const newPath = '/' + parts.join('/');
  loadFileList(newPath || '/');
}

window.downloadFile = async function(fileName) {
  const remotePath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;
  const localPath = fileName;
  
  log(`开始下载: ${fileName}`, 'info');
  addProgressItem(fileName, 'download');
  
  const result = await ftpAPI.download(remotePath, localPath);
  if (result.success) {
    log(`下载完成: ${fileName}`, 'success');
  } else {
    log(`下载失败: ${result.message}`, 'error');
  }
};

window.resumeDownloadFile = async function(fileName) {
  const remotePath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;
  const localPath = fileName;
  
  log(`开始断点续传下载: ${fileName}`, 'info');
  addProgressItem(fileName, 'download');
  
  const result = await ftpAPI.resumeDownload(remotePath, localPath);
  if (result.success) {
    if (result.data.resumed) {
      log(`断点续传下载完成 (从 ${formatBytes(result.data.fromBytes)} 字节开始): ${fileName}`, 'success');
    } else {
      log(`下载完成: ${fileName}`, 'success');
    }
  } else {
    log(`下载失败: ${result.message}`, 'error');
  }
};

window.deleteItem = async function(name, isFolder) {
  const remotePath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
  
  if (!confirm(`确定要删除 ${name} 吗?`)) return;
  
  log(`正在删除: ${name}`, 'info');
  const result = await ftpAPI.delete(remotePath);
  if (result.success) {
    log(`删除成功: ${name}`, 'success');
    loadFileList(currentPath);
  } else {
    log(`删除失败: ${result.message}`, 'error');
  }
};

function uploadFiles(files, resume = false) {
  Array.from(files).forEach(async (file) => {
    const remotePath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
    const localPath = file.path;
    
    log(`${resume ? '断点续传上传' : '上传'}: ${file.name}`, 'info');
    addProgressItem(file.name, 'upload');
    
    const uploadFn = resume ? ftpAPI.resumeUpload : ftpAPI.upload;
    uploadFn(localPath, remotePath).then(result => {
      if (result.success) {
        if (result.data.resumed) {
          log(`上传完成 (从 ${formatBytes(result.data.fromBytes)} 字节开始): ${file.name}`, 'success');
        } else {
          log(`上传完成: ${file.name}`, 'success');
        }
        loadFileList(currentPath);
      } else {
          log(`上传失败: ${result.message}`, 'error');
        }
    });
  });
}

function addProgressItem(fileName, type) {
  const emptyState = elements.progressList.querySelector('.empty-state');
  if (emptyState) emptyState.remove();
  
  const progressItem = document.createElement('div');
  progressItem.className = 'progress-item';
  progressItem.id = `progress-${fileName.replace(/[^a-zA-Z0-9]/g, '-')}`;
  progressItem.innerHTML = `
    <div class="progress-info">
      <span class="progress-name">${fileName}</span>
      <span class="progress-type">${type === 'upload' ? '上传' : '下载'}</span>
    </div>
    <div class="progress-bar-container">
      <div class="progress-bar" style="width: 0%"></div>
    </div>
    <div class="progress-stats">
      <span class="progress-percent">0%</span>
      <span class="progress-bytes">0 B / 0 B</span>
      <span class="progress-speed">0 B/s</span>
    </div>
  `;
  elements.progressList.appendChild(progressItem);
}

function updateProgress(progress, type) {
  const safeName = progress.name.replace(/[^a-zA-Z0-9]/g, '-');
  let progressItem = document.getElementById(`progress-${safeName}`);
  
  if (!progressItem) {
    addProgressItem(progress.name, type);
    progressItem = document.getElementById(`progress-${safeName}`);
  }
  
  const progressBar = progressItem.querySelector('.progress-bar');
  const progressPercent = progressItem.querySelector('.progress-percent');
  const progressBytes = progressItem.querySelector('.progress-bytes');
  const progressSpeed = progressItem.querySelector('.progress-speed');
  
  progressBar.style.width = `${progress.percentage}%`;
  progressPercent.textContent = `${progress.percentage}%`;
  progressBytes.textContent = `${formatBytes(progress.bytes)} / ${formatBytes(progress.totalBytes)}`;
  progressSpeed.textContent = progress.speed;
  
  if (progress.percentage === 100) {
    progressItem.classList.add('progress-complete');
  }
}

async function createDir() {
  const dirName = prompt('请输入文件夹名称:');
  if (!dirName) return;
  
  const remotePath = currentPath === '/' ? `/${dirName}` : `${currentPath}/${dirName}`;
  
  log(`正在创建文件夹: ${dirName}`, 'info');
  const result = await ftpAPI.mkdir(remotePath);
  if (result.success) {
    log(`文件夹创建成功: ${dirName}`, 'success');
    loadFileList(currentPath);
  } else {
    log(`创建文件夹失败: ${result.message}`, 'error');
  }
}

elements.connectBtn.addEventListener('click', connect);
elements.disconnectBtn.addEventListener('click', disconnect);
elements.goBackBtn.addEventListener('click', goBack);

elements.uploadBtn.addEventListener('click', () => {
  uploadResumeMode = false;
  elements.fileInput.click();
});

elements.resumeUploadBtn.addEventListener('click', () => {
  uploadResumeMode = true;
  elements.fileInput.click();
});

elements.createDirBtn.addEventListener('click', createDir);

elements.fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    uploadFiles(e.target.files, uploadResumeMode);
    elements.fileInput.value = '';
  }
});

async function startMirrorSync() {
  elements.mirrorDirInput.click();
}

elements.mirrorDirInput.addEventListener('change', async (e) => {
  if (e.target.files.length > 0) {
    const localDir = e.target.files[0].path;
    log(`开始镜像同步: ${localDir} -> ${currentPath}`, 'info');
    
    const result = await ftpAPI.mirrorSync(localDir, currentPath);
    if (result.success) {
      const data = result.data;
      log(`镜像同步完成: 上传 ${data.uploaded.length}, 跳过 ${data.skipped.length}, 错误 ${data.errors.length}`, 'success');
      if (data.errors.length > 0) {
        data.errors.forEach(err => log(`错误: ${err.path} - ${err.error}`, 'error'));
      }
      loadFileList(currentPath);
    } else {
      log(`镜像同步失败: ${result.message}`, 'error');
    }
    elements.mirrorDirInput.value = '';
  }
});

elements.mirrorSyncBtn.addEventListener('click', startMirrorSync);

ftpAPI.onUploadProgress((progress) => {
  updateProgress(progress, 'upload');
});

ftpAPI.onDownloadProgress((progress) => {
  updateProgress(progress, 'download');
});

ftpAPI.onMirrorProgress((progress) => {
  updateProgress(progress, 'upload');
});

ftpAPI.onMirrorFileComplete((data) => {
  log(`文件同步完成: ${data.localPath}`, 'success');
});

log('FTP Client 已就绪', 'info');
