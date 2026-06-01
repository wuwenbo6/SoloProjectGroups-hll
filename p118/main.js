const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron');
const path = require('path');
const Database = require('./src/database');
const VideoProcessor = require('./src/videoProcessor');
const AlarmSystem = require('./src/alarmSystem');
const EmergencyRecorder = require('./src/emergencyRecorder');
const UploadManager = require('./src/uploadManager');
const GPSTracker = require('./src/gpsTracker');

let mainWindow;
let db;
let videoProcessor;
let alarmSystem;
let emergencyRecorder;
let uploadManager;
let gpsTracker;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('src/renderer/index.html');
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  db = new Database(app);
  db.init();
  
  alarmSystem = new AlarmSystem();
  emergencyRecorder = new EmergencyRecorder(db, app);
  uploadManager = new UploadManager(db);
  gpsTracker = new GPSTracker(db);
  videoProcessor = new VideoProcessor(db, alarmSystem, emergencyRecorder, gpsTracker);

  videoProcessor.on('frame:processed', (data) => {
    mainWindow.webContents.send('frame:processed', data);
  });

  videoProcessor.on('detection:alert', (alert) => {
    mainWindow.webContents.send('detection:alert', alert);
    
    const settings = db.getSettings();
    const triggerOnCollision = settings['emergency_trigger_on_collision']?.value !== false;
    const triggerOnNearMiss = settings['emergency_trigger_on_nearmiss']?.value === true;
    
    if ((alert.riskLevel === 'danger' && triggerOnCollision) || 
        (alert.riskLevel === 'warning' && triggerOnNearMiss)) {
      emergencyRecorder.triggerCollision({
        distance: alert.distance,
        riskLevel: alert.riskLevel,
        ttc: alert.ttc
      });
    }
  });

  videoProcessor.on('processing:complete', (result) => {
    mainWindow.webContents.send('processing:complete', result);
  });

  emergencyRecorder.on('emergency:triggered', (data) => {
    mainWindow.webContents.send('emergency:triggered', data);
    
    new Notification({
      title: '紧急录像已触发',
      body: `原因: ${data.reason}`,
      silent: false
    }).show();
  });

  emergencyRecorder.on('emergency:saved', (record) => {
    mainWindow.webContents.send('emergency:saved', record);
    
    const settings = db.getSettings();
    const autoUpload = settings['auto_upload_enabled']?.value === true;
    
    if (autoUpload && record.reason === 'collision') {
      uploadManager.autoUpload(record, 'collision');
    }
  });

  emergencyRecorder.on('emergency:error', (error) => {
    mainWindow.webContents.send('emergency:error', error);
  });

  uploadManager.on('upload:queued', (task) => {
    mainWindow.webContents.send('upload:queued', task);
  });

  uploadManager.on('upload:started', (task) => {
    mainWindow.webContents.send('upload:started', task);
  });

  uploadManager.on('upload:progress', (data) => {
    mainWindow.webContents.send('upload:progress', data);
  });

  uploadManager.on('upload:completed', (task) => {
    mainWindow.webContents.send('upload:completed', task);
  });

  uploadManager.on('upload:failed', (task) => {
    mainWindow.webContents.send('upload:failed', task);
  });

  gpsTracker.on('gps:recording_started', (track) => {
    mainWindow.webContents.send('gps:recording_started', track);
  });

  gpsTracker.on('gps:recording_stopped', (track) => {
    mainWindow.webContents.send('gps:recording_stopped', track);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (videoProcessor) {
    videoProcessor.stop();
  }
  if (emergencyRecorder) {
    emergencyRecorder.stop();
  }
  if (gpsTracker) {
    gpsTracker.stopRecording();
  }
  if (db) {
    db.close();
  }
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('video:select', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: '视频文件', extensions: ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('video:process', async (event, videoPath, options = {}) => {
  try {
    const settings = db.getSettings();
    const preSeconds = settings['emergency_pre_seconds']?.value || 15;
    const postSeconds = settings['emergency_post_seconds']?.value || 10;
    
    emergencyRecorder.setConfig({ preEventSeconds: preSeconds, postEventSeconds: postSeconds });
    
    const gpsEnabled = settings['gps_enabled']?.value !== false;
    if (gpsEnabled) {
      gpsTracker.startRecording(Date.now());
    }
    
    return await videoProcessor.processVideo(videoPath, options);
  } catch (error) {
    console.error('视频处理错误:', error);
    throw error;
  }
});

ipcMain.handle('video:stop', async () => {
  emergencyRecorder.stop();
  gpsTracker.stopRecording();
  return videoProcessor.stop();
});

ipcMain.handle('events:getAll', async (event, filters = {}) => {
  return db.getEvents(filters);
});

ipcMain.handle('events:getById', async (event, id) => {
  return db.getEventById(id);
});

ipcMain.handle('events:delete', async (event, id) => {
  return db.deleteEvent(id);
});

ipcMain.handle('events:export', async (event, outputPath) => {
  return db.exportEvents(outputPath);
});

ipcMain.handle('settings:get', async () => {
  return db.getSettings();
});

ipcMain.handle('settings:update', async (event, settings) => {
  const result = db.updateSettings(settings);
  
  const uploadConfig = {};
  if (settings['auto_upload_enabled'] !== undefined) uploadConfig.autoUploadEnabled = settings['auto_upload_enabled'];
  if (settings['upload_server_url'] !== undefined) uploadConfig.uploadServerUrl = settings['upload_server_url'];
  if (settings['upload_max_retries'] !== undefined) uploadConfig.maxRetries = settings['upload_max_retries'];
  if (settings['upload_on_collision'] !== undefined) uploadConfig.uploadOnCollision = settings['upload_on_collision'];
  if (settings['upload_on_nearmiss'] !== undefined) uploadConfig.uploadOnNearMiss = settings['upload_on_nearmiss'];
  
  if (Object.keys(uploadConfig).length > 0) {
    uploadManager.setConfig(uploadConfig);
  }
  
  return result;
});

ipcMain.handle('alarm:test', async () => {
  alarmSystem.triggerTest();
  return { success: true };
});

ipcMain.handle('alarm:mute', async (event, muted) => {
  alarmSystem.setMuted(muted);
  return { success: true, muted };
});

ipcMain.handle('emergency:trigger', async (event, reason = 'manual') => {
  return emergencyRecorder.triggerManual();
});

ipcMain.handle('emergency:getRecords', async (event, filters = {}) => {
  return db.getEmergencyRecords(filters);
});

ipcMain.handle('emergency:getById', async (event, id) => {
  return db.getEmergencyRecordById(id);
});

ipcMain.handle('emergency:delete', async (event, id) => {
  return emergencyRecorder.deleteEmergencyRecord(id);
});

ipcMain.handle('emergency:getStatus', async () => {
  return emergencyRecorder.getStatus();
});

ipcMain.handle('upload:getQueue', async () => {
  return uploadManager.getUploadQueue();
});

ipcMain.handle('upload:getHistory', async (event, filters = {}) => {
  return db.getUploadTasks(filters);
});

ipcMain.handle('upload:cancel', async (event, uploadId) => {
  return uploadManager.cancelUpload(uploadId);
});

ipcMain.handle('upload:retry', async (event, uploadId) => {
  return uploadManager.retryUpload(uploadId);
});

ipcMain.handle('upload:getStatus', async () => {
  return uploadManager.getStatus();
});

ipcMain.handle('gps:getTracks', async (event, filters = {}) => {
  return db.getGPSTracks(filters);
});

ipcMain.handle('gps:getTrackById', async (event, trackId) => {
  return db.getGPSTrackById(trackId);
});

ipcMain.handle('gps:getTrackPoints', async (event, trackId) => {
  return gpsTracker.getTrackPoints(trackId);
});

ipcMain.handle('gps:exportGPX', async (event, trackId) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出GPX文件',
    defaultPath: `track_${trackId}.gpx`,
    filters: [{ name: 'GPX文件', extensions: ['gpx'] }]
  });
  
  if (result.canceled) return null;
  
  return gpsTracker.exportToGPX(trackId, result.filePath);
});

ipcMain.handle('gps:exportKML', async (event, trackId) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出KML文件',
    defaultPath: `track_${trackId}.kml`,
    filters: [{ name: 'KML文件', extensions: ['kml'] }]
  });
  
  if (result.canceled) return null;
  
  return gpsTracker.exportToKML(trackId, result.filePath);
});

ipcMain.handle('gps:exportJSON', async (event, trackId) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出JSON文件',
    defaultPath: `track_${trackId}.json`,
    filters: [{ name: 'JSON文件', extensions: ['json'] }]
  });
  
  if (result.canceled) return null;
  
  return gpsTracker.exportToJSON(trackId, result.filePath);
});

ipcMain.handle('gps:getStatistics', async (event, trackId) => {
  return gpsTracker.getTrackStatistics(trackId);
});

ipcMain.handle('gps:delete', async (event, trackId) => {
  return gpsTracker.deleteTrack(trackId);
});

ipcMain.handle('gps:getStatus', async () => {
  return gpsTracker.getStatus();
});
