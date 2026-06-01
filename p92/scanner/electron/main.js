const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../frontend/index.html'));
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

function runPythonScript(args) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../python/scanner.py');
    const pythonProcess = spawn('python3', [scriptPath, ...args]);
    
    let output = '';
    let error = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(output));
        } catch (e) {
          resolve(output);
        }
      } else {
        reject(new Error(error || `Python script exited with code ${code}`));
      }
    });
  });
}

ipcMain.handle('detect-corners', async (event, imagePath) => {
  try {
    const result = await runPythonScript(['detect', imagePath]);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('warp-perspective', async (event, imagePath, corners, outputPath, removeShadow = false) => {
  try {
    const cornersStr = JSON.stringify(corners);
    const args = ['warp', imagePath, cornersStr, outputPath];
    if (removeShadow) {
      args.push('true');
    }
    const result = await runPythonScript(args);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('detect-barcode', async (event, imagePath) => {
  try {
    const result = await runPythonScript(['barcode', imagePath]);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ocr-image', async (event, imagePath, lang) => {
  try {
    const args = ['ocr', imagePath];
    if (lang) {
      args.push(lang);
    }
    const result = await runPythonScript(args);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-searchable-pdf', async (event, imagePaths, outputPath, lang) => {
  try {
    const imagePathsStr = JSON.stringify(imagePaths);
    const args = ['searchable-pdf', imagePathsStr, outputPath];
    if (lang) {
      args.push(lang);
    }
    const result = await runPythonScript(args);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('remove-shadow', async (event, imagePath, outputPath) => {
  try {
    const result = await runPythonScript(['remove-shadow', imagePath, outputPath]);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp'] }
    ]
  });
  return result.filePaths;
});

ipcMain.handle('select-output-path', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'PNG Image', extensions: ['png'] },
      { name: 'PDF Document', extensions: ['pdf'] }
    ]
  });
  return result.filePath;
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.filePaths[0];
});

ipcMain.handle('export-png', async (event, imageData, outputPath) => {
  try {
    const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(outputPath, base64Data, 'base64');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-pdf', async (event, imagesData, outputPath) => {
  try {
    const pdfDoc = await PDFDocument.create();
    
    for (const imageData of imagesData) {
      const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
      const imageBytes = Buffer.from(base64Data, 'base64');
      const image = await pdfDoc.embedPng(imageBytes);
      
      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height
      });
    }
    
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
