const EventEmitter = require('events');

class AlarmSystem extends EventEmitter {
  constructor() {
    super();
    this.muted = false;
    this.lastAlarmTime = 0;
    this.minInterval = 1000;
    this.alarmCount = 0;
    this.audioContext = null;
    this.initAudio();
  }

  initAudio() {
    try {
      if (typeof window !== 'undefined' && window.AudioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
    } catch (e) {
      console.log('音频上下文初始化失败，将使用系统提示音');
    }
  }

  setMuted(muted) {
    this.muted = muted;
    this.emit('mute:changed', muted);
  }

  isMuted() {
    return this.muted;
  }

  triggerAlarm(level = 'warning', distance = 0, data = {}) {
    if (this.muted) return;

    const now = Date.now();
    if (now - this.lastAlarmTime < this.minInterval) return;
    this.lastAlarmTime = now;
    this.alarmCount++;

    const alarm = {
      id: Date.now(),
      level,
      distance,
      timestamp: new Date().toISOString(),
      count: this.alarmCount,
      ...data
    };

    this.emit('alarm:triggered', alarm);
    this.playAlarmSound(level);
    this.showNotification(level, distance);
  }

  triggerDanger(distance, data = {}) {
    this.triggerAlarm('danger', distance, data);
  }

  triggerWarning(distance, data = {}) {
    this.triggerAlarm('warning', distance, data);
  }

  triggerTest() {
    if (this.muted) {
      return { success: false, reason: 'muted' };
    }
    this.playAlarmSound('warning');
    this.emit('alarm:test', { timestamp: new Date().toISOString() });
    return { success: true };
  }

  playAlarmSound(level) {
    const isMainProcess = typeof process !== 'undefined' && process.versions && process.versions.electron;
    
    if (isMainProcess) {
      const { exec } = require('child_process');
      const os = require('os');
      
      if (os.platform() === 'darwin') {
        const sound = level === 'danger' ? 'Glass' : 'Basso';
        exec(`afplay /System/Library/Sounds/${sound}.aiff -v ${level === 'danger' ? '2' : '1'}`, (err) => {
          if (err) console.log('播放提示音失败:', err);
        });
      } else if (os.platform() === 'win32') {
        const frequency = level === 'danger' ? 1000 : 600;
        exec(`powershell -c "(New-Object Media.SoundPlayer).Play(); [console]::beep(${frequency}, ${level === 'danger' ? '500' : '300'})"`, (err) => {
          if (err) console.log('播放提示音失败:', err);
        });
      }
    } else if (this.audioContext) {
      this.playWebAudio(level);
    }
  }

  playWebAudio(level) {
    if (!this.audioContext) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.value = level === 'danger' ? 880 : 440;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(level === 'danger' ? 0.5 : 0.3, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + (level === 'danger' ? 0.5 : 0.3));

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + (level === 'danger' ? 0.5 : 0.3));

      if (level === 'danger') {
        setTimeout(() => {
          const osc2 = this.audioContext.createOscillator();
          const gain2 = this.audioContext.createGain();
          osc2.connect(gain2);
          gain2.connect(this.audioContext.destination);
          osc2.frequency.value = 1000;
          osc2.type = 'sine';
          gain2.gain.setValueAtTime(0.5, this.audioContext.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
          osc2.start();
          osc2.stop(this.audioContext.currentTime + 0.5);
        }, 200);
      }
    } catch (e) {
      console.log('Web Audio播放失败:', e);
    }
  }

  showNotification(level, distance) {
    try {
      const { Notification } = require('electron');
      
      if (Notification.isSupported()) {
        const title = level === 'danger' ? '⚠️ 危险！碰撞警告' : '⚠️ 注意车距';
        const body = level === 'danger' 
          ? `前车距离过近！距离: ${distance.toFixed(2)}米，请立即减速！`
          : `前车距离: ${distance.toFixed(2)}米，请注意保持安全距离。`;

        new Notification({
          title,
          body,
          urgency: level === 'danger' ? 'critical' : 'normal',
          silent: true
        }).show();
      }
    } catch (e) {
      console.log('通知显示失败:', e);
    }
  }

  reset() {
    this.alarmCount = 0;
    this.lastAlarmTime = 0;
  }

  getStats() {
    return {
      alarmCount: this.alarmCount,
      muted: this.muted,
      minInterval: this.minInterval
    };
  }
}

module.exports = AlarmSystem;
