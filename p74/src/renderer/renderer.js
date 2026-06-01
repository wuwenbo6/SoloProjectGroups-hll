const { ipcRenderer } = require('electron');

let state = {
  pages: [],
  currentPageIndex: 0,
  fileName: '',
  filePath: '',
  zoom: 1,
  currentTool: 'select',
  isCropping: false,
  cropRect: null,
  fabricCanvas: null,
  ocrSelectionRect: null,
  isSelectingOcrArea: false,
  thumbnailCache: new Map(),
  visibleThumbnailRange: { start: 0, end: 20 },
  searchResults: [],
  currentSearchIndex: 0,
  selectedPages: new Set()
};

const elements = {
  btnOpen: document.getElementById('btn-open'),
  btnSave: document.getElementById('btn-save'),
  btnLoad: document.getElementById('btn-load'),
  btnExport: document.getElementById('btn-export'),
  btnExportPdf: document.getElementById('btn-export-pdf'),
  btnExportImages: document.getElementById('btn-export-images'),
  btnRotateLeft: document.getElementById('btn-rotate-left'),
  btnRotateRight: document.getElementById('btn-rotate-right'),
  btnCrop: document.getElementById('btn-crop'),
  btnCropApply: document.getElementById('btn-crop-apply'),
  btnCropCancel: document.getElementById('btn-crop-cancel'),
  btnMoveUp: document.getElementById('btn-move-up'),
  btnMoveDown: document.getElementById('btn-move-down'),
  btnDeletePage: document.getElementById('btn-delete-page'),
  btnSelect: document.getElementById('btn-select'),
  btnHighlight: document.getElementById('btn-highlight'),
  btnTextbox: document.getElementById('btn-textbox'),
  btnClearAnnotations: document.getElementById('btn-clear-annotations'),
  btnOcr: document.getElementById('btn-ocr'),
  btnOcrArea: document.getElementById('btn-ocr-area'),
  btnOcrCancel: document.getElementById('btn-ocr-cancel'),
  btnOcrAll: document.getElementById('btn-ocr-all'),
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnZoomFit: document.getElementById('btn-zoom-fit'),
  btnAutoSplit: document.getElementById('btn-auto-split'),
  btnMergePages: document.getElementById('btn-merge-pages'),
  btnSearch: document.getElementById('btn-search'),
  btnSearchPrev: document.getElementById('btn-search-prev'),
  btnSearchNext: document.getElementById('btn-search-next'),
  splitThreshold: document.getElementById('split-threshold'),
  thresholdValue: document.getElementById('threshold-value'),
  splitResult: document.getElementById('split-result'),
  searchInput: document.getElementById('search-input'),
  searchResults: document.getElementById('search-results'),
  searchCount: document.getElementById('search-count'),
  highlightColor: document.getElementById('highlight-color'),
  highlightOpacity: document.getElementById('highlight-opacity'),
  fileInfo: document.getElementById('file-info'),
  pageInfo: document.getElementById('page-info'),
  pageThumbnails: document.getElementById('page-thumbnails'),
  mainCanvas: document.getElementById('main-canvas'),
  canvasWrapper: document.querySelector('.canvas-wrapper'),
  canvasContainer: document.querySelector('.canvas-container'),
  dropHint: document.getElementById('drop-hint'),
  cropOverlay: document.getElementById('crop-overlay'),
  cropBox: document.querySelector('.crop-box'),
  ocrProgress: document.getElementById('ocr-progress'),
  ocrProgressFill: document.querySelector('.progress-fill'),
  ocrResult: document.getElementById('ocr-result'),
  loadingOverlay: document.getElementById('loading-overlay'),
  loadingProgress: document.getElementById('loading-progress'),
  ocrAreaHint: document.getElementById('ocr-area-hint')
};

function init() {
  setupEventListeners();
  setupDragDrop();
  initFabricCanvas();
  setupThumbnailLazyLoad();
}

function initFabricCanvas() {
  state.fabricCanvas = new fabric.Canvas('main-canvas', {
    selection: true,
    preserveObjectStacking: true
  });
}

