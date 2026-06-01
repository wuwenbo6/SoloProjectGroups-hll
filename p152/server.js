const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const ZooKeeperClient = require('./zookeeperClient');

const app = express();
const PORT = process.env.PORT || 3000;
const WS_PUSH_INTERVAL = parseInt(process.env.WS_PUSH_INTERVAL || '5000');
const HISTORY_WINDOW_SIZE = parseInt(process.env.HISTORY_WINDOW || '100');
const ALERT_BASELINE_THRESHOLD = parseFloat(process.env.ALERT_THRESHOLD || '2.0');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const zkHosts = [
  { host: 'localhost', port: 2181 },
  { host: 'localhost', port: 2182 },
  { host: 'localhost', port: 2183 }
];

const metricsHistory = new Map();
const activeAlerts = new Map();

function getNodeKey(host, port) {
  return `${host}:${port}`;
}

function initNodeHistory(host, port) {
  const key = getNodeKey(host, port);
  if (!metricsHistory.has(key)) {
    metricsHistory.set(key, {
      latency: [],
      outstanding: [],
      connections: [],
      baselines: {
        latencyAvg: 0,
        latencyStd: 0,
        latencyMax: 0,
        outstandingAvg: 0
      }
    });
  }
  return metricsHistory.get(key);
}

function recordMetric(history, metricName, value) {
  if (typeof value !== 'number' || isNaN(value)) return;

  history[metricName].push({
    value,
    timestamp: Date.now()
  });

  if (history[metricName].length > HISTORY_WINDOW_SIZE) {
    history[metricName].shift();
  }
}

function calculateBaselines(history) {
  const latencies = history.latency.map(m => m.value);
  const outstandings = history.outstanding.map(m => m.value);

  if (latencies.length > 0) {
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const varianceLatency = latencies.reduce((a, b) => a + Math.pow(b - avgLatency, 2), 0) / latencies.length;
    history.baselines.latencyAvg = Math.round(avgLatency * 100) / 100;
    history.baselines.latencyStd = Math.round(Math.sqrt(varianceLatency) * 100) / 100;
    history.baselines.latencyMax = Math.max(...latencies);
  }

  if (outstandings.length > 0) {
    history.baselines.outstandingAvg = Math.round(
      outstandings.reduce((a, b) => a + b, 0) / outstandings.length * 100
    ) / 100;
  }

  return history.baselines;
}

function detectAlerts(nodeStatus, history) {
  const alerts = [];
  const baseline = history.baselines;
  const currentLatency = nodeStatus.stat?.latency?.avg;
  const currentOutstanding = nodeStatus.stat?.outstanding;

  if (baseline.latencyAvg > 0 && typeof currentLatency === 'number') {
    const ratio = currentLatency / baseline.latencyAvg;
    if (ratio >= ALERT_BASELINE_THRESHOLD) {
      alerts.push({
        id: 'high_latency',
        level: 'warning',
        title: '延迟过高',
        message: `当前平均延迟 ${currentLatency}ms 超过历史均值 (${baseline.latencyAvg}ms) 的 ${ratio.toFixed(1)} 倍`,
        currentValue: currentLatency,
        baseline: baseline.latencyAvg,
        threshold: ALERT_BASELINE_THRESHOLD,
        ratio
      });
    }
  }

  if (baseline.outstandingAvg > 0 && typeof currentOutstanding === 'number') {
    const ratio = currentOutstanding / baseline.outstandingAvg;
    if (ratio >= ALERT_BASELINE_THRESHOLD && currentOutstanding > 10) {
      alerts.push({
        id: 'high_outstanding',
        level: 'error',
        title: '未处理请求激增',
        message: `当前未处理请求 ${currentOutstanding} 超过历史均值 (${baseline.outstandingAvg}) 的 ${ratio.toFixed(1)} 倍`,
        currentValue: currentOutstanding,
        baseline: baseline.outstandingAvg,
        threshold: ALERT_BASELINE_THRESHOLD,
        ratio
      });
    }
  }

  if (typeof currentLatency === 'number' && currentLatency > 1000) {
    alerts.push({
      id: 'critical_latency',
      level: 'error',
      title: '延迟严重',
      message: `平均延迟 ${currentLatency}ms 超过 1000ms 阈值`,
      currentValue: currentLatency,
      threshold: 1000
    });
  }

  if (typeof currentOutstanding === 'number' && currentOutstanding > 1000) {
    alerts.push({
      id: 'critical_outstanding',
      level: 'error',
      title: '请求积压严重',
      message: `未处理请求 ${currentOutstanding} 超过 1000 阈值`,
      currentValue: currentOutstanding,
      threshold: 1000
    });
  }

  return alerts;
}

