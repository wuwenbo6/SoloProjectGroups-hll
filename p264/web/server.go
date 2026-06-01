package web

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"stun-bench/stats"
)

type Server struct {
	Collector *stats.Collector
	Hub       *Hub
	Interval  time.Duration
}

func (s *Server) HandleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.Hub.Register(conn)

	go func() {
		defer func() {
			s.Hub.Unregister(conn)
			conn.Close()
		}()
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				break
			}
		}
	}()
}

func (s *Server) HandleStatsAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	snap := s.Collector.Snapshot()
	json.NewEncoder(w).Encode(snap)
}

func (s *Server) HandleHistogramAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	hist := s.Collector.Histogram()
	json.NewEncoder(w).Encode(hist)
}

func (s *Server) HandleStart(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "running"})
}

func (s *Server) HandleStop(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "stopped"})
}

func (s *Server) StatsLoop(ctx context.Context) {
	ticker := time.NewTicker(s.Interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			snap := s.Collector.Snapshot()
			data, err := json.Marshal(snap)
			if err != nil {
				continue
			}
			s.Hub.Broadcast(data)
		}
	}
}

func (s *Server) HandleDashboard(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(dashboardHTML))
}

var dashboardHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>STUN Bench - Real-time Dashboard</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0e17;--surface:#111827;--border:#1e293b;
  --text:#e2e8f0;--muted:#64748b;--accent:#06d6a0;
  --accent2:#118ab2;--error:#ef476f;--warning:#ffd166;
  --card-radius:12px;
}
html,body{height:100%;font-family:'JetBrains Mono','Fira Code',monospace;background:var(--bg);color:var(--text);overflow-x:hidden}
body{padding:24px;max-width:1440px;margin:0 auto}

.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid var(--border)}
.header h1{font-size:1.5rem;font-weight:700;letter-spacing:-0.5px;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.header .status{display:flex;align-items:center;gap:8px;font-size:.8rem;color:var(--muted)}
.header .status .dot{width:8px;height:8px;border-radius:50%;background:var(--accent);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}

.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:24px}
.metric-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--card-radius);padding:20px;position:relative;overflow:hidden}
.metric-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--accent),transparent)}
.metric-card.error::before{background:linear-gradient(90deg,var(--error),transparent)}
.metric-card.warn::before{background:linear-gradient(90deg,var(--warning),transparent)}
.metric-card.info::before{background:linear-gradient(90deg,var(--accent2),transparent)}
.metric-label{font-size:.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.metric-value{font-size:1.8rem;font-weight:700}
.metric-value.accent{color:var(--accent)}
.metric-value.error{color:var(--error)}
.metric-value.warn{color:var(--warning)}
.metric-value.info{color:var(--accent2)}

.charts{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
.chart-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--card-radius);padding:20px}
.chart-card h3{font-size:.85rem;color:var(--muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px}
.chart-container{position:relative;height:260px}
canvas{width:100%!important;height:100%!important}

.latency-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.lat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--card-radius);padding:16px;text-align:center}
.lat-card .lat-label{font-size:.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.lat-card .lat-value{font-size:1.4rem;font-weight:700;color:var(--accent)}
.lat-card .lat-unit{font-size:.7rem;color:var(--muted);margin-left:2px}

.bottom-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.summary-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--card-radius);padding:20px}
.summary-card h3{font-size:.85rem;color:var(--muted);margin-bottom:16px;text-transform:uppercase;letter-spacing:.5px}
.summary-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)}
.summary-row:last-child{border-bottom:none}
.summary-row .s-label{color:var(--muted);font-size:.8rem}
.summary-row .s-value{font-weight:600;font-size:.9rem}

