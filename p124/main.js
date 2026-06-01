const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

const SerialModule = require('./src/serial.js')
const DatabaseModule = require('./src/database.js')
const VanGenuchtenModule = require('./src/van_genuchten.js')
const ReportModule = require('./src/report.js')
const TurntableController = require('./src/turntable.js')
const MultiPlateManager = require('./src/multi_plate.js')
const HydrusExporter = require('./src/hydrus_export.js')

let mainWindow = null
let serialModule = null
let dbModule = null
let turntable = null
let multiPlate = null
let hydrusExporter = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    title: '土壤水分特征曲线分析仪',
    icon: path.join(__dirname, 'assets', 'icon.png')
  })

  mainWindow.loadFile('index.html')

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    if (serialModule) {
      serialModule.disconnect()
    }
    if (dbModule) {
      dbModule.close()
    }
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  dbModule = new DatabaseModule(path.join(app.getPath('userData'), 'soil_samples.db'))
  await dbModule.init()
  serialModule = new SerialModule()
  serialModule.onData((data) => {
    if (mainWindow) {
      mainWindow.webContents.send('serial:data', data)
    }
  })
  serialModule.onError((error) => {
    if (mainWindow) {
      mainWindow.webContents.send('serial:error', error.message)
    }
  })

  turntable = new TurntableController()
  turntable.on('positionChanged', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('turntable:positionChanged', info)
    }
  })
  turntable.on('homed', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('turntable:homed', info)
    }
  })
  turntable.on('autoSequenceCompleted', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('turntable:sequenceCompleted', info)
    }
  })

  multiPlate = new MultiPlateManager({ plateCount: 6 })
  multiPlate.on('dataAdded', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('multiplate:dataAdded', info)
    }
  })
  multiPlate.on('equilibriumReached', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('multiplate:equilibriumReached', info)
    }
  })
  multiPlate.on('plateFitComplete', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('multiplate:fitComplete', info)
    }
  })
  multiPlate.on('autoMeasurementCompleted', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('multiplate:measurementCompleted', info)
    }
  })

  hydrusExporter = new HydrusExporter()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (serialModule) {
    serialModule.disconnect()
  }
  if (dbModule) {
    dbModule.close()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ==================== Serial Port IPC ====================

ipcMain.handle('serial:list', async () => {
  try {
    const ports = await serialModule.listPorts()
    return { success: true, ports }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('serial:connect', async (event, options) => {
  try {
    await serialModule.connect(options)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('serial:disconnect', async () => {
  try {
    await serialModule.disconnect()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('serial:status', async () => {
  return {
    connected: serialModule.isConnected(),
    port: serialModule.getPortPath(),
    baudRate: serialModule.getBaudRate()
  }
})

ipcMain.handle('serial:send', async (event, command) => {
  try {
    await serialModule.send(command)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('serial:calibration:get', async () => {
  try {
    const config = serialModule.getCalibration()
    return { success: true, config }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('serial:calibration:set', async (event, config) => {
  try {
    serialModule.setCalibration(config)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('serial:calibration:auto', async (event, referenceData, measuredData) => {
  try {
    const result = serialModule.autoCalibrate(referenceData, measuredData)
    return { success: true, result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('serial:filter:get', async () => {
  try {
    const config = serialModule.getFilterConfig()
    return { success: true, config }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('serial:filter:set', async (event, config) => {
  try {
    serialModule.setFilterConfig(config)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('serial:drift:enable', async (event, referenceValue) => {
  try {
    serialModule.enableDriftCompensation(referenceValue)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('serial:drift:disable', async () => {
  try {
    serialModule.disableDriftCompensation()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('serial:drift:setRate', async (event, rate) => {
  try {
    serialModule.setDriftRate(rate)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('serial:drift:estimate', async () => {
  try {
    const rate = serialModule.estimateDriftRate()
    const stats = serialModule.getDriftStats()
    return { success: true, rate, stats }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('data:process', async (event, dataPoints) => {
  try {
    const processed = serialModule.processBatch(dataPoints)
    return { success: true, data: processed }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ==================== Database IPC ====================

ipcMain.handle('db:sample:list', async () => {
  try {
    const samples = dbModule.getAllSamples()
    return { success: true, samples }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('db:sample:get', async (event, id) => {
  try {
    const sample = dbModule.getSampleById(id)
    return { success: true, sample }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('db:sample:save', async (event, sample) => {
  try {
    const id = dbModule.saveSample(sample)
    return { success: true, id }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('db:sample:update', async (event, sample) => {
  try {
    dbModule.updateSample(sample)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('db:sample:delete', async (event, id) => {
  try {
    dbModule.deleteSample(id)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('db:sample:search', async (event, keyword) => {
  try {
    const samples = dbModule.searchSamples(keyword)
    return { success: true, samples }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ==================== Van Genuchten Fitting IPC ====================

ipcMain.handle('vg:fit', async (event, data) => {
  try {
    const result = VanGenuchtenModule.fit(data.pressures, data.waterContents, data.options || {})
    return { success: true, result }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('vg:curve', async (event, params) => {
  try {
    const curve = VanGenuchtenModule.generateCurve(params)
    return { success: true, curve }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ==================== Report Export IPC ====================

ipcMain.handle('report:export', async (event, reportData) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出分析报告',
    defaultPath: `土壤水分特征报告_${new Date().toISOString().slice(0, 10)}.html`,
    filters: [
      { name: 'HTML Report', extensions: ['html'] },
      { name: 'PDF Report', extensions: ['pdf'] },
      { name: 'Excel Data', extensions: ['xlsx', 'csv'] }
    ]
  })

  if (result.canceled) {
    return { success: false, canceled: true }
  }

  try {
    const filePath = result.filePath
    const ext = path.extname(filePath).toLowerCase()

    if (ext === '.html' || ext === '.htm') {
      const html = ReportModule.generateHTMLReport(reportData)
      fs.writeFileSync(filePath, html, 'utf-8')
    } else if (ext === '.csv') {
      const csv = ReportModule.generateCSVReport(reportData)
      fs.writeFileSync(filePath, csv, 'utf-8')
    } else if (ext === '.xlsx') {
      const xlsx = ReportModule.generateExcelReport(reportData)
      fs.writeFileSync(filePath, xlsx, 'binary')
    }

    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('report:preview', async (event, reportData) => {
  try {
    const tempDir = path.join(app.getPath('temp'), 'soil_report')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    const tempFile = path.join(tempDir, `preview_${Date.now()}.html`)
    const html = ReportModule.generateHTMLReport(reportData)
    fs.writeFileSync(tempFile, html, 'utf-8')

    const previewWin = new BrowserWindow({
      width: 900,
      height: 700,
      title: '报告预览',
      parent: mainWindow
    })
    previewWin.loadFile(tempFile)
    return { success: true, tempFile }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ==================== Turntable IPC ====================

ipcMain.handle('turntable:home', async () => {
  try {
    const result = await turntable.home()
    return result
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('turntable:moveTo', async (event, position, options) => {
  try {
    const result = await turntable.moveTo(position, options || {})
    return result
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('turntable:moveNext', async () => {
  try {
    const result = await turntable.moveNext()
    return result
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('turntable:movePrevious', async () => {
  try {
    const result = await turntable.movePrevious()
    return result
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('turntable:status', () => {
  return turntable.getStatus()
})

ipcMain.handle('turntable:setPositions', async (event, count) => {
  return turntable.setTotalPositions(count)
})

ipcMain.handle('turntable:setSpeed', async (event, speed) => {
  return turntable.setSpeed(speed)
})

ipcMain.handle('turntable:setName', async (event, position, name) => {
  return turntable.setPositionName(position, name)
})

ipcMain.handle('turntable:stop', () => {
  turntable.stop()
  return { success: true }
})

ipcMain.handle('turntable:reset', () => {
  turntable.reset()
  return { success: true }
})

ipcMain.handle('turntable:runSequence', async (event, start, end, options) => {
  try {
    const result = await turntable.runAutoSequence(start, end, options || {})
    return result
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ==================== Multi-Plate IPC ====================

ipcMain.handle('multiplate:status', () => {
  return multiPlate.getStatus()
})

ipcMain.handle('multiplate:setPlateCount', async (event, count) => {
  return multiPlate.setPlateCount(count)
})

ipcMain.handle('multiplate:setPlateName', async (event, plateId, name) => {
  return multiPlate.setPlateName(plateId, name)
})

ipcMain.handle('multiplate:setPlateActive', async (event, plateId, active) => {
  return multiPlate.setPlateActive(plateId, active)
})

ipcMain.handle('multiplate:addData', async (event, plateId, data) => {
  return multiPlate.addDataPoint(plateId, data)
})

ipcMain.handle('multiplate:getPlateData', async (event, plateId) => {
  return { success: true, data: multiPlate.getPlateData(plateId) }
})

ipcMain.handle('multiplate:getAllData', () => {
  return { success: true, data: multiPlate.getAllData() }
})

ipcMain.handle('multiplate:setPressureSteps', async (event, steps) => {
  return multiPlate.setPressureSteps(steps)
})

ipcMain.handle('multiplate:startAuto', async (event, config) => {
  return multiPlate.startAutoMeasurement(config || {})
})

ipcMain.handle('multiplate:stopAuto', () => {
  multiPlate.stopAutoMeasurement()
  return { success: true }
})

ipcMain.handle('multiplate:fitPlate', async (event, plateId, options) => {
  return multiPlate.fitPlate(plateId, options || {})
})

ipcMain.handle('multiplate:fitAll', async (event, options) => {
  return multiPlate.fitAllActivePlates(options || {})
})

ipcMain.handle('multiplate:clearPlate', async (event, plateId) => {
  return multiPlate.clearPlateData(plateId)
})

ipcMain.handle('multiplate:clearAll', () => {
  return multiPlate.clearAllData()
})

ipcMain.handle('multiplate:setEquilibriumConfig', async (event, config) => {
  return multiPlate.setEquilibriumConfig(
    config.threshold,
    config.time,
    config.minPoints
  )
})

ipcMain.handle('multiplate:summary', () => {
  return { success: true, summary: multiPlate.getSummary() }
})

// ==================== Hydrus Export IPC ====================

ipcMain.handle('hydrus:exportFiles', async (event, fitResults, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '选择导出目录',
    defaultPath: path.join(app.getPath('documents'), 'HYDRUS_Export'),
    properties: ['createDirectory', 'openDirectory']
  })

  if (result.canceled) {
    return { success: false, canceled: true }
  }

  try {
    const exportResult = hydrusExporter.exportToFiles(fitResults, result.filePath, options || {})
    return exportResult
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('hydrus:exportCSV', async (event, fitResults, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出Hydrus参数CSV',
    defaultPath: `HydrusParameters_${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })

  if (result.canceled) {
    return { success: false, canceled: true }
  }

  try {
    return hydrusExporter.exportToCSV(fitResults, result.filePath, options || {})
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('hydrus:exportJSON', async (event, fitResults, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出Hydrus参数JSON',
    defaultPath: `HydrusParameters_${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })

  if (result.canceled) {
    return { success: false, canceled: true }
  }

  try {
    return hydrusExporter.exportToJSON(fitResults, result.filePath, options || {})
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('hydrus:exportBatch', async (event, fitResults, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '选择批量导出目录',
    defaultPath: path.join(app.getPath('documents'), 'HYDRUS_Batch'),
    properties: ['createDirectory', 'openDirectory']
  })

  if (result.canceled) {
    return { success: false, canceled: true }
  }

  try {
    return hydrusExporter.generateHYDRUSBatch(fitResults, result.filePath, options || {})
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('hydrus:convertParams', async (event, fitResult, options) => {
  try {
    const params = hydrusExporter.convertToHydrusParams(fitResult, options || {})
    return { success: true, params }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('hydrus:generateReport', async (event, fitResults, options) => {
  try {
    const report = hydrusExporter.generateSummaryReport(fitResults, options || {})
    return { success: true, report }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
