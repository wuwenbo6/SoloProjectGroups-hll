const { ipcRenderer } = require('electron');

class ReceiptDesigner {
  constructor() {
    this.printer = new WebHIDPrinter();
    this.template = {
      id: null,
      name: '新模板',
      items: []
    };
    this.selectedItemIndex = -1;
    this.draggedItem = null;
    this.printerType = 'usb';
    this.networkPrinterConfig = null;
    this.printQueue = [];
    this.init();
  }

  async init() {
    this.bindEvents();
    this.loadTemplates();
    this.loadNetworkPrinterConfig();
    this.loadPrintQueue();
    this.updatePreview();
    this.listenToQueueUpdates();
  }

  bindEvents() {
    document.querySelectorAll('.field-item').forEach(item => {
      item.addEventListener('dragstart', (e) => this.onFieldDragStart(e));
    });

    const canvas = document.getElementById('designCanvas');
    canvas.addEventListener('dragover', (e) => this.onCanvasDragOver(e));
    canvas.addEventListener('drop', (e) => this.onCanvasDrop(e));
    canvas.addEventListener('dragleave', (e) => this.onCanvasDragLeave(e));

    document.getElementById('connectBtn').addEventListener('click', () => this.connectPrinter());
    document.getElementById('saveBtn').addEventListener('click', () => this.saveTemplate());
    document.getElementById('printBtn').addEventListener('click', () => this.printTest());
    document.getElementById('deleteBtn').addEventListener('click', () => this.deleteTemplate());
    document.getElementById('templateSelect').addEventListener('change', (e) => this.loadTemplate(e.target.value));
    document.getElementById('printerTypeSelect').addEventListener('change', (e) => this.switchPrinterType(e.target.value));
    document.getElementById('networkConfigBtn').addEventListener('click', () => this.openNetworkConfigModal());
    document.getElementById('queueBtn').addEventListener('click', () => this.openQueueModal());
    document.getElementById('exportPdfBtn').addEventListener('click', () => this.exportPDF());
  }

  onFieldDragStart(e) {
    e.dataTransfer.setData('fieldType', e.target.dataset.type);
    e.dataTransfer.setData('fieldLabel', e.target.dataset.label);
    e.dataTransfer.effectAllowed = 'copy';
  }

  onCanvasDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const canvas = document.getElementById('designCanvas');
    canvas.style.borderColor = '#667eea';
  }

  onCanvasDragLeave(e) {
    const canvas = document.getElementById('designCanvas');
    canvas.style.borderColor = '';
  }

  onCanvasDrop(e) {
    e.preventDefault();
    const canvas = document.getElementById('designCanvas');
    canvas.style.borderColor = '';

    const fieldType = e.dataTransfer.getData('fieldType');
    const fieldLabel = e.dataTransfer.getData('fieldLabel');

    if (fieldType) {
      this.addItem(fieldType, fieldLabel);
    }
  }

  addItem(type, label) {
    const item = {
      id: Date.now(),
      type: type,
      content: this.getDefaultContent(type),
      align: 'left',
      bold: false,
      width: 1,
      height: 1,
      lines: 1,
      size: 8,
      format: 'CODE128',
      barcodeHeight: 80,
      errorLevel: 'M'
    };

    if (type === 'title') {
      item.align = 'center';
      item.bold = true;
      item.width = 2;
      item.height = 2;
    }

    this.template.items.push(item);
    this.renderCanvas();
    this.updatePreview();
  }

  getDefaultContent(type) {
    const defaults = {
      text: '示例文本',
      title: '票据标题',
      barcode: '1234567890',
      qrcode: 'https://example.com',
      line: '',
      space: ''
    };
    return defaults[type] || '';
  }

  renderCanvas() {
    const canvas = document.getElementById('designCanvas');
    
    if (this.template.items.length === 0) {
      canvas.innerHTML = '<div class="canvas-placeholder">👆 从左侧拖拽字段到此处开始设计</div>';
      return;
    }

    canvas.innerHTML = this.template.items.map((item, index) => `
      <div class="canvas-item ${this.selectedItemIndex === index ? 'selected' : ''}" 
           data-index="${index}"
           draggable="true">
        <div class="item-header">
          <span class="item-type">${this.getTypeLabel(item.type)}</span>
          <div class="item-actions">
            <button class="move-up-btn" onclick="designer.moveItem(${index}, -1)" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button class="move-down-btn" onclick="designer.moveItem(${index}, 1)" ${index === this.template.items.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="delete-btn" onclick="designer.removeItem(${index})">×</button>
          </div>
        </div>
        <div class="item-content">${this.getItemPreview(item)}</div>
      </div>
    `).join('');

    canvas.querySelectorAll('.canvas-item').forEach(el => {
      el.addEventListener('click', () => {
        this.selectedItemIndex = parseInt(el.dataset.index);
        this.renderCanvas();
        this.renderPropertyPanel();
      });

      el.addEventListener('dragstart', (e) => {
        this.draggedItem = parseInt(el.dataset.index);
        el.classList.add('dragging');
      });

      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        this.draggedItem = null;
      });

      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this.draggedItem !== null && this.draggedItem !== parseInt(el.dataset.index)) {
          el.classList.add('drag-over');
        }
      });

      el.addEventListener('dragleave', () => {
        el.classList.remove('drag-over');
      });

      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const targetIndex = parseInt(el.dataset.index);
        if (this.draggedItem !== null && this.draggedItem !== targetIndex) {
          this.reorderItems(this.draggedItem, targetIndex);
        }
      });
    });
  }

  getTypeLabel(type) {
    const labels = {
      text: '文本',
      title: '标题',
      barcode: '条码',
      qrcode: '二维码',
      line: '分割线',
      space: '空白行'
    };
    return labels[type] || type;
  }

  getItemPreview(item) {
    switch (item.type) {
      case 'line':
        return '--- 分割线 ---';
      case 'space':
        return `[空白行 x${item.lines}]`;
      case 'barcode':
        return `条码: ${item.content}`;
      case 'qrcode':
        return `二维码: ${item.content}`;
      default:
        return item.content || '(空)';
    }
  }

  moveItem(index, direction) {
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < this.template.items.length) {
      const temp = this.template.items[index];
      this.template.items[index] = this.template.items[newIndex];
      this.template.items[newIndex] = temp;
      this.selectedItemIndex = newIndex;
      this.renderCanvas();
      this.renderPropertyPanel();
      this.updatePreview();
    }
  }

  reorderItems(fromIndex, toIndex) {
    const [item] = this.template.items.splice(fromIndex, 1);
    this.template.items.splice(toIndex, 0, item);
    this.selectedItemIndex = toIndex;
    this.renderCanvas();
    this.renderPropertyPanel();
    this.updatePreview();
  }

  removeItem(index) {
    this.template.items.splice(index, 1);
    if (this.selectedItemIndex === index) {
      this.selectedItemIndex = -1;
    } else if (this.selectedItemIndex > index) {
      this.selectedItemIndex--;
    }
    this.renderCanvas();
    this.renderPropertyPanel();
    this.updatePreview();
  }

  renderPropertyPanel() {
    const panel = document.getElementById('propertyPanel');
    
    if (this.selectedItemIndex < 0) {
      panel.innerHTML = '<p class="hint">选择字段以编辑属性</p>';
      return;
    }

    const item = this.template.items[this.selectedItemIndex];
    let html = '';

    if (item.type === 'text' || item.type === 'title') {
      html += `
        <div class="property-group">
          <label>内容</label>
          <textarea id="propContent">${item.content}</textarea>
        </div>
        <div class="property-group">
          <label>对齐方式</label>
          <select id="propAlign">
            <option value="left" ${item.align === 'left' ? 'selected' : ''}>左对齐</option>
            <option value="center" ${item.align === 'center' ? 'selected' : ''}>居中</option>
            <option value="right" ${item.align === 'right' ? 'selected' : ''}>右对齐</option>
          </select>
        </div>
      `;
    }

    if (item.type === 'text') {
      html += `
        <div class="property-group">
          <label><input type="checkbox" id="propBold" ${item.bold ? 'checked' : ''}> 粗体</label>
        </div>
      `;
    }

    if (item.type === 'title') {
      html += `
        <div class="property-group">
          <label>宽度倍数</label>
          <select id="propWidth">
            ${[1,2,3,4].map(n => `<option value="${n}" ${item.width === n ? 'selected' : ''}>${n}x</option>`).join('')}
          </select>
        </div>
        <div class="property-group">
          <label>高度倍数</label>
          <select id="propHeight">
            ${[1,2,3,4].map(n => `<option value="${n}" ${item.height === n ? 'selected' : ''}>${n}x</option>`).join('')}
          </select>
        </div>
      `;
    }

    if (item.type === 'barcode') {
      html += `
        <div class="property-group">
          <label>条码内容</label>
          <input type="text" id="propContent" value="${item.content}">
        </div>
        <div class="property-group">
          <label>条码格式</label>
          <select id="propFormat">
            <option value="CODE128" ${item.format === 'CODE128' ? 'selected' : ''}>CODE128</option>
            <option value="CODE39" ${item.format === 'CODE39' ? 'selected' : ''}>CODE39</option>
            <option value="UPC-A" ${item.format === 'UPC-A' ? 'selected' : ''}>UPC-A</option>
            <option value="EAN13" ${item.format === 'EAN13' ? 'selected' : ''}>EAN13</option>
          </select>
        </div>
        <div class="property-group">
          <label>条码高度</label>
          <select id="propBarcodeHeight">
            ${[40,60,80,100,120].map(n => `<option value="${n}" ${item.barcodeHeight === n ? 'selected' : ''}>${n}px</option>`).join('')}
          </select>
        </div>
      `;
    }

    if (item.type === 'qrcode') {
      html += `
        <div class="property-group">
          <label>二维码内容</label>
          <textarea id="propContent">${item.content}</textarea>
        </div>
        <div class="property-group">
          <label>大小</label>
          <select id="propSize">
            ${[4,5,6,7,8,9,10].map(n => `<option value="${n}" ${item.size === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </div>
        <div class="property-group">
          <label>纠错级别</label>
          <select id="propErrorLevel">
            <option value="L" ${item.errorLevel === 'L' ? 'selected' : ''}>L (7%)</option>
            <option value="M" ${item.errorLevel === 'M' ? 'selected' : ''}>M (15%)</option>
            <option value="Q" ${item.errorLevel === 'Q' ? 'selected' : ''}>Q (25%)</option>
            <option value="H" ${item.errorLevel === 'H' ? 'selected' : ''}>H (30%)</option>
          </select>
        </div>
      `;
    }

    if (item.type === 'space') {
      html += `
        <div class="property-group">
          <label>空行行数</label>
          <select id="propLines">
            ${[1,2,3,4,5].map(n => `<option value="${n}" ${item.lines === n ? 'selected' : ''}>${n}行</option>`).join('')}
          </select>
        </div>
      `;
    }

    panel.innerHTML = html;

    panel.querySelectorAll('input, textarea, select').forEach(input => {
      input.addEventListener('change', () => this.updateItemProperty());
      input.addEventListener('input', () => this.updateItemProperty());
    });
  }

  updateItemProperty() {
    if (this.selectedItemIndex < 0) return;

    const item = this.template.items[this.selectedItemIndex];
    const contentEl = document.getElementById('propContent');
    const alignEl = document.getElementById('propAlign');
    const boldEl = document.getElementById('propBold');
    const widthEl = document.getElementById('propWidth');
    const heightEl = document.getElementById('propHeight');
    const formatEl = document.getElementById('propFormat');
    const sizeEl = document.getElementById('propSize');
    const linesEl = document.getElementById('propLines');
    const barcodeHeightEl = document.getElementById('propBarcodeHeight');
    const errorLevelEl = document.getElementById('propErrorLevel');

    if (contentEl) item.content = contentEl.value;
    if (alignEl) item.align = alignEl.value;
    if (boldEl) item.bold = boldEl.checked;
    if (widthEl) item.width = parseInt(widthEl.value);
    if (heightEl) item.height = parseInt(heightEl.value);
    if (formatEl) item.format = formatEl.value;
    if (sizeEl) item.size = parseInt(sizeEl.value);
    if (linesEl) item.lines = parseInt(linesEl.value);
    if (barcodeHeightEl) item.barcodeHeight = parseInt(barcodeHeightEl.value);
    if (errorLevelEl) item.errorLevel = errorLevelEl.value;

    this.renderCanvas();
    this.updatePreview();
  }

  updatePreview() {
    const paper = document.getElementById('receiptPaper');
    let html = '';

    this.template.items.forEach(item => {
      const alignClass = item.align ? `class="${item.align}"` : '';
      
      switch (item.type) {
        case 'title':
          html += `<div class="title" style="font-size: ${12 * item.width}px;">${item.content}</div>`;
          break;
        case 'text':
          html += `<div ${alignClass} style="font-weight: ${item.bold ? 'bold' : 'normal'};">${item.content}</div>`;
          break;
        case 'line':
          html += '<div class="line"></div>';
          break;
        case 'space':
          html += `<div class="space" style="height: ${item.lines * 20}px;"></div>`;
          break;
        case 'barcode':
          html += `<svg id="barcode-preview-${item.id}"></svg>`;
          break;
        case 'qrcode':
          html += `<div id="qrcode-preview-${item.id}" style="text-align: center;"></div>`;
          break;
      }
    });

    paper.innerHTML = html || '<div style="color:#999;text-align:center;">预览区域</div>';

    this.template.items.forEach(item => {
      if (item.type === 'barcode') {
        const el = document.getElementById(`barcode-preview-${item.id}`);
        if (el && window.JsBarcode) {
          try {
            JsBarcode(el, item.content, {
              format: item.format,
              width: 2,
              height: 40,
              displayValue: true,
              fontSize: 10
            });
          } catch (e) {
            console.error('条码生成失败:', e);
          }
        }
      }

      if (item.type === 'qrcode') {
        const el = document.getElementById(`qrcode-preview-${item.id}`);
        if (el && window.QRCode) {
          el.innerHTML = '';
          new QRCode(el, {
            text: item.content,
            width: 80,
            height: 80
          });
        }
      }
    });
  }

  async connectPrinter() {
    if (this.printerType === 'network') {
      alert('网络打印机无需连接，配置后直接使用');
      return;
    }

    try {
      await this.printer.connect();
      document.getElementById('printerStatus').textContent = `已连接: ${this.printer.device.productName}`;
      document.getElementById('printerStatus').className = 'status-connected';
      document.getElementById('connectBtn').textContent = '重新连接';
    } catch (error) {
      alert('连接打印机失败: ' + error.message);
    }
  }

  switchPrinterType(type) {
    this.printerType = type;
    const usbStatus = document.getElementById('printerStatus');
    const networkStatus = document.getElementById('networkPrinterStatus');
    
    if (type === 'usb') {
      usbStatus.style.display = 'block';
      networkStatus.style.display = 'none';
      document.getElementById('connectBtn').style.display = 'inline-block';
      document.getElementById('connectBtn').textContent = this.printer.connected ? '重新连接' : '连接打印机';
    } else {
      usbStatus.style.display = 'none';
      networkStatus.style.display = 'block';
      document.getElementById('connectBtn').style.display = 'none';
      this.updateNetworkStatus();
    }
  }

  async loadNetworkPrinterConfig() {
    try {
      this.networkPrinterConfig = await ipcRenderer.invoke('get-network-printer-config');
      this.updateNetworkStatus();
    } catch (error) {
      console.error('加载网络打印机配置失败:', error);
    }
  }

  updateNetworkStatus() {
    const statusEl = document.getElementById('networkPrinterStatus');
    if (this.networkPrinterConfig && this.networkPrinterConfig.enabled && this.networkPrinterConfig.ip) {
      statusEl.textContent = `网络: ${this.networkPrinterConfig.ip}:${this.networkPrinterConfig.port || 9100}`;
      statusEl.className = 'status-connected';
    } else {
      statusEl.textContent = '网络: 未配置';
      statusEl.className = 'status-disconnected';
    }
  }

  openNetworkConfigModal() {
    const modal = document.getElementById('networkConfigModal');
    modal.style.display = 'flex';
    
    if (this.networkPrinterConfig) {
      document.getElementById('networkPrinterEnabled').checked = this.networkPrinterConfig.enabled || false;
      document.getElementById('networkPrinterIp').value = this.networkPrinterConfig.ip || '';
      document.getElementById('networkPrinterPort').value = this.networkPrinterConfig.port || 9100;
    }
  }

  async saveNetworkConfig() {
    const config = {
      enabled: document.getElementById('networkPrinterEnabled').checked,
      ip: document.getElementById('networkPrinterIp').value.trim(),
      port: parseInt(document.getElementById('networkPrinterPort').value) || 9100
    };

    try {
      await ipcRenderer.invoke('save-network-printer-config', config);
      this.networkPrinterConfig = config;
      this.updateNetworkStatus();
      closeNetworkConfigModal();
      alert('配置已保存！');
    } catch (error) {
      alert('保存配置失败: ' + error.message);
    }
  }

  async testNetworkPrinter() {
    try {
      const result = await ipcRenderer.invoke('test-network-printer');
      if (result.success) {
        alert('测试打印已发送！');
      } else {
        alert('测试打印失败: ' + result.error);
      }
    } catch (error) {
      alert('测试打印失败: ' + error.message);
    }
  }

  openQueueModal() {
    const modal = document.getElementById('queueModal');
    modal.style.display = 'flex';
    this.renderQueueList();
  }

  async loadPrintQueue() {
    try {
      this.printQueue = await ipcRenderer.invoke('get-print-queue');
    } catch (error) {
      console.error('加载打印队列失败:', error);
    }
  }

  listenToQueueUpdates() {
    ipcRenderer.on('queue-updated', (event, queue) => {
      this.printQueue = queue;
      if (document.getElementById('queueModal').style.display === 'flex') {
        this.renderQueueList();
      }
    });
  }

  renderQueueList() {
    const listEl = document.getElementById('queueList');
    const countEl = document.getElementById('queueCount');
    
    countEl.textContent = `${this.printQueue.length} 个任务`;

    if (this.printQueue.length === 0) {
      listEl.innerHTML = '<p class="hint">暂无打印任务</p>';
      return;
    }

    listEl.innerHTML = this.printQueue.map(job => `
      <div class="queue-item">
        <div class="queue-item-header">
          <span class="queue-item-title">${job.templateName || '打印任务'}</span>
          <span class="queue-item-status ${job.status}">${this.getStatusText(job.status)}</span>
        </div>
        <div class="queue-item-info">
          创建时间: ${new Date(job.createdAt).toLocaleString()}
          ${job.printerType === 'network' ? ' | 网络打印机' : ' | USB打印机'}
        </div>
        ${job.error ? `<div class="queue-item-info" style="color: #c62828;">错误: ${job.error}</div>` : ''}
        <div class="queue-item-actions">
          ${job.status === 'failed' ? `<button class="btn btn-success" onclick="designer.retryJob('${job.id}')">重试</button>` : ''}
          ${job.status !== 'printing' ? `<button class="btn-remove" onclick="designer.removeJob('${job.id}')">删除</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  getStatusText(status) {
    const texts = {
      pending: '等待中',
      printing: '打印中',
      completed: '已完成',
      failed: '失败'
    };
    return texts[status] || status;
  }

  async retryJob(jobId) {
    await ipcRenderer.invoke('retry-print-queue');
  }

  async removeJob(jobId) {
    await ipcRenderer.invoke('remove-from-queue', jobId);
  }

  async clearQueue() {
    if (confirm('确定要清空打印队列吗？')) {
      await ipcRenderer.invoke('clear-print-queue');
    }
  }

  async retryQueue() {
    await ipcRenderer.invoke('retry-print-queue');
  }

  async exportPDF() {
    try {
      const result = await ipcRenderer.invoke('export-pdf', this.template);
      if (result.canceled) {
        return;
      }
      if (result.success) {
        alert(`PDF已导出成功！\n路径: ${result.path}`);
      } else {
        alert('导出失败: ' + result.error);
      }
    } catch (error) {
      alert('导出失败: ' + error.message);
    }
  }

  async saveTemplate() {
    const name = prompt('输入模板名称:', this.template.name || '新模板');
    if (!name) return;

    this.template.name = name;
    try {
      const saved = await ipcRenderer.invoke('save-template', this.template);
      this.template.id = saved.id;
      await this.loadTemplates();
      document.getElementById('templateSelect').value = saved.id;
      alert('保存成功！');
    } catch (error) {
      alert('保存失败: ' + error.message);
    }
  }

  async loadTemplates() {
    try {
      const templates = await ipcRenderer.invoke('get-templates');
      const select = document.getElementById('templateSelect');
      select.innerHTML = '<option value="">-- 选择模板 --</option>' + 
        templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    } catch (error) {
      console.error('加载模板失败:', error);
    }
  }

  async loadTemplate(id) {
    if (!id) {
      this.template = { id: null, name: '新模板', items: [] };
      this.selectedItemIndex = -1;
      this.renderCanvas();
      this.renderPropertyPanel();
      this.updatePreview();
      return;
    }

    try {
      const templates = await ipcRenderer.invoke('get-templates');
      const template = templates.find(t => t.id === id);
      if (template) {
        this.template = { ...template };
        this.selectedItemIndex = -1;
        this.renderCanvas();
        this.renderPropertyPanel();
        this.updatePreview();
      }
    } catch (error) {
      alert('加载模板失败: ' + error.message);
    }
  }

  async deleteTemplate() {
    if (!this.template.id) {
      alert('请先选择要删除的模板');
      return;
    }

    if (!confirm('确定要删除此模板吗？')) return;

    try {
      await ipcRenderer.invoke('delete-template', this.template.id);
      this.template = { id: null, name: '新模板', items: [] };
      this.selectedItemIndex = -1;
      await this.loadTemplates();
      this.renderCanvas();
      this.renderPropertyPanel();
      this.updatePreview();
      alert('删除成功！');
    } catch (error) {
      alert('删除失败: ' + error.message);
    }
  }

  async printTest() {
    const printBtn = document.getElementById('printBtn');
    const originalText = printBtn.textContent;
    printBtn.textContent = '打印中...';
    printBtn.disabled = true;

    try {
      if (this.printerType === 'network') {
        if (!this.networkPrinterConfig || !this.networkPrinterConfig.enabled || !this.networkPrinterConfig.ip) {
          alert('请先配置网络打印机');
          printBtn.textContent = originalText;
          printBtn.disabled = false;
          return;
        }

        const commands = await ESCPOS.fromTemplate(this.template);
        const job = {
          printerType: 'network',
          templateName: this.template.name || '打印任务',
          data: Array.from(commands)
        };
        
        await ipcRenderer.invoke('add-to-print-queue', job);
        alert('已添加到打印队列！');
      } else {
        if (!this.printer.connected) {
          alert('请先连接打印机');
          printBtn.textContent = originalText;
          printBtn.disabled = false;
          return;
        }

        await this.printer.print(this.template);
        alert('打印命令已发送！');
      }
    } catch (error) {
      alert('打印失败: ' + error.message);
    } finally {
      printBtn.textContent = originalText;
      printBtn.disabled = false;
    }
  }
}

function closeNetworkConfigModal() {
  document.getElementById('networkConfigModal').style.display = 'none';
}

function closeQueueModal() {
  document.getElementById('queueModal').style.display = 'none';
}

function saveNetworkConfig() {
  designer.saveNetworkConfig();
}

function testNetworkPrinter() {
  designer.testNetworkPrinter();
}

function retryQueue() {
  designer.retryQueue();
}

function clearQueue() {
  designer.clearQueue();
}

const designer = new ReceiptDesigner();
window.designer = designer;
