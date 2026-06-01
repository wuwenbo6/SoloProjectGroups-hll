import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, PlayCircle, PauseCircle } from 'lucide-react';

interface TestPacketSenderProps {
  onSend: (config: {
    srcMac: string;
    dstMac: string;
    srcIp: string;
    dstIp: string;
    srcPort: number;
    dstPort: number;
    inPort: number;
    protocol: string;
    payload: string;
  }) => Promise<void>;
  disabled?: boolean;
}

const PRESET_PAIRS = [
  { name: '主机A → 主机B', srcMac: '00:11:22:33:44:55', dstMac: 'aa:bb:cc:dd:ee:ff', srcIp: '192.168.1.10', dstIp: '192.168.1.20' },
  { name: '主机B → 主机A', srcMac: 'aa:bb:cc:dd:ee:ff', dstMac: '00:11:22:33:44:55', srcIp: '192.168.1.20', dstIp: '192.168.1.10' },
  { name: '主机C → 主机D', srcMac: '11:22:33:44:55:66', dstMac: 'bb:cc:dd:ee:ff:00', srcIp: '192.168.1.30', dstIp: '192.168.1.40' },
  { name: '广播包', srcMac: '00:11:22:33:44:55', dstMac: 'ff:ff:ff:ff:ff:ff', srcIp: '192.168.1.10', dstIp: '255.255.255.255' },
];

export function TestPacketSender({ onSend, disabled }: TestPacketSenderProps) {
  const [srcMac, setSrcMac] = useState('00:11:22:33:44:55');
  const [dstMac, setDstMac] = useState('aa:bb:cc:dd:ee:ff');
  const [srcIp, setSrcIp] = useState('192.168.1.10');
  const [dstIp, setDstIp] = useState('192.168.1.20');
  const [srcPort, setSrcPort] = useState(12345);
  const [dstPort, setDstPort] = useState(80);
  const [inPort, setInPort] = useState(1);
  const [protocol, setProtocol] = useState('tcp');
  const [payload, setPayload] = useState('Hello P4 Simulator!');
  const [autoSend, setAutoSend] = useState(false);
  const [sendInterval, setSendInterval] = useState<number | null>(null);

  const handleSend = async () => {
    try {
      await onSend({
        srcMac,
        dstMac,
        srcIp,
        dstIp,
        srcPort,
        dstPort,
        inPort,
        protocol,
        payload,
      });
    } catch (e) {
      console.error('Failed to send packet:', e);
    }
  };

  const handlePreset = (preset: typeof PRESET_PAIRS[0]) => {
    setSrcMac(preset.srcMac);
    setDstMac(preset.dstMac);
    setSrcIp(preset.srcIp);
    setDstIp(preset.dstIp);
  };

  const toggleAutoSend = () => {
    if (autoSend) {
      if (sendInterval) {
        clearInterval(sendInterval);
        setSendInterval(null);
      }
      setAutoSend(false);
    } else {
      setAutoSend(true);
      const interval = window.setInterval(() => {
        handleSend();
      }, 1000);
      setSendInterval(interval);
    }
  };

  const handleRandomPort = () => {
    setSrcPort(Math.floor(Math.random() * 64511) + 1024);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-6 border border-slate-700 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Send className="w-5 h-5 text-cyan-400" />
          发送测试数据包
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAutoSend}
            disabled={disabled}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1 ${
              autoSend
                ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                : 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {autoSend ? (
              <>
                <PauseCircle className="w-4 h-4" />
                停止自动发送
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4" />
                自动发送
              </>
            )}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {PRESET_PAIRS.map((preset, index) => (
          <button
            key={index}
            onClick={() => handlePreset(preset)}
            className="px-3 py-1.5 bg-slate-700/50 text-slate-300 text-xs rounded-lg hover:bg-slate-600/50 transition-colors"
          >
            {preset.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">源 MAC</label>
          <input
            type="text"
            value={srcMac}
            onChange={(e) => setSrcMac(e.target.value)}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">目的 MAC</label>
          <input
            type="text"
            value={dstMac}
            onChange={(e) => setDstMac(e.target.value)}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">源 IP</label>
          <input
            type="text"
            value={srcIp}
            onChange={(e) => setSrcIp(e.target.value)}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">目的 IP</label>
          <input
            type="text"
            value={dstIp}
            onChange={(e) => setDstIp(e.target.value)}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">源端口</label>
          <div className="flex gap-1">
            <input
              type="number"
              value={srcPort}
              onChange={(e) => setSrcPort(Number(e.target.value))}
              className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={handleRandomPort}
              className="px-2 py-1 bg-slate-600 text-slate-300 rounded-lg hover:bg-slate-500 transition-colors text-xs"
              title="随机端口"
            >
              ↻
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">目的端口</label>
          <input
            type="number"
            value={dstPort}
            onChange={(e) => setDstPort(Number(e.target.value))}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">入端口</label>
          <select
            value={inPort}
            onChange={(e) => setInPort(Number(e.target.value))}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          >
            <option value={1}>Port 1</option>
            <option value={2}>Port 2</option>
            <option value={3}>Port 3</option>
            <option value={4}>Port 4</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">协议</label>
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value)}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
            <option value="icmp">ICMP</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={handleSend}
            disabled={disabled}
            className="w-full px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            发送
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Payload</label>
        <input
          type="text"
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          placeholder="数据包内容..."
          className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
        />
      </div>
    </motion.div>
  );
}