function setupEventListeners() {
  elements.btnOpen.addEventListener('click', openTiffFile);
  elements.btnSave.addEventListener('click', saveProject);
  elements.btnLoad.addEventListener('click', loadProject);
  elements.btnExportPdf.addEventListener('click', exportPdf);
  elements.btnExportImages.addEventListener('click', exportImages);

  elements.btnRotateLeft.addEventListener('click', () => rotatePage(-90));
  elements.btnRotateRight.addEventListener('click', () => rotatePage(90));

  elements.btnCrop.addEventListener('click', toggleCropMode);
  elements.btnCropApply.addEventListener('click', applyCrop);
  elements.btnCropCancel.addEventListener('click', cancelCrop);

  elements.btnMoveUp.addEventListener('click', () => movePage(-1));
  elements.btnMoveDown.addEventListener('click', () => movePage(1));
  elements.btnDeletePage.addEventListener('click', deletePage);

  elements.btnSelect.addEventListener('click', () => setTool('select'));
  elements.btnHighlight.addEventListener('click', () => setTool('highlight'));
  elements.btnTextbox.addEventListener('click', () => setTool('textbox'));
  elements.btnClearAnnotations.addEventListener('click', clearAnnotations);

  elements.btnOcr.addEventListener('click', performOcr);
  elements.btnOcrArea.addEventListener('click', startOcrAreaSelection);
  elements.btnOcrCancel.addEventListener('click', cancelOcrAreaSelection);
  elements.btnOcrAll.addEventListener('click', performOcrAll);

  elements.btnZoomIn.addEventListener('click', () => zoom(0.2));
  elements.btnZoomOut.addEventListener('click', () => zoom(-0.2));
  elements.btnZoomFit.addEventListener('click', zoomToFit);

  elements.btnAutoSplit.addEventListener('click', autoSplitPage);
  elements.btnMergePages.addEventListener('click', mergeSelectedPages);
  elements.splitThreshold.addEventListener('input', (e) => {
    elements.thresholdValue.textContent = Math.round(e.target.value * 100) + '%';
  });

  elements.btnSearch.addEventListener('click', performSearch);
  elements.btnSearchPrev.addEventListener('click', () => navigateSearch(-1));
  elements.btnSearchNext.addEventListener('click', () => navigateSearch(1));
  elements.searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });

  setupCropHandlers();
}

function setupThumbnailLazyLoad() {
  elements.pageThumbnails.addEventListener('scroll', () => {
    requestAnimationFrame(updateVisibleThumbnails);
  });
}

function updateVisibleThumbnails() {
  if (state.pages.length === 0) return;

  const container = elements.pageThumbnails;
  const scrollTop = container.scrollTop;
  const containerHeight = container.clientHeight;
  const thumbnailHeight = 140;

  const start = Math.max(0, Math.floor(scrollTop / thumbnailHeight) - 5);
  const end = Math.min(state.pages.length, Math.ceil((scrollTop + containerHeight) / thumbnailHeight) + 5);

  if (start !== state.visibleThumbnailRange.start || end !== state.visibleThumbnailRange.end) {
    state.visibleThumbnailRange = { start, end };
    renderVisibleThumbnails(start, end);
  }
}

function setupDragDrop() {
  const container = elements.canvasContainer;

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    container.style.background = '#1e1e2e';
  });

  container.addEventListener('dragleave', () => {
    container.style.background = '#11111b';
  });

  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    container.style.background = '#11111b';

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.toLowerCase().endsWith('.tiff') || file.name.toLowerCase().endsWith('.tif')) {
        const result = await ipcRenderer.invoke('open-tiff-file');
        if (result) {
          loadDocument(result);
        }
      }
    }
  });
}

async function openTiffFile() {
  showLoading('正在加载TIFF文件...\n准备中...');
  
  ipcRenderer.on('file-load-progress', (event, progress) => {
    const percentage = Math.round((progress.current / progress.total) * 100);
    showLoading(`正在加载TIFF文件...\n第 ${progress.current}/${progress.total} 页 (${percentage}%)`);
  });
  
  const result = await ipcRenderer.invoke('open-tiff-file');
  hideLoading();
  
  ipcRenderer.removeAllListeners('file-load-progress');
  
  if (result) {
    loadDocument(result);
  }
}

function loadDocument(data) {
  state.pages = data.pages;
  state.fileName = data.fileName;
  state.filePath = data.filePath;
  state.currentPageIndex = 0;
  state.zoom = 1;
  state.thumbnailCache.clear();
  state.selectedPages.clear();
  state.searchResults = [];

  elements.fileInfo.textContent = `${state.fileName} (${state.pages.length}页)`;
  elements.dropHint.classList.add('hidden');
  elements.searchResults.classList.add('hidden');

  initThumbnailPlaceholders();
  renderVisibleThumbnails(0, Math.min(20, state.pages.length));
  renderCurrentPage();
  updatePageInfo();
}

function initThumbnailPlaceholders() {
  elements.pageThumbnails.innerHTML = '';
  
  for (let i = 0; i < state.pages.length; i++) {
    const thumbnail = document.createElement('div');
    thumbnail.className = `thumbnail-item ${i === state.currentPageIndex ? 'active' : ''}`;
    thumbnail.dataset.index = i;
    thumbnail.id = `thumbnail-${i}`;
    thumbnail.style.minHeight = '120px';
    thumbnail.style.background = '#3a3b4c';
    thumbnail.style.display = 'flex';
    thumbnail.style.alignItems = 'center';
    thumbnail.style.justifyContent = 'center';
    
    const pageNum = document.createElement('div');
    pageNum.className = 'thumbnail-number';
    pageNum.textContent = i + 1;
    thumbnail.appendChild(pageNum);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'thumbnail-checkbox';
    checkbox.checked = state.selectedPages.has(i);
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        state.selectedPages.add(i);
      } else {
        state.selectedPages.delete(i);
      }
      thumbnail.classList.toggle('selected', checkbox.checked);
    });
    thumbnail.appendChild(checkbox);

    const loadingText = document.createElement('span');
    loadingText.className = 'thumbnail-loading';
    loadingText.textContent = `第${i + 1}页`;
    loadingText.style.fontSize = '11px';
    loadingText.style.color = '#6c7086';
    thumbnail.appendChild(loadingText);

    thumbnail.addEventListener('click', (e) => {
      if (e.target.type === 'checkbox') return;
      state.currentPageIndex = i;
      renderCurrentPage();
      updateActiveThumbnail();
      updatePageInfo();
    });

    elements.pageThumbnails.appendChild(thumbnail);
  }
}

