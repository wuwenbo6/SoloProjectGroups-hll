const { ipcRenderer } = require('electron');
const axios = require('axios');
const cornerstone = window.cornerstone;
const cornerstoneTools = window.cornerstoneTools;
const cornerstoneWADOImageLoader = window.cornerstoneWADOImageLoader;
const dicomParser = window.dicomParser;

cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneTools.external.cornerstone = cornerstone;

const API_BASE = 'http://localhost:8000';

const state = {
  images: [],
  currentImageIndex: 0,
  element: null,
  annotations: {},
  currentTool: null,
  drawingPolygon: false,
  polygonPoints: [],
  enabled: false,
  history: [],
  historyIndex: -1,
  maxHistory: 50
};

const elements = {
  loadDicomBtn: document.getElementById('loadDicomBtn'),
  polygonToolBtn: document.getElementById('polygonToolBtn'),
  growToolBtn: document.getElementById('growToolBtn'),
  aiSegmentBtn: document.getElementById('aiSegmentBtn'),
  volumeRenderBtn: document.getElementById('volumeRenderBtn'),
  exportNiftiBtn: document.getElementById('exportNiftiBtn'),
  exportDicomSegBtn: document.getElementById('exportDicomSegBtn'),
  saveAnnotationBtn: document.getElementById('saveAnnotationBtn'),
  submitTrainingBtn: document.getElementById('submitTrainingBtn'),
  sliceSlider: document.getElementById('sliceSlider'),
  sliceInfo: document.getElementById('sliceInfo'),
  annotationList: document.getElementById('annotationList'),
  seriesInfo: document.getElementById('seriesInfo'),
  placeholder: document.getElementById('placeholder'),
  cornerstoneCanvas: document.getElementById('cornerstoneCanvas'),
  overlay: document.getElementById('overlay'),
  dicomViewer: document.getElementById('dicomViewer'),
  volumeViewer: document.getElementById('volumeViewer'),
  volumeCanvas: document.getElementById('volumeCanvas'),
  thresholdSlider: document.getElementById('thresholdSlider'),
  thresholdValue: document.getElementById('thresholdValue'),
  volumeOpacitySlider: document.getElementById('volumeOpacitySlider'),
  volumeOpacityValue: document.getElementById('volumeOpacityValue'),
  closeVolumeBtn: document.getElementById('closeVolumeBtn'),
  labelName: document.getElementById('labelName'),
  labelColor: document.getElementById('labelColor'),
  labelOpacity: document.getElementById('labelOpacity'),
  growTolerance: document.getElementById('growTolerance'),
  growToleranceValue: document.getElementById('growToleranceValue'),
  growMaxPixels: document.getElementById('growMaxPixels'),
  growMaxValue: document.getElementById('growMaxValue'),
  grow3D: document.getElementById('grow3D'),
  denoiseStrength: document.getElementById('denoiseStrength'),
  denoiseValue: document.getElementById('denoiseValue'),
  trainingJobs: document.getElementById('trainingJobs')
};

function initCornerstone() {
  state.element = elements.cornerstoneCanvas;
  cornerstone.enable(state.element);
  state.enabled = true;
  setupOverlay();
}

function setupOverlay() {
  const overlay = elements.overlay;
  overlay.style.display = 'block';
  overlay.style.pointerEvents = 'auto';
  
  overlay.addEventListener('click', handleOverlayClick);
  overlay.addEventListener('mousemove', handleOverlayMouseMove);
  overlay.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (state.drawingPolygon && state.polygonPoints.length > 2) {
      finishPolygon();
    } else if (state.drawingPolygon) {
      cancelPolygon();
    }
  });
}

