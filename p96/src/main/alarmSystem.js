const { Notification, shell } = require('electron');
const fs = require('fs');
const path = require('path');

class AlarmSystem {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.activeAlarms = new Map();
    this.alarmHistory = [];
    this.soundEnabled = true;
    this.notificationEnabled = true;
    this.maxAlarms = 50;
  }

  triggerAlarm(anomaly) {
    const alarmId = `alarm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alarm = {
      id: alarmId,
      anomaly: anomaly,
      timestamp: new Date().toISOString(),
      acknowledged: false,
      level: this.getAlarmLevel(anomaly.severity)
    };

    this.activeAlarms.set(alarmId, alarm);
    this.alarmHistory.push(alarm);

    if (this.alarmHistory.length > this.maxAlarms) {
      this.alarmHistory.shift();
    }

    if (this.notificationEnabled) {
      this.showNotification(alarm);
    }

    if (this.soundEnabled) {
      this.playAlarmSound(anomaly.severity);
    }

    this.mainWindow.webContents.send('alarm-triggered', alarm);

    if (anomaly.severity === 'high') {
      this.requestUserAttention();
    }

    return alarm;
  }

  getAlarmLevel(severity) {
    const levels = {
      'low': 1,
      'medium': 2,
      'high': 3,
      'critical': 4
    };
    return levels[severity] || 1;
  }

  showNotification(alarm) {
    if (!Notification.isSupported()) return;

    const severityColors = {
      'low': '⚠️',
      'medium': '⚡',
      'high': '🚨',
      'critical': '🔴'
    };

    const notification = new Notification({
      title: `${severityColors[alarm.anomaly.severity] || '⚠️'} GNSS 安全警报`,
      body: alarm.anomaly.description,
      silent: !this.soundEnabled,
      urgency: alarm.anomaly.severity === 'high' ? 'critical' : 'normal'
    });

    notification.on('click', () => {
      if (this.mainWindow) {
        this.mainWindow.show();
        this.mainWindow.focus();
        this.mainWindow.webContents.send('focus-alarm', alarm.id);
      }
    });

    notification.show();
  }

  playAlarmSound(severity) {
    try {
      const soundPath = path.join(__dirname, '../../assets/sounds');
      
      if (!fs.existsSync(soundPath)) {
        fs.mkdirSync(soundPath, { recursive: true });
      }

      let frequency = 800;
      let duration = 200;
      let count = 1;

      switch (severity) {
        case 'low':
          frequency = 600;
          count = 1;
          break;
        case 'medium':
          frequency = 800;
          count = 2;
          break;
        case 'high':
          frequency = 1000;
          count = 3;
          break;
        case 'critical':
          frequency = 1200;
          duration = 300;
          count = 4;
          break;
      }

      this.playBeep(frequency, duration, count);
      
    } catch (err) {
      console.error('Failed to play alarm sound:', err);
    }
  }

  playBeep(frequency, duration, count) {
    try {
      const { exec } = require('child_process');
      
      let beepCommand;
      if (process.platform === 'darwin') {
        beepCommand = `osascript -e 'beep ${count}'`;
      } else if (process.platform === 'win32') {
        beepCommand = `powershell -c "1..${count} | % { [console]::beep(${frequency}, ${duration}); Start-Sleep -m ${duration} }"`;
      } else {
        beepCommand = `for i in $(seq 1 ${count}); do beep -f ${frequency} -l ${duration}; sleep 0.$((duration/10)); done`;
      }

      exec(beepCommand, (err) => {
        if (err) console.error('Beep error:', err);
      });
    } catch (err) {
      console.error('Beep failed:', err);
    }
  }

  requestUserAttention() {
    if (this.mainWindow) {
      this.mainWindow.flashFrame(true);
      
      setTimeout(() => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.flashFrame(false);
        }
      }, 5000);
    }
  }

  acknowledge(alarmId) {
    const alarm = this.activeAlarms.get(alarmId);
    if (alarm) {
      alarm.acknowledged = true;
      alarm.acknowledgedAt = new Date().toISOString();
      this.activeAlarms.delete(alarmId);
      
      if (this.mainWindow) {
        this.mainWindow.webContents.send('alarm-acknowledged', alarmId);
      }
      
      return true;
    }
    return false;
  }

  acknowledgeAll() {
    const count = this.activeAlarms.size;
    this.activeAlarms.forEach((alarm, id) => {
      this.acknowledge(id);
    });
    return count;
  }

  getActiveAlarms() {
    return Array.from(this.activeAlarms.values());
  }

  getAlarmHistory() {
    return [...this.alarmHistory];
  }

  isAlarmActive() {
    return this.activeAlarms.size > 0;
  }

  getHighestAlarmLevel() {
    let maxLevel = 0;
    this.activeAlarms.forEach(alarm => {
      if (alarm.level > maxLevel) {
        maxLevel = alarm.level;
      }
    });
    return maxLevel;
  }

  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
  }

  setNotificationEnabled(enabled) {
    this.notificationEnabled = enabled;
  }

  exportAlarms(options = {}) {
    const exportData = {
      exportTime: new Date().toISOString(),
      activeAlarms: this.getActiveAlarms(),
      alarmHistory: this.getAlarmHistory()
    };

    const exportPath = path.join(require('os').homedir(), `gnss_alarms_${Date.now()}.json`);
    fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
    
    return exportPath;
  }

  openSoundSettings() {
    if (process.platform === 'darwin') {
      shell.openPath('x-apple.systempreferences:com.apple.preference.sound');
    } else if (process.platform === 'win32') {
      shell.openPath('ms-settings:sound');
    } else {
      shell.openPath('gnome-control-center sound');
    }
  }

  getAlarmStats() {
    const stats = {
      total: this.alarmHistory.length,
      active: this.activeAlarms.size,
      bySeverity: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      },
      byType: {}
    };

    this.alarmHistory.forEach(alarm => {
      if (stats.bySeverity.hasOwnProperty(alarm.anomaly.severity)) {
        stats.bySeverity[alarm.anomaly.severity]++;
      }
      
      if (!stats.byType[alarm.anomaly.type]) {
        stats.byType[alarm.anomaly.type] = 0;
      }
      stats.byType[alarm.anomaly.type]++;
    });

    return stats;
  }
}

module.exports = AlarmSystem;