async function collectStatus(customNodes = []) {
  const targets = [...zkHosts, ...customNodes];

  const results = await Promise.all(
    targets.map(async (target) => {
      try {
        const client = new ZooKeeperClient(target.host, target.port, 3000);
        const status = await client.getFullStatus();

        const history = initNodeHistory(target.host, target.port);

        if (status.stat && !status.stat.error) {
          if (status.stat.latency) {
            recordMetric(history, 'latency', status.stat.latency.avg);
          }
          if (typeof status.stat.outstanding === 'number') {
            recordMetric(history, 'outstanding', status.stat.outstanding);
          }
          if (typeof status.stat.connections === 'number') {
            recordMetric(history, 'connections', status.stat.connections);
          }
        }

        const baselines = calculateBaselines(history);
        const alerts = status.ruok ? detectAlerts(status, history) : [];

        const nodeKey = getNodeKey(target.host, target.port);
        if (alerts.length > 0) {
          activeAlerts.set(nodeKey, alerts);
        } else {
          activeAlerts.delete(nodeKey);
        }

        const recentTrend = {
          latency: history.latency.slice(-20).map(m => ({ t: m.timestamp, v: m.value })),
          outstanding: history.outstanding.slice(-20).map(m => ({ t: m.timestamp, v: m.value }))
        };

        return {
          ...status,
          baselines,
          alerts,
          recentTrend
        };
      } catch (err) {
        return {
          host: target.host,
          port: target.port,
          timestamp: new Date().toISOString(),
          ruok: false,
          error: err.message,
          stat: null,
          mntr: null,
          enviData: null,
          alerts: [],
          suggestion: {
            type: 'error',
            title: '无法连接到 ZooKeeper',
            description: err.message,
            steps: [
              { title: '检查服务状态', content: '确认 ZooKeeper 服务已启动' },
              { title: '检查网络', content: `确认 ${target.host}:${target.port} 可达` }
            ]
          }
        };
      }
    })
  );

  return {
    success: true,
    data: results,
    timestamp: new Date().toISOString()
  };
}

function formatPrometheusValue(value) {
  if (typeof value !== 'number' || isNaN(value)) return 'NaN';
  return value;
}