.connecting-overlay{position:fixed;inset:0;background:rgba(10,14,23,.9);display:flex;align-items:center;justify-content:center;z-index:100;flex-direction:column;gap:16px}
.connecting-overlay.hidden{display:none}
.spinner{width:40px;height:40px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

@media(max-width:900px){
  .metrics{grid-template-columns:repeat(2,1fr)}
  .charts{grid-template-columns:1fr}
  .latency-row{grid-template-columns:repeat(2,1fr)}
  .bottom-row{grid-template-columns:1fr}
  .histogram-row{grid-template-columns:1fr}
}
</style>
</head>
<body>

<div class="connecting-overlay" id="overlay">
  <div class="spinner"></div>
  <div style="color:var(--muted);font-size:.85rem">Connecting to STUN Bench...</div>
</div>

<div class="header">
  <h1>⚡ STUN Bench</h1>
  <div class="status"><span class="dot"></span> Live Dashboard</div>
</div>

<div class="metrics">
  <div class="metric-card">
    <div class="metric-label">Current QPS</div>
    <div class="metric-value accent" id="qps">0</div>
  </div>
  <div class="metric-card warn">
    <div class="metric-label">Conn Rate</div>
    <div class="metric-value warn" id="conn-rate">0/s</div>
  </div>
  <div class="metric-card info">
    <div class="metric-label">Active Clients</div>
    <div class="metric-value info" id="clients">0</div>
  </div>
  <div class="metric-card">
    <div class="metric-label">Success Rate</div>
    <div class="metric-value accent" id="success-rate">0%</div>
  </div>
  <div class="metric-card error">
    <div class="metric-label">Error Rate</div>
    <div class="metric-value error" id="error-rate">0%</div>
  </div>
</div>

<div class="charts">
  <div class="chart-card">
    <h3>QPS Over Time</h3>
    <div class="chart-container"><canvas id="qpsChart"></canvas></div>
  </div>
  <div class="chart-card">
    <h3>Error Rate Over Time</h3>
    <div class="chart-container"><canvas id="errorChart"></canvas></div>
  </div>
</div>

<div class="latency-row">
  <div class="lat-card"><div class="lat-label">Avg</div><div class="lat-value" id="avg-lat">0<span class="lat-unit">ms</span></div></div>
  <div class="lat-card"><div class="lat-label">P50</div><div class="lat-value" id="p50-lat">0<span class="lat-unit">ms</span></div></div>
  <div class="lat-card"><div class="lat-label">P95</div><div class="lat-value" id="p95-lat">0<span class="lat-unit">ms</span></div></div>
  <div class="lat-card"><div class="lat-label">P99</div><div class="lat-value" id="p99-lat">0<span class="lat-unit">ms</span></div></div>
</div>

<div class="bottom-row">
  <div class="summary-card">
    <h3>Request Summary</h3>
    <div class="summary-row"><span class="s-label">Total Requests</span><span class="s-value" id="total-reqs">0</span></div>
    <div class="summary-row"><span class="s-label">Total Conns</span><span class="s-value" id="total-conns">0</span></div>
    <div class="summary-row"><span class="s-label">Successful</span><span class="s-value" style="color:var(--accent)" id="total-succ">0</span></div>
    <div class="summary-row"><span class="s-label">Failed</span><span class="s-value" style="color:var(--error)" id="total-err">0</span></div>
  </div>
  <div class="summary-card">
    <h3>Latency Snapshot</h3>
    <div class="chart-container" style="height:160px"><canvas id="latChart"></canvas></div>
  </div>
</div>

<div class="histogram-row" style="display:grid;grid-template-columns:1fr;gap:16px;margin-top:24px">
  <div class="chart-card" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--card-radius);padding:20px">
    <h3 style="font-size:.85rem;color:var(--muted);margin-bottom:16px;text-transform:uppercase;letter-spacing:.5px">Latency Distribution Histogram</h3>
    <div class="chart-container" style="height:220px"><canvas id="histChart"></canvas></div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<script>
const MAX_POINTS = 120;
const qpsData = [], errData = [], latData = [], labels = [];

function fmt(n, d) { return n.toFixed(d); }

function makeChart(id, label, borderColor, bgColor, yLabel) {
  return new Chart(document.getElementById(id), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: label,
        data: id === 'qpsChart' ? qpsData : errData,
        borderColor: borderColor,
        backgroundColor: bgColor,
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHitRadius: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      scales: {
        x: { display: false },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#64748b', font: { size: 10 } },
          title: { display: true, text: yLabel, color: '#64748b', font: { size: 10 } }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#1e293b', titleColor: '#e2e8f0', bodyColor: '#e2e8f0', borderColor: '#334155', borderWidth: 1 }
      }
    }
  });
}

function makeLatChart() {
  return new Chart(document.getElementById('latChart'), {
    type: 'bar',
    data: {
      labels: ['Avg', 'P50', 'P95', 'P99'],
      datasets: [{
        data: [0, 0, 0, 0],
        backgroundColor: ['rgba(6,214,160,0.6)', 'rgba(6,214,160,0.5)', 'rgba(17,138,178,0.5)', 'rgba(239,71,111,0.5)'],
        borderColor: ['#06d6a0', '#06d6a0', '#118ab2', '#ef476f'],
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#64748b', font: { size: 10 } },
          title: { display: true, text: 'ms', color: '#64748b', font: { size: 10 } }
        }
      },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e293b', titleColor: '#e2e8f0', bodyColor: '#e2e8f0' } }
    }
  });
}

const qpsChart = makeChart('qpsChart', 'QPS', '#06d6a0', 'rgba(6,214,160,0.1)', 'Requests/sec');
const errChart = makeChart('errorChart', 'Error Rate', '#ef476f', 'rgba(239,71,111,0.1)', 'Error %');
const latChart = makeLatChart();