async function renderVisibleThumbnails(start, end) {
  for (let i = start; i < end; i++) {
    if (i >= 0 && i < state.pages.length && !state.thumbnailCache.has(i)) {
      await renderThumbnail(i);
    }
  }
}

async function renderThumbnail(index) {
  return new Promise((resolve) => {
    const page = state.pages[index];
    const thumbnail = document.getElementById(`thumbnail-${index}`);
    
    if (!thumbnail || state.thumbnailCache.has(index)) {
      resolve();
      return;
    }

    setTimeout(() => {
      const canvas = document.createElement('canvas');
      const maxWidth = 160;
      const scale = maxWidth / page.width;
      canvas.width = maxWidth;
      canvas.height = page.height * scale;

      const ctx = canvas.getContext('2d');
      
      try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = page.width;
        tempCanvas.height = page.height;
        const tempCtx = tempCanvas.getContext('2d');
        const imageData = tempCtx.createImageData(page.width, page.height);
        imageData.data.set(Uint8ClampedArray.from(page.data));
        tempCtx.putImageData(imageData, 0, 0);

        ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
        
        const checkbox = thumbnail.querySelector('.thumbnail-checkbox');
        thumbnail.innerHTML = '';
        thumbnail.style.background = 'transparent';
        thumbnail.appendChild(canvas);
        
        const pageNum = document.createElement('div');
        pageNum.className = 'thumbnail-number';
        pageNum.textContent = index + 1;
        thumbnail.appendChild(pageNum);
        
        if (checkbox) {
          thumbnail.appendChild(checkbox);
        }
        
        state.thumbnailCache.set(index, true);
      } catch (e) {
        console.error('Error rendering thumbnail:', e);
      }
      
      resolve();
    }, 0);
  });
}

function updateActiveThumbnail() {
  document.querySelectorAll('.thumbnail-item').forEach((item, index) => {
    item.classList.toggle('active', index === state.currentPageIndex);
  });
}

function renderCurrentPage() {
  if (state.pages.length === 0) return;

  const page = state.pages[state.currentPageIndex];
  const canvas = elements.mainCanvas;

  canvas.width = page.width;
  canvas.height = page.height;

  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(page.width, page.height);
  imageData.data.set(Uint8ClampedArray.from(page.data));
  ctx.putImageData(imageData, 0, 0);

  if (page.rotation) {
    const tempCanvas = document.createElement('canvas');
    const isRotated = Math.abs(page.rotation) === 90 || Math.abs(page.rotation) === 270;
    tempCanvas.width = isRotated ? page.height : page.width;
    tempCanvas.height = isRotated ? page.width : page.height;
    
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
    tempCtx.rotate((page.rotation * Math.PI) / 180);
    tempCtx.drawImage(canvas, -page.width / 2, -page.height / 2);

    canvas.width = tempCanvas.width;
    canvas.height = tempCanvas.height;
    ctx.drawImage(tempCanvas, 0, 0);
  }

  state.fabricCanvas.setWidth(canvas.width);
  state.fabricCanvas.setHeight(canvas.height);
  state.fabricCanvas.setBackgroundImage(canvas.toDataURL(), state.fabricCanvas.renderAll.bind(state.fabricCanvas), {
    originX: 'left',
    originY: 'top'
  });

  if (page.annotations && page.annotations.length > 0) {
    page.annotations.forEach(ann => {
      if (ann.type === 'rect') {
        const rect = new fabric.Rect(ann);
        state.fabricCanvas.add(rect);
      } else if (ann.type === 'textbox') {
        const textbox = new fabric.Textbox(ann.text, ann);
        state.fabricCanvas.add(textbox);
      }
    });
  }

  elements.ocrResult.value = page.ocrText || '';
  applyZoom();
}

function updatePageInfo() {
  elements.pageInfo.textContent = `${state.currentPageIndex + 1} / ${state.pages.length}`;
}

function rotatePage(degrees) {
  if (state.pages.length === 0) return;

  const page = state.pages[state.currentPageIndex];
  page.rotation = (page.rotation + degrees) % 360;

  if (Math.abs(degrees) === 90 || Math.abs(degrees) === 270) {
    [page.width, page.height] = [page.height, page.width];
  }

  renderCurrentPage();
  state.thumbnailCache.delete(state.currentPageIndex);
  renderThumbnail(state.currentPageIndex);
}

function toggleCropMode() {
  if (state.pages.length === 0) return;

  state.isCropping = !state.isCropping;

  if (state.isCropping) {
    elements.cropOverlay.classList.remove('hidden');
    elements.btnCropApply.classList.remove('hidden');
    elements.btnCropCancel.classList.remove('hidden');
    elements.btnCrop.classList.add('btn-active');

    const page = state.pages[state.currentPageIndex];
    const cropBox = elements.cropBox;
    cropBox.style.left = '10%';
    cropBox.style.top = '10%';
    cropBox.style.width = '80%';
    cropBox.style.height = '80%';

    state.cropRect = {
      x: page.width * 0.1,
      y: page.height * 0.1,
      width: page.width * 0.8,
      height: page.height * 0.8
    };
  } else {
    elements.cropOverlay.classList.add('hidden');
    elements.btnCropApply.classList.add('hidden');
    elements.btnCropCancel.classList.add('hidden');
    elements.btnCrop.classList.remove('btn-active');
  }
}