const volumeRenderer = {
  scene: null,
  camera: null,
  renderer: null,
  volumeMesh: null,
  animationId: null,
  isDragging: false,
  previousMouse: { x: 0, y: 0 },
  rotation: { x: 0, y: 0 },
  
  init() {
    try {
      const THREE = require('three');
      
      const canvas = elements.volumeCanvas;
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x0a0a1a);
      
      this.camera = new THREE.PerspectiveCamera(60, canvas.width / canvas.height, 0.1, 1000);
      this.camera.position.z = 200;
      
      this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
      this.renderer.setSize(canvas.width, canvas.height);
      
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      this.scene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(100, 100, 100);
      this.scene.add(directionalLight);
      
      this.setupControls(canvas);
      
    } catch (error) {
      console.error('Volume renderer init error:', error);
      alert('Three.js not available. Please run npm install.');
    }
  },
  
  setupControls(canvas) {
    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.previousMouse = { x: e.clientX, y: e.clientY };
    });
    
    canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging && this.volumeMesh) {
        const deltaX = e.clientX - this.previousMouse.x;
        const deltaY = e.clientY - this.previousMouse.y;
        
        this.rotation.y += deltaX * 0.01;
        this.rotation.x += deltaY * 0.01;
        
        this.volumeMesh.rotation.x = this.rotation.x;
        this.volumeMesh.rotation.y = this.rotation.y;
        
        this.previousMouse = { x: e.clientX, y: e.clientY };
      }
    });
    
    canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
    
    canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
    });
    
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camera.position.z += e.deltaY * 0.1;
      this.camera.position.z = Math.max(50, Math.min(500, this.camera.position.z));
    });
  },
  
  createVolumeFromImages(images, threshold = 100, opacity = 0.5) {
    try {
      const THREE = require('three');
      
      if (this.volumeMesh) {
        this.scene.remove(this.volumeMesh);
      }
      
      const numSlices = images.length;
      const sliceWidth = images[0].image.width;
      const sliceHeight = images[0].image.height;
      
      const pixelDataList = images.map(img => img.image.getPixelData());
      
      const geometry = new THREE.BufferGeometry();
      const vertices = [];
      const colors = [];
      
      const step = 4;
      
      for (let z = 0; z < numSlices; z += step) {
        const pixelData = pixelDataList[z];
        
        for (let y = 0; y < sliceHeight; y += step) {
          for (let x = 0; x < sliceWidth; x += step) {
            const idx = y * sliceWidth + x;
            const value = pixelData[idx];
            
            if (value >= threshold) {
              const vx = (x - sliceWidth / 2) * 0.5;
              const vy = (y - sliceHeight / 2) * 0.5;
              const vz = (z - numSlices / 2) * 0.5;
              
              vertices.push(vx, vy, vz);
              
              const normalizedValue = Math.min((value - threshold) / 500, 1);
              const r = 0.8 + normalizedValue * 0.2;
              const g = 0.5 + normalizedValue * 0.3;
              const b = 0.3 + normalizedValue * 0.2;
              
              colors.push(r, g, b);
            }
          }
        }
      }
      
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      
      const material = new THREE.PointsMaterial({
        size: step * 0.3,
        vertexColors: true,
        transparent: true,
        opacity: opacity
      });
      
      this.volumeMesh = new THREE.Points(geometry, material);
      this.volumeMesh.rotation.x = this.rotation.x;
      this.volumeMesh.rotation.y = this.rotation.y;
      
      this.scene.add(this.volumeMesh);
      
    } catch (error) {
      console.error('Create volume error:', error);
    }
  },
  
  updateThreshold(threshold, opacity) {
    if (state.images.length > 0) {
      this.createVolumeFromImages(state.images, threshold, opacity);
    }
  },
  
  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    this.renderer.render(this.scene, this.camera);
  },
  
  start() {
    if (!this.scene) {
      this.init();
    }
    this.animate();
  },
  
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  },
  
  dispose() {
    this.stop();
    if (this.renderer) {
      this.renderer.dispose();
    }
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.volumeMesh = null;
  }
};

