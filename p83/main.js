const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const VideoDatabase = require('./database');

let mainWindow;
let pythonProcess = null;
let db = null;
const API_PORT = 5000;
const API_BASE = `http://127.0.0.1:${API_PORT}/api`;

function getPythonPath() {
    if (process.platform === 'win32') {
        return 'python';
    }
    return 'python3';
}

function startPythonServer() {
    return new Promise((resolve, reject) => {
        const pythonPath = getPythonPath();
        const serverPath = path.join(__dirname, 'python', 'server.py');
        
        console.log('Starting Python server...');
        console.log(`Python path: ${pythonPath}`);
        console.log(`Server path: ${serverPath}`);
        
        pythonProcess = spawn(pythonPath, [serverPath, API_PORT], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        pythonProcess.stdout.on('data', (data) => {
            console.log(`Python stdout: ${data}`);
            if (data.toString().includes('Running on')) {
                resolve(true);
            }
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error(`Python stderr: ${data}`);
        });

        pythonProcess.on('close', (code) => {
            console.log(`Python process exited with code ${code}`);
            pythonProcess = null;
        });

        pythonProcess.on('error', (err) => {
            console.error('Failed to start Python server:', err);
            reject(err);
        });

        setTimeout(() => {
            resolve(true);
        }, 3000);
    });
}

function stopPythonServer() {
    if (pythonProcess) {
        pythonProcess.kill();
        pythonProcess = null;
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, 'assets', 'icon.png')
    });

    mainWindow.loadFile('index.html');
    
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    });
    return response.json();
}

app.whenReady().then(async () => {
    const dbPath = path.join(app.getPath('userData'), 'videos.db');
    db = new VideoDatabase(dbPath);
    await db.initDatabase();
    console.log('Database initialized at:', dbPath);

    try {
        await startPythonServer();
        console.log('Python server started');
    } catch (err) {
        console.error('Failed to start Python server:', err);
    }

    createWindow();
});

app.on('window-all-closed', () => {
    stopPythonServer();
    if (db) {
        db.close();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

ipcMain.handle('api-port', () => API_PORT);

ipcMain.handle('select-video', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Videos', extensions: ['mp4', 'avi', 'mov', 'mkv', 'wmv'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (result.canceled) {
        return null;
    }

    const filePath = result.filePaths[0];
    const stats = fs.statSync(filePath);
    
    return {
        path: filePath,
        filename: path.basename(filePath),
        size: stats.size
    };
});

ipcMain.handle('save-dialog', async (event, defaultPath) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultPath || 'summary.mp4',
        filters: [
            { name: 'MP4 Video', extensions: ['mp4'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    return result.canceled ? null : result.filePath;
});

ipcMain.handle('select-folder-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: '选择导出文件夹'
    });

    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('db-add-video', async (event, videoData) => {
    return db.addVideo(videoData);
});

ipcMain.handle('db-get-video', async (event, videoId) => {
    return db.getVideo(videoId);
});

ipcMain.handle('db-get-all-videos', async () => {
    return db.getAllVideos();
});

ipcMain.handle('db-update-analysis', async (event, videoId, analysisResult) => {
    db.updateVideoAnalysis(videoId, analysisResult);
    return true;
});

ipcMain.handle('db-update-summary', async (event, videoId, summaryPath) => {
    db.updateVideoSummary(videoId, summaryPath);
    return true;
});

ipcMain.handle('db-delete-video', async (event, videoId) => {
    return db.deleteVideo(videoId);
});

ipcMain.handle('api-upload', async (event, filePath) => {
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer]);
    formData.append('video', blob, path.basename(filePath));

    const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData
    });
    return response.json();
});

ipcMain.handle('api-analyze', async (event, videoPath, videoId) => {
    return apiRequest('/analyze', {
        method: 'POST',
        body: JSON.stringify({ video_path: videoPath, video_id: videoId })
    });
});

ipcMain.handle('api-progress', async (event, taskId) => {
    return apiRequest(`/progress/${taskId}`);
});

ipcMain.handle('api-result', async (event, taskId) => {
    return apiRequest(`/result/${taskId}`);
});

ipcMain.handle('api-preview', async (event, videoPath, analysisResult, numFrames = 6) => {
    return apiRequest('/preview', {
        method: 'POST',
        body: JSON.stringify({ video_path: videoPath, analysis_result: analysisResult, num_frames: numFrames })
    });
});

ipcMain.handle('api-generate-summary', async (event, videoPath, analysisResult, videoId, outputFilename) => {
    return apiRequest('/generate_summary', {
        method: 'POST',
        body: JSON.stringify({ 
            video_path: videoPath, 
            analysis_result: analysisResult, 
            video_id: videoId,
            output_filename: outputFilename
        })
    });
});

ipcMain.handle('api-export', async (event, sourcePath, targetPath) => {
    return apiRequest('/export', {
        method: 'POST',
        body: JSON.stringify({ source_path: sourcePath, target_path: targetPath })
    });
});

ipcMain.handle('api-export-keyframes', async (event, analysisResult, outputDir) => {
    return apiRequest('/export_keyframes', {
        method: 'POST',
        body: JSON.stringify({ analysis_result: analysisResult, output_dir: outputDir })
    });
});
