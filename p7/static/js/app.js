let workspace;
let currentProjectId = null;
let currentStCode = '';

document.addEventListener('DOMContentLoaded', function() {
    initBlockly();
    initEventListeners();
    loadInitialStCode();
    registerStLanguage();
});

function registerStLanguage() {
    hljs.registerLanguage('structured-text', function(hljs) {
        return {
            name: 'Structured Text',
            keywords: {
                keyword: 'PROGRAM VAR END_VAR IF THEN END_IF ELSE ELSIF CASE OF END_CASE FOR TO DO END_FOR WHILE END_WHILE REPEAT UNTIL END_REPEAT FUNCTION FUNCTION_BLOCK RETURN AND OR NOT XOR MOD TRUE FALSE BOOL INT DINT REAL LREAL TIME TON TOF TP CTU CTD CTUD',
                literal: 'TRUE FALSE',
                built_in: 'ABS SQRT SIN COS TAN EXP LN LOG EXPT'
            },
            contains: [
                hljs.C_LINE_COMMENT_MODE,
                hljs.COMMENT(/\(\*/, /\*\)/),
                hljs.QUOTE_STRING_MODE,
                hljs.C_NUMBER_MODE,
                {
                    className: 'symbol',
                    begin: ':=|;|,|\\(|\\)|\\[|\\]|\\.|<|>|=|\\+|-|\\*|/|<=|>=|<>'
                }
            ]
        };
    });
}

function initBlockly() {
    workspace = Blockly.inject('blocklyDiv', {
        toolbox: document.getElementById('toolbox'),
        media: 'https://unpkg.com/blockly/media/',
        scrollbars: true,
        trashcan: true,
        zoom: {
            controls: true,
            wheel: true,
            startScale: 1.0,
            maxScale: 3,
            minScale: 0.3,
            scaleSpeed: 1.2
        },
        grid: {
            spacing: 20,
            length: 3,
            colour: '#ccc',
            snap: true
        }
    });
}

function initEventListeners() {
    document.getElementById('convertBtn').addEventListener('click', convertToSt);
    document.getElementById('clearWorkspaceBtn').addEventListener('click', clearWorkspace);
    document.getElementById('downloadBtn').addEventListener('click', downloadSt);
    document.getElementById('newProjectBtn').addEventListener('click', showNewProjectModal);
    document.getElementById('saveProjectBtn').addEventListener('click', saveProject);
    document.getElementById('projectsBtn').addEventListener('click', showProjectsModal);
    document.getElementById('historyBtn').addEventListener('click', showHistoryModal);
    document.getElementById('createProjectBtn').addEventListener('click', createProject);
    document.getElementById('closeProjectBtn').addEventListener('click', closeProject);

    document.getElementById('editStBtn').addEventListener('click', startEditSt);
    document.getElementById('applyStBtn').addEventListener('click', applyStEdit);
    document.getElementById('cancelEditBtn').addEventListener('click', cancelStEdit);
    document.getElementById('importStBtn').addEventListener('click', showImportStModal);
    document.getElementById('doImportStBtn').addEventListener('click', doImportSt);
    document.getElementById('stFileInput').addEventListener('change', handleStFileUpload);
    document.getElementById('exportPlcOpenBtn').addEventListener('click', exportPlcOpen);

    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.modal').classList.remove('show');
        });
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('show');
            }
        });
    });

    loadFunctionBlocks();
}

function loadInitialStCode() {
    const initialCode = `PROGRAM Main
VAR
    (* Variables *)
END_VAR

(* Ladder Logic Program *)
(* 请在左侧绘制梯形图后点击"转换为 ST"按钮 *)
`;
    updateStCode(initialCode);
}

function updateStCode(code) {
    currentStCode = code;
    const codeElement = document.getElementById('stCode');
    codeElement.textContent = code;
    hljs.highlightElement(codeElement);
}

async function convertToSt() {
    const xml = Blockly.Xml.workspaceToDom(workspace);
    const xmlText = Blockly.Xml.domToText(xml);

    try {
        const response = await fetch('/api/convert', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                blockly_xml: xmlText,
                save_history: currentProjectId !== null,
                project_id: currentProjectId
            })
        });

        const data = await response.json();
        if (data.success) {
            updateStCode(data.st_code);
            showToast('转换成功！', 'success');
        } else {
            showToast('转换失败', 'error');
        }
    } catch (error) {
        console.error('转换错误:', error);
        showToast('转换失败: ' + error.message, 'error');
    }
}

