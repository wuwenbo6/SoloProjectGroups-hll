import { Send } from 'lucide-react';
import { useState } from 'react';
import { useLogStore } from '@/stores/logStore';

export default function TestSender() {
  const { searchLogs, fetchStats } = useLogStore();
  const [sending, setSending] = useState(false);

  const handleSendTest = async () => {
    setSending(true);
    try {
      const hosts = ['web-01', 'web-02', 'db-primary', 'cache-01', 'worker-03'];
      const messages = [
        'Request processed successfully in 42ms',
        'Database connection pool exhausted, retrying...',
        'Cache miss for key user:1234, fetching from DB',
        'Background job completed: email_notification#5678',
        'Health check passed: all services operational',
        'Rate limit exceeded for client 10.0.1.55',
        'New WebSocket connection established',
        'Scheduled task cron_cleanup started',
        'SSL certificate expires in 14 days',
        'Memory usage at 87%, consider scaling',
      ];
      const levels = [3, 4, 6, 6, 7, 4, 6, 6, 4, 3];

      const idx = Math.floor(Math.random() * messages.length);
      const host = hosts[Math.floor(Math.random() * hosts.length)];

      await fetch('/api/logs/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host,
          short_message: messages[idx],
          full_message: `Detailed log from ${host}\n\nStack trace:\n  at processRequest (server.js:142)\n  at handleConnection (net.js:523)\n  at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1141)\n\nEnvironment: production\nPID: ${Math.floor(Math.random() * 65535)}`,
        }),
      });

      await searchLogs(undefined, 1);
      await fetchStats();
    } finally {
      setSending(false);
    }
  };

  return (
    <button
      onClick={handleSendTest}
      disabled={sending}
      className="flex items-center gap-2 px-4 py-2 bg-gelf-accent/10 border border-gelf-accent/30 text-gelf-accent rounded-lg text-sm font-medium hover:bg-gelf-accent/20 hover:border-gelf-accent/50 transition-all duration-300 disabled:opacity-50"
    >
      <Send size={14} className={sending ? 'animate-pulse' : ''} />
      发送测试日志
    </button>
  );
}