function makeHistChart() {
  return new Chart(document.getElementById('histChart'), {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Requests',
        data: [],
        backgroundColor: [],
        borderColor: [],
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', font: { size: 9 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#64748b', font: { size: 10 } },
          title: { display: true, text: 'Count', color: '#64748b', font: { size: 10 } }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#e2e8f0',
          bodyColor: '#e2e8f0',
          callbacks: {
            label: function(ctx) {
              const label = ctx.dataset.data[ctx.dataIndex];
              const total = ctx.dataset.data.reduce((a,b)=>a+b,0);
              const pct = total > 0 ? ((label/total)*100).toFixed(1) : 0;
              return 'Count: ' + label.toLocaleString() + ' (' + pct + '%)';
            }
          }
        }
      }
    }
  });
}

const histChart = makeHistChart();

const histColors = [
  {bg: 'rgba(6,214,160,0.7)', bd: '#06d6a0'},
  {bg: 'rgba(6,214,160,0.6)', bd: '#06d6a0'},
  {bg: 'rgba(6,214,160,0.55)', bd: '#06d6a0'},
  {bg: 'rgba(6,214,160,0.5)', bd: '#06d6a0'},
  {bg: 'rgba(6,214,160,0.45)', bd: '#06d6a0'},
  {bg: 'rgba(255,209,102,0.55)', bd: '#ffd166'},
  {bg: 'rgba(255,209,102,0.5)', bd: '#ffd166'},
  {bg: 'rgba(255,209,102,0.45)', bd: '#ffd166'},
  {bg: 'rgba(239,71,111,0.55)', bd: '#ef476f'},
  {bg: 'rgba(239,71,111,0.5)', bd: '#ef476f'},
  {bg: 'rgba(239,71,111,0.45)', bd: '#ef476f'},
  {bg: 'rgba(239,71,111,0.4)', bd: '#ef476f'},
  {bg: 'rgba(123,44,191,0.5)', bd: '#7b2cbf'},
];

function fetchHistogram() {
  fetch('/api/histogram')
    .then(r => r.json())
    .then(d => {
      if (!d.buckets) return;
      const labels = [], data = [], bg = [], bd = [];
      for (let i = 0; i < d.buckets.length; i++) {
        const b = d.buckets[i];
        if (b.count === 0 && i > 2) continue;
        labels.push(b.range);
        data.push(b.count);
        const ci = i < histColors.length ? i : histColors.length-1;
        bg.push(histColors[ci].bg);
        bd.push(histColors[ci].bd);
      }
      histChart.data.labels = labels;
      histChart.data.datasets[0].data = data;
      histChart.data.datasets[0].backgroundColor = bg;
      histChart.data.datasets[0].borderColor = bd;
      histChart.update('none');
    })
    .catch(() => {});
}

let connected = false;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(proto + '//' + location.host + '/ws');

  ws.onopen = () => {
    connected = true;
    document.getElementById('overlay').classList.add('hidden');
  };

  ws.onclose = () => {
    connected = false;
    document.getElementById('overlay').classList.remove('hidden');
    setTimeout(connect, 2000);
  };

  ws.onerror = () => { ws.close(); };

  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    const t = new Date(d.timestamp);
    const label = t.getHours().toString().padStart(2,'0') + ':' + t.getMinutes().toString().padStart(2,'0') + ':' + t.getSeconds().toString().padStart(2,'0');

    labels.push(label);
    qpsData.push(d.qps);
    errData.push(d.error_rate * 100);

    if (labels.length > MAX_POINTS) {
      labels.shift(); qpsData.shift(); errData.shift();
    }

    qpsChart.update('none');
    errChart.update('none');

    latChart.data.datasets[0].data = [d.avg_latency_ms, d.p50_latency_ms, d.p95_latency_ms, d.p99_latency_ms];
    latChart.update('none');

    document.getElementById('qps').textContent = fmt(d.qps, 1);
    document.getElementById('conn-rate').textContent = fmt(d.conn_rate, 1) + '/s';
    document.getElementById('clients').textContent = d.active_clients;
    document.getElementById('success-rate').textContent = fmt(d.success_rate * 100, 1) + '%';
    document.getElementById('error-rate').textContent = fmt(d.error_rate * 100, 1) + '%';

    document.getElementById('avg-lat').innerHTML = fmt(d.avg_latency_ms, 2) + '<span class="lat-unit">ms</span>';
    document.getElementById('p50-lat').innerHTML = fmt(d.p50_latency_ms, 2) + '<span class="lat-unit">ms</span>';
    document.getElementById('p95-lat').innerHTML = fmt(d.p95_latency_ms, 2) + '<span class="lat-unit">ms</span>';
    document.getElementById('p99-lat').innerHTML = fmt(d.p99_latency_ms, 2) + '<span class="lat-unit">ms</span>';

    document.getElementById('total-reqs').textContent = d.total_requests.toLocaleString();
    document.getElementById('total-conns').textContent = d.total_conns.toLocaleString();
    document.getElementById('total-succ').textContent = d.total_success.toLocaleString();
    document.getElementById('total-err').textContent = d.total_errors.toLocaleString();
  };
}

connect();
setInterval(fetchHistogram, 2000);
fetchHistogram();
</script>
</body>
</html>`
