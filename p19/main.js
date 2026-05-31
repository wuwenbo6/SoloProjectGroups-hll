const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const ParticleDatabase = require('./database');
const ExcelJS = require('exceljs');

let mainWindow;
let db;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
    
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    db = new ParticleDatabase(path.join(app.getPath('userData'), 'particle_analyzer.db'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (db) db.close();
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('analyze-image', async (event, imagePath, minArea, maxArea, fgThreshold, useAdaptive, scaleFactor) => {
    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, 'python', 'particle_analyzer.py');
        const python = spawn('python3', [
            pythonScript, 
            imagePath, 
            minArea, 
            maxArea,
            fgThreshold || 0.5,
            useAdaptive || false,
            scaleFactor || 1.0
        ]);

        let output = '';
        let error = '';

        python.stdout.on('data', (data) => {
            output += data.toString();
        });

        python.stderr.on('data', (data) => {
            error += data.toString();
        });

        python.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(error || `Python script exited with code ${code}`));
                return;
            }

            try {
                const result = JSON.parse(output);
                resolve(result);
            } catch (e) {
                reject(new Error(`Failed to parse output: ${e.message}\nOutput: ${output}`));
            }
        });
    });
});

ipcMain.handle('save-analysis', async (event, imageName, imagePath, result) => {
    return db.saveAnalysis(imageName, imagePath, result);
});

ipcMain.handle('get-analyses', async () => {
    return db.getAllAnalyses();
});

ipcMain.handle('get-analysis-particles', async (event, analysisId) => {
    return db.getAnalysisParticles(analysisId);
});

ipcMain.handle('delete-analysis', async (event, analysisId) => {
    db.deleteAnalysis(analysisId);
    return true;
});

ipcMain.handle('export-excel', async (event, filePath, result) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('颗粒分析结果');

    const scaleFactor = result.scale_factor || 1.0;
    const unit = scaleFactor !== 1.0 ? 'nm' : 'px';
    const areaUnit = scaleFactor !== 1.0 ? 'nm²' : 'px²';

    worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: `面积(${areaUnit})`, key: 'area', width: 15 },
        { header: `面积(px²)`, key: 'area_px', width: 15 },
        { header: `周长(${unit})`, key: 'perimeter', width: 15 },
        { header: `周长(px)`, key: 'perimeter_px', width: 15 },
        { header: '圆形度', key: 'circularity', width: 15 },
        { header: '中心X', key: 'cx', width: 10 },
        { header: '中心Y', key: 'cy', width: 10 }
    ];

    result.particles.forEach(p => {
        worksheet.addRow({
            id: p.id,
            area: p.area.toFixed(2),
            area_px: (p.area_px || p.area).toFixed(2),
            perimeter: p.perimeter.toFixed(2),
            perimeter_px: (p.perimeter_px || p.perimeter).toFixed(2),
            circularity: p.circularity.toFixed(4),
            cx: p.centroid.x,
            cy: p.centroid.y
        });
    });

    worksheet.addRow({});
    worksheet.addRow({ id: '统计信息' });
    worksheet.addRow({ id: '颗粒总数', area: result.total_count });
    worksheet.addRow({ id: `平均面积(${areaUnit})`, area: result.statistics.avg_area.toFixed(2) });
    worksheet.addRow({ id: '平均圆形度', area: result.statistics.avg_circularity.toFixed(4) });
    worksheet.addRow({ id: `比例尺(1px=${unit})`, area: scaleFactor.toFixed(6) });

    await workbook.xlsx.writeFile(filePath);
    return true;
});

ipcMain.handle('show-save-dialog', async (event, options) => {
    return dialog.showSaveDialog(mainWindow, options);
});

ipcMain.handle('show-open-dialog', async (event, options) => {
    return dialog.showOpenDialog(mainWindow, options);
});

ipcMain.handle('analyze-image-unet', async (event, imagePath, minArea, maxArea, scaleFactor, useTF) => {
    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, 'python', 'unet_segmenter.py');
        const python = spawn('python3', [pythonScript, imagePath, minArea, maxArea, scaleFactor, useTF]);

        let output = '';
        let error = '';

        python.stdout.on('data', (data) => {
            output += data.toString();
        });

        python.stderr.on('data', (data) => {
            error += data.toString();
        });

        python.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(error || `Python script exited with code ${code}`));
                return;
            }

            try {
                const result = JSON.parse(output);
                resolve(result);
            } catch (e) {
                reject(new Error(`Failed to parse output: ${e.message}\nOutput: ${output}`));
            }
        });
    });
});

ipcMain.handle('batch-process', async (event, imageDir, minArea, maxArea, fgThreshold, useAdaptive, scaleFactor, method, outputDir) => {
    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, 'python', 'batch_processor.py');
        const args = [pythonScript, imageDir, minArea, maxArea, fgThreshold, useAdaptive, scaleFactor, method];
        if (outputDir) args.push(outputDir);
        
        const python = spawn('python3', args);

        let output = '';
        let error = '';

        python.stdout.on('data', (data) => {
            output += data.toString();
        });

        python.stderr.on('data', (data) => {
            error += data.toString();
        });

        python.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(error || `Python script exited with code ${code}`));
                return;
            }

            try {
                const lastLine = output.trim().split('\n').pop();
                const result = JSON.parse(lastLine);
                resolve(result);
            } catch (e) {
                reject(new Error(`Failed to parse output: ${e.message}\nOutput: ${output}`));
            }
        });
    });
});

ipcMain.handle('export-imagej', async (event, result, filePath, scriptType) => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const tempJson = path.join(os.tmpdir(), `particle_result_${Date.now()}.json`);
    fs.writeFileSync(tempJson, JSON.stringify(result));
    
    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, 'python', 'imagej_exporter.py');
        const python = spawn('python3', [pythonScript, tempJson, filePath, result.image_path || '', scriptType]);

        let output = '';
        let error = '';

        python.stdout.on('data', (data) => {
            output += data.toString();
        });

        python.stderr.on('data', (data) => {
            error += data.toString();
        });

        python.on('close', (code) => {
            fs.unlinkSync(tempJson);
            
            if (code !== 0) {
                reject(new Error(error || `Python script exited with code ${code}`));
                return;
            }

            try {
                const result = JSON.parse(output);
                resolve(result);
            } catch (e) {
                reject(new Error(`Failed to parse output: ${e.message}\nOutput: ${output}`));
            }
        });
    });
});
