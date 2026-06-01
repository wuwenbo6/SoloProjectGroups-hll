let workspace;

document.addEventListener('DOMContentLoaded', function() {
    initBlockly();
    setupEventListeners();
});

function initBlockly() {
    const blocklyDiv = document.getElementById('blocklyDiv');
    const toolbox = document.getElementById('toolbox');
    
    workspace = Blockly.inject(blocklyDiv, {
        toolbox: toolbox,
        grid: {
            spacing: 20,
            length: 3,
            colour: '#ccc',
            snap: true
        },
        zoom: {
            controls: true,
            wheel: true,
            startScale: 1.0,
            maxScale: 3,
            minScale: 0.3,
            scaleSpeed: 1.2
        },
        trashcan: true,
        scrollbars: true
    });

    Blockly.svgResize(workspace);
    window.addEventListener('resize', function() {
        Blockly.svgResize(workspace);
    });
}

function setupEventListeners() {
    document.getElementById('generateBtn').addEventListener('click', generateCode);
    document.getElementById('downloadBtn').addEventListener('click', downloadKeilProject);
    document.getElementById('downloadArduinoBtn').addEventListener('click', downloadArduinoLibrary);
    document.getElementById('clearBtn').addEventListener('click', clearWorkspace);
    document.getElementById('copyBtn').addEventListener('click', copyCode);
}

function generateCode() {
    updateStatus('正在生成代码...');
    
    const xml = Blockly.Xml.workspaceToDom(workspace);
    const xmlText = Blockly.Xml.domToText(xml);
    
    fetch('/api/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ xml: xmlText })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.querySelector('#codePreview code').textContent = data.code;
            updateStatus('代码生成成功！');
        } else {
            document.querySelector('#codePreview code').textContent = '错误: ' + data.error;
            updateStatus('代码生成失败');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        document.querySelector('#codePreview code').textContent = '请求失败: ' + error;
        updateStatus('请求失败');
    });
}

function downloadKeilProject() {
    updateStatus('正在生成Keil工程...');
    
    const xml = Blockly.Xml.workspaceToDom(workspace);
    const xmlText = Blockly.Xml.domToText(xml);
    
    fetch('/api/download', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ xml: xmlText })
    })
    .then(response => {
        if (response.ok) {
            return response.blob();
        }
        throw new Error('下载失败');
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'STM32_Ladder_Project.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        updateStatus('Keil工程下载成功！');
    })
    .catch(error => {
        console.error('Error:', error);
        updateStatus('下载失败: ' + error.message);
    });
}

function downloadArduinoLibrary() {
    updateStatus('正在生成Arduino库...');
    
    const xml = Blockly.Xml.workspaceToDom(workspace);
    const xmlText = Blockly.Xml.domToText(xml);
    
    fetch('/api/download_arduino', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ xml: xmlText })
    })
    .then(response => {
        if (response.ok) {
            return response.blob();
        }
        throw new Error('下载失败');
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'LadderLogic_Arduino.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        updateStatus('Arduino库下载成功！');
    })
    .catch(error => {
        console.error('Error:', error);
        updateStatus('下载失败: ' + error.message);
    });
}

function clearWorkspace() {
    if (confirm('确定要清空画布吗？')) {
        workspace.clear();
        document.querySelector('#codePreview code').textContent = '// 点击"生成 C 代码"按钮查看生成的代码';
        updateStatus('画布已清空');
    }
}

function copyCode() {
    const code = document.querySelector('#codePreview code').textContent;
    navigator.clipboard.writeText(code).then(() => {
        updateStatus('代码已复制到剪贴板！');
    }).catch(err => {
        console.error('复制失败:', err);
        updateStatus('复制失败');
    });
}

function updateStatus(message) {
    document.getElementById('statusText').textContent = message;
}
