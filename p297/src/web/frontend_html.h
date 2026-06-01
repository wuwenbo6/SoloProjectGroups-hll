#pragma once
#include <string>

const std::string FRONTEND_HTML = R"HTML(<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>User TCP/IP Stack - Protocol Analyzer</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #e4e4e7;
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 1800px; margin: 0 auto; }
        h1 {
            text-align: center;
            color: #60a5fa;
            margin-bottom: 20px;
            font-size: 28px;
            text-shadow: 0 0 20px rgba(96, 165, 250, 0.3);
        }
        .subtitle {
            text-align: center;
            color: #94a3b8;
            margin-bottom: 30px;
            font-size: 14px;
        }
        .grid {
            display: grid;
            grid-template-columns: 350px 1fr 400px;
            gap: 20px;
            margin-bottom: 20px;
        }
        .panel {
            background: rgba(30, 41, 59, 0.8);
            border-radius: 12px;
            padding: 20px;
            border: 1px solid rgba(148, 163, 184, 0.1);
            backdrop-filter: blur(10px);
        }
        .panel h2 {
            color: #60a5fa;
            margin-bottom: 15px;
            font-size: 18px;
            padding-bottom: 10px;
            border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        }
        .control-group { margin-bottom: 15px; }
        .control-group label {
            display: block;
            margin-bottom: 5px;
            color: #94a3b8;
            font-size: 13px;
        }
        .control-group input, .control-group button {
            width: 100%;
            padding: 10px;
            border: 1px solid rgba(148, 163, 184, 0.3);
            border-radius: 6px;
            background: rgba(15, 23, 42, 0.6);
            color: #e4e4e7;
            font-size: 14px;
            transition: all 0.2s;
        }
        .control-group input:focus {
            outline: none;
            border-color: #60a5fa;
            box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
        }
        .btn {
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            border: none;
            color: white;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.2s;
        }
        .btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4); }
        .btn:active { transform: translateY(0); }
        .btn.danger { background: linear-gradient(135deg, #ef4444, #dc2626); }
        .btn.success { background: linear-gradient(135deg, #10b981, #059669); }
        .btn-row { display: flex; gap: 10px; }
        .btn-row .btn { flex: 1; }
        .status-bar {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        .status-item {
            background: rgba(30, 41, 59, 0.8);
            padding: 12px 20px;
            border-radius: 8px;
            border: 1px solid rgba(148, 163, 184, 0.1);
        }
        .status-label { color: #94a3b8; font-size: 12px; }
        .status-value { color: #60a5fa; font-size: 20px; font-weight: 700; }
        .seq-ack-container {
            position: relative;
            height: 300px;
            overflow: hidden;
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 8px;
            background: rgba(15, 23, 42, 0.6);
        }
        .seq-axis {
            position: absolute;
            top: 50%;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(90deg, #3b82f6, #8b5cf6);
            transform: translateY(-50%);
        }
        .seq-marker {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            width: 4px;
            height: 40px;
            background: #f59e0b;
            border-radius: 2px;
            transition: left 0.3s ease;
            box-shadow: 0 0 10px rgba(245, 158, 11, 0.6);
        }
        .seq-label {
            position: absolute;
            top: calc(50% + 25px);
            transform: translateX(-50%);
            font-size: 11px;
            color: #f59e0b;
            font-family: monospace;
            white-space: nowrap;
        }
        .seq-marker.ack {
            background: #10b981;
            box-shadow: 0 0 10px rgba(16, 185, 129, 0.6);
        }
        .seq-marker.ack + .seq-label {
            color: #10b981;
            top: calc(50% - 40px);
        }
        .seq-side-label {
            position: absolute;
            font-size: 12px;
            color: #94a3b8;
        }
        .seq-side-label.left { left: 10px; top: 10px; }
        .seq-side-label.right { right: 10px; top: 10px; }
        .packets-list {
            max-height: 500px;
            overflow-y: auto;
            font-family: 'SF Mono', 'Consolas', monospace;
            font-size: 12px;
        }
        .packets-list::-webkit-scrollbar { width: 8px; }
        .packets-list::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.4); }
        .packets-list::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.3); border-radius: 4px; }
        .packet-item {
            padding: 10px;
            margin-bottom: 8px;
            border-radius: 6px;
            border-left: 3px solid;
            cursor: pointer;
            transition: all 0.2s;
        }
        .packet-item:hover { background: rgba(96, 165, 250, 0.1); }
        .packet-item.tx { border-left-color: #3b82f6; background: rgba(59, 130, 246, 0.05); }
        .packet-item.rx { border-left-color: #10b981; background: rgba(16, 185, 129, 0.05); }
        .packet-time { color: #64748b; font-size: 10px; }
        .packet-proto { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; margin-right: 8px; }
        .proto-ARP { background: #f59e0b; color: #1a1a2e; }
        .proto-IP { background: #6366f1; color: white; }
        .proto-ICMP { background: #ef4444; color: white; }
        .proto-TCP { background: #8b5cf6; color: white; }
        .proto-ETH { background: #64748b; color: white; }
        .proto-IPv4 { background: #6366f1; color: white; }
        .packet-info { margin-top: 4px; color: #cbd5e1; }
        .hex-dump {
            background: rgba(0, 0, 0, 0.3);
            padding: 12px;
            border-radius: 6px;
            font-size: 11px;
            max-height: 200px;
            overflow-y: auto;
            margin-top: 8px;
            white-space: pre-wrap;
            word-break: break-all;
            color: #94a3b8;
            display: none;
        }
        .hex-dump.open { display: block; }
        .detail-view {
            background: rgba(0, 0, 0, 0.3);
            padding: 15px;
            border-radius: 6px;
            margin-top: 15px;
            font-family: monospace;
            font-size: 12px;
            line-height: 1.6;
            max-height: 300px;
            overflow-y: auto;
        }
        .detail-view .field { display: flex; margin-bottom: 4px; }
        .detail-view .field-name { color: #60a5fa; width: 120px; }
        .detail-view .field-value { color: #e4e4e7; }
        .connection-state {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
        }
        .state-LISTEN { background: #f59e0b; color: #1a1a2e; }
        .state-SYN_SENT { background: #f97316; color: white; }
        .state-SYN_RCVD { background: #8b5cf6; color: white; }
        .state-ESTABLISHED { background: #10b981; color: white; }
        .state-FIN_WAIT_1, .state-FIN_WAIT_2 { background: #ec4899; color: white; }
        .state-CLOSE_WAIT { background: #ef4444; color: white; }
        .state-CLOSED { background: #64748b; color: white; }
        .ping-result {
            padding: 12px;
            margin-bottom: 8px;
            border-radius: 6px;
            background: rgba(16, 185, 129, 0.1);
            border-left: 3px solid #10b981;
            font-size: 13px;
        }
        .ping-result.error {
            background: rgba(239, 68, 68, 0.1);
            border-left-color: #ef4444;
        }
        .seq-graph {
            height: 200px;
            position: relative;
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 8px;
            background: rgba(15, 23, 42, 0.6);
            margin-top: 15px;
            overflow: hidden;
        }
        .seq-graph-canvas {
            width: 100%;
            height: 100%;
        }
        .handshake-diagram {
            display: flex;
            justify-content: space-around;
            align-items: flex-start;
            margin-top: 20px;
            position: relative;
            min-height: 250px;
        }
        .handshake-endpoint {
            text-align: center;
            z-index: 10;
        }
        .endpoint-box {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 12px;
            color: white;
        }
        .endpoint-box.client { background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
        .endpoint-box.server { background: linear-gradient(135deg, #8b5cf6, #6d28d9); }
        .endpoint-ip { font-size: 11px; color: #94a3b8; margin-top: 8px; font-family: monospace; }
        .handshake-arrows {
            position: absolute;
            top: 40px;
            left: 120px;
            right: 120px;
            bottom: 20px;
        }
        .handshake-step {
            position: relative;
            height: 50px;
            margin-bottom: 15px;
        }
        .handshake-step .arrow-line {
            position: absolute;
            top: 25px;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(90deg, #3b82f6, #8b5cf6);
            transform-origin: left center;
            animation: drawLine 0.6s ease forwards;
        }
        .handshake-step.server .arrow-line {
            background: linear-gradient(90deg, #8b5cf6, #3b82f6);
        }
        .handshake-step .arrow-head {
            position: absolute;
            top: 20px;
            width: 0;
            height: 0;
            border-top: 6px solid transparent;
            border-bottom: 6px solid transparent;
            border-left: 10px solid #3b82f6;
            animation: appear 0.3s ease 0.6s forwards;
            opacity: 0;
        }
        .handshake-step:not(.server) .arrow-head { right: 0; }
        .handshake-step.server .arrow-head {
            left: 0;
            border-left: none;
            border-right: 10px solid #8b5cf6;
        }
        .handshake-step .step-label {
            position: absolute;
            top: -5px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 11px;
            color: #fbbf24;
            font-family: monospace;
            white-space: nowrap;
            animation: appear 0.3s ease 0.3s forwards;
            opacity: 0;
        }
        @keyframes drawLine { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes appear { to { opacity: 1; } }
        .tab-buttons {
            display: flex;
            gap: 5px;
            margin-bottom: 15px;
        }
        .tab-btn {
            flex: 1;
            padding: 8px;
            border: none;
            background: rgba(15, 23, 42, 0.6);
            color: #94a3b8;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
        }
        .tab-btn.active {
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            color: white;
        }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .legend {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            margin-top: 10px;
            font-size: 11px;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .legend-color {
            width: 12px;
            height: 12px;
            border-radius: 3px;
        }
        .legend-color.seq { background: #f59e0b; }
        .legend-color.ack { background: #10b981; }
        .legend-color.tx { background: #3b82f6; }
        .legend-color.rx { background: #10b981; }
    </style>
</head>
<body>
    <div class="container">
        <h1>User TCP/IP Stack Analyzer</h1>
        <p class="subtitle">VIRTIO Net | Ethernet | ARP | IPv4 | ICMP | TCP</p>

        <div class="status-bar">
            <div class="status-item">
                <div class="status-label">MAC Address</div>
                <div class="status-value" id="macAddr">52:54:00:12:34:56</div>
            </div>
            <div class="status-item">
                <div class="status-label">IP Address</div>
                <div class="status-value" id="ipAddr">192.168.1.100</div>
            </div>
            <div class="status-item">
                <div class="status-label">RX Packets</div>
                <div class="status-value" id="rxCount">0</div>
            </div>
            <div class="status-item">
                <div class="status-label">TX Packets</div>
                <div class="status-value" id="txCount">0</div>
            </div>
            <div class="status-item">
                <div class="status-label">TCP State</div>
                <div class="status-value" id="tcpState"><span class="connection-state state-CLOSED">CLOSED</span></div>
            </div>
        </div>

        <div class="grid">
            <div class="panel">
                <h2>Control Panel</h2>
                <div class="control-group">
                    <label>Target IP</label>
                    <input type="text" id="targetIp" value="192.168.1.1" placeholder="e.g. 192.168.1.1">
                </div>
                <div class="control-group">
                    <label>Ping Test</label>
                    <div class="btn-row">
                        <button class="btn success" onclick="sendPing()">Ping</button>
                        <button class="btn" onclick="sendMultiplePings()">Ping x5</button>
                    </div>
                </div>
                <div class="control-group">
                    <label>TCP Connection Test</label>
                    <div style="display: flex; gap: 10px;">
                        <div style="flex: 1;">
                            <label style="font-size: 11px;">Dst Port</label>
                            <input type="number" id="targetPort" value="8080">
                        </div>
                        <div style="flex: 1;">
                            <label style="font-size: 11px;">Src Port</label>
                            <input type="number" id="localPort" value="12345">
                        </div>
                    </div>
                </div>
                <div class="control-group">
                    <div class="btn-row">
                        <button class="btn" onclick="tcpConnect()">Connect</button>
                        <button class="btn" onclick="tcpListen()">Listen</button>
                        <button class="btn danger" onclick="clearAll()">Clear</button>
                    </div>
                </div>

                <div class="control-group">
                    <label>Zero Window Test</label>
                    <button class="btn" onclick="simulateZeroWindow()" style="background: linear-gradient(135deg, #f59e0b, #d97706);">Simulate Zero Window</button>
                    <p style="color: #94a3b8; font-size: 11px; margin-top: 5px;">
                        Simulates peer advertising zero window. The stack will send 1-byte probes every 500ms.
                    </p>
                </div>

                <div class="control-group">
                    <label>Keep-Alive Test</label>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn" onclick="toggleKeepAlive(true)" style="background: linear-gradient(135deg, #10b981, #059669);">Enable Keep-Alive</button>
                        <button class="btn" onclick="toggleKeepAlive(false)" style="background: linear-gradient(135deg, #ef4444, #dc2626);">Disable Keep-Alive</button>
                    </div>
                    <p style="color: #94a3b8; font-size: 11px; margin-top: 5px;">
                        After 2s idle, sends keep-alive probes every 1s. Connection closes after 9 failed probes.
                    </p>
                    <div id="keepAliveStatus" style="color: #10b981; font-size: 12px; margin-top: 5px; display: none;"></div>
                </div>

                <div class="control-group">
                    <label>PCAP Capture</label>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn" onclick="downloadPcap()" style="background: linear-gradient(135deg, #3b82f6, #2563eb);">Download PCAP</button>
                        <button class="btn" onclick="clearPcap()" style="background: linear-gradient(135deg, #6366f1, #4f46e5);">Clear Buffer</button>
                    </div>
                    <p style="color: #94a3b8; font-size: 11px; margin-top: 5px;">
                        Captures all packets (Ethernet frames). Download as .pcap file for Wireshark analysis.
                    </p>
                    <div id="pcapStatus" style="color: #60a5fa; font-size: 12px; margin-top: 5px;"></div>
                </div>

                <h2 style="margin-top: 25px;">Real-time SEQ/ACK</h2>
                <div class="seq-ack-container" id="seqAckContainer">
                    <div class="seq-side-label left">Client</div>
                    <div class="seq-side-label right">Server</div>
                    <div class="seq-axis"></div>
                    <div class="seq-marker" id="seqMarker" style="left: 50%;"></div>
                    <div class="seq-label" id="seqLabel" style="left: 50%;">SEQ: 0</div>
                    <div class="seq-marker ack" id="ackMarker" style="left: 50%;"></div>
                    <div class="seq-label" id="ackLabel" style="left: 50%;">ACK: 0</div>
                </div>

                <div class="legend">
                    <div class="legend-item">
                        <div class="legend-color seq"></div>
                        <span>Sequence (SEQ)</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color ack"></div>
                        <span>Acknowledgment (ACK)</span>
                    </div>
                </div>
            </div>

            <div class="panel">
                <h2>Packet List</h2>
                <div class="tab-buttons">
                    <button class="tab-btn active" onclick="switchTab('packets')">All Packets</button>
                    <button class="tab-btn" onclick="switchTab('tcp')">TCP Flow</button>
                    <button class="tab-btn" onclick="switchTab('ping')">Ping Results</button>
                    <button class="tab-btn" onclick="switchTab('handshake')">Handshake</button>
                </div>

                <div id="tab-packets" class="tab-content active">
                    <div class="packets-list" id="packetsList"></div>
                </div>

                <div id="tab-tcp" class="tab-content">
                    <div id="tcpFlow" style="font-family: monospace; font-size: 12px; line-height: 1.8;">
                        <div style="color: #64748b; text-align: center; padding: 20px;">No TCP flow data yet</div>
                    </div>
                </div>

                <div id="tab-ping" class="tab-content">
                    <div id="pingResults"></div>
                </div>

                <div id="tab-handshake" class="tab-content">
                    <div class="handshake-diagram">
                        <div class="handshake-endpoint">
                            <div class="endpoint-box client">Client</div>
                            <div class="endpoint-ip" id="clientIp">192.168.1.100</div>
                        </div>
                        <div class="handshake-arrows" id="handshakeArrows">
                            <div style="color: #64748b; text-align: center; padding-top: 40px;">
                                Start TCP connection to see handshake
                            </div>
                        </div>
                        <div class="handshake-endpoint">
                            <div class="endpoint-box server">Server</div>
                            <div class="endpoint-ip" id="serverIp">192.168.1.1</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="panel">
                <h2>Details</h2>
                <div id="packetDetails">
                    <div style="color: #64748b; text-align: center; padding: 40px;">
                        Click a packet to see details
                    </div>
                </div>

                <h2 style="margin-top: 25px;">SEQ/ACK Graph</h2>
                <div class="seq-graph">
                    <canvas class="seq-graph-canvas" id="seqGraph"></canvas>
                </div>

                <h2 style="margin-top: 25px;">Connection Info</h2>
                <div class="detail-view" id="connectionInfo">
                    <div class="field"><span class="field-name">State:</span><span class="field-value" id="connState">CLOSED</span></div>
                    <div class="field"><span class="field-name">Local IP:</span><span class="field-value" id="connLocalIp">-</span></div>
                    <div class="field"><span class="field-name">Local Port:</span><span class="field-value" id="connLocalPort">-</span></div>
                    <div class="field"><span class="field-name">Remote IP:</span><span class="field-value" id="connRemoteIp">-</span></div>
                    <div class="field"><span class="field-name">Remote Port:</span><span class="field-value" id="connRemotePort">-</span></div>
                    <div class="field"><span class="field-name">SND.NXT:</span><span class="field-value" id="connSndNxt">-</span></div>
                    <div class="field"><span class="field-name">RCV.NXT:</span><span class="field-value" id="connRcvNxt">-</span></div>
                    <div class="field"><span class="field-name">SND.UNA:</span><span class="field-value" id="connSndUna">-</span></div>
                    <div class="field"><span class="field-name">SND.WND:</span><span class="field-value" id="connSndWnd">-</span></div>
                    <div class="field"><span class="field-name">RCV.WND:</span><span class="field-value" id="connRcvWnd">-</span></div>
                </div>
            </div>
        </div>
    </div>

    <script>
        var ws;
        var rxCount = 0;
        var txCount = 0;
        var currentSeq = 0;
        var currentAck = 0;
        var maxSeq = 1000;
        var seqHistory = [];
        var handshakeStep = 0;
        var tcpSegments = [];

        function connectWebSocket() {
            ws = new WebSocket('ws://' + location.host + '/ws');
            ws.onopen = function() {
                console.log('WebSocket connected');
            };
            ws.onmessage = function(event) {
                try {
                    var data = JSON.parse(event.data);
                    handleEvent(data);
                } catch(e) {
                    console.error('Parse error:', e);
                }
            };
            ws.onclose = function() {
                console.log('WebSocket disconnected, reconnecting in 3s...');
                setTimeout(connectWebSocket, 3000);
            };
        }

        function handleEvent(data) {
            if (data.type === 'packet_rx' || data.type === 'packet_tx') {
                addPacket(data);
                updateCounts(data.type);
            } else if (data.type === 'tcp_segment') {
                handleTcpSegment(data);
            } else if (data.type === 'tcp_state_change') {
                handleTcpStateChange(data);
            } else if (data.type === 'ping_result') {
                handlePingResult(data);
            } else if (data.type === 'zero_window_simulated') {
                handleZeroWindowSimulated(data);
            } else if (data.type === 'keep_alive_toggled') {
                handleKeepAliveToggled(data);
            } else if (data.type === 'pcap_data') {
                handlePcapData(data);
            } else if (data.type === 'pcap_cleared') {
                handlePcapCleared(data);
            }
        }

        function updateCounts(type) {
            if (type === 'packet_rx') {
                rxCount++;
                document.getElementById('rxCount').textContent = rxCount;
            } else if (type === 'packet_tx') {
                txCount++;
                document.getElementById('txCount').textContent = txCount;
            }
        }

        function getTime() {
            var now = new Date();
            return now.toLocaleTimeString('en-US', { hour12: false }) + '.' +
                   String(now.getMilliseconds()).padStart(3, '0');
        }

        function addPacket(pkt) {
            var list = document.getElementById('packetsList');
            var item = document.createElement('div');
            item.className = 'packet-item ' + pkt.direction;

            var protoClass = 'proto-' + pkt.proto;
            var direction = pkt.direction === 'tx' ? '->' : '<-';

            item.innerHTML = '<div class="packet-time">' + getTime() + ' ' + direction + '</div>' +
                '<div><span class="packet-proto ' + protoClass + '">' + pkt.proto + '</span> ' + pkt.info + '</div>' +
                (pkt.details ? '<div class="packet-info">' + pkt.details + '</div>' : '') +
                '<div class="hex-dump">' + (pkt.hex_dump || '') + '</div>';

            item.onclick = function() {
                var hex = item.querySelector('.hex-dump');
                hex.classList.toggle('open');
                showPacketDetails(pkt);
            };

            list.insertBefore(item, list.firstChild);
            if (list.children.length > 100) {
                list.removeChild(list.lastChild);
            }
        }

        function showPacketDetails(pkt) {
            var details = document.getElementById('packetDetails');
            var html = '<div class="field"><span class="field-name">Direction:</span><span class="field-value">' +
                (pkt.direction === 'tx' ? 'Transmit (TX)' : 'Receive (RX)') + '</span></div>' +
                '<div class="field"><span class="field-name">Protocol:</span><span class="field-value">' + pkt.proto + '</span></div>' +
                '<div class="field"><span class="field-name">Info:</span><span class="field-value">' + pkt.info + '</span></div>';

            if (pkt.details) {
                var lines = pkt.details.split('\n');
                lines.forEach(function(line) {
                    var parts = line.split(':');
                    if (parts.length >= 2) {
                        html += '<div class="field"><span class="field-name">' + parts[0].trim() + ':</span>' +
                            '<span class="field-value">' + parts.slice(1).join(':').trim() + '</span></div>';
                    }
                });
            }

            if (pkt.hex_dump) {
                html += '<div class="hex-dump open" style="display: block; margin-top: 15px;">' + pkt.hex_dump + '</div>';
            }

            details.innerHTML = html;
        }

        function handleTcpSegment(data) {
            tcpSegments.push(data);

            if (data.is_keep_alive) {
                var results = document.getElementById('pingResults');
                var item = document.createElement('div');
                item.className = 'ping-result';
                item.innerHTML = '<span style="color: #64748b; font-size: 11px;">' + getTime() + '</span> ' +
                    '<span style="color: #8b5cf6;">❤ Keep-Alive Probe ' + data.keep_alive_probe + '/' + data.keep_alive_max_probes +
                    ' sent (SEQ=' + data.seq + ', ACK=' + data.ack + ')</span>';
                results.insertBefore(item, results.firstChild);
            }

            if (data.direction === 'tx') {
                currentSeq = data.seq;
            }
            if (data.direction === 'rx' || data.flags.indexOf('ACK') !== -1) {
                currentAck = data.ack;
            }

            updateSeqAckMarkers();
            updateSeqGraph(data);
            updateTcpFlow(data);
            updateConnectionInfo(data);

            if (data.flags.indexOf('SYN') !== -1 && data.flags.indexOf('ACK') === -1) {
                handshakeStep = 1;
                updateHandshakeDiagram(data);
            } else if (data.flags.indexOf('SYN') !== -1 && data.flags.indexOf('ACK') !== -1) {
                handshakeStep = 2;
                updateHandshakeDiagram(data);
            } else if (data.flags.indexOf('ACK') !== -1 && handshakeStep === 2) {
                handshakeStep = 3;
                updateHandshakeDiagram(data);
            }
        }

        function updateSeqAckMarkers() {
            var seqPos = Math.min(90, Math.max(10, (currentSeq % maxSeq) / maxSeq * 80 + 10));
            var ackPos = Math.min(90, Math.max(10, (currentAck % maxSeq) / maxSeq * 80 + 10));

            document.getElementById('seqMarker').style.left = seqPos + '%';
            document.getElementById('ackMarker').style.left = ackPos + '%';
            document.getElementById('seqLabel').style.left = seqPos + '%';
            document.getElementById('ackLabel').style.left = ackPos + '%';
            document.getElementById('seqLabel').textContent = 'SEQ: ' + currentSeq;
            document.getElementById('ackLabel').textContent = 'ACK: ' + currentAck;
        }

        function updateSeqGraph(data) {
            seqHistory.push({ time: Date.now(), seq: data.seq, ack: data.ack, dir: data.direction });
            if (seqHistory.length > 50) seqHistory.shift();

            var canvas = document.getElementById('seqGraph');
            var ctx = canvas.getContext('2d');
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (seqHistory.length < 2) return;

            var maxVal = Math.max.apply(null, seqHistory.map(function(d) { return Math.max(d.seq, d.ack); })) || 1;
            var minVal = Math.min.apply(null, seqHistory.map(function(d) { return Math.min(d.seq, d.ack); })) || 0;
            var range = Math.max(1, maxVal - minVal);

            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            seqHistory.forEach(function(d, i) {
                var x = (i / (seqHistory.length - 1)) * canvas.width;
                var y = canvas.height - ((d.seq - minVal) / range) * (canvas.height - 20) - 10;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();

            ctx.strokeStyle = '#10b981';
            ctx.beginPath();
            seqHistory.forEach(function(d, i) {
                var x = (i / (seqHistory.length - 1)) * canvas.width;
                var y = canvas.height - ((d.ack - minVal) / range) * (canvas.height - 20) - 10;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();

            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px monospace';
            ctx.fillText('SEQ', 5, 15);
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(35, 8, 15, 3);
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('ACK', 60, 15);
            ctx.fillStyle = '#10b981';
            ctx.fillRect(90, 8, 15, 3);
        }

        function updateTcpFlow(data) {
            var flow = document.getElementById('tcpFlow');
            var direction = data.direction === 'tx' ? '->' : '<-';
            var color = data.direction === 'tx' ? '#3b82f6' : '#10b981';

            var line = document.createElement('div');
            line.style.cssText = 'padding: 4px 8px; margin: 2px 0; border-radius: 4px; ' +
                'background: rgba(' + (data.direction === 'tx' ? '59, 130, 246' : '16, 185, 129') + ', 0.1); ' +
                'border-left: 3px solid ' + color + ';';
            line.innerHTML = '<span style="color: ' + color + ';">' + direction + '</span> ' +
                '<span style="color: #fbbf24;">[' + data.flags.trim() + ']</span> ' +
                '<span style="color: #94a3b8;">' + data.src_port + ' -> ' + data.dst_port + '</span> ' +
                'SEQ=<span style="color: #f59e0b;">' + data.seq + '</span> ' +
                'ACK=<span style="color: #10b981;">' + data.ack + '</span> ' +
                'WIN=' + data.window;

            if (flow.querySelector('div')) {
                flow.appendChild(line);
            } else {
                flow.innerHTML = '';
                flow.appendChild(line);
            }
            flow.scrollTop = flow.scrollHeight;
        }

        function updateConnectionInfo(data) {
            document.getElementById('connState').textContent = data.state;
            document.getElementById('connLocalIp').textContent = document.getElementById('ipAddr').textContent;
            document.getElementById('connLocalPort').textContent = data.direction === 'tx' ? data.src_port : data.dst_port;
            document.getElementById('connRemoteIp').textContent = document.getElementById('targetIp').value;
            document.getElementById('connRemotePort').textContent = data.direction === 'tx' ? data.dst_port : data.src_port;
            document.getElementById('connSndNxt').textContent = data.seq;
            document.getElementById('connRcvNxt').textContent = data.ack;
            document.getElementById('connSndUna').textContent = data.snd_una !== undefined ? data.snd_una : '-';
            document.getElementById('connSndWnd').textContent = data.window;
            document.getElementById('connRcvWnd').textContent = '65535';
        }

        function handleTcpStateChange(data) {
            var stateEl = document.getElementById('tcpState');
            stateEl.innerHTML = '<span class="connection-state state-' + data.new_state + '">' + data.new_state + '</span>';
            document.getElementById('connState').textContent = data.new_state;

            if (data.new_state === 'CLOSED') {
                document.getElementById('connSndNxt').textContent = '-';
                document.getElementById('connRcvNxt').textContent = '-';

                if (data.reason === 'keep_alive_timeout') {
                    var results = document.getElementById('pingResults');
                    var item = document.createElement('div');
                    item.className = 'ping-result error';
                    item.innerHTML = '<span style="color: #64748b; font-size: 11px;">' + getTime() + '</span> ' +
                        '<span style="color: #ef4444;">⚠ Connection closed due to Keep-Alive timeout on port ' + data.local_port + '</span>';
                    results.insertBefore(item, results.firstChild);
                }
            }
        }

        function handlePingResult(data) {
            var results = document.getElementById('pingResults');
            var item = document.createElement('div');
            var statusText = '';

            switch(data.status) {
                case 'request_sent':
                    statusText = '-> Ping request sent id=' + data.id + ' seq=' + data.seq;
                    break;
                case 'request_received':
                    statusText = '<- Ping request received id=' + data.id + ' seq=' + data.seq + ' from ' + data.src_ip;
                    break;
                case 'reply_sent':
                    statusText = '-> Ping reply sent id=' + data.id + ' seq=' + data.seq;
                    break;
                case 'reply_received':
                    statusText = '<- Ping reply received id=' + data.id + ' seq=' + data.seq + ' from ' + data.src_ip + ' OK';
                    break;
            }

            item.className = 'ping-result';
            item.innerHTML = '<span style="color: #64748b; font-size: 11px;">' + getTime() + '</span> ' + statusText;
            results.insertBefore(item, results.firstChild);

            if (results.children.length > 20) {
                results.removeChild(results.lastChild);
            }
        }

        function updateHandshakeDiagram(data) {
            var container = document.getElementById('handshakeArrows');
            var targetIp = document.getElementById('targetIp').value;
            var localIp = document.getElementById('ipAddr').textContent;
            var html = '';

            if (handshakeStep >= 1) {
                html += '<div class="handshake-step">' +
                    '<div class="arrow-line" style="animation-delay: 0s;"></div>' +
                    '<div class="arrow-head" style="animation-delay: 0.3s;"></div>' +
                    '<div class="step-label" style="animation-delay: 0.15s;">SYN SEQ=' + (data.seq || '?') + '</div>' +
                    '</div>';
            }
            if (handshakeStep >= 2) {
                html += '<div class="handshake-step server">' +
                    '<div class="arrow-line" style="animation-delay: 0.6s;"></div>' +
                    '<div class="arrow-head" style="animation-delay: 0.9s;"></div>' +
                    '<div class="step-label" style="animation-delay: 0.75s;">SYN+ACK SEQ=' + (data.seq || '?') + ' ACK=' + (data.ack || '?') + '</div>' +
                    '</div>';
            }
            if (handshakeStep >= 3) {
                html += '<div class="handshake-step">' +
                    '<div class="arrow-line" style="animation-delay: 1.2s;"></div>' +
                    '<div class="arrow-head" style="animation-delay: 1.5s;"></div>' +
                    '<div class="step-label" style="animation-delay: 1.35s;">ACK SEQ=' + (data.seq || '?') + ' ACK=' + (data.ack || '?') + '</div>' +
                    '</div>';
                html += '<div style="text-align: center; color: #10b981; margin-top: 20px; font-size: 14px; ' +
                    'animation: appear 0.3s ease 1.8s forwards; opacity: 0;">Connection Established (ESTABLISHED)</div>';
            }

            container.innerHTML = html;
            document.getElementById('serverIp').textContent = targetIp;
            document.getElementById('clientIp').textContent = localIp;
        }

        function sendPing() {
            var targetIp = document.getElementById('targetIp').value;
            var msg = JSON.stringify({ action: 'ping', ip: targetIp });
            ws.send(msg);
        }

        function sendMultiplePings() {
            var targetIp = document.getElementById('targetIp').value;
            for (var i = 1; i <= 5; i++) {
                (function(seqNum) {
                    setTimeout(function() {
                        var msg = JSON.stringify({ action: 'ping', ip: targetIp, id: 1, seq: seqNum });
                        ws.send(msg);
                    }, seqNum * 500);
                })(i);
            }
        }

        function tcpConnect() {
            var targetIp = document.getElementById('targetIp').value;
            var targetPort = parseInt(document.getElementById('targetPort').value);
            var localPort = parseInt(document.getElementById('localPort').value);
            var msg = JSON.stringify({ action: 'tcp_connect', ip: targetIp, dst_port: targetPort, src_port: localPort });
            ws.send(msg);
            handshakeStep = 0;
            document.getElementById('handshakeArrows').innerHTML =
                '<div style="color: #94a3b8; text-align: center; padding-top: 40px;">Handshake in progress...</div>';
        }

        function tcpListen() {
            var localPort = parseInt(document.getElementById('localPort').value);
            var msg = JSON.stringify({ action: 'tcp_listen', port: localPort });
            ws.send(msg);
        }

        function simulateZeroWindow() {
            var localPort = parseInt(document.getElementById('localPort').value);
            var msg = JSON.stringify({ action: 'simulate_zero_window', port: localPort });
            ws.send(msg);
        }

        function handleZeroWindowSimulated(data) {
            var results = document.getElementById('pingResults');
            var item = document.createElement('div');
            item.className = 'ping-result';
            item.innerHTML = '<span style="color: #64748b; font-size: 11px;">' + getTime() + '</span> ' +
                '<span style="color: #f59e0b;">⚠ Zero window simulated on port ' + data.local_port +
                '. Probes will be sent every 500ms.</span>';
            results.insertBefore(item, results.firstChild);

            document.getElementById('connSndWnd').textContent = '0';
        }

        function toggleKeepAlive(enabled) {
            var localPort = parseInt(document.getElementById('localPort').value);
            var msg = JSON.stringify({ action: 'toggle_keep_alive', port: localPort, enabled: enabled });
            ws.send(msg);
        }

        function handleKeepAliveToggled(data) {
            var status = document.getElementById('keepAliveStatus');
            status.style.display = 'block';
            if (data.enabled) {
                status.textContent = '✓ Keep-Alive enabled on port ' + data.local_port;
                status.style.color = '#10b981';
            } else {
                status.textContent = '✗ Keep-Alive disabled on port ' + data.local_port;
                status.style.color = '#ef4444';
            }

            var results = document.getElementById('pingResults');
            var item = document.createElement('div');
            item.className = 'ping-result';
            item.innerHTML = '<span style="color: #64748b; font-size: 11px;">' + getTime() + '</span> ' +
                '<span style="color: ' + (data.enabled ? '#10b981' : '#ef4444') + ';">' +
                (data.enabled ? '✓' : '✗') + ' Keep-Alive ' + (data.enabled ? 'enabled' : 'disabled') +
                ' on port ' + data.local_port + '</span>';
            results.insertBefore(item, results.firstChild);
        }

        function downloadPcap() {
            var msg = JSON.stringify({ action: 'get_pcap' });
            ws.send(msg);
            document.getElementById('pcapStatus').textContent = 'Downloading PCAP...';
        }

        function clearPcap() {
            var msg = JSON.stringify({ action: 'clear_pcap' });
            ws.send(msg);
        }

        function handlePcapData(data) {
            var byteCharacters = atob(data.data);
            var byteNumbers = new Array(byteCharacters.length);
            for (var i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            var byteArray = new Uint8Array(byteNumbers);
            var blob = new Blob([byteArray], { type: 'application/vnd.tcpdump.pcap' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'capture_' + new Date().toISOString().replace(/[:.]/g, '-') + '.pcap';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            document.getElementById('pcapStatus').textContent = '✓ Downloaded ' + formatBytes(data.size);
            setTimeout(function() {
                document.getElementById('pcapStatus').textContent = '';
            }, 3000);
        }

        function handlePcapCleared() {
            document.getElementById('pcapStatus').textContent = '✓ Buffer cleared';
            setTimeout(function() {
                document.getElementById('pcapStatus').textContent = '';
            }, 2000);
        }

        function formatBytes(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
            return (bytes / 1048576).toFixed(2) + ' MB';
        }

        function clearAll() {
            document.getElementById('packetsList').innerHTML = '';
            document.getElementById('pingResults').innerHTML = '';
            document.getElementById('tcpFlow').innerHTML =
                '<div style="color: #64748b; text-align: center; padding: 20px;">No TCP flow data yet</div>';
            document.getElementById('packetDetails').innerHTML =
                '<div style="color: #64748b; text-align: center; padding: 40px;">Click a packet to see details</div>';
            document.getElementById('handshakeArrows').innerHTML =
                '<div style="color: #64748b; text-align: center; padding-top: 40px;">Start TCP connection to see handshake</div>';
            rxCount = 0;
            txCount = 0;
            document.getElementById('rxCount').textContent = '0';
            document.getElementById('txCount').textContent = '0';
            seqHistory = [];
            tcpSegments = [];
            handshakeStep = 0;
            currentSeq = 0;
            currentAck = 0;
            updateSeqAckMarkers();
        }

        function switchTab(tabName) {
            var buttons = document.querySelectorAll('.tab-btn');
            var contents = document.querySelectorAll('.tab-content');
            buttons.forEach(function(b) { b.classList.remove('active'); });
            contents.forEach(function(c) { c.classList.remove('active'); });
            event.target.classList.add('active');
            document.getElementById('tab-' + tabName).classList.add('active');
        }

        window.onload = function() {
            connectWebSocket();
            updateSeqAckMarkers();
            updateSeqGraph({ seq: 0, ack: 0, direction: 'tx' });
        };

        window.onresize = function() {
            if (seqHistory.length > 0) {
                updateSeqGraph(seqHistory[seqHistory.length - 1]);
            }
        };
    </script>
</body>
</html>)HTML";