function regionGrow(startX, startY, sliceIndex, tolerance = 50, maxPixels = 1000, use3D = true) {
  if (sliceIndex < 0 || sliceIndex >= state.images.length) {
    return null;
  }
  
  const image = state.images[sliceIndex].image;
  const pixelData = image.getPixelData();
  const width = image.width;
  const height = image.height;
  
  const startIdx = startY * width + startX;
  if (startIdx < 0 || startIdx >= pixelData.length) {
    return null;
  }
  
  const seedValue = pixelData[startIdx];
  const visited = new Set();
  const resultPoints = [];
  const queue = [[startX, startY, sliceIndex]];
  
  const checkAndAdd = (x, y, z) => {
    if (z < 0 || z >= state.images.length) return;
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    
    const key = `${x},${y},${z}`;
    if (visited.has(key)) return;
    
    const slicePixelData = state.images[z].image.getPixelData();
    const idx = y * width + x;
    const value = slicePixelData[idx];
    
    if (Math.abs(value - seedValue) <= tolerance) {
      visited.add(key);
      queue.push([x, y, z]);
      
      if (z === sliceIndex) {
        resultPoints.push({ x, y });
      }
    }
  };
  
  while (queue.length > 0 && resultPoints.length < maxPixels) {
    const [cx, cy, cz] = queue.shift();
    
    checkAndAdd(cx + 1, cy, cz);
    checkAndAdd(cx - 1, cy, cz);
    checkAndAdd(cx, cy + 1, cz);
    checkAndAdd(cx, cy - 1, cz);
    
    if (use3D) {
      checkAndAdd(cx, cy, cz + 1);
      checkAndAdd(cx, cy, cz - 1);
    }
  }
  
  if (resultPoints.length < 3) {
    return null;
  }
  
  const convexHull = pointsToConvexHull(resultPoints);
  
  return {
    type: 'polygon',
    points: convexHull,
    label: elements.labelName?.value || 'Grow',
    color: elements.labelColor?.value || '#00ff00',
    opacity: parseFloat(elements.labelOpacity?.value || 0.5)
  };
}

function pointsToConvexHull(points) {
  if (points.length < 3) return points;
  
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  
  const cross = (o, a, b) => {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  };
  
  const lower = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  
  const upper = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  
  lower.pop();
  upper.pop();
  
  return lower.concat(upper);
}

function handleRegionGrowClick(e) {
  if (state.currentTool !== 'regionGrow' || !state.images.length) return;
  
  const coords = getCanvasCoords(e);
  if (!coords) return;
  
  const tolerance = parseInt(elements.growTolerance?.value || 50);
  const maxPixels = parseInt(elements.growMaxPixels?.value || 1000);
  const use3D = elements.grow3D?.checked ?? true;
  
  const result = regionGrow(
    Math.round(coords.x),
    Math.round(coords.y),
    state.currentImageIndex,
    tolerance,
    maxPixels,
    use3D
  );
  
  if (result && result.points && result.points.length >= 3) {
    const annotation = {
      id: Date.now().toString(),
      type: result.type,
      points: result.points,
      sliceIndex: state.currentImageIndex,
      label: result.label,
      color: result.color,
      opacity: result.opacity,
      createdAt: new Date().toISOString()
    };
    
    if (!state.annotations[state.currentImageIndex]) {
      state.annotations[state.currentImageIndex] = [];
    }
    state.annotations[state.currentImageIndex].push(annotation);
    
    saveHistoryState();
    drawOverlay();
    updateAnnotationList();
  } else {
    alert('Could not grow region. Try adjusting tolerance or click on a different point.');
  }
}

function getCanvasCoords(e) {
  const rect = elements.cornerstoneCanvas.getBoundingClientRect();
  const viewport = cornerstone.getViewport(state.element);
  if (!viewport) return null;
  
  const scale = viewport.scale;
  const translation = viewport.translation;
  const canvas = elements.cornerstoneCanvas;
  
  const canvasX = (e.clientX - rect.left - translation.x * scale) / scale + canvas.width / 2;
  const canvasY = (e.clientY - rect.top - translation.y * scale) / scale + canvas.height / 2;
  
  return { x: Math.round(canvasX), y: Math.round(canvasY) };
}

function handleOverlayClick(e) {
  if (!state.images.length) return;
  
  if (state.currentTool === 'regionGrow') {
    handleRegionGrowClick(e);
    return;
  }
  
  if (state.currentTool !== 'polygon') return;
  
  const coords = getCanvasCoords(e);
  if (!coords) return;
  
  if (e.button === 0) {
    state.polygonPoints.push(coords);
    drawOverlay();
  }
}

