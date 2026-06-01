let currentXmlContent = '';
let currentParsedData = null;
let currentFilename = '';
let currentEditContext = null;
let changes = [];

document.addEventListener('DOMContentLoaded', function() {
    initUpload();
    initTabs();
    initToolbar();
    initHeaderActions();
    loadTemplates();
});

function initUpload() {
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');

    fileInput.addEventListener('change', handleFileSelect);

    uploadArea.addEventListener('click', () => fileInput.click());

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
            processFile(files[0]);
        }
    });
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        processFile(file);
    }
}

function processFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    fetch('/api/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('错误: ' + data.error);
            return;
        }
        
        currentXmlContent = data.xml_content;
        currentParsedData = data.parsed_data;
        currentFilename = data.filename;
        changes = [];
        
        displayFileInfo();
        displayIEDInfo();
        renderVisualization();
        displayXML();
    })
    .catch(error => {
        console.error('Error:', error);
        alert('上传失败: ' + error.message);
    });
}

function displayFileInfo() {
    document.getElementById('fileInfo').classList.remove('hidden');
    document.getElementById('currentFilename').textContent = currentFilename;
}

function displayIEDInfo() {
    const infoPanel = document.getElementById('iedInfo');
    infoPanel.classList.remove('hidden');
    
    const ied = currentParsedData.ied;
    document.getElementById('iedName').value = ied.name || '';
    document.getElementById('iedType').textContent = ied.type || '';
    document.getElementById('iedManufacturer').textContent = ied.manufacturer || '';
    document.getElementById('iedDesc').value = ied.desc || '';
    
    document.getElementById('iedName').onchange = function() {
        changes.push({
            type: 'ied_name',
            new_name: this.value
        });
    };
    
    document.getElementById('iedDesc').onchange = function() {
        changes.push({
            type: 'ied_desc',
            new_desc: this.value
        });
    };
}

function renderVisualization() {
    const area = document.getElementById('visualizationArea');
    const ied = currentParsedData.ied;
    
    if (!ied.access_points || ied.access_points.length === 0) {
        area.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>没有找到访问点数据</p></div>';
        return;
    }
    
    let html = '';
    
    ied.access_points.forEach((ap, apIdx) => {
        html += `
            <div class="access-point">
                <div class="access-point-header">
                    <span class="node-icon">🔌</span>
                    访问点: ${ap.name}
                </div>
        `;
        
        ap.ldevices.forEach((ld, ldIdx) => {
            html += `
                <div class="ldevice">
                    <div class="ldevice-header" onclick="toggleSection('ld-${apIdx}-${ldIdx}')">
                        <span class="node-toggle" id="toggle-ld-${apIdx}-${ldIdx}">▶</span>
                        <span class="node-icon">📦</span>
                        逻辑设备: ${ld.ldName || ld.inst} (实例: ${ld.inst})
                    </div>
                    <div class="ld-children tree-children" id="ld-${apIdx}-${ldIdx}">
            `;
            
            if (ld.ln0) {
                html += renderLogicalNode(ld.ln0, ap.name, ld.inst, true, apIdx, ldIdx, -1);
            }
            
            ld.logical_nodes.forEach((ln, lnIdx) => {
                html += renderLogicalNode(ln, ap.name, ld.inst, false, apIdx, ldIdx, lnIdx);
            });
            
            html += '</div></div>';
        });
        
        html += '</div>';
    });
    
    area.innerHTML = html;
}

function toggleSection(id) {
    const section = document.getElementById(id);
    const toggle = document.getElementById('toggle-' + id);
    if (section && toggle) {
        section.classList.toggle('expanded');
        toggle.textContent = section.classList.contains('expanded') ? '▼' : '▶';
    }
}