function setupCropHandlers() {
  const cropBox = elements.cropBox;
  let isDragging = false;
  let isResizing = false;
  let currentHandle = null;
  let startX, startY;
  let startRect = {};

  cropBox.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('crop-handle')) {
      isResizing = true;
      currentHandle = e.target.dataset.handle;
    } else {
      isDragging = true;
    }
    startX = e.clientX;
    startY = e.clientY;
    startRect = {
      left: cropBox.offsetLeft,
      top: cropBox.offsetTop,
      width: cropBox.offsetWidth,
      height: cropBox.offsetHeight
    };
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging && !isResizing) return;
    if (!state.isCropping) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const wrapper = elements.canvasWrapper;

    if (isDragging) {
      let newLeft = startRect.left + dx;
      let newTop = startRect.top + dy;
      newLeft = Math.max(0, Math.min(newLeft, wrapper.offsetWidth - startRect.width));
      newTop = Math.max(0, Math.min(newTop, wrapper.offsetHeight - startRect.height));
      cropBox.style.left = newLeft + 'px';
      cropBox.style.top = newTop + 'px';
    } else if (isResizing) {
      switch (currentHandle) {
        case 'se':
          cropBox.style.width = Math.max(50, startRect.width + dx) + 'px';
          cropBox.style.height = Math.max(50, startRect.height + dy) + 'px';
          break;
        case 'sw':
          cropBox.style.left = Math.max(0, startRect.left + dx) + 'px';
          cropBox.style.width = Math.max(50, startRect.width - dx) + 'px';
          cropBox.style.height = Math.max(50, startRect.height + dy) + 'px';
          break;
        case 'ne':
          cropBox.style.top = Math.max(0, startRect.top + dy) + 'px';
          cropBox.style.width = Math.max(50, startRect.width + dx) + 'px';
          cropBox.style.height = Math.max(50, startRect.height - dy) + 'px';
          break;
        case 'nw':
          cropBox.style.left = Math.max(0, startRect.left + dx) + 'px';
          cropBox.style.top = Math.max(0, startRect.top + dy) + 'px';
          cropBox.style.width = Math.max(50, startRect.width - dx) + 'px';
          cropBox.style.height = Math.max(50, startRect.height - dy) + 'px';
          break;
      }
    }

    state.cropRect = {
      x: (cropBox.offsetLeft / wrapper.offsetWidth) * state.pages[state.currentPageIndex].width,
      y: (cropBox.offsetTop / wrapper.offsetHeight) * state.pages[state.currentPageIndex].height,
      width: (cropBox.offsetWidth / wrapper.offsetWidth) * state.pages[state.currentPageIndex].width,
      height: (cropBox.offsetHeight / wrapper.offsetHeight) * state.pages[state.currentPageIndex].height
    };
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    isResizing = false;
    currentHandle = null;
  });
}

function applyCrop() {
  if (!state.cropRect || state.pages.length === 0) return;

  const page = state.pages[state.currentPageIndex];
  const canvas = elements.mainCanvas;
  const ctx = canvas.getContext('2d');

  const cropX = Math.max(0, Math.floor(state.cropRect.x));
  const cropY = Math.max(0, Math.floor(state.cropRect.y));
  const cropW = Math.min(page.width - cropX, Math.floor(state.cropRect.width));
  const cropH = Math.min(page.height - cropY, Math.floor(state.cropRect.height));

  const imageData = ctx.getImageData(cropX, cropY, cropW, cropH);

  page.data = Array.from(imageData.data);
  page.width = cropW;
  page.height = cropH;
  page.annotations = [];

  cancelCrop();
  renderCurrentPage();
  state.thumbnailCache.delete(state.currentPageIndex);
  renderThumbnail(state.currentPageIndex);
}

function cancelCrop() {
  state.isCropping = false;
  state.cropRect = null;
  elements.cropOverlay.classList.add('hidden');
  elements.btnCropApply.classList.add('hidden');
  elements.btnCropCancel.classList.add('hidden');
  elements.btnCrop.classList.remove('btn-active');
}

function movePage(direction) {
  if (state.pages.length <= 1) return;

  const newIndex = state.currentPageIndex + direction;
  if (newIndex < 0 || newIndex >= state.pages.length) return;

  [state.pages[state.currentPageIndex], state.pages[newIndex]] = 
  [state.pages[newIndex], state.pages[state.currentPageIndex]];

  state.thumbnailCache.delete(state.currentPageIndex);
  state.thumbnailCache.delete(newIndex);

  state.currentPageIndex = newIndex;
  initThumbnailPlaceholders();
  renderVisibleThumbnails(state.visibleThumbnailRange.start, state.visibleThumbnailRange.end);
  updatePageInfo();
}

