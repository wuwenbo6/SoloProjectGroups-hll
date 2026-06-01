const net = require('net');

class ZooKeeperClient {
  constructor(host, port, timeout = 5000) {
    this.host = host;
    this.port = port;
    this.timeout = timeout;
  }

  sendCommand(command) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let response = '';
      let timer = null;
      let connected = false;

      socket.setTimeout(this.timeout);

      socket.connect(this.port, this.host, () => {
        connected = true;
        socket.write(command);
      });

      socket.on('data', (data) => {
        response += data.toString();
      });

      socket.on('end', () => {
        if (timer) clearTimeout(timer);
        resolve({ response, connected });
      });

      socket.on('error', (err) => {
        if (timer) clearTimeout(timer);
        reject(new Error(`连接错误: ${err.message}`));
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('连接超时'));
      });

      timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('读取超时'));
      }, this.timeout);
    });
  }

  async stat() {
    const { response } = await this.sendCommand('stat');
    return this.parseStat(response);
  }

  async mntr() {
    const { response } = await this.sendCommand('mntr');
    return this.parseMntr(response);
  }

  async srvr() {
    const { response } = await this.sendCommand('srvr');
    return this.parseSrvr(response);
  }

  async envi() {
    const { response } = await this.sendCommand('envi');
    return this.parseEnvi(response);
  }

  async ruok() {
    const { response } = await this.sendCommand('ruok');
    return response.trim() === 'imok';
  }

  async diagnoseConnection() {
    try {
      const { response } = await this.sendCommand('envi');
      const hasEnviResponse = response && response.trim().length > 0;

      if (hasEnviResponse) {
        const enviData = this.parseEnvi(response);
        return {
          connectionOk: true,
          enviAvailable: true,
          enviData,
          suggestion: null
        };
      }

      return {
        connectionOk: true,
        enviAvailable: false,
        enviData: null,
        suggestion: this.buildSuggestion()
      };
    } catch (err) {
      return {
        connectionOk: false,
        enviAvailable: false,
        enviData: null,
        suggestion: this.buildConnectionFailedSuggestion(err)
      };
    }
  }

  async getFullStatus() {
    const results = await Promise.allSettled([
      this.stat(),
      this.mntr(),
      this.ruok()
    ]);

    const stat = results[0].status === 'fulfilled' ? results[0].value : { error: results[0].reason?.message };
    const mntr = results[1].status === 'fulfilled' ? results[1].value : { error: results[1].reason?.message };
    const ruok = results[2].status === 'fulfilled' ? results[2].value : false;

    let suggestion = null;
    let enviData = null;

    if (!ruok && (!stat || stat.error) && (!mntr || mntr.error)) {
      const diagnosis = await this.diagnoseConnection().catch(() => null);
      if (diagnosis) {
        suggestion = diagnosis.suggestion;
        enviData = diagnosis.enviData;
      }
    }

    return {
      host: this.host,
      port: this.port,
      timestamp: new Date().toISOString(),
      ruok,
      stat,
      mntr,
      enviData,
      suggestion
    };
  }

  buildSuggestion() {
    return {
      type: 'warning',
      title: '四字命令可能未启用',
      description: 'TCP 连接成功，但四字命令无响应。ZooKeeper 3.5+ 版本默认只允许部分四字命令，可能需要手动配置白名单。',
      steps: [
        {
          title: '检查 ZooKeeper 版本',
          content: '3.5+ 版本引入 4lw.commands.whitelist 配置项，默认仅启用了部分命令。'
        },
        {
          title: '修改 zoo.cfg',
          content: '在 zoo.cfg 中添加或修改以下配置：\n4lw.commands.whitelist=stat,mntr,srvr,ruok,envi,conf,cons,dirs'
        },
        {
          title: '启用全部四字命令（不推荐生产环境）',
          content: '4lw.commands.whitelist=*'
        },
        {
          title: '重启 ZooKeeper',
          content: '修改配置后需要重启 ZooKeeper 服务才能生效。'
        }
      ],
      reference: 'https://zookeeper.apache.org/doc/current/zookeeperAdmin.html#sc_4lw'
    };
  }

  buildConnectionFailedSuggestion(err) {
    return {
      type: 'error',
      title: '无法连接到 ZooKeeper',
      description: err?.message || '连接失败，请检查以下配置：',
      steps: [
        {
          title: '检查 ZooKeeper 服务状态',
          content: '确认 ZooKeeper 服务已启动并正常运行。'
        },
        {
          title: '检查网络连接',
          content: `确认 ${this.host}:${this.port} 可达，防火墙未阻止该端口。`
        },
        {
          title: '检查客户端端口',
          content: '确认连接的是 ZooKeeper 的 clientPort（默认 2181），而非 electionPort 或 peerPort。'
        }
      ]
    };
  }

  parseStat(response) {
    const result = {};
    const lines = response.trim().split('\n');

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      if (line.startsWith('Zookeeper version:')) {
        result.version = line.replace('Zookeeper version:', '').trim();
      } else if (line.startsWith('Clients:')) {
        result.clientsSection = true;
        result.clients = [];
      } else if (result.clientsSection && line.includes('/')) {
        result.clients.push(line);
      } else if (line.startsWith('Latency min/avg/max:')) {
        const latency = line.replace('Latency min/avg/max:', '').trim().split('/');
        result.latency = {
          min: parseInt(latency[0]),
          avg: parseInt(latency[1]),
          max: parseInt(latency[2])
        };
      } else if (line.startsWith('Received:')) {
        result.received = parseInt(line.replace('Received:', '').trim());
      } else if (line.startsWith('Sent:')) {
        result.sent = parseInt(line.replace('Sent:', '').trim());
      } else if (line.startsWith('Connections:')) {
        result.connections = parseInt(line.replace('Connections:', '').trim());
      } else if (line.startsWith('Outstanding:')) {
        result.outstanding = parseInt(line.replace('Outstanding:', '').trim());
      } else if (line.startsWith('Zxid:')) {
        result.zxid = line.replace('Zxid:', '').trim();
      } else if (line.startsWith('Mode:')) {
        result.mode = line.replace('Mode:', '').trim();
      } else if (line.startsWith('Node count:')) {
        result.nodeCount = parseInt(line.replace('Node count:', '').trim());
      } else if (line.startsWith('Proposal sizes last/min/max:')) {
        const sizes = line.replace('Proposal sizes last/min/max:', '').trim().split('/');
        result.proposalSizes = {
          last: parseInt(sizes[0]),
          min: parseInt(sizes[1]),
          max: parseInt(sizes[2])
        };
      }
    });

    return result;
  }

  parseMntr(response) {
    const result = {};
    const lines = response.trim().split('\n');

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      const [key, value] = line.split('\t');
      if (key && value !== undefined) {
        const numValue = parseFloat(value);
        result[key] = isNaN(numValue) ? value : numValue;
      }
    });

    return result;
  }

  parseSrvr(response) {
    const result = {};
    const lines = response.trim().split('\n');

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      const [key, ...rest] = line.split(':');
      if (key && rest.length > 0) {
        const value = rest.join(':').trim();
        const numValue = parseFloat(value);
        result[key] = isNaN(numValue) ? value : numValue;
      }
    });

    return result;
  }

  parseEnvi(response) {
    const result = {};
    const lines = response.trim().split('\n');
    let currentSection = null;

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      if (line.endsWith(':')) {
        currentSection = line.slice(0, -1);
        result[currentSection] = {};
      } else if (line.includes('=')) {
        const [key, ...rest] = line.split('=');
        const value = rest.join('=').trim();
        if (currentSection) {
          result[currentSection][key.trim()] = value;
        } else {
          result[key.trim()] = value;
        }
      } else if (line.includes(':')) {
        const [key, ...rest] = line.split(':');
        const value = rest.join(':').trim();
        if (currentSection) {
          result[currentSection][key.trim()] = value;
        } else {
          result[key.trim()] = value;
        }
      }
    });

    return result;
  }
}

module.exports = ZooKeeperClient;
