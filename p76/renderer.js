const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

let selectedImages = [];
let resultImageData = null;
let layerPaths = [];

const selectImagesBtn = document.getElementById('selectImagesBtn');
const startBtn = document.getElementById('startBtn');
const exportBtn = document.getElementById('exportBtn');
const imageCount = document.getElementById('imageCount');
const imageThumbs = document.getElementById('imageThumbs');
const sourceEmpty = document.getElementById('sourceEmpty');
const matchCanvas = document.getElementById('matchCanvas');
const statusText = document.getElementById('statusText');
const progressFill = document.getElementById('progressFill');
const resultEmpty = document.getElementById('resultEmpty');
const resultImage = document.getElementById('resultImage');
const useBundleAdjustment = document.getElementById('useBundleAdjustment');
const exportLayers = document.getElementById('exportLayers');

const isVideoFile = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  return ['.mp4', '.avi', '.mov', '.mkv'].includes(ext);
};

selectImagesBtn.addEventListener('click', async () => {
  const filePaths = await ipcRenderer.invoke('select-images');
  if (filePaths && filePaths.length > 0) {
    selectedImages = filePaths;
    updateImageThumbs();
    
    const hasVideo = selectedImages.some(isVideoFile);
    if (hasVideo) {
      startBtn.disabled = false;
      imageCount.textContent = `已选择: 视频文件`;
    } else {
      startBtn.disabled = selectedImages.length < 2;
      imageCount.textContent = `已选择: ${selectedImages.length} 张`;
    }
  }
});

async function updateImageThumbs() {
  imageThumbs.innerHTML = '';
  sourceEmpty.style.display = selectedImages.length > 0 ? 'none' : 'flex';
  
  const hasVideo = selectedImages.some(isVideoFile);
  if (hasVideo) {
    const videoThumb = document.createElement('div');
    videoThumb.className = 'thumb';
    videoThumb.style.width = 'auto';
    videoThumb.style.padding = '10px 15px';
    videoThumb.style.display = 'flex';
    videoThumb.style.alignItems = 'center';
    videoThumb.style.gap = '8px';
    videoThumb.style.background = 'rgba(0, 212, 255, 0.2)';
    videoThumb.innerHTML = `<span>🎬</span><span>${path.basename(selectedImages[0])}</span>`;
    imageThumbs.appendChild(videoThumb);
    return;
  }
  
  for (let i = 0; i < selectedImages.length; i++) {
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    
    const base64 = await ipcRenderer.invoke('read-image-base64', selectedImages[i]);
    const img = document.createElement('img');
    img.src = `data:image/jpeg;base64,${base64}`;
    thumb.appendChild(img);
    
    thumb.addEventListener('click', () => {
      displayMatchPreview(selectedImages[i], selectedImages[Math.min(i + 1, selectedImages.length - 1)]);
    });
    
    imageThumbs.appendChild(thumb);
  }
}

startBtn.addEventListener('click', async () => {
  const hasVideo = selectedImages.some(isVideoFile);
  if (!hasVideo && selectedImages.length < 2) return;
  
  startBtn.disabled = true;
  selectImagesBtn.disabled = true;
  exportBtn.disabled = true;
  layerPaths = [];
  
  resetSteps();
  
  try {
    const tempDir = path.join(require('os').tmpdir(), 'panorama_stitch');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const stitchParams = {
      images: selectedImages,
      use_bundle_adjustment: useBundleAdjustment.checked,
      export_layers: exportLayers.checked,
      output_dir: exportLayers.checked ? tempDir : null
    };
    
    const result = await ipcRenderer.invoke('start-stitching', stitchParams);
    resultImageData = result.final_image;
    layerPaths = result.layer_paths || [];
    
    displayResult(result.final_image);
    statusText.textContent = '拼接完成！';
    statusText.className = 'status-text complete';
    progressFill.style.width = '100%';
    exportBtn.disabled = false;
    completeAllSteps();
  } catch (error) {
    statusText.textContent = `错误: ${error.message}`;
    statusText.className = 'status-text';
    statusText.style.color = '#ef4444';
  } finally {
    startBtn.disabled = false;
    selectImagesBtn.disabled = false;
  }
});

ipcRenderer.on('stitching-progress', (event, message) => {
  updateProgress(message);
});