function deletePage() {
  if (state.pages.length <= 1) return;
  
  if (confirm('确定要删除当前页面吗？')) {
    state.pages.splice(state.currentPageIndex, 1);
    state.currentPageIndex = Math.min(state.currentPageIndex, state.pages.length - 1);
    
    state.thumbnailCache.clear();
    
    if (state.pages.length === 0) {
      elements.dropHint.classList.remove('hidden');
      elements.fileInfo.textContent = '未加载文件';
      elements.pageInfo.textContent = '- / -';
      elements.pageThumbnails.innerHTML = '';
    } else {
      initThumbnailPlaceholders();
      renderVisibleThumbnails(0, Math.min(20, state.pages.length));
      renderCurrentPage();
      updatePageInfo();
    }
  }
}

function setTool(tool) {
  state.currentTool = tool;

  elements.btnSelect.classList.toggle('btn-active', tool === 'select');
  elements.btnHighlight.classList.toggle('btn-active', tool === 'highlight');
  elements.btnTextbox.classList.toggle('btn-active', tool === 'textbox');

  if (state.ocrSelectionRect) {
    state.fabricCanvas.remove(state.ocrSelectionRect);
    state.ocrSelectionRect = null;
  }
  elements.ocrAreaHint.classList.add('hidden');
  elements.btnOcrCancel.classList.add('hidden');

  if (tool === 'select') {
    state.fabricCanvas.isDrawingMode = false;
    state.fabricCanvas.selection = true;
  } else if (tool === 'highlight') {
    state.fabricCanvas.isDrawingMode = false;
    state.fabricCanvas.selection = false;
    setupHighlightDrawing();
  } else if (tool === 'textbox') {
    state.fabricCanvas.isDrawingMode = false;
    state.fabricCanvas.selection = true;
    addTextbox();
  }
}

function setupHighlightDrawing() {
  const canvas = elements.mainCanvas;
  let isDrawing = false;
  let startX, startY;
  let currentRect = null;

  const color = elements.highlightColor.value;
  const opacity = parseFloat(elements.highlightOpacity.value);

  canvas.onmousedown = (e) => {
    if (state.currentTool !== 'highlight') return;
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    startX = (e.clientX - rect.left) / state.zoom;
    startY = (e.clientY - rect.top) / state.zoom;
  };

  canvas.onmousemove = (e) => {
    if (!isDrawing || state.currentTool !== 'highlight') return;
    const rect = canvas.getBoundingClientRect();
    const currentX = (e.clientX - rect.left) / state.zoom;
    const currentY = (e.clientY - rect.top) / state.zoom;

    if (currentRect) {
      state.fabricCanvas.remove(currentRect);
    }

    currentRect = new fabric.Rect({
      left: Math.min(startX, currentX),
      top: Math.min(startY, currentY),
      width: Math.abs(currentX - startX),
      height: Math.abs(currentY - startY),
      fill: color,
      opacity: opacity,
      selectable: true
    });

    state.fabricCanvas.add(currentRect);
  };

  canvas.onmouseup = () => {
    if (!isDrawing) return;
    isDrawing = false;
    
    if (currentRect) {
      saveAnnotations();
      currentRect = null;
    }
  };
}

function addTextbox() {
  const textbox = new fabric.Textbox('双击编辑文字', {
    left: 100,
    top: 100,
    width: 200,
    fontSize: 18,
    fill: '#ff0000',
    backgroundColor: 'rgba(255, 255, 0, 0.3)'
  });

  state.fabricCanvas.add(textbox);
  state.fabricCanvas.setActiveObject(textbox);
  saveAnnotations();
  setTool('select');
}

function saveAnnotations() {
  if (state.pages.length === 0) return;

  const page = state.pages[state.currentPageIndex];
  page.annotations = [];

  state.fabricCanvas.getObjects().forEach(obj => {
    if (obj.type === 'rect') {
      page.annotations.push({
        type: 'rect',
        left: obj.left,
        top: obj.top,
        width: obj.width,
        height: obj.height,
        fill: obj.fill,
        opacity: obj.opacity
      });
    } else if (obj.type === 'textbox') {
      page.annotations.push({
        type: 'textbox',
        text: obj.text,
        left: obj.left,
        top: obj.top,
        width: obj.width,
        fontSize: obj.fontSize,
        fill: obj.fill,
        backgroundColor: obj.backgroundColor
      });
    }
  });
}

function clearAnnotations() {
  if (state.pages.length === 0) return;
  if (!confirm('确定要清除当前页面的所有标注吗？')) return;

  const objects = state.fabricCanvas.getObjects();
  objects.forEach(obj => state.fabricCanvas.remove(obj));
  
  state.pages[state.currentPageIndex].annotations = [];
}

