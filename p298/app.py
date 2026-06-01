from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
from call_flow_manager import CallFlowManager

app = Flask(__name__)
CORS(app)

call_flow_manager = CallFlowManager()

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GSM A接口 SCCP/DTAP 消息解析器</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
        }

        h1 {
            color: white;
            text-align: center;
            margin-bottom: 30px;
            font-size: 2em;
        }

        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }

        .card {
            background: white;
            border-radius: 12px;
            padding: 25px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
        }

        .card h2 {
            color: #333;
            margin-bottom: 20px;
            font-size: 1.3em;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }

        .form-group {
            margin-bottom: 15px;
        }

        label {
            display: block;
            margin-bottom: 5px;
            color: #555;
            font-weight: 500;
        }

        textarea, select, input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s;
            font-family: 'Courier New', monospace;
        }

        textarea:focus, select:focus, input:focus {
            outline: none;
            border-color: #667eea;
        }

        textarea {
            min-height: 100px;
            resize: vertical;
        }

        button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            font-weight: 500;
        }

        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
        }

        button:active {
            transform: translateY(0);
        }

        .button-group {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        .btn-secondary {
            background: #6c757d;
        }

        .btn-success {
            background: #28a745;
        }

        .result-box {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            margin-top: 15px;
            max-height: 400px;
            overflow-y: auto;
        }

        .result-box pre {
            white-space: pre-wrap;
            word-wrap: break-word;
            font-size: 13px;
            line-height: 1.6;
            color: #333;
        }

        .call-flow {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-top: 15px;
        }

        .flow-item {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
            position: relative;
        }

        .flow-arrow {
            font-size: 24px;
            margin: 0 15px;
            color: #667eea;
        }

        .flow-box {
            padding: 12px 20px;
            border-radius: 8px;
            font-weight: 500;
            min-width: 120px;
            text-align: center;
        }

        .mobile {
            background: #e3f2fd;
            color: #1565c0;
            border: 2px solid #1565c0;
        }

        .network {
            background: #e8f5e9;
            color: #2e7d32;
            border: 2px solid #2e7d32;
        }

        .setup { background: #fff3e0; border-color: #f57c00; color: #e65100; }
        .call-proceeding { background: #f3e5f5; border-color: #7b1fa2; color: #6a1b9a; }
        .alerting { background: #fff8e1; border-color: #fbc02d; color: #f57f17; }
        .connect { background: #c8e6c9; border-color: #388e3c; color: #2e7d32; }
        .release { background: #ffcdd2; border-color: #d32f2f; color: #c62828; }

        .time-info {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
        }

        .call-info {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }

        .call-info h3 {
            margin-bottom: 15px;
        }

        .call-info p {
            margin: 8px 0;
            font-size: 14px;
        }

        .full-width {
            grid-column: 1 / -1;
        }

        .sample-messages {
            margin-top: 15px;
            padding: 15px;
            background: #f0f4ff;
            border-radius: 8px;
        }

        .sample-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 6px;
            font-size: 13px;
            margin: 5px;
            cursor: pointer;
        }

        .error {
            background: #ffebee;
            color: #c62828;
            padding: 15px;
            border-radius: 8px;
            margin-top: 15px;
        }

        @media (max-width: 768px) {
            .grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 GSM A接口 SCCP/DTAP 消息解析器</h1>
        
        <div class="grid">
            <div class="card">
                <h2>📤 输入SCCP消息 (十六进制)</h2>
                <div class="form-group">
                    <label for="direction">消息方向</label>
                    <select id="direction">
                        <option value="mobile_to_network">手机 → 网络</option>
                        <option value="network_to_mobile">网络 → 手机</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="hexInput">十六进制数据</label>
                    <textarea id="hexInput" placeholder="输入SCCP消息的十六进制数据，例如：09 00 03 07 ..."></textarea>
                </div>
                <div class="button-group">
                    <button onclick="parseMessage()">解析消息</button>
                    <button class="btn-secondary" onclick="clearAll()">清除全部</button>
                </div>
                
                <div class="sample-messages">
                    <strong>示例消息（点击加载）：</strong><br>
                    <button class="sample-btn" onclick="loadSample('setup')">Setup (手机发起)</button>
                    <button class="sample-btn" onclick="loadSample('call_proceeding')">Call Proceeding</button>
                    <button class="sample-btn" onclick="loadSample('alerting')">Alerting</button>
                    <button class="sample-btn" onclick="loadSample('connect')">Connect</button>
                    <button class="sample-btn" onclick="loadSample('connect_ack')">Connect Ack</button>
                    <button class="sample-btn" onclick="loadSample('release')">Release</button>
                    <button class="sample-btn" onclick="loadCompleteFlow()">加载完整呼叫流程</button>
                    <br><br>
                    <strong>位置更新示例：</strong><br>
                    <button class="sample-btn" onclick="loadSample('location_update_request')">Location Updating Request</button>
                    <button class="sample-btn" onclick="loadSample('auth_request')">Authentication Request</button>
                    <button class="sample-btn" onclick="loadSample('auth_response')">Authentication Response</button>
                    <button class="sample-btn" onclick="loadSample('identity_request')">Identity Request</button>
                    <button class="sample-btn" onclick="loadSample('identity_response')">Identity Response</button>
                    <button class="sample-btn" onclick="loadSample('location_update_accept')">Location Updating Accept</button>
                    <button class="sample-btn" onclick="loadLocationUpdateFlow()">加载完整位置更新流程</button>
                </div>
                
                <div id="parseResult" class="result-box" style="display: none;"></div>
                <div id="parseError" class="error" style="display: none;"></div>
            </div>

            <div class="card">
                <h2>📊 当前呼叫状态</h2>
                <div id="callsList">
                    <p style="color: #999;">暂无活动呼叫</p>
                </div>
            </div>

            <div class="card">
                <h2>📍 当前位置更新状态</h2>
                <div id="locationUpdatesList">
                    <p style="color: #999;">暂无位置更新</p>
                </div>
            </div>

            <div class="card full-width">
                <h2>🔄 手机发起呼叫流程 (Setup → Connect)</h2>
                <div class="button-group" style="margin-bottom: 15px;">
                    <button class="btn-success" onclick="exportCallFlow('json')">导出JSON</button>
                    <button class="btn-success" onclick="exportCallFlow('mermaid')">导出Mermaid</button>
                </div>
                <div id="callFlow"></div>
            </div>

            <div class="card full-width">
                <h2>📍 位置更新流程</h2>
                <div class="button-group" style="margin-bottom: 15px;">
                    <button class="btn-success" onclick="exportLocationUpdateFlow('json')">导出JSON</button>
                    <button class="btn-success" onclick="exportLocationUpdateFlow('mermaid')">导出Mermaid</button>
                </div>
                <div id="locationUpdateFlow"></div>
            </div>

            <div class="card full-width">
                <h2>📊 导出全部流程图</h2>
                <div class="button-group">
                    <button class="btn-success" onclick="exportAllFlows('json')">导出全部JSON</button>
                    <button class="btn-success" onclick="exportAllFlows('mermaid')">导出全部Mermaid</button>
                </div>
                <div id="exportResult" class="result-box" style="display: none; margin-top: 15px;"></div>
            </div>

            <div class="card full-width">
                <h2>📝 消息日志</h2>
                <div id="messageLog" class="result-box">
                    <p style="color: #999;">暂无消息日志</p>
                </div>
            </div>
        </div>
    </div>

    <script>
        const sampleMessages = {
            setup: "09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 14 03 05 05 01 5C 06 91 94 71 06 00 10 5E 07 91 94 71 06 00 11 F0 04 03 60 80",
            call_proceeding: "09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 0A 03 02 02 01 1E 02 82 88",
            alerting: "09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 05 03 01 01 01 34 01 01",
            connect: "09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 09 03 07 07 01 4C 06 91 94 71 06 00 11",
            connect_ack: "09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 03 03 0F 0F",
            release: "09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 05 03 4D 4D 01 08 02 81 90",
            location_update_request: "09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 0D 04 08 08 16 09 81 60 14 91 16 00 F4 13 05 13 00 F1 10 00 17 09 91 60 14 91 16 00 F4 10 F0",
            auth_request: "09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 07 04 12 21 10 DB 4D 6F 9A C3 1F A1 9F 60 3C 9F 8E 1D 6E 8A",
            auth_response: "09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 08 04 13 22 04 AA 12 34 56",
            identity_request: "09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 04 04 18 10 02",
            identity_response: "09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 0B 04 19 18 0A 35 10 07 65 44 08 00 F3",
            location_update_accept: "09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 0F 04 09 13 05 13 00 F1 10 00 17 05 F4 09 10 00 41 A0 00"
        };

        function loadSample(type) {
            document.getElementById('hexInput').value = sampleMessages[type];
            const mobileInitTypes = ['setup', 'connect_ack', 'release', 'location_update_request', 'auth_response', 'identity_response'];
            if (mobileInitTypes.includes(type)) {
                document.getElementById('direction').value = 'mobile_to_network';
            } else {
                document.getElementById('direction').value = 'network_to_mobile';
            }
        }

        async function loadCompleteFlow() {
            const flow = [
                { type: 'setup', direction: 'mobile_to_network' },
                { type: 'call_proceeding', direction: 'network_to_mobile' },
                { type: 'alerting', direction: 'network_to_mobile' },
                { type: 'connect', direction: 'network_to_mobile' },
                { type: 'connect_ack', direction: 'mobile_to_network' }
            ];

            for (const msg of flow) {
                document.getElementById('hexInput').value = sampleMessages[msg.type];
                document.getElementById('direction').value = msg.direction;
                await parseMessage();
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        async function loadLocationUpdateFlow() {
            const flow = [
                { type: 'location_update_request', direction: 'mobile_to_network' },
                { type: 'auth_request', direction: 'network_to_mobile' },
                { type: 'auth_response', direction: 'mobile_to_network' },
                { type: 'identity_request', direction: 'network_to_mobile' },
                { type: 'identity_response', direction: 'mobile_to_network' },
                { type: 'location_update_accept', direction: 'network_to_mobile' }
            ];

            for (const msg of flow) {
                document.getElementById('hexInput').value = sampleMessages[msg.type];
                document.getElementById('direction').value = msg.direction;
                await parseMessage();
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        async function parseMessage() {
            const hexData = document.getElementById('hexInput').value.trim();
            const direction = document.getElementById('direction').value;

            if (!hexData) {
                showError('请输入十六进制数据');
                return;
            }

            try {
                const response = await fetch('/api/parse', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hex_data: hexData, direction: direction })
                });

                const result = await response.json();
                
                if (result.error) {
                    showError(result.error);
                } else {
                    showResult(result);
                    updateCallsList();
                    updateLocationUpdatesList();
                    updateCallFlow();
                    updateLocationUpdateFlow();
                    updateMessageLog();
                }
            } catch (e) {
                showError('请求失败: ' + e.message);
            }
        }

        function showResult(result) {
            const resultDiv = document.getElementById('parseResult');
            const errorDiv = document.getElementById('parseError');
            
            errorDiv.style.display = 'none';
            resultDiv.style.display = 'block';
            
            let html = '<h4>解析结果：</h4>';
            html += '<pre>' + JSON.stringify(result, null, 2) + '</pre>';
            resultDiv.innerHTML = html;
        }

        function showError(message) {
            const errorDiv = document.getElementById('parseError');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            document.getElementById('parseResult').style.display = 'none';
        }

        async function updateCallsList() {
            const response = await fetch('/api/calls');
            const calls = await response.json();
            
            const callsDiv = document.getElementById('callsList');
            if (calls.length === 0) {
                callsDiv.innerHTML = '<p style="color: #999;">暂无活动呼叫</p>';
                return;
            }

            let html = '';
            for (const call of calls) {
                html += `
                    <div class="call-info">
                        <h3>呼叫 ID: ${call.call_id}</h3>
                        <p><strong>主叫号码:</strong> ${call.calling_number || '未知'}</p>
                        <p><strong>被叫号码:</strong> ${call.called_number || '未知'}</p>
                        <p><strong>状态:</strong> ${call.state}</p>
                        <button class="btn-success" onclick="showCallDetails('${call.call_id}')">查看详情</button>
                    </div>
                `;
            }
            callsDiv.innerHTML = html;
        }

        async function showCallDetails(callId) {
            const response = await fetch(`/api/call/${callId}`);
            const call = await response.json();
            
            if (call.error) {
                alert(call.error);
                return;
            }

            alert(`呼叫详情:\n\n主叫: ${call.calling_number}\n被叫: ${call.called_number}\n状态: ${call.state}\n消息数: ${call.messages.length}`);
        }

        async function updateCallFlow() {
            const response = await fetch('/api/call-flow');
            const flow = await response.json();
            
            const flowDiv = document.getElementById('callFlow');
            
            if (flow.length === 0) {
                flowDiv.innerHTML = '<p style="color: #999;">暂无呼叫流程数据，请先加载示例消息</p>';
                return;
            }

            let html = '';
            for (const msg of flow) {
                const isMobile = msg.direction === 'mobile_to_network';
                const msgClass = msg.message_type.toLowerCase().replace(/\s+/g, '-');
                
                html += `
                    <div class="flow-item">
                        <div class="flow-box ${isMobile ? msgClass : 'mobile'}">${isMobile ? '📱 手机' : '手机 📱'}</div>
                        <div class="flow-arrow">${isMobile ? '→' : '←'}</div>
                        <div class="flow-box ${!isMobile ? msgClass : 'network'}">${!isMobile ? '🌐 网络' : '网络 🌐'}</div>
                        <div style="margin-left: 20px;">
                            <strong>${msg.message_type}</strong>
                            <div class="time-info">事务ID: ${msg.transaction_id} | 呼叫ID: ${msg.call_id}</div>
                        </div>
                    </div>
                `;
            }
            
            flowDiv.innerHTML = html;
        }

        async function updateMessageLog() {
            const response = await fetch('/api/messages');
            const messages = await response.json();
            
            const logDiv = document.getElementById('messageLog');
            
            if (messages.length === 0) {
                logDiv.innerHTML = '<p style="color: #999;">暂无消息日志</p>';
                return;
            }

            let html = '<pre>';
            for (const msg of messages) {
                const time = new Date(msg.timestamp * 1000).toLocaleTimeString();
                const dir = msg.direction === 'mobile_to_network' ? '→' : '←';
                const dtap = msg.dtap ? msg.dtap.message_type_name : 'N/A';
                html += `[${time}] ${dir} ${dtap}\n`;
            }
            html += '</pre>';
            logDiv.innerHTML = html;
        }

        async function updateLocationUpdatesList() {
            const response = await fetch('/api/location-updates');
            const updates = await response.json();
            
            const updatesDiv = document.getElementById('locationUpdatesList');
            if (updates.length === 0) {
                updatesDiv.innerHTML = '<p style="color: #999;">暂无位置更新</p>';
                return;
            }

            let html = '';
            for (const update of updates) {
                html += `
                    <div class="call-info">
                        <h3>位置更新 ID: ${update.update_id}</h3>
                        <p><strong>IMSI:</strong> ${update.imsi || '未知'}</p>
                        <p><strong>TMSI:</strong> ${update.tmsi || '未知'}</p>
                        <p><strong>状态:</strong> ${update.state}</p>
                        <button class="btn-success" onclick="showLocationUpdateDetails('${update.update_id}')">查看详情</button>
                    </div>
                `;
            }
            updatesDiv.innerHTML = html;
        }

        async function showLocationUpdateDetails(updateId) {
            const response = await fetch(`/api/location-update/${updateId}`);
            const update = await response.json();
            
            if (update.error) {
                alert(update.error);
                return;
            }

            alert(`位置更新详情:\n\nIMSI: ${update.imsi || '未知'}\nIMEI: ${update.imei || '未知'}\nTMSI: ${update.tmsi || '未知'}\n旧LAI: ${update.old_lai || '未知'}\n新LAI: ${update.new_lai || '未知'}\n状态: ${update.state}\n消息数: ${update.messages.length}`);
        }

        async function updateLocationUpdateFlow() {
            const response = await fetch('/api/location-update-flow');
            const flow = await response.json();
            
            const flowDiv = document.getElementById('locationUpdateFlow');
            
            if (flow.length === 0) {
                flowDiv.innerHTML = '<p style="color: #999;">暂无位置更新流程数据，请先加载示例消息</p>';
                return;
            }

            let html = '';
            for (const msg of flow) {
                const isMobile = msg.direction === 'mobile_to_network';
                const msgClass = msg.message_type.toLowerCase().replace(/\s+/g, '-');
                
                html += `
                    <div class="flow-item">
                        <div class="flow-box ${isMobile ? msgClass : 'mobile'}">${isMobile ? '📱 手机' : '手机 📱'}</div>
                        <div class="flow-arrow">${isMobile ? '→' : '←'}</div>
                        <div class="flow-box ${!isMobile ? msgClass : 'network'}">${!isMobile ? '🌐 网络' : '网络 🌐'}</div>
                        <div style="margin-left: 20px;">
                            <strong>${msg.message_type}</strong>
                            <div class="time-info">位置更新ID: ${msg.location_update_id}</div>
                        </div>
                    </div>
                `;
            }
            
            flowDiv.innerHTML = html;
        }

        async function exportCallFlow(format) {
            const callsResponse = await fetch('/api/calls');
            const calls = await callsResponse.json();
            if (calls.length === 0) {
                alert('没有可导出的呼叫流程');
                return;
            }
            const callId = calls[0].call_id;
            const response = await fetch(`/api/export/call/${callId}?format=${format}`);
            if (format === 'json') {
                const result = await response.json();
                showExportResult(JSON.stringify(result, null, 2));
            } else {
                const result = await response.text();
                showExportResult(result);
            }
        }

        async function exportLocationUpdateFlow(format) {
            const updatesResponse = await fetch('/api/location-updates');
            const updates = await updatesResponse.json();
            if (updates.length === 0) {
                alert('没有可导出的位置更新流程');
                return;
            }
            const updateId = updates[0].update_id;
            const response = await fetch(`/api/export/location-update/${updateId}?format=${format}`);
            if (format === 'json') {
                const result = await response.json();
                showExportResult(JSON.stringify(result, null, 2));
            } else {
                const result = await response.text();
                showExportResult(result);
            }
        }

        async function exportAllFlows(format) {
            const response = await fetch(`/api/export/all?format=${format}`);
            if (format === 'json') {
                const result = await response.json();
                showExportResult(JSON.stringify(result, null, 2));
            } else {
                const result = await response.text();
                showExportResult(result);
            }
        }

        function showExportResult(content) {
            const resultDiv = document.getElementById('exportResult');
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = '<h4>导出结果：</h4><pre>' + escapeHtml(content) + '</pre>';
            resultDiv.scrollIntoView({ behavior: 'smooth' });
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        async function clearAll() {
            await fetch('/api/clear', { method: 'POST' });
            document.getElementById('hexInput').value = '';
            document.getElementById('parseResult').style.display = 'none';
            document.getElementById('parseError').style.display = 'none';
            document.getElementById('exportResult').style.display = 'none';
            updateCallsList();
            updateLocationUpdatesList();
            updateCallFlow();
            updateLocationUpdateFlow();
            updateMessageLog();
        }

        window.onload = function() {
            updateCallsList();
            updateLocationUpdatesList();
            updateCallFlow();
            updateLocationUpdateFlow();
            updateMessageLog();
        };
    </script>
</body>
</html>
"""


@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)


@app.route('/api/parse', methods=['POST'])
def parse_message():
    try:
        data = request.get_json()
        hex_data = data.get('hex_data', '')
        direction = data.get('direction', 'mobile_to_network')

        result = call_flow_manager.process_sccp_message(hex_data, direction)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/calls', methods=['GET'])
def get_calls():
    try:
        calls = call_flow_manager.get_all_calls()
        return jsonify(calls)
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/call/<call_id>', methods=['GET'])
def get_call(call_id):
    try:
        call = call_flow_manager.get_call_flow(call_id)
        if call is None:
            return jsonify({'error': 'Call not found'}), 404
        return jsonify(call)
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/call-flow', methods=['GET'])
def get_call_flow():
    try:
        flow = call_flow_manager.get_mobile_originated_call_flow()
        return jsonify(flow)
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/messages', methods=['GET'])
def get_messages():
    try:
        return jsonify(call_flow_manager.message_log)
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/clear', methods=['POST'])
def clear_all():
    try:
        call_flow_manager.clear_all()
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/sample-flow', methods=['POST'])
def load_sample_flow():
    try:
        sample_messages = [
            ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 14 03 05 05 01 5C 06 91 94 71 06 00 10 5E 07 91 94 71 06 00 11 F0 04 03 60 80", "mobile_to_network"),
            ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 0A 03 02 02 01 1E 02 82 88", "network_to_mobile"),
            ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 05 03 01 01 01 34 01 01", "network_to_mobile"),
            ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 09 03 07 07 01 4C 06 91 94 71 06 00 11", "network_to_mobile"),
            ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 03 03 0F 0F", "mobile_to_network"),
        ]

        results = []
        for hex_data, direction in sample_messages:
            result = call_flow_manager.process_sccp_message(hex_data, direction)
            results.append(result)

        return jsonify({'status': 'success', 'messages_processed': len(results)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/location-updates', methods=['GET'])
def get_location_updates():
    try:
        updates = call_flow_manager.get_all_location_updates()
        return jsonify(updates)
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/location-update/<update_id>', methods=['GET'])
def get_location_update(update_id):
    try:
        update = call_flow_manager.get_location_update_flow(update_id)
        if update is None:
            return jsonify({'error': 'Location update not found'}), 404
        return jsonify(update)
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/location-update-flow', methods=['GET'])
def get_location_update_flow():
    try:
        flow = call_flow_manager.get_location_update_flow_messages()
        return jsonify(flow)
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/export/call/<call_id>', methods=['GET'])
def export_call(call_id):
    try:
        format = request.args.get('format', 'json')
        result = call_flow_manager.export_call_flow(call_id, format)
        if result is None:
            return jsonify({'error': 'Call not found'}), 404
        if format == 'mermaid':
            return result, 200, {'Content-Type': 'text/plain; charset=utf-8'}
        return jsonify(json.loads(result))
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/export/location-update/<update_id>', methods=['GET'])
def export_location_update(update_id):
    try:
        format = request.args.get('format', 'json')
        result = call_flow_manager.export_location_update_flow(update_id, format)
        if result is None:
            return jsonify({'error': 'Location update not found'}), 404
        if format == 'mermaid':
            return result, 200, {'Content-Type': 'text/plain; charset=utf-8'}
        return jsonify(json.loads(result))
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/export/all', methods=['GET'])
def export_all():
    try:
        format = request.args.get('format', 'json')
        result = call_flow_manager.export_all_flows(format)
        if format == 'mermaid':
            return result, 200, {'Content-Type': 'text/plain; charset=utf-8'}
        return jsonify(json.loads(result))
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/sample-location-update-flow', methods=['POST'])
def load_sample_location_update_flow():
    try:
        sccp_header = '09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11'
        dtap_messages = [
            ('04 08 08 16 09 81 60 14 91 16 00 F4 13 05 13 00 F1 10 00 17 08 28 64 00 11 49 16 00 54 01', 'mobile_to_network'),
            ('04 12 21 10 DB 4D 6F 9A C3 1F A1 9F 60 3C 9F 8E 1D 6E 8A', 'network_to_mobile'),
            ('04 13 22 04 AA 12 34 56', 'mobile_to_network'),
            ('04 18 10 02', 'network_to_mobile'),
            ('04 19 18 08 49 35 01 70 56 44 80 00', 'mobile_to_network'),
            ('04 09 13 05 13 00 F1 10 00 17 04 84 F4 09 10 00', 'network_to_mobile'),
        ]
        
        sample_messages = []
        for dtap_hex, direction in dtap_messages:
            dtap_bytes = bytes.fromhex(dtap_hex.replace(' ', ''))
            bssap = f'01 {len(dtap_bytes):02X} {dtap_hex}'
            sample_messages.append((f'{sccp_header} {bssap}', direction))

        results = []
        for hex_data, direction in sample_messages:
            result = call_flow_manager.process_sccp_message(hex_data, direction)
            results.append(result)

        return jsonify({'status': 'success', 'messages_processed': len(results)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


if __name__ == '__main__':
    print("🚀 GSM SCCP/DTAP 消息解析器启动中...")
    print("📱 访问 http://localhost:8080 查看Web界面")
    print("=" * 60)
    app.run(host='0.0.0.0', port=8080, debug=True)
