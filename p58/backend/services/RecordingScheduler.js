const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const db = require('../database/init');

class RecordingScheduler {
  constructor() {
    this.tasks = new Map();
    this.activeRecordings = new Map();
  }

  start() {
    this.loadSchedules();
    setInterval(() => this.loadSchedules(), 60000);
  }

  loadSchedules() {
    const schedules = db.prepare(`
      SELECT rs.*, c.ip_address, c.port, c.username, c.password, c.rtsp_uri
      FROM recording_schedules rs
      JOIN cameras c ON rs.camera_id = c.id
      WHERE rs.enabled = 1
    `).all();

    const currentScheduleIds = new Set(schedules.map(s => s.id));
    
    for (const [id] of this.tasks) {
      if (!currentScheduleIds.has(id)) {
        this.stopSchedule(id);
      }
    }

    for (const schedule of schedules) {
      if (!this.tasks.has(schedule.id)) {
        this.scheduleRecording(schedule);
      }
    }
  }

  scheduleRecording(schedule) {
    const days = schedule.days_of_week.split(',').map(d => d.trim()).join(',');
    const [startHour, startMin] = schedule.start_time.split(':').map(Number);
    const [endHour, endMin] = schedule.end_time.split(':').map(Number);

    const startCron = `${startMin} ${startHour} * * ${days}`;
    const task = cron.schedule(startCron, () => {
      this.startRecording(schedule);
    });

    this.tasks.set(schedule.id, { task, schedule });

    setTimeout(() => {
      const now = new Date();
      const currentDay = now.getDay();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;
      const scheduleDays = schedule.days_of_week.split(',').map(Number);

      if (scheduleDays.includes(currentDay) && 
          currentTime >= startTime && 
          currentTime < endTime) {
        this.startRecording(schedule);
      }
    }, 5000);
  }

  startRecording(schedule) {
    if (this.activeRecordings.has(schedule.id)) {
      return;
    }

    const outputPath = schedule.storage_path || process.env.NAS_PATH || './recordings';
    const cameraDir = path.join(outputPath, `camera_${schedule.camera_id}`);
    
    if (!fs.existsSync(cameraDir)) {
      fs.mkdirSync(cameraDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(cameraDir, `${timestamp}.mp4`);

    const rtspUri = schedule.rtsp_uri;
    if (!rtspUri) {
      console.error(`No RTSP URI for camera ${schedule.camera_id}`);
      return;
    }

    const segmentTime = schedule.segment_duration || 300;
    const ffmpegCmd = `ffmpeg -i "${rtspUri}" -c:v copy -c:a aac -f segment -segment_time ${segmentTime} -reset_timestamps 1 "${cameraDir}/%(Y-%m-%d_%H-%M-%S).mp4"`;

    const recordingProcess = exec(ffmpegCmd, (error) => {
      if (error) {
        console.error('Recording error:', error);
      }
    });

    this.activeRecordings.set(schedule.id, {
      process: recordingProcess,
      schedule,
      startTime: new Date()
    });

    const [endHour, endMin] = schedule.end_time.split(':').map(Number);
    const now = new Date();
    const endTime = new Date(now);
    endTime.setHours(endHour, endMin, 0, 0);
    
    if (endTime <= now) {
      endTime.setDate(endTime.getDate() + 1);
    }

    const timeout = endTime - now;
    setTimeout(() => {
      this.stopRecording(schedule.id);
    }, timeout);
  }

  stopRecording(scheduleId) {
    const recording = this.activeRecordings.get(scheduleId);
    if (recording) {
      recording.process.kill('SIGINT');
      this.activeRecordings.delete(scheduleId);
    }
  }

  stopSchedule(scheduleId) {
    const taskData = this.tasks.get(scheduleId);
    if (taskData) {
      taskData.task.stop();
      this.tasks.delete(scheduleId);
    }
    this.stopRecording(scheduleId);
  }
}

module.exports = RecordingScheduler;