function updateProgress(message) {
  const stepMessages = {
    'detect': '正在提取 SIFT 特征点...',
    'match': '正在进行特征匹配...',
    'homography': '正在计算单应性矩阵...',
    'warp': '正在进行图像变换...',
    'blend': '正在融合拼接...'
  };
  
  statusText.textContent = stepMessages[message.step] || message.message || '处理中...';
  statusText.className = 'status-text active';
  progressFill.style.width = `${message.progress}%`;
  
  setStepActive(message.step);
  
  if (message.step === 'match' && message.match_preview) {
    drawMatchLines(message.match_preview);
  }
}

function setStepActive(stepName) {
  const steps = document.querySelectorAll('.step');
  steps.forEach(step => {
    if (step.dataset.step === stepName) {
      step.className = 'step active';
    }
  });
}

function completeAllSteps() {
  const steps = document.querySelectorAll('.step');
  steps.forEach(step => {
    step.className = 'step complete';
  });
}

function resetSteps() {
  const steps = document.querySelectorAll('.step');
  steps.forEach(step => {
    step.className = 'step';
  });
  statusText.className = 'status-text';
  statusText.style.color = '';
}

function drawMatchLines(matchData) {
  const canvas = matchCanvas;
  const ctx = canvas.getContext('2d');
  
  const img1Data = matchData.img1;
  const img2Data = matchData.img2;
  const keypoints1 = matchData.keypoints1;
  const keypoints2 = matchData.keypoints2;
  const matches = matchData.matches;
  
  const img1 = new Image();
  const img2 = new Image();
  
  img1.onload = () => {
    img2.onload = () => {
      const maxHeight = Math.max(img1.height, img2.height);
      const totalWidth = img1.width + img2.width;
      
      canvas.width = totalWidth;
      canvas.height = maxHeight;
      
      ctx.drawImage(img1, 0, 0);
      ctx.drawImage(img2, img1.width, 0);
      
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.6)';
      ctx.lineWidth = 1;
      
      const displayMatches = matches.slice(0, 100);
      
      displayMatches.forEach(match => {
        const kp1 = keypoints1[match.queryIdx];
        const kp2 = keypoints2[match.trainIdx];
        
        ctx.beginPath();
        ctx.moveTo(kp1[0], kp1[1]);
        ctx.lineTo(img1.width + kp2[0], kp2[1]);
        ctx.stroke();
        
        ctx.fillStyle = '#00d4ff';
        ctx.beginPath();
        ctx.arc(kp1[0], kp1[1], 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(img1.width + kp2[0], kp2[1], 3, 0, Math.PI * 2);
        ctx.fill();
      });
    };
    img2.src = `data:image/jpeg;base64,${img2Data}`;
  };
  img1.src = `data:image/jpeg;base64,${img1Data}`;
}

function displayResult(base64Image) {
  resultEmpty.style.display = 'none';
  resultImage.style.display = 'block';
  resultImage.src = `data:image/jpeg;base64,${base64Image}`;
}

async function displayMatchPreview(imgPath1, imgPath2) {
  const base64_1 = await ipcRenderer.invoke('read-image-base64', imgPath1);
  const base64_2 = await ipcRenderer.invoke('read-image-base64', imgPath2);
  
  const canvas = matchCanvas;
  const ctx = canvas.getContext('2d');
  
  const img1 = new Image();
  const img2 = new Image();
  
  img1.onload = () => {
    img2.onload = () => {
      const maxHeight = Math.max(img1.height, img2.height);
      const totalWidth = img1.width + img2.width;
      
      canvas.width = totalWidth;
      canvas.height = maxHeight;
      
      ctx.drawImage(img1, 0, 0);
      ctx.drawImage(img2, img1.width, 0);
    };
    img2.src = `data:image/jpeg;base64,${base64_2}`;
  };
  img1.src = `data:image/jpeg;base64,${base64_1}`;
}

exportBtn.addEventListener('click', async () => {
  if (!resultImageData) return;
  
  const savePath = await ipcRenderer.invoke('save-image', 'panorama.jpg');
  if (savePath) {
    const imageBuffer = Buffer.from(resultImageData, 'base64');
    fs.writeFileSync(savePath, imageBuffer);
    
    if (layerPaths.length > 0) {
      const saveDir = path.dirname(savePath);
      const baseName = path.basename(savePath, path.extname(savePath));
      
      layerPaths.forEach((layerPath, index) => {
        const destPath = path.join(saveDir, `${baseName}_layer_${index + 1}.png`);
        if (fs.existsSync(layerPath)) {
          fs.copyFileSync(layerPath, destPath);
        }
      });
    }
  }
});