function renderLogicalNode(ln, apName, ldInst, isLn0, apIdx, ldIdx, lnIdx) {
    const lnClass = ln.prefix ? `${ln.prefix}/${ln.lnClass}` : ln.lnClass;
    const headerClass = isLn0 ? 'ln-node ln0' : 'ln-node';
    const nodeId = `ln-${apIdx}-${ldIdx}-${lnIdx}`;
    
    let doHtml = '';
    ln.data_objects.forEach((doObj, doIdx) => {
        doHtml += renderDataObject(doObj, apName, ldInst, ln, nodeId, doIdx);
    });
    
    return `
        <div class="${headerClass}" data-ln="${ln.lnClass}" data-inst="${ln.inst}">
            <div class="ln-header node-content" onclick="toggleSection('${nodeId}')">
                <span class="node-toggle" id="toggle-${nodeId}">▶</span>
                <span class="node-icon">${isLn0 ? '🎯' : '🔧'}</span>
                <span class="node-name">${lnClass}.${ln.inst}</span>
                ${ln.desc ? `<span class="node-desc">(${ln.desc})</span>` : ''}
                <span class="node-desc" style="margin-left: auto; color: #a0aec0;">类型: ${ln.lnType}</span>
            </div>
            <div class="ln-children tree-children" id="${nodeId}">
                ${doHtml}
            </div>
        </div>
    `;
}

function renderDataObject(doObj, apName, ldInst, ln, parentId, doIdx) {
    const doId = `${parentId}-do-${doIdx}`;
    
    let daHtml = '';
    doObj.data_attributes.forEach(da => {
        daHtml += `
            <div class="da-node">
                <span>${da.name}</span>
                ${da.value !== null ? `<span class="da-value">${da.value}</span>` : ''}
                <span class="node-actions">
                    <button class="edit-btn" onclick="event.stopPropagation(); openEditModal('${apName}', '${ldInst}', '${ln.lnClass}', '${ln.inst}', '${doObj.name}', '${da.name}', '${da.value || ''}')">编辑</button>
                </span>
            </div>
        `;
    });
    
    return `
        <div class="do-node">
            <div class="do-header node-content" onclick="toggleSection('${doId}')">
                <span class="node-toggle" id="toggle-${doId}">▶</span>
                <span class="node-icon">📊</span>
                <span class="node-name">${doObj.name}</span>
                ${doObj.desc ? `<span class="node-desc">(${doObj.desc})</span>` : ''}
            </div>
            <div class="da-children tree-children" id="${doId}">
                ${daHtml}
            </div>
        </div>
    `;
}

function displayXML() {
    document.getElementById('xmlContent').value = currentXmlContent;
}

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.dataset.tab;
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(tab + 'Tab').classList.add('active');
        });
    });
}

function initToolbar() {
    document.getElementById('expandAllBtn').addEventListener('click', function() {
        document.querySelectorAll('.ln-children').forEach(el => el.classList.add('expanded'));
        document.querySelectorAll('.node-toggle').forEach(el => el.textContent = '▼');
    });
    
    document.getElementById('collapseAllBtn').addEventListener('click', function() {
        document.querySelectorAll('.ln-children').forEach(el => el.classList.remove('expanded'));
        document.querySelectorAll('.node-toggle').forEach(el => el.textContent = '▶');
    });
    
    document.getElementById('searchInput').addEventListener('input', function() {
        const query = this.value.toLowerCase();
        if (!query) {
            document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
            return;
        }
        
        document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
        
        document.querySelectorAll('.ln-node, .do-node').forEach(node => {
            const text = node.textContent.toLowerCase();
            if (text.includes(query)) {
                node.classList.add('highlight');
                const children = node.closest('.ln-children');
                if (children) {
                    children.classList.add('expanded');
                    const parent = node.closest('.ln-node');
                    if (parent) {
                        const toggle = parent.querySelector('.node-toggle');
                        if (toggle) toggle.textContent = '▼';
                    }
                }
            }
        });
    });
}

function initHeaderActions() {
    document.getElementById('exportBtn').addEventListener('click', exportCID);
    document.getElementById('saveTemplateBtn').addEventListener('click', openTemplateModal);
    document.getElementById('loadTemplateBtn').addEventListener('click', toggleTemplateList);
    document.getElementById('scdMergeBtn').addEventListener('click', openScdMergeModal);
    document.getElementById('svConfigBtn').addEventListener('click', openSvConfigModal);
    document.getElementById('reportBtn').addEventListener('click', openReportModal);
    initScdFileInput();
}