function startOcrAreaSelection() {
  if (state.pages.length === 0) return;

  state.isSelectingOcrArea = true;
  state.currentTool = 'ocrArea';

  elements.btnSelect.classList.remove('btn-active');
  elements.btnHighlight.classList.remove('btn-active');
  elements.btnTextbox.classList.remove('btn-active');
  elements.ocrAreaHint.classList.remove('hidden');
  elements.btnOcrCancel.classList.remove('hidden');

  state.fabricCanvas.selection = false;
  state.fabricCanvas.isDrawingMode = false;

  let isDrawing = false;
  let startX, startY;

  const canvas = elements.mainCanvas;

  const onMouseDown = (e) => {
    if (!state.isSelectingOcrArea) return;
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    startX = (e.clientX - rect.left) / state.zoom;
    startY = (e.clientY - rect.top) / state.zoom;

    if (state.ocrSelectionRect) {
      state.fabricCanvas.remove(state.ocrSelectionRect);
    }
  };

  const onMouseMove = (e) => {
    if (!isDrawing || !state.isSelectingOcrArea) return;
    const rect = canvas.getBoundingClientRect();
    const currentX = (e.clientX - rect.left) / state.zoom;
    const currentY = (e.clientY - rect.top) / state.zoom;

    if (state.ocrSelectionRect) {
      state.fabricCanvas.remove(state.ocrSelectionRect);
    }

    state.ocrSelectionRect = new fabric.Rect({
      left: Math.min(startX, currentX),
      top: Math.min(startY, currentY),
      width: Math.abs(currentX - startX),
      height: Math.abs(currentY - startY),
      fill: 'rgba(137, 180, 250, 0.2)',
      stroke: '#89b4fa',
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      selectable: false
    });

    state.fabricCanvas.add(state.ocrSelectionRect);
    state.fabricCanvas.renderAll();
  };

  const onMouseUp = () => {
    if (!isDrawing) return;
    isDrawing = false;
  };

  canvas.onmousedown = onMouseDown;
  canvas.onmousemove = onMouseMove;
  canvas.onmouseup = onMouseUp;
}

function cancelOcrAreaSelection() {
  state.isSelectingOcrArea = false;
  
  if (state.ocrSelectionRect) {
    state.fabricCanvas.remove(state.ocrSelectionRect);
    state.ocrSelectionRect = null;
  }
  
  elements.ocrAreaHint.classList.add('hidden');
  elements.btnOcrCancel.classList.add('hidden');
  
  setTool('select');
}

async function performOcr() {
  if (state.pages.length === 0) return;

  const page = state.pages[state.currentPageIndex];
  elements.ocrProgress.classList.remove('hidden');
  elements.ocrProgressFill.style.width = '0%';

  let ocrData = {
    data: page.data,
    width: page.width,
    height: page.height
  };

  if (state.ocrSelectionRect && state.isSelectingOcrArea) {
    const canvas = elements.mainCanvas;
    const ctx = canvas.getContext('2d');
    
    const x = Math.max(0, Math.floor(state.ocrSelectionRect.left));
    const y = Math.max(0, Math.floor(state.ocrSelectionRect.top));
    const width = Math.min(page.width - x, Math.floor(state.ocrSelectionRect.width));
    const height = Math.min(page.height - y, Math.floor(state.ocrSelectionRect.height));

    if (width > 10 && height > 10) {
      const imageData = ctx.getImageData(x, y, width, height);
      ocrData = {
        data: Array.from(imageData.data),
        width: width,
        height: height
      };
    }

    cancelOcrAreaSelection();
  }

  ipcRenderer.on('ocr-progress', (event, progress) => {
    elements.ocrProgressFill.style.width = `${progress * 100}%`;
  });

  const text = await ipcRenderer.invoke('perform-ocr', ocrData);

  page.ocrText = text;
  elements.ocrResult.value = text;
  elements.ocrProgress.classList.add('hidden');
}

