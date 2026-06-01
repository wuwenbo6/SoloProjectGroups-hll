const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

class DocumentScanner {
    constructor() {
        this.files = [];
        this.currentFileIndex = -1;
        this.corners = [];
        this.originalCorners = [];
        this.isDragging = false;
        this.dragCornerIndex = -1;
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.resultImageData = null;
        
        this.initElements();
        this.initEventListeners();
        this.showEmptyState();
    }

    initElements() {
        this.originalCanvas = document.getElementById('originalCanvas');
        this.resultCanvas = document.getElementById('resultCanvas');
        this.originalCtx = this.originalCanvas.getContext('2d');
        this.resultCtx = this.resultCanvas.getContext('2d');
        this.fileList = document.getElementById('fileList');
        this.fileCount = document.getElementById('fileCount');
        this.statusText = document.getElementById('statusText');
        this.canvasContainer = document.querySelector('#originalTab .canvas-container');
        this.removeShadowCheck = document.getElementById('removeShadowCheck');
        this.ocrLangSelect = document.getElementById('ocrLangSelect');
        this.infoPanel = document.getElementById('infoPanel');
        this.infoPanelTitle = document.getElementById('infoPanelTitle');
        this.infoPanelContent = document.getElementById('infoPanelContent');
    }

    initEventListeners() {
        document.getElementById('addFilesBtn').addEventListener('click', () => this.addFiles());
        document.getElementById('batchProcessBtn').addEventListener('click', () => this.batchProcess());
        document.getElementById('detectBtn').addEventListener('click', () => this.detectCorners());
        document.getElementById('detectBarcodeBtn').addEventListener('click', () => this.detectBarcode());
        document.getElementById('resetCornersBtn').addEventListener('click', () => this.resetCorners());
        document.getElementById('processBtn').addEventListener('click', () => this.processImage());
        document.getElementById('ocrBtn').addEventListener('click', () => this.recognizeOCR());
        document.getElementById('exportPngBtn').addEventListener('click', () => this.exportPng());
        document.getElementById('exportPdfBtn').addEventListener('click', () => this.exportPdf());
        document.getElementById('exportSearchablePdfBtn').addEventListener('click', () => this.exportSearchablePdf());
        document.getElementById('closeInfoPanel').addEventListener('click', () => this.hideInfoPanel());

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        this.originalCanvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.originalCanvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.originalCanvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.originalCanvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));
    }

    showInfoPanel(title, content) {
        this.infoPanelTitle.textContent = title;
        this.infoPanelContent.innerHTML = content;
        this.infoPanel.classList.remove('hidden');
    }

    hideInfoPanel() {
        this.infoPanel.classList.add('hidden');
    }

    showEmptyState() {
        const container = document.querySelector('#originalTab .canvas-container');
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📄</div>
                <div class="empty-state-text">点击"添加图片"开始</div>
                <button class="btn btn-primary" onclick="document.getElementById('addFilesBtn').click()">
                    选择图片
                </button>
            </div>
        `;
    }

    hideEmptyState() {
        const container = document.querySelector('#originalTab .canvas-container');
        if (container.querySelector('.empty-state')) {
            container.innerHTML = '<canvas id="originalCanvas"></canvas>';
            this.originalCanvas = document.getElementById('originalCanvas');
            this.originalCtx = this.originalCanvas.getContext('2d');
            this.originalCanvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
            this.originalCanvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
            this.originalCanvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
            this.originalCanvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));
        }
    }

    async addFiles() {
        const filePaths = await ipcRenderer.invoke('select-files');
        if (!filePaths || filePaths.length === 0) return;

        for (const filePath of filePaths) {
            const fileName = path.basename(filePath);
            const file = {
                path: filePath,
                name: fileName,
                processed: false,
                resultData: null
            };
            this.files.push(file);
        }

        this.updateFileList();
        if (this.currentFileIndex === -1) {
            this.selectFile(0);
        }
    }

    updateFileList() {
        this.fileList.innerHTML = '';
        this.fileCount.textContent = `${this.files.length} 个文件`;

        this.files.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = `file-item ${index === this.currentFileIndex ? 'active' : ''}`;
            item.innerHTML = `
                <img class="file-item-thumbnail" src="${this.getImageSrc(file.path)}" alt="">
                <div class="file-item-info">
                    <div class="file-item-name">${file.name}</div>
                    <div class="file-item-status ${file.processed ? 'processed' : ''}">
                        ${file.processed ? '✓ 已处理' : '待处理'}
                    </div>
                </div>
                <button class="file-item-remove" data-index="${index}">×</button>
            `;
            
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('file-item-remove')) {
                    this.selectFile(index);
                }
            });

            item.querySelector('.file-item-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeFile(index);
            });

            this.fileList.appendChild(item);
        });
    }

    getImageSrc(filePath) {
        return `file://${filePath}`;
    }

    selectFile(index) {
        if (index < 0 || index >= this.files.length) return;

        this.currentFileIndex = index;
        this.updateFileList();
        this.loadImage(this.files[index].path);
        
        if (this.files[index].processed && this.files[index].resultData) {
            this.resultImageData = this.files[index].resultData;
            this.showResult();
        } else {
            this.resultImageData = null;
            this.clearResultCanvas();
        }
    }

    removeFile(index) {
        this.files.splice(index, 1);
        
        if (this.files.length === 0) {
            this.currentFileIndex = -1;
            this.showEmptyState();
            this.clearResultCanvas();
        } else if (index === this.currentFileIndex) {
            this.selectFile(Math.min(index, this.files.length - 1));
        } else if (index < this.currentFileIndex) {
            this.currentFileIndex--;
        }
        
        this.updateFileList();
    }

    loadImage(imagePath) {
        return new Promise((resolve) => {
            this.hideEmptyState();
            const img = new Image();
            img.onload = () => {
                this.currentImage = img;
                this.currentImagePath = imagePath;
                
                const containerRect = this.canvasContainer.getBoundingClientRect();
                const maxWidth = containerRect.width - 40;
                const maxHeight = containerRect.height - 40;
                
                this.scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
                const displayWidth = img.width * this.scale;
                const displayHeight = img.height * this.scale;
                
                this.originalCanvas.width = displayWidth;
                this.originalCanvas.height = displayHeight;
                
                this.offsetX = 0;
                this.offsetY = 0;
                
                this.corners = [
                    [0, 0],
                    [img.width, 0],
                    [img.width, img.height],
                    [0, img.height]
                ];
                this.originalCorners = JSON.parse(JSON.stringify(this.corners));
                
                this.drawOriginalImage();
                resolve();
            };
            img.src = this.getImageSrc(imagePath);
        });
    }

    drawOriginalImage() {
        if (!this.currentImage) return;

        this.originalCtx.clearRect(0, 0, this.originalCanvas.width, this.originalCanvas.height);
        this.originalCtx.drawImage(
            this.currentImage,
            0, 0,
            this.originalCanvas.width,
            this.originalCanvas.height
        );

        if (this.corners.length === 4) {
            this.originalCtx.strokeStyle = '#3b82f6';
            this.originalCtx.lineWidth = 2;
            this.originalCtx.beginPath();
            
            const firstCorner = this.imageToCanvas(this.corners[0]);
            this.originalCtx.moveTo(firstCorner[0], firstCorner[1]);
            
            for (let i = 1; i <= 4; i++) {
                const corner = this.imageToCanvas(this.corners[i % 4]);
                this.originalCtx.lineTo(corner[0], corner[1]);
            }
            this.originalCtx.stroke();

            this.corners.forEach((corner, index) => {
                const [x, y] = this.imageToCanvas(corner);
                this.originalCtx.beginPath();
                this.originalCtx.arc(x, y, 8, 0, Math.PI * 2);
                this.originalCtx.fillStyle = '#3b82f6';
                this.originalCtx.fill();
                this.originalCtx.strokeStyle = '#fff';
                this.originalCtx.lineWidth = 2;
                this.originalCtx.stroke();

                this.originalCtx.fillStyle = '#fff';
                this.originalCtx.font = 'bold 10px sans-serif';
                this.originalCtx.textAlign = 'center';
                this.originalCtx.textBaseline = 'middle';
                this.originalCtx.fillText(index + 1, x, y);
            });
        }
    }

    imageToCanvas(point) {
        return [
            point[0] * this.scale + this.offsetX,
            point[1] * this.scale + this.offsetY
        ];
    }

    canvasToImage(point) {
        return [
            (point[0] - this.offsetX) / this.scale,
            (point[1] - this.offsetY) / this.scale
        ];
    }

    async detectCorners() {
        if (!this.currentImagePath) return;

        this.setStatus('正在检测角点...');
        const result = await ipcRenderer.invoke('detect-corners', this.currentImagePath);

        if (result.success) {
            this.corners = result.corners;
            this.originalCorners = JSON.parse(JSON.stringify(this.corners));
            this.drawOriginalImage();
            this.setStatus('角点检测完成，可拖动调整');
        } else {
            this.setStatus(`检测失败: ${result.error}`);
        }
    }

    resetCorners() {
        if (!this.currentImage) return;
        
        this.corners = [
            [0, 0],
            [this.currentImage.width, 0],
            [this.currentImage.width, this.currentImage.height],
            [0, this.currentImage.height]
        ];
        this.drawOriginalImage();
        this.setStatus('角点已重置');
    }

    onMouseDown(e) {
        if (this.corners.length !== 4) return;

        const rect = this.originalCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        for (let i = 0; i < this.corners.length; i++) {
            const [cx, cy] = this.imageToCanvas(this.corners[i]);
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (dist < 15) {
                this.isDragging = true;
                this.dragCornerIndex = i;
                this.originalCanvas.style.cursor = 'grabbing';
                break;
            }
        }
    }

    onMouseMove(e) {
        if (this.corners.length !== 4) return;

        const rect = this.originalCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.isDragging && this.dragCornerIndex >= 0) {
            const [imageX, imageY] = this.canvasToImage([x, y]);
            this.corners[this.dragCornerIndex] = [
                Math.max(0, Math.min(this.currentImage.width, imageX)),
                Math.max(0, Math.min(this.currentImage.height, imageY))
            ];
            this.drawOriginalImage();
        } else {
            let hovering = false;
            for (let i = 0; i < this.corners.length; i++) {
                const [cx, cy] = this.imageToCanvas(this.corners[i]);
                const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
                if (dist < 15) {
                    hovering = true;
                    break;
                }
            }
            this.originalCanvas.style.cursor = hovering ? 'grab' : 'default';
        }
    }

    onMouseUp(e) {
        this.isDragging = false;
        this.dragCornerIndex = -1;
        this.originalCanvas.style.cursor = 'default';
    }

    async processImage() {
        if (!this.currentImagePath || this.corners.length !== 4) return;

        this.setStatus('正在应用透视变换...');
        
        const tempPath = path.join(
            path.dirname(this.currentImagePath),
            `temp_${Date.now()}_scanned.png`
        );

        const removeShadow = this.removeShadowCheck.checked;

        const result = await ipcRenderer.invoke(
            'warp-perspective',
            this.currentImagePath,
            this.corners,
            tempPath,
            removeShadow
        );

        if (result.success) {
            await this.loadResultImage(tempPath);
            
            if (this.currentFileIndex >= 0) {
                this.files[this.currentFileIndex].processed = true;
                this.files[this.currentFileIndex].resultData = this.resultImageData;
                this.files[this.currentFileIndex].resultPath = tempPath;
                this.updateFileList();
            }

            this.switchTab('result');
            this.setStatus('校正完成');
        } else {
            this.setStatus(`校正失败: ${result.error}`);
        }
    }

    async detectBarcode() {
        if (!this.currentImagePath) return;

        this.setStatus('正在识别条形码...');
        
        const result = await ipcRenderer.invoke('detect-barcode', this.currentImagePath);

        if (result.success && result.barcodes && result.barcodes.length > 0) {
            const content = result.barcodes.map(b => `
                <div class="barcode-item">
                    <div class="barcode-type">${b.type}</div>
                    <div class="barcode-data">${b.data}</div>
                </div>
            `).join('');
            this.showInfoPanel('条形码识别结果', content);
            this.setStatus(`识别到 ${result.barcodes.length} 个条形码`);
        } else {
            this.showInfoPanel('条形码识别结果', '<div class="ocr-text">未识别到条形码</div>');
            this.setStatus('未识别到条形码');
        }
    }

    async recognizeOCR() {
        if (this.currentFileIndex < 0 || !this.files[this.currentFileIndex].resultPath) {
            this.setStatus('请先校正图像');
            return;
        }

        this.setStatus('正在进行OCR识别...');
        
        const lang = this.ocrLangSelect.value;
        const result = await ipcRenderer.invoke('ocr-image', this.files[this.currentFileIndex].resultPath, lang);

        if (result.success && result.ocr && result.ocr.text) {
            const content = `<div class="ocr-text">${result.ocr.text}</div>`;
            this.showInfoPanel('OCR识别结果', content);
            this.setStatus('OCR识别完成');
        } else {
            this.showInfoPanel('OCR识别结果', '<div class="ocr-text">未识别到文字</div>');
            this.setStatus('未识别到文字');
        }
    }

    async exportSearchablePdf() {
        const processedFiles = this.files.filter(f => f.processed && f.resultPath);
        
        if (processedFiles.length === 0) {
            this.setStatus('没有已处理的图像');
            return;
        }

        const outputPath = await ipcRenderer.invoke('select-output-path');
        if (!outputPath) return;

        const finalPath = outputPath.endsWith('.pdf') ? outputPath : `${outputPath}.pdf`;
        const imagePaths = processedFiles.map(f => f.resultPath);
        const lang = this.ocrLangSelect.value;

        this.setStatus('正在生成可搜索PDF...');
        
        const result = await ipcRenderer.invoke('export-searchable-pdf', imagePaths, finalPath, lang);

        if (result.success) {
            this.setStatus(`可搜索PDF已导出: ${finalPath}`);
        } else {
            this.setStatus(`导出失败: ${result.error || '需要安装 Tesseract 和 reportlab'}`);
        }
    }

    loadResultImage(imagePath) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                this.resultCanvas.width = img.width;
                this.resultCanvas.height = img.height;
                this.resultCtx.drawImage(img, 0, 0);
                this.resultImageData = this.resultCanvas.toDataURL('image/png');
                resolve();
            };
            img.src = this.getImageSrc(imagePath);
        });
    }

    showResult() {
        if (!this.resultImageData) return;

        const img = new Image();
        img.onload = () => {
            this.resultCanvas.width = img.width;
            this.resultCanvas.height = img.height;
            this.resultCtx.drawImage(img, 0, 0);
        };
        img.src = this.resultImageData;
    }

    clearResultCanvas() {
        this.resultCtx.clearRect(0, 0, this.resultCanvas.width, this.resultCanvas.height);
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}Tab`);
        });
    }

    async exportPng() {
        if (!this.resultImageData) {
            this.setStatus('请先处理图像');
            return;
        }

        const outputPath = await ipcRenderer.invoke('select-output-path');
        if (!outputPath) return;

        const finalPath = outputPath.endsWith('.png') ? outputPath : `${outputPath}.png`;
        const result = await ipcRenderer.invoke('export-png', this.resultImageData, finalPath);

        if (result.success) {
            this.setStatus(`已导出到: ${finalPath}`);
        } else {
            this.setStatus(`导出失败: ${result.error}`);
        }
    }

    async exportPdf() {
        const processedFiles = this.files.filter(f => f.processed && f.resultData);
        
        if (processedFiles.length === 0) {
            this.setStatus('没有已处理的图像');
            return;
        }

        const outputPath = await ipcRenderer.invoke('select-output-path');
        if (!outputPath) return;

        const finalPath = outputPath.endsWith('.pdf') ? outputPath : `${outputPath}.pdf`;
        const imagesData = processedFiles.map(f => f.resultData);
        
        const result = await ipcRenderer.invoke('export-pdf', imagesData, finalPath);

        if (result.success) {
            this.setStatus(`PDF已导出: ${finalPath} (${imagesData.length}页)`);
        } else {
            this.setStatus(`导出失败: ${result.error}`);
        }
    }

    async batchProcess() {
        if (this.files.length === 0) {
            this.setStatus('没有可处理的文件');
            return;
        }

        for (let i = 0; i < this.files.length; i++) {
            if (this.files[i].processed) continue;

            this.selectFile(i);
            await this.loadImage(this.files[i].path);
            await this.detectCorners();
            await this.processImage();
        }

        this.setStatus('批量处理完成');
    }

    setStatus(text) {
        this.statusText.textContent = text;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.scanner = new DocumentScanner();
});