function handleOverlayMouseMove(e) {
  if (!state.drawingPolygon) return;
  drawOverlay();
  
  const coords = getCanvasCoords(e);
  if (!coords) return;
  
  const ctx = elements.overlay.getContext('2d');
  if (state.polygonPoints.length > 0) {
    const lastPoint = state.polygonPoints[state.polygonPoints.length - 1];
    const viewport = cornerstone.getViewport(state.element);
    const canvas = elements.cornerstoneCanvas;
    const scale = viewport.scale;
    const translation = viewport.translation;
    
    const toScreen = (pt) => ({
      x: (pt.x - canvas.width / 2) * scale + translation.x * scale + canvas.width / 2,
      y: (pt.y - canvas.height / 2) * scale + translation.y * scale + canvas.height / 2
    });
    
    const sp = toScreen(lastPoint);
    const cp = toScreen(coords);
    
    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(cp.x, cp.y);
    ctx.strokeStyle = elements.labelColor.value;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawOverlay() {
  try {
    const canvas = elements.overlay;
    if (!canvas) return;
    
    const parent = canvas.parentElement;
    if (!parent) return;
    
    canvas.width = parent.clientWidth || 512;
    canvas.height = parent.clientHeight || 512;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!state.element) return;
    const viewport = cornerstone.getViewport(state.element);
    if (!viewport) return;
    
    const csCanvas = elements.cornerstoneCanvas;
    if (!csCanvas) return;
    
    const scale = viewport.scale || 1;
    const translation = viewport.translation || { x: 0, y: 0 };
    
    const toScreen = (pt) => {
      if (!pt || typeof pt.x === 'undefined' || typeof pt.y === 'undefined') {
        return { x: 0, y: 0 };
      }
      return {
        x: (pt.x - csCanvas.width / 2) * scale + translation.x * scale + csCanvas.width / 2,
        y: (pt.y - csCanvas.height / 2) * scale + translation.y * scale + csCanvas.height / 2
      };
    };
    
    const currentSliceAnns = state.annotations[state.currentImageIndex] || [];
    currentSliceAnns.forEach(ann => {
      if (ann && ann.type === 'polygon' && ann.points && ann.points.length > 2) {
        try {
          ctx.beginPath();
          const first = toScreen(ann.points[0]);
          ctx.moveTo(first.x, first.y);
          ann.points.slice(1).forEach(p => {
            const sp = toScreen(p);
            ctx.lineTo(sp.x, sp.y);
          });
          ctx.closePath();
          ctx.fillStyle = (ann.color || '#ff0000') + Math.floor((ann.opacity || 0.5) * 255).toString(16).padStart(2, '0');
          ctx.fill();
          ctx.strokeStyle = ann.color || '#ff0000';
          ctx.lineWidth = 2;
          ctx.stroke();
        } catch (e) {
          console.warn('Error drawing annotation:', e);
        }
      }
    });
    
    if (state.polygonPoints && state.polygonPoints.length > 0) {
      try {
        ctx.beginPath();
        const first = toScreen(state.polygonPoints[0]);
        ctx.moveTo(first.x, first.y);
        state.polygonPoints.slice(1).forEach(p => {
          const sp = toScreen(p);
          ctx.lineTo(sp.x, sp.y);
        });
        
        if (state.drawingPolygon) {
          ctx.strokeStyle = elements.labelColor?.value || '#ff0000';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        
        state.polygonPoints.forEach(p => {
          const sp = toScreen(p);
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = elements.labelColor?.value || '#ff0000';
          ctx.fill();
        });
      } catch (e) {
        console.warn('Error drawing polygon:', e);
      }
    }
  } catch (error) {
    console.error('drawOverlay error:', error);
  }
}

function saveHistoryState() {
  const annotationsCopy = JSON.parse(JSON.stringify(state.annotations));
  
  if (state.historyIndex < state.history.length - 1) {
    state.history = state.history.slice(0, state.historyIndex + 1);
  }
  
  state.history.push(annotationsCopy);
  
  if (state.history.length > state.maxHistory) {
    state.history.shift();
  } else {
    state.historyIndex++;
  }
}

function undo() {
  if (state.historyIndex <= 0) {
    console.log('Nothing to undo');
    return;
  }
  
  state.historyIndex--;
  state.annotations = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
  
  drawOverlay();
  updateAnnotationList();
  console.log('Undo performed');
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) {
    console.log('Nothing to redo');
    return;
  }
  
  state.historyIndex++;
  state.annotations = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
  
  drawOverlay();
  updateAnnotationList();
  console.log('Redo performed');
}

function finishPolygon() {
  if (state.polygonPoints.length < 3) return;
  
  const annotation = {
    id: Date.now().toString(),
    type: 'polygon',
    points: [...state.polygonPoints],
    sliceIndex: state.currentImageIndex,
    label: elements.labelName?.value || 'Lesion',
    color: elements.labelColor?.value || '#ff0000',
    opacity: parseFloat(elements.labelOpacity?.value || 0.5),
    createdAt: new Date().toISOString()
  };
  
  if (!state.annotations[state.currentImageIndex]) {
    state.annotations[state.currentImageIndex] = [];
  }
  state.annotations[state.currentImageIndex].push(annotation);
  
  saveHistoryState();
  
  state.polygonPoints = [];
  state.drawingPolygon = false;
  
  drawOverlay();
  updateAnnotationList();
}

function cancelPolygon() {
  state.polygonPoints = [];
  state.drawingPolygon = false;
  drawOverlay();
}

function updateAnnotationList() {
  elements.annotationList.innerHTML = '';
  
  const allAnnotations = [];
  Object.keys(state.annotations).forEach(sliceIdx => {
    state.annotations[sliceIdx].forEach(ann => {
      allAnnotations.push({ ...ann, sliceIndex: parseInt(sliceIdx) });
    });
  });
  
  allAnnotations.forEach(ann => {
    const div = document.createElement('div');
    div.className = 'annotation-item';
    div.innerHTML = `
      <span><strong>${ann.label}</strong> (Slice ${ann.sliceIndex + 1})</span>
      <span class="delete-btn" data-id="${ann.id}">✕</span>
    `;
    div.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteAnnotation(ann.id, ann.sliceIndex);
    });
    div.addEventListener('click', () => {
      state.currentImageIndex = ann.sliceIndex;
      updateImage();
    });
    elements.annotationList.appendChild(div);
  });
}