async function performOcrAll() {
  if (state.pages.length === 0) return;

  if (!confirm(`确定要对全部 ${state.pages.length} 页进行OCR识别吗？这可能需要较长时间。`)) {
    return;
  }

  elements.ocrProgress.classList.remove('hidden');

  for (let i = 0; i < state.pages.length; i++) {
    const progress = (i / state.pages.length) * 100;
    elements.ocrProgressFill.style.width = `${progress}%`;
    elements.fileInfo.textContent = `正在识别: 第 ${i + 1}/${state.pages.length} 页`;

    const page = state.pages[i];
    const text = await ipcRenderer.invoke('perform-ocr', {
      data: page.data,
      width: page.width,
      height: page.height
    });
    page.ocrText = text;

    if (i === state.currentPageIndex) {
      elements.ocrResult.value = text;
    }

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  elements.ocrProgressFill.style.width = '100%';
  elements.fileInfo.textContent = `${state.fileName} (${state.pages.length}页)`;
  
  setTimeout(() => {
    elements.ocrProgress.classList.add('hidden');
  }, 500);
}

function zoom(delta) {
  state.zoom = Math.max(0.1, Math.min(3, state.zoom + delta));
  applyZoom();
}

function zoomToFit() {
  if (state.pages.length === 0) return;

  const page = state.pages[state.currentPageIndex];
  const container = elements.canvasContainer;
  const containerWidth = container.clientWidth - 40;
  const containerHeight = container.clientHeight - 40;

  const scaleX = containerWidth / page.width;
  const scaleY = containerHeight / page.height;
  state.zoom = Math.min(scaleX, scaleY, 1);

  applyZoom();
}

function applyZoom() {
  elements.canvasWrapper.style.transform = `scale(${state.zoom})`;
  elements.canvasWrapper.style.transformOrigin = 'center center';
}

function showLoading(text = '加载中...') {
  elements.loadingOverlay.querySelector('p').textContent = text;
  elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  elements.loadingOverlay.classList.add('hidden');
}

async function autoSplitPage() {
  if (state.pages.length === 0) return;

  const page = state.pages[state.currentPageIndex];
  const threshold = parseFloat(elements.splitThreshold.value);
  
  showLoading('正在检测空白区域...');
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(page.width, page.height);
  imageData.data.set(Uint8ClampedArray.from(page.data));
  ctx.putImageData(imageData, 0, 0);
  
  const splitPositions = [];
  const scanStep = 2;
  const minGapHeight = Math.floor(page.height * 0.05);
  
  for (let y = minGapHeight; y < page.height - minGapHeight; y += scanStep) {
    let isWhiteLine = true;
    let whiteCount = 0;
    
    for (let x = 0; x < page.width; x += 4) {
      const idx = (y * page.width + x) * 4;
      const r = page.data[idx];
      const g = page.data[idx + 1];
      const b = page.data[idx + 2];
      const brightness = (r + g + b) / 3;
      
      if (brightness >= 240) {
        whiteCount++;
      }
    }
    
    const whiteRatio = whiteCount / (page.width / 4);
    
    if (whiteRatio >= threshold) {
      let gapEnd = y;
      while (gapEnd < page.height - 1) {
        let gapWhiteCount = 0;
        for (let x = 0; x < page.width; x += 4) {
          const idx = (gapEnd * page.width + x) * 4;
          const brightness = (page.data[idx] + page.data[idx + 1] + page.data[idx + 2]) / 3;
          if (brightness >= 240) gapWhiteCount++;
        }
        if (gapWhiteCount / (page.width / 4) < threshold) break;
        gapEnd += scanStep;
      }
      
      const gapHeight = gapEnd - y;
      if (gapHeight >= minGapHeight) {
        const splitY = y + Math.floor(gapHeight / 2);
        splitPositions.push(splitY);
        y = gapEnd;
      }
    }
  }
  
  hideLoading();
  
  if (splitPositions.length === 0) {
    elements.splitResult.textContent = '未检测到可分割的空白区域';
    elements.splitResult.classList.remove('hidden');
    setTimeout(() => elements.splitResult.classList.add('hidden'), 3000);
    return;
  }
  
  if (!confirm(`检测到 ${splitPositions.length} 个可分割位置，确定要拆分吗？`)) {
    return;
  }
  
  const newPages = [];
  let prevY = 0;
  
  splitPositions.push(page.height);
  
  for (let i = 0; i < splitPositions.length; i++) {
    const splitY = splitPositions[i];
    const sliceHeight = splitY - prevY;
    
    if (sliceHeight > 50) {
      const sliceData = ctx.getImageData(0, prevY, page.width, sliceHeight);
      
      newPages.push({
        index: state.pages.length + newPages.length,
        width: page.width,
        height: sliceHeight,
        data: Array.from(sliceData.data),
        rotation: 0,
        annotations: [],
        ocrText: ''
      });
    }
    
    prevY = splitY;
  }
  
  state.pages.splice(state.currentPageIndex, 1, ...newPages);
  state.thumbnailCache.clear();
  
  elements.splitResult.textContent = `已拆分为 ${newPages.length} 页`;
  elements.splitResult.classList.remove('hidden');
  setTimeout(() => elements.splitResult.classList.add('hidden'), 3000);
  
  initThumbnailPlaceholders();
  renderVisibleThumbnails(0, Math.min(20, state.pages.length));
  renderCurrentPage();
  updatePageInfo();
}

function mergeSelectedPages() {
  const selected = Array.from(state.selectedPages).sort((a, b) => a - b);
  
  if (selected.length < 2) {
    alert('请至少选择2页进行合并');
    return;
  }
  
  if (!confirm(`确定要合并选中的 ${selected.length} 页吗？`)) {
    return;
  }
  
  showLoading('正在合并页面...');
  
  setTimeout(() => {
    let totalHeight = 0;
    let maxWidth = 0;
    
    selected.forEach(idx => {
      const page = state.pages[idx];
      maxWidth = Math.max(maxWidth, page.width);
      totalHeight += page.height;
    });
    
    const mergedCanvas = document.createElement('canvas');
    mergedCanvas.width = maxWidth;
    mergedCanvas.height = totalHeight;
    const mergedCtx = mergedCanvas.getContext('2d');
    mergedCtx.fillStyle = '#ffffff';
    mergedCtx.fillRect(0, 0, maxWidth, totalHeight);
    
    let currentY = 0;
    selected.forEach(idx => {
      const page = state.pages[idx];
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = page.width;
      pageCanvas.height = page.height;
      const pageCtx = pageCanvas.getContext('2d');
      const imageData = pageCtx.createImageData(page.width, page.height);
      imageData.data.set(Uint8ClampedArray.from(page.data));
      pageCtx.putImageData(imageData, 0, 0);
      
      const xOffset = Math.floor((maxWidth - page.width) / 2);
      mergedCtx.drawImage(pageCanvas, xOffset, currentY);
      currentY += page.height;
    });
    
    const mergedImageData = mergedCtx.getImageData(0, 0, maxWidth, totalHeight);
    
    const mergedPage = {
      index: selected[0],
      width: maxWidth,
      height: totalHeight,
      data: Array.from(mergedImageData.data),
      rotation: 0,
      annotations: [],
      ocrText: selected.map(idx => state.pages[idx].ocrText || '').filter(t => t).join('\n\n')
    };
    
    const newPages = state.pages.filter((_, idx) => !selected.includes(idx));
    newPages.splice(selected[0], 0, mergedPage);
    
    newPages.forEach((page, idx) => page.index = idx);
    state.pages = newPages;
    state.currentPageIndex = selected[0];
    state.selectedPages.clear();
    state.thumbnailCache.clear();
    
    hideLoading();
    
    initThumbnailPlaceholders();
    renderVisibleThumbnails(0, Math.min(20, state.pages.length));
    renderCurrentPage();
    updatePageInfo();
    elements.fileInfo.textContent = `${state.fileName} (${state.pages.length}页)`;
  }, 100);
}

function performSearch() {
  const query = elements.searchInput.value.trim().toLowerCase();
  
  if (!query) {
    state.searchResults = [];
    elements.searchResults.classList.add('hidden');
    return;
  }
  
  state.searchResults = [];
  state.currentSearchIndex = 0;
  
  state.pages.forEach((page, pageIndex) => {
    if (!page.ocrText) return;
    
    const text = page.ocrText.toLowerCase();
    let pos = 0;
    
    while ((pos = text.indexOf(query, pos)) !== -1) {
      state.searchResults.push({
        pageIndex,
        position: pos
      });
      pos += query.length;
    }
  });
  
  if (state.searchResults.length > 0) {
    elements.searchCount.textContent = `找到 ${state.searchResults.length} 个匹配`;
    elements.searchResults.classList.remove('hidden');
    navigateSearch(0);
  } else {
    elements.searchCount.textContent = '未找到匹配内容';
    elements.searchResults.classList.remove('hidden');
  }
}

function navigateSearch(direction) {
  if (state.searchResults.length === 0) return;
  
  state.currentSearchIndex += direction;
  
  if (state.currentSearchIndex < 0) {
    state.currentSearchIndex = state.searchResults.length - 1;
  } else if (state.currentSearchIndex >= state.searchResults.length) {
    state.currentSearchIndex = 0;
  }
  
  const result = state.searchResults[state.currentSearchIndex];
  state.currentPageIndex = result.pageIndex;
  
  renderCurrentPage();
  updateActiveThumbnail();
  updatePageInfo();
  
  elements.searchCount.textContent = `第 ${state.currentSearchIndex + 1}/${state.searchResults.length} 个匹配 (第 ${result.pageIndex + 1} 页)`;
}

async function saveProject() {
  if (state.pages.length === 0) return;

  saveAnnotations();

  const projectData = {
    fileName: state.fileName,
    filePath: state.filePath,
    pages: state.pages.map(page => ({
      ...page,
      annotations: page.annotations || []
    }))
  };

  const success = await ipcRenderer.invoke('save-project', projectData);
  if (success) {
    alert('项目保存成功！');
  }
}

async function loadProject() {
  const data = await ipcRenderer.invoke('load-project');
  if (data) {
    state.fileName = data.fileName;
    state.filePath = data.filePath;
    state.pages = data.pages;
    state.currentPageIndex = 0;
    state.zoom = 1;
    state.thumbnailCache.clear();
    state.selectedPages.clear();
    state.searchResults = [];

    elements.fileInfo.textContent = `${state.fileName} (${state.pages.length}页)`;
    elements.dropHint.classList.add('hidden');
    elements.searchResults.classList.add('hidden');

    initThumbnailPlaceholders();
    renderVisibleThumbnails(0, Math.min(20, state.pages.length));
    renderCurrentPage();
    updatePageInfo();
  }
}

async function exportPdf() {
  if (state.pages.length === 0) return;

  saveAnnotations();

  const hasOcr = state.pages.some(p => p.ocrText && p.ocrText.trim());
  if (!hasOcr) {
    if (!confirm('检测到未进行OCR识别，导出的PDF将不包含可搜索文本层。是否继续？\n建议先进行OCR识别后再导出。')) {
      return;
    }
  }

  showLoading('正在导出PDF...\n准备中...');

  ipcRenderer.on('export-progress', (event, progress) => {
    showLoading(`正在导出PDF...\n第 ${progress.current}/${progress.total} 页`);
  });

  try {
    const projectData = {
      fileName: state.fileName,
      pages: state.pages
    };

    const success = await ipcRenderer.invoke('export-pdf', projectData);
    
    if (success) {
      alert('PDF导出成功！');
    }
  } catch (error) {
    console.error('Export error:', error);
    alert('导出失败: ' + error.message);
  } finally {
    hideLoading();
    ipcRenderer.removeAllListeners('export-progress');
  }
}

async function exportImages() {
  if (state.pages.length === 0) return;

  alert('图片导出功能可将页面保存为PNG格式。\n请选择保存位置（目前实现中）。');
}

init();
