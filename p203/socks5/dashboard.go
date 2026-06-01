package socks5

const dashboardHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SOCKS5 Proxy Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0a0e17;--card:#111827;--border:#1e293b;--accent:#06b6d4;--accent2:#8b5cf6;--text:#e2e8f0;--muted:#64748b;--success:#10b981;--warn:#f59e0b}
body{font-family:'SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
.container{max-width:1200px;margin:0 auto;padding:2rem}
header{display:flex;align-items:center;justify-content:space-between;margin-bottom:2.5rem;padding-bottom:1.5rem;border-bottom:1px solid var(--border)}
header h1{font-size:1.75rem;font-weight:700;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.status{display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;color:var(--muted)}
.status-dot{width:8px;height:8px;border-radius:50%;background:var(--success);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.25rem;margin-bottom:2rem}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:1.5rem;position:relative;overflow:hidden;transition:transform .2s,border-color .2s}
.card:hover{transform:translateY(-2px);border-color:var(--accent)}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--accent),var(--accent2));opacity:0;transition:opacity .2s}
.card:hover::before{opacity:1}
.card-label{font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:0.5rem}
.card-value{font-size:2rem;font-weight:700;font-variant-numeric:tabular-nums}
.card-sub{font-size:0.75rem;color:var(--muted);margin-top:0.25rem}
.accent-cyan .card-value{color:var(--accent)}
.accent-purple .card-value{color:var(--accent2)}
.accent-green .card-value{color:var(--success)}
.accent-amber .card-value{color:var(--warn)}
.section{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:1.5rem;margin-bottom:1.5rem}
.section h2{font-size:1rem;font-weight:600;margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem}
.section h2::before{content:'';width:3px;height:1rem;background:var(--accent);border-radius:2px}
.bar-container{display:flex;flex-direction:column;gap:0.75rem}
.bar-row{display:flex;align-items:center;gap:1rem}
.bar-label{width:120px;font-size:0.8rem;color:var(--muted);flex-shrink:0}
.bar-track{flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden}
.bar-fill{height:100%;border-radius:4px;transition:width .5s ease}
.bar-fill.tcp{background:linear-gradient(90deg,var(--accent),var(--accent2))}
.bar-fill.udp{background:linear-gradient(90deg,var(--success),var(--warn))}
.bar-value{width:80px;text-align:right;font-size:0.8rem;font-variant-numeric:tabular-nums;color:var(--text);flex-shrink:0}
footer{text-align:center;padding:2rem 0;color:var(--muted);font-size:0.75rem}
</style>
</head>
<body>
<div class="container">
<header>
<h1>SOCKS5 Proxy</h1>
<div class="status"><span class="status-dot"></span> Running</div>
</header>
<div class="grid">
<div class="card accent-cyan">
<div class="card-label">Active Connections</div>
<div class="card-value" id="active">0</div>
<div class="card-sub">Currently active</div>
</div>
<div class="card accent-purple">
<div class="card-label">Total Connections</div>
<div class="card-value" id="total">0</div>
<div class="card-sub">Since startup</div>
</div>
<div class="card accent-green">
<div class="card-label">Bytes Sent</div>
<div class="card-value" id="sent">0 B</div>
<div class="card-sub">TCP + UDP</div>
</div>
<div class="card accent-amber">
<div class="card-label">Bytes Received</div>
<div class="card-value" id="recv">0 B</div>
<div class="card-sub">TCP + UDP</div>
</div>
</div>
<div class="section">
<h2>Connection Breakdown</h2>
<div class="bar-container">
<div class="bar-row">
<span class="bar-label">TCP</span>
<div class="bar-track"><div class="bar-fill tcp" id="tcp-bar" style="width:0%"></div></div>
<span class="bar-value" id="tcp-val">0</span>
</div>
<div class="bar-row">
<span class="bar-label">UDP</span>
<div class="bar-track"><div class="bar-fill udp" id="udp-bar" style="width:0%"></div></div>
<span class="bar-value" id="udp-val">0</span>
</div>
</div>
</div>
<div class="section">
<h2>Traffic Detail</h2>
<div class="grid" style="margin-bottom:0">
<div class="card accent-green" style="background:transparent;border-color:var(--border)">
<div class="card-label">TCP Sent</div>
<div class="card-value" id="tcp-sent" style="font-size:1.25rem">0 B</div>
</div>
<div class="card accent-amber" style="background:transparent;border-color:var(--border)">
<div class="card-label">TCP Received</div>
<div class="card-value" id="tcp-recv" style="font-size:1.25rem">0 B</div>
</div>
<div class="card accent-green" style="background:transparent;border-color:var(--border)">
<div class="card-label">UDP Sent</div>
<div class="card-value" id="udp-sent" style="font-size:1.25rem">0 B</div>
</div>
<div class="card accent-amber" style="background:transparent;border-color:var(--border)">
<div class="card-label">UDP Received</div>
<div class="card-value" id="udp-recv" style="font-size:1.25rem">0 B</div>
</div>
</div>
</div>
<footer>SOCKS5 Proxy Dashboard &middot; Real-time Stats</footer>
</div>
<script>
function fmt(b){if(b===0)return'0 B';const u=['B','KB','MB','GB','TB'];const i=Math.floor(Math.log(b)/Math.log(1024));return(b/Math.pow(1024,i)).toFixed(1)+' '+u[i]}
async function refresh(){try{const r=await fetch('/api/stats');const d=await r.json();document.getElementById('active').textContent=d.active_connections;document.getElementById('total').textContent=d.total_connections;const sent=d.bytes_sent+d.udp_bytes_sent;const recv=d.bytes_received+d.udp_bytes_received;document.getElementById('sent').textContent=fmt(sent);document.getElementById('recv').textContent=fmt(recv);const total=d.tcp_connections+d.udp_connections;const tcpP=total>0?(d.tcp_connections/total*100):0;const udpP=total>0?(d.udp_connections/total*100):0;document.getElementById('tcp-bar').style.width=tcpP+'%';document.getElementById('udp-bar').style.width=udpP+'%';document.getElementById('tcp-val').textContent=d.tcp_connections;document.getElementById('udp-val').textContent=d.udp_connections;document.getElementById('tcp-sent').textContent=fmt(d.bytes_sent);document.getElementById('tcp-recv').textContent=fmt(d.bytes_received);document.getElementById('udp-sent').textContent=fmt(d.udp_bytes_sent);document.getElementById('udp-recv').textContent=fmt(d.udp_bytes_received)}catch(e){console.error(e)}}
refresh();setInterval(refresh,2000);
</script>
</body>
</html>`