function clearWorkspace() {
    if (confirm('确定要清空工作区吗？')) {
        workspace.clear();
        loadInitialStCode();
        showToast('工作区已清空', 'info');
    }
}

async function downloadSt() {
    if (!currentStCode || currentStCode.trim() === '') {
        showToast('没有可下载的代码', 'error');
        return;
    }

    const filename = currentProjectId ? 
        document.getElementById('currentProjectName').textContent + '.st' : 
        'program.st';

    try {
        const response = await fetch('/api/download/st', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                st_code: currentStCode,
                filename: filename
            })
        });

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showToast('下载成功！', 'success');
    } catch (error) {
        console.error('下载错误:', error);
        showToast('下载失败', 'error');
    }
}

function showNewProjectModal() {
    document.getElementById('newProjectModal').classList.add('show');
    document.getElementById('newProjectName').value = '';
    document.getElementById('newProjectDesc').value = '';
    document.getElementById('newProjectName').focus();
}

async function createProject() {
    const name = document.getElementById('newProjectName').value.trim();
    const desc = document.getElementById('newProjectDesc').value.trim();

    if (!name) {
        showToast('请输入项目名称', 'error');
        return;
    }

    try {
        const response = await fetch('/api/projects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                description: desc
            })
        });

        const data = await response.json();
        if (data.id) {
            currentProjectId = data.id;
            document.getElementById('currentProjectName').textContent = name;
            document.getElementById('projectInfoBar').style.display = 'flex';
            document.getElementById('newProjectModal').classList.remove('show');
            workspace.clear();
            loadInitialStCode();
            showToast('项目创建成功！', 'success');
        }
    } catch (error) {
        console.error('创建项目错误:', error);
        showToast('创建项目失败', 'error');
    }
}

async function saveProject() {
    if (!currentProjectId) {
        showToast('请先创建或打开一个项目', 'error');
        return;
    }

    const xml = Blockly.Xml.workspaceToDom(workspace);
    const xmlText = Blockly.Xml.domToText(xml);

    try {
        const response = await fetch('/api/projects/' + currentProjectId, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                blockly_xml: xmlText,
                st_code: currentStCode
            })
        });

        const data = await response.json();
        showToast('项目保存成功！', 'success');
    } catch (error) {
        console.error('保存项目错误:', error);
        showToast('保存项目失败', 'error');
    }
}

async function showProjectsModal() {
    const modal = document.getElementById('projectsModal');
    const list = document.getElementById('projectsList');
    
    try {
        const response = await fetch('/api/projects');
        const projects = await response.json();

        if (projects.length === 0) {
            list.innerHTML = '<div class="empty-state">暂无项目</div>';
        } else {
            list.innerHTML = projects.map(project => `
                <div class="project-item">
                    <div class="project-item-header">
                        <span class="project-item-name">${escapeHtml(project.name)}</span>
                        <div class="project-item-actions">
                            <button class="btn btn-sm btn-primary" onclick="openProject(${project.id})">打开</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteProject(${project.id})">删除</button>
                        </div>
                    </div>
                    ${project.description ? `<div class="project-item-desc">${escapeHtml(project.description)}</div>` : ''}
                    <div class="project-item-date">更新于: ${formatDate(project.updated_at)}</div>
                </div>
            `).join('');
        }

        modal.classList.add('show');
    } catch (error) {
        console.error('加载项目错误:', error);
        showToast('加载项目失败', 'error');
    }
}

async function openProject(projectId) {
    try {
        const response = await fetch('/api/projects/' + projectId);
        const project = await response.json();

        currentProjectId = project.id;
        document.getElementById('currentProjectName').textContent = project.name;
        document.getElementById('projectInfoBar').style.display = 'flex';

        workspace.clear();
        if (project.blockly_xml) {
            const xml = Blockly.utils.xml.textToDom(project.blockly_xml);
            Blockly.Xml.domToWorkspace(xml, workspace);
        }

        updateStCode(project.st_code || '');
        document.getElementById('projectsModal').classList.remove('show');
        showToast('项目已打开', 'success');
    } catch (error) {
        console.error('打开项目错误:', error);
        showToast('打开项目失败', 'error');
    }
}

async function deleteProject(projectId) {
    if (!confirm('确定要删除这个项目吗？')) {
        return;
    }

    try {
        await fetch('/api/projects/' + projectId, {
            method: 'DELETE'
        });

        if (currentProjectId === projectId) {
            closeProject();
        }

        showProjectsModal();
        showToast('项目已删除', 'success');
    } catch (error) {
        console.error('删除项目错误:', error);
        showToast('删除项目失败', 'error');
    }
}