function generatePrometheusMetrics(statusData) {
  const lines = [];
  const timestamp = Date.now();

  lines.push('# HELP zookeeper_up ZooKeeper 节点状态 (1=在线, 0=离线)');
  lines.push('# TYPE zookeeper_up gauge');

  lines.push('# HELP zookeeper_latency_avg_ms 平均延迟 (ms)');
  lines.push('# TYPE zookeeper_latency_avg_ms gauge');

  lines.push('# HELP zookeeper_latency_min_ms 最小延迟 (ms)');
  lines.push('# TYPE zookeeper_latency_min_ms gauge');

  lines.push('# HELP zookeeper_latency_max_ms 最大延迟 (ms)');
  lines.push('# TYPE zookeeper_latency_max_ms gauge');

  lines.push('# HELP zookeeper_outstanding_requests 未处理请求数');
  lines.push('# TYPE zookeeper_outstanding_requests gauge');

  lines.push('# HELP zookeeper_connections 当前连接数');
  lines.push('# TYPE zookeeper_connections gauge');

  lines.push('# HELP zookeeper_znode_count ZNode 数量');
  lines.push('# TYPE zookeeper_znode_count gauge');

  lines.push('# HELP zookeeper_watch_count Watch 数量');
  lines.push('# TYPE zookeeper_watch_count gauge');

  lines.push('# HELP zookeeper_packets_received_total 累计接收包数');
  lines.push('# TYPE zookeeper_packets_received_total counter');

  lines.push('# HELP zookeeper_packets_sent_total 累计发送包数');
  lines.push('# TYPE zookeeper_packets_sent_total counter');

  lines.push('# HELP zookeeper_baseline_latency_avg_ms 历史平均延迟基线 (ms)');
  lines.push('# TYPE zookeeper_baseline_latency_avg_ms gauge');

  lines.push('# HELP zookeeper_baseline_outstanding_avg 历史未处理请求基线');
  lines.push('# TYPE zookeeper_baseline_outstanding_avg gauge');

  lines.push('# HELP zookeeper_alert_active 活跃告警数');
  lines.push('# TYPE zookeeper_alert_active gauge');

  statusData.forEach(node => {
    const labels = `host="${node.host}",port="${node.port}"`;

    lines.push(`zookeeper_up{${labels}} ${node.ruok ? 1 : 0} ${timestamp}`);

    if (node.stat && !node.stat.error) {
      lines.push(`zookeeper_latency_avg_ms{${labels}} ${formatPrometheusValue(node.stat.latency?.avg)} ${timestamp}`);
      lines.push(`zookeeper_latency_min_ms{${labels}} ${formatPrometheusValue(node.stat.latency?.min)} ${timestamp}`);
      lines.push(`zookeeper_latency_max_ms{${labels}} ${formatPrometheusValue(node.stat.latency?.max)} ${timestamp}`);
      lines.push(`zookeeper_outstanding_requests{${labels}} ${formatPrometheusValue(node.stat.outstanding)} ${timestamp}`);
      lines.push(`zookeeper_connections{${labels}} ${formatPrometheusValue(node.stat.connections)} ${timestamp}`);
      lines.push(`zookeeper_znode_count{${labels}} ${formatPrometheusValue(node.stat.nodeCount)} ${timestamp}`);
    }

    if (node.mntr && !node.mntr.error) {
      lines.push(`zookeeper_watch_count{${labels}} ${formatPrometheusValue(node.mntr.zk_watch_count)} ${timestamp}`);
      lines.push(`zookeeper_packets_received_total{${labels}} ${formatPrometheusValue(node.mntr.zk_packets_received)} ${timestamp}`);
      lines.push(`zookeeper_packets_sent_total{${labels}} ${formatPrometheusValue(node.mntr.zk_packets_sent)} ${timestamp}`);
    }

    if (node.baselines) {
      lines.push(`zookeeper_baseline_latency_avg_ms{${labels}} ${formatPrometheusValue(node.baselines.latencyAvg)} ${timestamp}`);
      lines.push(`zookeeper_baseline_outstanding_avg{${labels}} ${formatPrometheusValue(node.baselines.outstandingAvg)} ${timestamp}`);
    }

    lines.push(`zookeeper_alert_active{${labels}} ${node.alerts?.length || 0} ${timestamp}`);
  });

  return lines.join('\n') + '\n';
}

