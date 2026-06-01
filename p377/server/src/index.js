const express = require('express');
const cors = require('cors');
const EBpfSimulator = require('./ebpf-simulator');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const simulator = new EBpfSimulator();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/verify', (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    const result = simulator.verifyProgram(code);
    res.json(result);
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/compile', (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    const compileLogs = [];
    compileLogs.push('=== Clang Compilation Log ===');
    compileLogs.push(`Target: bpf`);
    compileLogs.push(`Thread model: posix`);
    compileLogs.push(`InstalledDir: /usr/bin`);
    compileLogs.push('');
    compileLogs.push(`clang -O2 -target bpf -c program.c -o program.o`);
    compileLogs.push('');
    
    const verifyResult = simulator.verifyProgram(code);
    
    if (verifyResult.success) {
      compileLogs.push('Compilation successful!');
      compileLogs.push(`Output: program.o (${Math.floor(code.length / 2)} bytes)`);
      compileLogs.push('');
      compileLogs.push(verifyResult.logs);
    } else {
      compileLogs.push('Compilation failed: Verification errors');
      compileLogs.push('');
      compileLogs.push(verifyResult.logs);
    }

    res.json({
      success: verifyResult.success,
      logs: compileLogs.join('\n'),
      programId: verifyResult.programId,
      verification: verifyResult
    });
  } catch (error) {
    console.error('Compilation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/attach', (req, res) => {
  try {
    const { programId, interfaceName, code } = req.body;
    
    if (!programId || !interfaceName) {
      return res.status(400).json({ error: 'programId and interfaceName are required' });
    }

    const iface = simulator.attachProgram(programId, interfaceName, code);
    
    res.json({
      success: true,
      message: `Program ${programId} attached to interface ${interfaceName}`,
      interface: {
        name: iface.name,
        stats: iface.stats,
        programAttached: !!iface.attachedProgram
      }
    });
  } catch (error) {
    console.error('Attach error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/simulate', (req, res) => {
  try {
    const { interfaceName, packetCount = 100 } = req.body;
    
    if (!interfaceName) {
      return res.status(400).json({ error: 'interfaceName is required' });
    }

    const result = simulator.simulateTraffic(interfaceName, packetCount);
    res.json(result);
  } catch (error) {
    console.error('Simulation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/interfaces', (req, res) => {
  try {
    const interfaces = simulator.getInterfaces();
    res.json({ interfaces });
  } catch (error) {
    console.error('Get interfaces error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/interfaces/:name/stats', (req, res) => {
  try {
    const { name } = req.params;
    const stats = simulator.getInterfaceStats(name);
    
    if (!stats) {
      return res.status(404).json({ error: `Interface ${name} not found` });
    }
    
    res.json({ stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/interfaces/:name/reset', (req, res) => {
  try {
    const { name } = req.params;
    const stats = simulator.resetInterfaceStats(name);
    
    if (!stats) {
      return res.status(404).json({ error: `Interface ${name} not found` });
    }
    
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Reset stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/programs', (req, res) => {
  try {
    const programs = simulator.getLoadedPrograms();
    res.json({ programs });
  } catch (error) {
    console.error('Get programs error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/interfaces/:name/maps', (req, res) => {
  try {
    const { name } = req.params;
    const mapStats = simulator.getMapStats(name);
    
    if (!mapStats) {
      return res.status(404).json({ error: `Interface ${name} not found` });
    }
    
    res.json({ maps: mapStats });
  } catch (error) {
    console.error('Get map stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/logs/export', (req, res) => {
  try {
    const { logs, type = 'verifier', format = 'text' } = req.body;
    
    if (!logs) {
      return res.status(400).json({ error: 'Logs are required' });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let filename, content, contentType;

    if (format === 'json') {
      filename = `ebpf-${type}-logs-${timestamp}.json`;
      content = JSON.stringify({
        type,
        timestamp: new Date().toISOString(),
        logs: logs.split('\n')
      }, null, 2);
      contentType = 'application/json';
    } else {
      filename = `ebpf-${type}-logs-${timestamp}.log`;
      let header = `========================================\n`;
      header += `eBPF ${type.toUpperCase()} Logs Export\n`;
      header += `Generated: ${new Date().toLocaleString()}\n`;
      header += `========================================\n\n`;
      content = header + logs;
      contentType = 'text/plain';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(content));
    
    res.send(content);
  } catch (error) {
    console.error('Export logs error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/examples', (req, res) => {
  const examples = [
    {
      id: 'xdp-drop-all',
      name: 'XDP Drop All',
      description: 'Simple XDP program that drops all packets',
      category: 'Basic'
    },
    {
      id: 'xdp-pass-all',
      name: 'XDP Pass All',
      description: 'Simple XDP program that passes all packets',
      category: 'Basic'
    },
    {
      id: 'xdp-drop-port',
      name: 'XDP Drop by Port',
      description: 'Drop packets targeting specific ports (e.g., SSH)',
      category: 'Filtering'
    },
    {
      id: 'xdp-drop-ip',
      name: 'XDP Drop by IP',
      description: 'Drop packets from specific source IP addresses',
      category: 'Filtering'
    },
    {
      id: 'xdp-stats',
      name: 'XDP Statistics (Array Map)',
      description: 'Count packets using BPF_MAP_TYPE_ARRAY',
      category: 'Maps'
    },
    {
      id: 'xdp-lru-stats',
      name: 'XDP LRU Statistics',
      description: 'Track source IPs using BPF_MAP_TYPE_LRU_HASH',
      category: 'Maps'
    },
    {
      id: 'xdp-complex',
      name: 'XDP Complex (Test Limit)',
      description: 'Complex program to test 4096 instruction limit',
      category: 'Test'
    },
    {
      id: 'xdp-load-balancer',
      name: 'XDP Load Balancer',
      description: 'Distribute packets based on hash of src/dst IP and port',
      category: 'Advanced'
    }
  ];
  res.json({ examples });
});

app.get('/api/examples/:id', (req, res) => {
  const examples = {
    'xdp-drop-all': `#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>

SEC("xdp")
int xdp_drop_all(struct xdp_md *ctx) {
    return XDP_DROP;
}

char _license[] SEC("license") = "GPL";`,

    'xdp-pass-all': `#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>

SEC("xdp")
int xdp_pass_all(struct xdp_md *ctx) {
    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";`,

    'xdp-drop-port': `#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/tcp.h>
#include <bpf/bpf_helpers.h>

SEC("xdp")
int xdp_drop_port(struct xdp_md *ctx) {
    void *data = (void *)(long)ctx->data;
    void *data_end = (void *)(long)ctx->data_end;
    
    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end)
        return XDP_PASS;
    
    if (eth->h_proto != __constant_htons(ETH_P_IP))
        return XDP_PASS;
    
    struct iphdr *ip = (void *)(eth + 1);
    if ((void *)(ip + 1) > data_end)
        return XDP_PASS;
    
    if (ip->protocol != IPPROTO_TCP)
        return XDP_PASS;
    
    struct tcphdr *tcp = (void *)(ip + 1);
    if ((void *)(tcp + 1) > data_end)
        return XDP_PASS;
    
    if (tcp->dest == __constant_htons(22))
        return XDP_DROP;
    
    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";`,

    'xdp-drop-ip': `#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <bpf/bpf_helpers.h>

SEC("xdp")
int xdp_drop_ip(struct xdp_md *ctx) {
    void *data = (void *)(long)ctx->data;
    void *data_end = (void *)(long)ctx->data_end;
    
    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end)
        return XDP_PASS;
    
    if (eth->h_proto != __constant_htons(ETH_P_IP))
        return XDP_PASS;
    
    struct iphdr *ip = (void *)(eth + 1);
    if ((void *)(ip + 1) > data_end)
        return XDP_PASS;
    
    if (ip->saddr == __constant_htonl(0x0a000001))
        return XDP_DROP;
    
    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";`,

    'xdp-stats': `#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>

struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __type(key, __u32);
    __type(value, __u64);
    __uint(max_entries, 256);
} packet_count SEC(".maps");

SEC("xdp")
int xdp_stats(struct xdp_md *ctx) {
    __u32 key = 0;
    __u64 *count;
    
    count = bpf_map_lookup_elem(&packet_count, &key);
    if (count)
        __sync_fetch_and_add(count, 1);
    
    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";`,

    'xdp-lru-stats': `#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

struct {
    __uint(type, BPF_MAP_TYPE_LRU_HASH);
    __uint(max_entries, 1024);
    __type(key, __u32);
    __type(value, __u64);
} src_ip_stats SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_LRU_HASH);
    __uint(max_entries, 1024);
    __type(key, __u16);
    __type(value, __u64);
} dst_port_stats SEC(".maps");

SEC("xdp")
int xdp_lru_stats(struct xdp_md *ctx) {
    void *data = (void *)(long)ctx->data;
    void *data_end = (void *)(long)ctx->data_end;
    
    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end)
        return XDP_PASS;
    
    if (eth->h_proto != __constant_htons(ETH_P_IP))
        return XDP_PASS;
    
    struct iphdr *ip = (void *)(eth + 1);
    if ((void *)(ip + 1) > data_end)
        return XDP_PASS;
    
    __u32 saddr = ip->saddr;
    __u64 *ip_count;
    
    ip_count = bpf_map_lookup_elem(&src_ip_stats, &saddr);
    if (ip_count) {
        __sync_fetch_and_add(ip_count, 1);
    } else {
        __u64 initial = 1;
        bpf_map_update_elem(&src_ip_stats, &saddr, &initial, BPF_ANY);
    }
    
    if (ip->protocol == IPPROTO_TCP) {
        struct tcphdr *tcp = (void *)(ip + 1);
        if ((void *)(tcp + 1) > data_end)
            return XDP_PASS;
        
        __u16 dport = tcp->dest;
        __u64 *port_count;
        
        port_count = bpf_map_lookup_elem(&dst_port_stats, &dport);
        if (port_count) {
            __sync_fetch_and_add(port_count, 1);
        } else {
            __u64 initial = 1;
            bpf_map_update_elem(&dst_port_stats, &dport, &initial, BPF_ANY);
        }
    }
    
    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";`,

    'xdp-complex': `#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/tcp.h>
#include <linux/udp.h>
#include <linux/icmp.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __type(key, __u32);
    __type(value, __u64);
    __uint(max_entries, 256);
} tcp_stats SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __type(key, __u32);
    __type(value, __u64);
    __uint(max_entries, 256);
} udp_stats SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __type(key, __u32);
    __type(value, __u64);
    __uint(max_entries, 256);
} icmp_stats SEC(".maps");

static __always_inline int check_tcp_port(__u16 port) {
    if (port == __constant_htons(22)) return 1;
    if (port == __constant_htons(23)) return 1;
    if (port == __constant_htons(21)) return 1;
    if (port == __constant_htons(3389)) return 1;
    if (port == __constant_htons(5900)) return 1;
    if (port == __constant_htons(5901)) return 1;
    if (port == __constant_htons(5902)) return 1;
    if (port == __constant_htons(5903)) return 1;
    return 0;
}

static __always_inline int check_udp_port(__u16 port) {
    if (port == __constant_htons(53)) return 1;
    if (port == __constant_htons(69)) return 1;
    if (port == __constant_htons(123)) return 1;
    if (port == __constant_htons(161)) return 1;
    if (port == __constant_htons(162)) return 1;
    if (port == __constant_htons(500)) return 1;
    if (port == __constant_htons(5060)) return 1;
    if (port == __constant_htons(5061)) return 1;
    return 0;
}

static __always_inline int check_ip_range(__u32 addr) {
    __u32 ip = ntohl(addr);
    if ((ip & 0xFFFFFF00) == 0x0A000000) return 1;
    if ((ip & 0xFFFF0000) == 0xAC100000) return 1;
    if ((ip & 0xFFFF0000) == 0xC0A80000) return 1;
    if ((ip & 0xFF000000) == 0x7F000000) return 1;
    if ((ip & 0xF0000000) == 0xE0000000) return 1;
    if ((ip & 0xFFFF0000) == 0xA9FE0000) return 1;
    return 0;
}

static __always_inline int check_tcp_flags(__u8 flags) {
    int count = 0;
    if (flags & TH_FIN) count++;
    if (flags & TH_SYN) count++;
    if (flags & TH_RST) count++;
    if (flags & TH_PUSH) count++;
    if (flags & TH_ACK) count++;
    if (flags & TH_URG) count++;
    if (flags & TH_ECE) count++;
    if (flags & TH_CWR) count++;
    return count;
}

static __always_inline int validate_packet_size(__u32 size) {
    if (size < 64) return 0;
    if (size > 1500) return 0;
    if (size == 64) return 1;
    if (size == 128) return 1;
    if (size == 256) return 1;
    if (size == 512) return 1;
    if (size == 1024) return 1;
    if (size == 1500) return 1;
    return 1;
}

static __always_inline __u64 get_timestamp() {
    return bpf_ktime_get_ns();
}

static __always_inline void update_tcp_stat(__u32 key, __u64 val) {
    __u64 *count = bpf_map_lookup_elem(&tcp_stats, &key);
    if (count) *count = val;
}

static __always_inline void update_udp_stat(__u32 key, __u64 val) {
    __u64 *count = bpf_map_lookup_elem(&udp_stats, &key);
    if (count) *count = val;
}

static __always_inline void update_icmp_stat(__u32 key, __u64 val) {
    __u64 *count = bpf_map_lookup_elem(&icmp_stats, &key);
    if (count) *count = val;
}

SEC("xdp")
int xdp_complex_filter(struct xdp_md *ctx) {
    void *data = (void *)(long)ctx->data;
    void *data_end = (void *)(long)ctx->data_end;
    __u64 ts = get_timestamp();
    
    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end) {
        __u32 key = 0;
        update_tcp_stat(key, ts);
        return XDP_PASS;
    }
    
    __u16 eth_proto = eth->h_proto;
    if (eth_proto != __constant_htons(ETH_P_IP)) {
        __u32 key = 1;
        update_tcp_stat(key, ts);
        return XDP_PASS;
    }
    
    struct iphdr *ip = (void *)(eth + 1);
    if ((void *)(ip + 1) > data_end) {
        __u32 key = 2;
        update_tcp_stat(key, ts);
        return XDP_PASS;
    }
    
    __u32 saddr = ip->saddr;
    __u32 daddr = ip->daddr;
    __u8 protocol = ip->protocol;
    __u8 ttl = ip->ttl;
    __u8 tos = ip->tos;
    
    if (check_ip_range(saddr)) {
        __u32 key = 3;
        update_tcp_stat(key, ts);
    }
    
    if (check_ip_range(daddr)) {
        __u32 key = 4;
        update_tcp_stat(key, ts);
    }
    
    if (ttl < 5) {
        __u32 key = 5;
        update_tcp_stat(key, ts);
        return XDP_DROP;
    }
    
    if (tos != 0) {
        __u32 key = 6;
        update_tcp_stat(key, ts);
    }
    
    if (protocol == IPPROTO_TCP) {
        struct tcphdr *tcp = (void *)(ip + 1);
        if ((void *)(tcp + 1) > data_end) {
            __u32 key = 7;
            update_tcp_stat(key, ts);
            return XDP_PASS;
        }
        
        __u16 sport = tcp->source;
        __u16 dport = tcp->dest;
        __u8 flags = tcp->doff;
        __u16 window = tcp->window;
        
        int flag_count = check_tcp_flags(flags);
        if (flag_count > 4) {
            __u32 key = 8;
            update_tcp_stat(key, ts);
        }
        
        if (check_tcp_port(dport)) {
            __u32 key = 9;
            update_tcp_stat(key, ts);
            return XDP_DROP;
        }
        
        if (sport == dport) {
            __u32 key = 10;
            update_tcp_stat(key, ts);
        }
        
        if (window == 0) {
            __u32 key = 11;
            update_tcp_stat(key, ts);
            return XDP_DROP;
        }
        
        if (window < 100) {
            __u32 key = 12;
            update_tcp_stat(key, ts);
        }
        
        if (window > 60000) {
            __u32 key = 13;
            update_tcp_stat(key, ts);
        }
        
        __u32 tcp_key = 14;
        update_tcp_stat(tcp_key, ts);
        
        return XDP_PASS;
    }
    
    if (protocol == IPPROTO_UDP) {
        struct udphdr *udp = (void *)(ip + 1);
        if ((void *)(udp + 1) > data_end) {
            __u32 key = 15;
            update_udp_stat(key, ts);
            return XDP_PASS;
        }
        
        __u16 sport = udp->source;
        __u16 dport = udp->dest;
        __u16 len = udp->len;
        
        if (check_udp_port(dport)) {
            __u32 key = 16;
            update_udp_stat(key, ts);
            return XDP_DROP;
        }
        
        if (len < 8) {
            __u32 key = 17;
            update_udp_stat(key, ts);
            return XDP_DROP;
        }
        
        if (sport == dport) {
            __u32 key = 18;
            update_udp_stat(key, ts);
        }
        
        if (len > 1472) {
            __u32 key = 19;
            update_udp_stat(key, ts);
        }
        
        __u32 udp_key = 20;
        update_udp_stat(udp_key, ts);
        
        return XDP_PASS;
    }
    
    if (protocol == IPPROTO_ICMP) {
        struct icmphdr *icmp = (void *)(ip + 1);
        if ((void *)(icmp + 1) > data_end) {
            __u32 key = 21;
            update_icmp_stat(key, ts);
            return XDP_PASS;
        }
        
        __u8 type = icmp->type;
        __u8 code = icmp->code;
        
        if (type == ICMP_ECHO) {
            __u32 key = 22;
            update_icmp_stat(key, ts);
        }
        
        if (type == ICMP_ECHOREPLY) {
            __u32 key = 23;
            update_icmp_stat(key, ts);
        }
        
        if (type == ICMP_DEST_UNREACH) {
            __u32 key = 24;
            update_icmp_stat(key, ts);
        }
        
        if (type == ICMP_REDIRECT) {
            __u32 key = 25;
            update_icmp_stat(key, ts);
            return XDP_DROP;
        }
        
        if (code != 0) {
            __u32 key = 26;
            update_icmp_stat(key, ts);
        }
        
        __u32 icmp_key = 27;
        update_icmp_stat(icmp_key, ts);
        
        return XDP_PASS;
    }
    
    __u32 key = 28;
    update_tcp_stat(key, ts);
    
    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";`,

    'xdp-load-balancer': `#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/tcp.h>
#include <linux/udp.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __type(key, __u32);
    __type(value, __u64);
    __uint(max_entries, 8);
} backend_stats SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __type(key, __u32);
    __type(value, __u32);
    __uint(max_entries, 1);
} redirect_iface SEC(".maps");

static __always_inline __u32 hash_4tuple(__u32 saddr, __u32 daddr, __u16 sport, __u16 dport) {
    __u32 hash = 0;
    
    hash ^= saddr;
    hash ^= (hash << 13);
    hash ^= daddr;
    hash ^= (hash >> 17);
    hash ^= sport;
    hash ^= (hash << 5);
    hash ^= dport;
    hash ^= (hash >> 3);
    hash ^= (hash << 11);
    hash ^= (hash >> 15);
    
    return hash;
}

static __always_inline __u32 hash_3tuple(__u32 saddr, __u32 daddr, __u8 protocol) {
    __u32 hash = 0;
    
    hash ^= saddr;
    hash ^= (hash << 13);
    hash ^= daddr;
    hash ^= (hash >> 17);
    hash ^= protocol;
    hash ^= (hash << 5);
    hash ^= (hash >> 3);
    
    return hash;
}

SEC("xdp")
int xdp_load_balancer(struct xdp_md *ctx) {
    void *data = (void *)(long)ctx->data;
    void *data_end = (void *)(long)ctx->data_end;
    
    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end)
        return XDP_PASS;
    
    if (eth->h_proto != __constant_htons(ETH_P_IP))
        return XDP_PASS;
    
    struct iphdr *ip = (void *)(eth + 1);
    if ((void *)(ip + 1) > data_end)
        return XDP_PASS;
    
    __u32 saddr = ip->saddr;
    __u32 daddr = ip->daddr;
    __u8 protocol = ip->protocol;
    __u16 sport = 0;
    __u16 dport = 0;
    __u32 hash;
    __u32 backend_id;
    __u64 *counter;
    
    if (protocol == IPPROTO_TCP) {
        struct tcphdr *tcp = (void *)(ip + 1);
        if ((void *)(tcp + 1) > data_end)
            return XDP_PASS;
        
        sport = tcp->source;
        dport = tcp->dest;
        hash = hash_4tuple(saddr, daddr, sport, dport);
        backend_id = hash % 8;
        
        counter = bpf_map_lookup_elem(&backend_stats, &backend_id);
        if (counter) {
            __sync_fetch_and_add(counter, 1);
        }
        
        if (dport == __constant_htons(80) || dport == __constant_htons(443)) {
            bpf_printk("LB: TCP %pI4:%d -> %pI4:%d => backend %d",
                      &saddr, __constant_ntohs(sport),
                      &daddr, __constant_ntohs(dport),
                      backend_id);
            return XDP_PASS;
        }
    } else if (protocol == IPPROTO_UDP) {
        struct udphdr *udp = (void *)(ip + 1);
        if ((void *)(udp + 1) > data_end)
            return XDP_PASS;
        
        sport = udp->source;
        dport = udp->dest;
        hash = hash_4tuple(saddr, daddr, sport, dport);
        backend_id = hash % 8;
        
        counter = bpf_map_lookup_elem(&backend_stats, &backend_id);
        if (counter) {
            __sync_fetch_and_add(counter, 1);
        }
        
        bpf_printk("LB: UDP %pI4:%d -> %pI4:%d => backend %d",
                  &saddr, __constant_ntohs(sport),
                  &daddr, __constant_ntohs(dport),
                  backend_id);
    } else {
        hash = hash_3tuple(saddr, daddr, protocol);
        backend_id = hash % 8;
        
        counter = bpf_map_lookup_elem(&backend_stats, &backend_id);
        if (counter) {
            __sync_fetch_and_add(counter, 1);
        }
    }
    
    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";`
  };

  const { id } = req.params;
  if (!examples[id]) {
    return res.status(404).json({ error: 'Example not found' });
  }

  res.json({ id, code: examples[id] });
});

app.listen(PORT, () => {
  console.log(`eBPF XDP Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});