function openEditModal(apName, ldInst, lnClass, lnInst, doName, daName, currentValue) {
    currentEditContext = {
        ap_name: apName,
        ld_inst: ldInst,
        ln_class: lnClass,
        ln_inst: lnInst,
        do_name: doName,
        da_name: daName
    };
    
    document.getElementById('editAttrName').textContent = `${doName}.${daName}`;
    document.getElementById('editCurrentValue').textContent = currentValue || '(空)';
    document.getElementById('editNewValue').value = currentValue || '';
    document.getElementById('editModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('editModal').classList.add('hidden');
    currentEditContext = null;
}

function applyEdit() {
    if (!currentEditContext) return;
    
    const newValue = document.getElementById('editNewValue').value;
    
    changes.push({
        type: 'dai_value',
        ap_name: currentEditContext.ap_name,
        ld_inst: currentEditContext.ld_inst,
        ln_class: currentEditContext.ln_class,
        ln_inst: currentEditContext.ln_inst,
        do_name: currentEditContext.do_name,
        da_name: currentEditContext.da_name,
        new_value: newValue
    });
    
    closeModal();
    alert('更改已记录，导出CID时将应用');
}

function exportCID() {
    if (!currentXmlContent) {
        alert('请先上传ICD文件');
        return;
    }
    
    const exportFilename = currentFilename.replace('.icd', '.cid').replace('.xml', '.cid');
    
    fetch('/api/export/cid', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            xml_content: currentXmlContent,
            changes: changes,
            filename: exportFilename
        })
    })
    .then(response => {
        if (response.ok) {
            return response.blob();
        }
        return response.json().then(data => { throw new Error(data.error); });
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exportFilename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    })
    .catch(error => {
        console.error('Error:', error);
        alert('导出失败: ' + error.message);
    });
}

function openTemplateModal() {
    if (!currentXmlContent) {
        alert('请先上传ICD文件');
        return;
    }
    document.getElementById('templateName').value = currentFilename.replace('.icd', '');
    document.getElementById('templateModal').classList.remove('hidden');
}

function closeTemplateModal() {
    document.getElementById('templateModal').classList.add('hidden');
}

function saveTemplate() {
    const name = document.getElementById('templateName').value.trim();
    if (!name) {
        alert('请输入模板名称');
        return;
    }
    
    fetch('/api/templates', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: name,
            ied_name: currentParsedData?.ied?.name,
            manufacturer: currentParsedData?.ied?.manufacturer,
            desc: currentParsedData?.ied?.desc,
            xml_content: currentXmlContent
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('错误: ' + data.error);
            return;
        }
        closeTemplateModal();
        loadTemplates();
        alert('模板保存成功');
    })
    .catch(error => {
        console.error('Error:', error);
        alert('保存失败: ' + error.message);
    });
}

function toggleTemplateList() {
    const list = document.getElementById('templateList');
    list.classList.toggle('hidden');
}

function loadTemplates() {
    fetch('/api/templates')
    .then(response => response.json())
    .then(templates => {
        const container = document.getElementById('templateItems');
        if (templates.length === 0) {
            container.innerHTML = '<p style="color: #718096; font-size: 0.875rem;">暂无保存的模板</p>';
            return;
        }
        
        container.innerHTML = templates.map(t => `
            <div class="template-item" onclick="loadTemplate(${t.id})">
                <div class="template-item-name">${t.name}</div>
                <div class="template-item-date">${new Date(t.created_at).toLocaleString()}</div>
            </div>
        `).join('');
    })
    .catch(error => {
        console.error('Error loading templates:', error);
    });
}

function loadTemplate(templateId) {
    fetch(`/api/templates/${templateId}`)
    .then(response => response.json())
    .then(data => {
        currentXmlContent = data.xml_content;
        currentParsedData = data.parsed_data;
        currentFilename = data.template.name;
        changes = [];
        
        displayFileInfo();
        displayIEDInfo();
        renderVisualization();
        displayXML();
        toggleTemplateList();
    })
    .catch(error => {
        console.error('Error:', error);
        alert('加载模板失败: ' + error.message);
    });
}

function openScdMergeModal() {
    document.getElementById('scdMergeModal').classList.remove('hidden');
    document.getElementById('scdFileList').innerHTML = '';
    document.getElementById('scdFileInput').value = '';
}

function closeScdMergeModal() {
    document.getElementById('scdMergeModal').classList.add('hidden');
}