function deleteAnnotation(id, sliceIndex) {
  if (state.annotations[sliceIndex]) {
    state.annotations[sliceIndex] = state.annotations[sliceIndex].filter(a => a.id !== id);
    if (state.annotations[sliceIndex].length === 0) {
      delete state.annotations[sliceIndex];
    }
    saveHistoryState();
    drawOverlay();
    updateAnnotationList();
  }
}

async function loadDicomSeries() {
  const result = await ipcRenderer.invoke('select-dicom-folder');
  if (!result.success) return;
  
  try {
    elements.placeholder.style.display = 'none';
    state.images = [];
    state.annotations = {};
    
    const sortedFiles = result.files.sort();
    
    for (let i = 0; i < sortedFiles.length; i++) {
      const filePath = sortedFiles[i];
      const fs = require('fs');
      const arrayBuffer = fs.readFileSync(filePath).buffer;
      
      const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(arrayBuffer);
      const image = await cornerstone.loadImage(imageId);
      
      state.images.push({
        imageId: image.imageId,
        image: image,
        filePath: filePath
      });
    }
    
    if (state.images.length > 0) {
      state.currentImageIndex = 0;
      updateImage();
      updateSeriesInfo(result.folderPath);
      
      elements.sliceSlider.max = state.images.length - 1;
      elements.sliceSlider.disabled = false;
    }
  } catch (error) {
    console.error('Error loading DICOM:', error);
    alert('Error loading DICOM series: ' + error.message);
  }
}