function closeProject() {
    currentProjectId = null;
    document.getElementById('projectInfoBar').style.display = 'none';
    workspace.clear();
    loadInitialStCode();
    showToast('项目已关闭', 'info');
}

async function showHistoryModal() {
    const modal = document.getElementById('historyModal');
    const list = document.getElementById('historyList');
    
    try {
        const url = currentProjectId ? 
            `/api/history?project_id=${currentProjectId}` : 
            '/api/history';
        
        const response = await fetch(url);
        const history = await response.json();

        if (history.length === 0) {
            list.innerHTML = '<div class="empty-state">暂无转换历史</div>';
        } else {
            list.innerHTML = history.map(item => `
                <div class="history-item">
                    <div class="history-item-date">${formatDate(item.created_at)}</div>
                    <div class="history-item-preview">${escapeHtml(item.st_code_preview)}</div>
                </div>
            `).join('');
        }

        modal.classList.add('show');
    } catch (error) {
        console.error('加载历史错误:', error);
        showToast('加载历史失败', 'error');
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
}

function startEditSt() {
    document.getElementById('stCode').parentElement.parentElement.style.display = 'none';
    document.getElementById('stEditorContainer').style.display = 'flex';
    document.getElementById('stEditor').value = currentStCode;
    document.getElementById('stEditor').focus();
}

function applyStEdit() {
    const newCode = document.getElementById('stEditor').value;
    updateStCode(newCode);
    cancelStEdit();
    showToast('ST代码已更新', 'success');
}

function cancelStEdit() {
    document.getElementById('stCode').parentElement.parentElement.style.display = 'block';
    document.getElementById('stEditorContainer').style.display = 'none';
}

function showImportStModal() {
    document.getElementById('importStModal').classList.add('show');
    document.getElementById('importStCode').value = '';
    document.getElementById('stFileInput').value = '';
}

function handleStFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('importStCode').value = e.target.result;
    };
    reader.readAsText(file);
}

async function doImportSt() {
    const stCode = document.getElementById('importStCode').value.trim();
    
    if (!stCode) {
        showToast('请输入或上传ST代码', 'error');
        return;
    }

    try {
        const response = await fetch('/api/convert/st-to-blockly', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ st_code: stCode })
        });

        const data = await response.json();
        
        if (data.success) {
            workspace.clear();
            const xml = Blockly.utils.xml.textToDom(data.blockly_xml);
            Blockly.Xml.domToWorkspace(xml, workspace);
            updateStCode(stCode);
            document.getElementById('importStModal').classList.remove('show');
            showToast('ST代码已转换为梯形图', 'success');
        } else {
            showToast('转换失败: ' + (data.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('导入错误:', error);
        showToast('转换失败: ' + error.message, 'error');
    }
}

async function exportPlcOpen() {
    if (!currentStCode || currentStCode.trim() === '') {
        showToast('请先生成ST代码', 'error');
        return;
    }

    const projectName = currentProjectId ? 
        document.getElementById('currentProjectName').textContent : 
        'LadderLogicProject';

    try {
        const response = await fetch('/api/export/plcopen', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: projectName,
                st_code: currentStCode,
                created_at: new Date().toISOString()
            })
        });

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = projectName + '.xml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showToast('PLCopen XML导出成功！', 'success');
    } catch (error) {
        console.error('导出错误:', error);
        showToast('导出失败', 'error');
    }
}

let functionBlocks = [];

async function loadFunctionBlocks() {
    try {
        const response = await fetch('/api/function-blocks');
        const data = await response.json();
        functionBlocks = data.function_blocks || [];
        
        const select = document.getElementById('fbTypeSelect');
        if (select) {
            select.innerHTML = functionBlocks.map(fb => 
                `<option value="${fb.name}">${fb.name}</option>`
            ).join('');
            
            select.addEventListener('change', updateFbInputs);
            if (functionBlocks.length > 0) {
                updateFbInputs();
            }
        }
    } catch (error) {
        console.error('加载函数块错误:', error);
    }
}

function updateFbInputs() {
    const fbType = document.getElementById('fbTypeSelect').value;
    const fb = functionBlocks.find(f => f.name === fbType);
    const container = document.getElementById('fbInputs');
    
    if (!fb || !container) return;
    
    container.innerHTML = '<label>输入参数:</label>' + fb.inputs.map(input => `
        <div class="input-group">
            <label>${input.name}:</label>
            <input type="text" data-input="${input.name}" value="${input.default}" placeholder="${input.type}">
        </div>
    `).join('');
}