function initScdFileInput() {
    const input = document.getElementById('scdFileInput');
    if (input) {
        input.addEventListener('change', function() {
            const list = document.getElementById('scdFileList');
            list.innerHTML = '';
            for (let i = 0; i < this.files.length; i++) {
                const file = this.files[i];
                list.innerHTML += `
                    <div class="file-item" style="padding: 0.5rem; background: #f7fafc; margin: 0.25rem 0; border-radius: 4px; display: flex; align-items: center; gap: 0.5rem;">
                        <span>📄 ${file.name}</span>
                        <input type="text" placeholder="自定义IED名称(可选)" style="flex: 1; padding: 0.25rem 0.5rem; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 0.875rem;" data-index="${i}">
                    </div>
                `;
            }
        });
    }
}

function mergeSCD() {
    const input = document.getElementById('scdFileInput');
    if (input.files.length < 2) {
        alert('请至少选择2个ICD文件');
        return;
    }
    
    const formData = new FormData();
    const scdName = document.getElementById('scdName').value || 'Merged_SCD';
    formData.append('scd_name', scdName);
    
    for (let i = 0; i < input.files.length; i++) {
        formData.append('files', input.files[i]);
        const nameInput = document.querySelector(`input[data-index="${i}"]`);
        if (nameInput && nameInput.value) {
            formData.append(`name_${i}`, nameInput.value);
        }
    }
    
    fetch('/api/scd/merge', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (response.ok) {
            return response.blob();
        }
        return response.json().then(data => { throw new Error(data.error); });
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${scdName}.scd`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        closeScdMergeModal();
        alert('SCD合并成功！');
    })
    .catch(error => {
        console.error('Error:', error);
        alert('SCD合并失败: ' + error.message);
    });
}

function openSvConfigModal() {
    if (!currentXmlContent) {
        alert('请先上传ICD文件');
        return;
    }
    
    fetch('/api/sv/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml_content: currentXmlContent })
    })
    .then(response => response.json())
    .then(data => {
        const container = document.getElementById('svConfigList');
        if (data.sv_configs && data.sv_configs.length > 0) {
            let html = '<table style="width: 100%; border-collapse: collapse;"><tr><th>名称</th><th>AppID</th><th>类型</th><th>操作</th></tr>';
            data.sv_configs.forEach((sv, idx) => {
                if (sv.type === 'SampledValueControl') {
                    html += `
                        <tr>
                            <td>${sv.name}</td>
                            <td>-</td>
                            <td>控制块</td>
                            <td>
                                <select onchange="updateSvRate('${sv.name}', this.value)">
                                    <option value="">选择采样率</option>
                                    ${data.rate_options.map(opt => `<option value="${opt.value}" ${sv.smpRate === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
                                </select>
                            </td>
                        </tr>
                    `;
                } else {
                    html += `
                        <tr>
                            <td>${sv.cbName}</td>
                            <td>${sv.appID || '-'}</td>
                            <td>SMV订阅</td>
                            <td>-</td>
                        </tr>
                    `;
                }
            });
            html += '</table>';
            container.innerHTML = html;
        } else {
            container.innerHTML = '<p style="text-align: center; color: #718096;">暂无SV配置</p>';
        }
        document.getElementById('svConfigModal').classList.remove('hidden');
    })
    .catch(error => {
        console.error('Error:', error);
        alert('获取SV配置失败: ' + error.message);
    });
}

function closeSvConfigModal() {
    document.getElementById('svConfigModal').classList.add('hidden');
}

function updateSvRate(svcName, rate) {
    if (!rate) return;
    
    fetch('/api/sv/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            xml_content: currentXmlContent,
            svc_name: svcName,
            smp_rate: rate
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.xml_content) {
            currentXmlContent = data.xml_content;
            displayXML();
            alert('采样率已更新');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('更新失败: ' + error.message);
    });
}

function openReportModal() {
    if (!currentXmlContent) {
        alert('请先上传ICD文件');
        return;
    }
    document.getElementById('reportModal').classList.remove('hidden');
}

function closeReportModal() {
    document.getElementById('reportModal').classList.add('hidden');
}

function exportReport(format) {
    const url = format === 'html' ? '/api/report/html' : '/api/report/text';
    const filename = format === 'html' ? 'ied_report.html' : 'ied_report.txt';
    
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml_content: currentXmlContent })
    })
    .then(response => {
        if (response.ok) {
            return response.blob();
        }
        return response.json().then(data => { throw new Error(data.error); });
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        closeReportModal();
    })
    .catch(error => {
        console.error('Error:', error);
        alert('导出报告失败: ' + error.message);
    });
}