function updateImage() {
  if (!state.images[state.currentImageIndex]) return;
  
  const imageData = state.images[state.currentImageIndex];
  cornerstone.displayImage(state.element, imageData.image);
  
  elements.sliceSlider.value = state.currentImageIndex;
  elements.sliceInfo.textContent = `Slice: ${state.currentImageIndex + 1} / ${state.images.length}`;
  
  drawOverlay();
}

function updateSeriesInfo(folderPath) {
  const firstImage = state.images[0]?.image;
  if (!firstImage) return;
  
  const info = `
    <div><strong>Folder:</strong><br>${folderPath.split('/').pop()}</div>
    <div><strong>Slices:</strong> ${state.images.length}</div>
    <div><strong>Dimensions:</strong> ${firstImage.width} x ${firstImage.height}</div>
    <div><strong>Bits Stored:</strong> ${firstImage.bitsStored || 'N/A'}</div>
    <div><strong>Photometric:</strong> ${firstImage.photometricInterpretation || 'N/A'}</div>
    <div><strong>Modality:</strong> ${firstImage.data?.string('x00080060') || 'N/A'}</div>
  `;
  elements.seriesInfo.innerHTML = info;
}

async function runAISegmentation() {
  if (state.images.length === 0) {
    alert('Please load a DICOM series first');
    return;
  }
  
  try {
    elements.aiSegmentBtn.disabled = true;
    elements.aiSegmentBtn.textContent = 'Processing...';
    
    const denoiseStrength = parseFloat(elements.denoiseStrength?.value || 1.0);
    
    const formData = new FormData();
    const fs = require('fs');
    
    const sampleFile = state.images[0].filePath;
    const fileBuffer = fs.readFileSync(sampleFile);
    const blob = new Blob([fileBuffer], { type: 'application/dicom' });
    formData.append('dicom_files', blob, sampleFile.split('/').pop());
    formData.append('denoise_strength', denoiseStrength.toString());
    
    const response = await axios.post(`${API_BASE}/segment/liver`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    
    if (response.data.success) {
      alert(`AI segmentation completed!\nDenoise strength: ${denoiseStrength}\nSegmentation path: ${response.data.segmentation_path}`);
      console.log('Segmentation result:', response.data);
    }
  } catch (error) {
    console.error('AI Segmentation error:', error);
    alert('AI segmentation failed: ' + (error.response?.data?.detail || error.message));
  } finally {
    elements.aiSegmentBtn.disabled = false;
    elements.aiSegmentBtn.textContent = 'AI Segmentation (Liver)';
  }
}

async function exportNifti() {
  if (Object.keys(state.annotations).length === 0) {
    alert('No annotations to export');
    return;
  }
  
  const result = await ipcRenderer.invoke('export-nifti');
  if (!result.success) return;
  
  try {
    const annotationsForExport = {};
    Object.keys(state.annotations).forEach(sliceIdx => {
      annotationsForExport[sliceIdx] = state.annotations[sliceIdx].map(a => ({
        type: a.type,
        points: a.points,
        label: a.label
      }));
    });
    
    await axios.post(`${API_BASE}/export/nifti`, {
      annotations: annotationsForExport,
      output_path: result.path,
      image_size: state.images[0] ? [state.images[0].image.width, state.images[0].image.height, state.images.length] : [512, 512, 1]
    });
    
    alert('NIfTI export initiated!');
  } catch (error) {
    console.error('Export error:', error);
    alert('Export failed: ' + error.message);
  }
}

async function exportDicomSeg() {
  if (Object.keys(state.annotations).length === 0) {
    alert('No annotations to export');
    return;
  }
  
  if (state.images.length === 0) {
    alert('Please load DICOM series first');
    return;
  }
  
  try {
    const { dialog } = require('electron').remote || require('electron');
    const result = await ipcRenderer.invoke('save-annotation', {
      annotations: state.annotations,
      type: 'dicom-seg'
    });
    
    if (!result.success) return;
    
    const annotationsForExport = {};
    Object.keys(state.annotations).forEach(sliceIdx => {
      annotationsForExport[sliceIdx] = state.annotations[sliceIdx].map(a => ({
        type: a.type,
        points: a.points,
        label: a.label,
        color: a.color
      }));
    });
    
    const response = await axios.post(`${API_BASE}/export/dicom-seg`, {
      annotations: annotationsForExport,
      output_path: result.path.replace('.json', '.dcm'),
      reference_dicom: state.images[0]?.filePath,
      image_size: [state.images[0].image.width, state.images[0].image.height, state.images.length]
    });
    
    if (response.data.success) {
      alert('DICOM-SEG export completed!');
    }
  } catch (error) {
    console.error('DICOM-SEG export error:', error);
    alert('DICOM-SEG export failed: ' + error.message);
  }
}

function openVolumeRender() {
  if (state.images.length === 0) {
    alert('Please load a DICOM series first');
    return;
  }
  
  elements.dicomViewer.style.display = 'none';
  elements.volumeViewer.style.display = 'flex';
  elements.volumeViewer.style.position = 'absolute';
  elements.volumeViewer.style.top = '0';
  elements.volumeViewer.style.left = '0';
  elements.volumeViewer.style.width = '100%';
  elements.volumeViewer.style.height = '100%';
  
  const threshold = parseInt(elements.thresholdSlider?.value || 100);
  const opacity = parseFloat(elements.volumeOpacitySlider?.value || 0.5);
  
  volumeRenderer.start();
  volumeRenderer.createVolumeFromImages(state.images, threshold, opacity);
}

function closeVolumeRender() {
  volumeRenderer.stop();
  elements.volumeViewer.style.display = 'none';
  elements.dicomViewer.style.display = 'flex';
}

async function saveAnnotation() {
  if (Object.keys(state.annotations).length === 0) {
    alert('No annotations to save');
    return;
  }
  
  const result = await ipcRenderer.invoke('save-annotation', {
    annotations: state.annotations,
    series: state.images.map(i => i.filePath),
    createdAt: new Date().toISOString()
  });
  
  if (result.success) {
    alert('Annotation saved to: ' + result.path);
  }
}

async function submitForTraining() {
  if (Object.keys(state.annotations).length === 0) {
    alert('Please create annotations first');
    return;
  }
  
  try {
    const annotationsForExport = {};
    Object.keys(state.annotations).forEach(sliceIdx => {
      annotationsForExport[sliceIdx] = state.annotations[sliceIdx].map(a => ({
        type: a.type,
        points: a.points,
        label: a.label
      }));
    });
    
    const response = await axios.post(`${API_BASE}/training/submit`, {
      annotations: annotationsForExport,
      model_type: 'liver',
      image_size: state.images[0] ? [state.images[0].image.width, state.images[0].image.height, state.images.length] : [512, 512, 1]
    });
    
    if (response.data.success) {
      alert(`Training job submitted! Job ID: ${response.data.job_id}`);
      refreshTrainingJobs();
    }
  } catch (error) {
    console.error('Submit training error:', error);
    alert('Failed to submit training job: ' + error.message);
  }
}

async function refreshTrainingJobs() {
  try {
    const response = await axios.get(`${API_BASE}/training/jobs`);
    elements.trainingJobs.innerHTML = '';
    
    response.data.jobs.forEach(job => {
      const div = document.createElement('div');
      div.className = 'training-job';
      div.innerHTML = `
        <div><strong>Job ${job.id.slice(0, 8)}</strong></div>
        <div>Model: ${job.model_type}</div>
        <div>Status: <span class="status ${job.status}">${job.status}</span></div>
      `;
      elements.trainingJobs.appendChild(div);
    });
  } catch (error) {
    console.error('Refresh jobs error:', error);
  }
}

function bindEvents() {
  elements.loadDicomBtn.addEventListener('click', loadDicomSeries);
  
  elements.polygonToolBtn.addEventListener('click', () => {
    if (state.currentTool === 'polygon') {
      state.currentTool = null;
      state.drawingPolygon = false;
      state.polygonPoints = [];
      elements.polygonToolBtn.style.background = '';
    } else {
      state.currentTool = 'polygon';
      state.drawingPolygon = true;
      state.polygonPoints = [];
      elements.polygonToolBtn.style.background = '#e94560';
      elements.growToolBtn.style.background = '';
    }
    drawOverlay();
  });
  
  elements.growToolBtn.addEventListener('click', () => {
    if (state.currentTool === 'regionGrow') {
      state.currentTool = null;
      elements.growToolBtn.style.background = '';
    } else {
      state.currentTool = 'regionGrow';
      state.drawingPolygon = false;
      state.polygonPoints = [];
      elements.growToolBtn.style.background = '#e94560';
      elements.polygonToolBtn.style.background = '';
    }
    drawOverlay();
  });
  
  elements.volumeRenderBtn.addEventListener('click', openVolumeRender);
  
  if (elements.closeVolumeBtn) {
    elements.closeVolumeBtn.addEventListener('click', closeVolumeRender);
  }
  
  if (elements.thresholdSlider) {
    elements.thresholdSlider.addEventListener('input', (e) => {
      if (elements.thresholdValue) {
        elements.thresholdValue.textContent = e.target.value;
      }
      const threshold = parseInt(e.target.value);
      const opacity = parseFloat(elements.volumeOpacitySlider?.value || 0.5);
      volumeRenderer.updateThreshold(threshold, opacity);
    });
  }
  
  if (elements.volumeOpacitySlider) {
    elements.volumeOpacitySlider.addEventListener('input', (e) => {
      if (elements.volumeOpacityValue) {
        elements.volumeOpacityValue.textContent = e.target.value;
      }
      const threshold = parseInt(elements.thresholdSlider?.value || 100);
      const opacity = parseFloat(e.target.value);
      volumeRenderer.updateThreshold(threshold, opacity);
    });
  }
  
  if (elements.growTolerance) {
    elements.growTolerance.addEventListener('input', (e) => {
      if (elements.growToleranceValue) {
        elements.growToleranceValue.textContent = e.target.value;
      }
    });
  }
  
  if (elements.growMaxPixels) {
    elements.growMaxPixels.addEventListener('input', (e) => {
      if (elements.growMaxValue) {
        elements.growMaxValue.textContent = e.target.value;
      }
    });
  }
  
  elements.aiSegmentBtn.addEventListener('click', runAISegmentation);
  elements.exportNiftiBtn.addEventListener('click', exportNifti);
  elements.exportDicomSegBtn.addEventListener('click', exportDicomSeg);
  elements.saveAnnotationBtn.addEventListener('click', saveAnnotation);
  elements.submitTrainingBtn.addEventListener('click', submitForTraining);
  
  if (elements.denoiseStrength) {
    elements.denoiseStrength.addEventListener('input', (e) => {
      if (elements.denoiseValue) {
        elements.denoiseValue.textContent = e.target.value;
      }
    });
  }
  
  elements.sliceSlider.addEventListener('input', (e) => {
    state.currentImageIndex = parseInt(e.target.value);
    updateImage();
  });
  
  document.addEventListener('keydown', (e) => {
    try {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      
      if (e.key === 'ArrowDown' || e.key === 'j') {
        if (state.currentImageIndex < state.images.length - 1) {
          state.currentImageIndex++;
          updateImage();
        }
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        if (state.currentImageIndex > 0) {
          state.currentImageIndex--;
          updateImage();
        }
      } else if (e.key === 'Enter') {
        if (state.drawingPolygon && state.polygonPoints.length > 2) {
          finishPolygon();
        }
      } else if (e.key === 'Escape') {
        if (state.drawingPolygon) {
          cancelPolygon();
        }
      }
    } catch (error) {
      console.error('Keyboard event error:', error);
    }
  });
  
  window.addEventListener('resize', drawOverlay);
  
  state.element.addEventListener('cornerstoneimagerendered', drawOverlay);
}

function init() {
  initCornerstone();
  bindEvents();
  refreshTrainingJobs();
  setInterval(refreshTrainingJobs, 5000);
}

init();