app.get('/api/status', async (req, res) => {
  try {
    const { host, port } = req.query;
    const customTargets = host && port
      ? [{ host, port: parseInt(port) }]
      : [];

    const result = await collectStatus(customTargets);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get('/api/alerts', (req, res) => {
  try {
    const alerts = [];
    for (const [nodeKey, nodeAlerts] of activeAlerts) {
      const [host, port] = nodeKey.split(':');
      alerts.push({
        host,
        port: parseInt(port),
        alerts: nodeAlerts
      });
    }

    res.json({
      success: true,
      data: alerts,
      total: alerts.length,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get('/metrics', async (req, res) => {
  try {
    const result = await collectStatus([]);
    const metrics = generatePrometheusMetrics(result.data);

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (err) {
    res.status(500).send(`# Error: ${err.message}\n`);
  }
});

app.get('/api/stat', async (req, res) => {
  try {
    const { host = 'localhost', port = 2181 } = req.query;
    const client = new ZooKeeperClient(host, parseInt(port));
    const result = await client.stat();

    res.json({
      success: true,
      data: result,
      host,
      port: parseInt(port)
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get('/api/mntr', async (req, res) => {
  try {
    const { host = 'localhost', port = 2181 } = req.query;
    const client = new ZooKeeperClient(host, parseInt(port));
    const result = await client.mntr();

    res.json({
      success: true,
      data: result,
      host,
      port: parseInt(port)
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get('/api/srvr', async (req, res) => {
  try {
    const { host = 'localhost', port = 2181 } = req.query;
    const client = new ZooKeeperClient(host, parseInt(port));
    const result = await client.srvr();

    res.json({
      success: true,
      data: result,
      host,
      port: parseInt(port)
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get('/api/ruok', async (req, res) => {
  try {
    const { host = 'localhost', port = 2181 } = req.query;
    const client = new ZooKeeperClient(host, parseInt(port));
    const result = await client.ruok();

    res.json({
      success: true,
      data: { ruok: result },
      host,
      port: parseInt(port)
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get('/api/command/:cmd', async (req, res) => {
  try {
    const { cmd } = req.params;
    const { host = 'localhost', port = 2181 } = req.query;

    const validCommands = ['stat', 'mntr', 'srvr', 'ruok', 'conf', 'cons', 'dump', 'envi', 'reqs', 'wchs', 'wchp', 'wchc', 'dirs', 'crst', 'frst', 'isro', 'gtmk', 'stmk', 'hash', 'kill'];

    if (!validCommands.includes(cmd.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: '无效的四字命令'
      });
    }

    const client = new ZooKeeperClient(host, parseInt(port));
    const { response } = await client.sendCommand(cmd);

    res.json({
      success: true,
      data: response,
      host,
      port: parseInt(port),
      command: cmd
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const clientSubscriptions = new Map();
const clientCustomNodes = new Map();

wss.on('connection', (ws) => {
  const clientId = Math.random().toString(36).slice(2, 10);
  clientSubscriptions.set(clientId, { ws, pushInterval: WS_PUSH_INTERVAL });
  clientCustomNodes.set(clientId, []);

  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    message: 'WebSocket 已连接',
    pushInterval: WS_PUSH_INTERVAL,
    historyWindow: HISTORY_WINDOW_SIZE,
    alertThreshold: ALERT_BASELINE_THRESHOLD
  }));

  collectStatus().then((data) => {
    ws.send(JSON.stringify({
      type: 'initial',
      ...data
    }));
  }).catch((err) => {
    ws.send(JSON.stringify({
      type: 'error',
      message: err.message
    }));
  });

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());

      if (msg.type === 'addNode') {
        const { host, port } = msg;
        if (host && port) {
          const nodes = clientCustomNodes.get(clientId) || [];
          if (!nodes.some(n => n.host === host && n.port === port)) {
            nodes.push({ host, port: parseInt(port) });
            clientCustomNodes.set(clientId, nodes);
            ws.send(JSON.stringify({ type: 'nodeAdded', host, port }));
          }
        }
      } else if (msg.type === 'removeNode') {
        const { host, port } = msg;
        const nodes = clientCustomNodes.get(clientId) || [];
        const filtered = nodes.filter(n => !(n.host === host && n.port === parseInt(port)));
        clientCustomNodes.set(clientId, filtered);
        ws.send(JSON.stringify({ type: 'nodeRemoved', host, port }));
      } else if (msg.type === 'setPushInterval') {
        const { interval } = msg;
        if (interval >= 2000) {
          clientSubscriptions.set(clientId, { ws, pushInterval: parseInt(interval) });
          ws.send(JSON.stringify({ type: 'intervalUpdated', interval: parseInt(interval) }));
        }
      } else if (msg.type === 'refresh') {
        const customNodes = clientCustomNodes.get(clientId) || [];
        collectStatus(customNodes).then((data) => {
          ws.send(JSON.stringify({ type: 'update', ...data }));
        }).catch((err) => {
          ws.send(JSON.stringify({ type: 'error', message: err.message }));
        });
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: '消息格式错误' }));
    }
  });

  ws.on('close', () => {
    clientSubscriptions.delete(clientId);
    clientCustomNodes.delete(clientId);
  });

  ws.on('error', () => {
    clientSubscriptions.delete(clientId);
    clientCustomNodes.delete(clientId);
  });
});

async function broadcastUpdates() {
  for (const [clientId, sub] of clientSubscriptions) {
    const { ws } = sub;
    if (ws.readyState !== 1) continue;

    const customNodes = clientCustomNodes.get(clientId) || [];

    try {
      const data = await collectStatus(customNodes);
      ws.send(JSON.stringify({ type: 'update', ...data }));
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  }
}

setInterval(broadcastUpdates, WS_PUSH_INTERVAL);

server.listen(PORT, () => {
  console.log(`ZooKeeper 监控服务已启动: http://localhost:${PORT}`);
  console.log(`WebSocket 服务: ws://localhost:${PORT}/ws`);
  console.log(`Prometheus 指标: http://localhost:${PORT}/metrics`);
  console.log(`推送间隔: ${WS_PUSH_INTERVAL}ms`);
  console.log(`历史窗口: ${HISTORY_WINDOW_SIZE} 条`);
  console.log(`告警阈值: ${ALERT_BASELINE_THRESHOLD}x 历史均值`);
  console.log(`默认监控节点: ${zkHosts.map(h => `${h.host}:${h.port}`).join(', ')}`);
});
