const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  serial: {
    list: () => ipcRenderer.invoke('serial:list'),
    connect: (options) => ipcRenderer.invoke('serial:connect', options),
    disconnect: () => ipcRenderer.invoke('serial:disconnect'),
    status: () => ipcRenderer.invoke('serial:status'),
    send: (command) => ipcRenderer.invoke('serial:send', command),
    getCalibration: () => ipcRenderer.invoke('serial:calibration:get'),
    setCalibration: (config) => ipcRenderer.invoke('serial:calibration:set', config),
    autoCalibrate: (referenceData, measuredData) => ipcRenderer.invoke('serial:calibration:auto', referenceData, measuredData),
    getFilterConfig: () => ipcRenderer.invoke('serial:filter:get'),
    setFilterConfig: (config) => ipcRenderer.invoke('serial:filter:set', config),
    enableDriftCompensation: (referenceValue) => ipcRenderer.invoke('serial:drift:enable', referenceValue),
    disableDriftCompensation: () => ipcRenderer.invoke('serial:drift:disable'),
    setDriftRate: (rate) => ipcRenderer.invoke('serial:drift:setRate', rate),
    estimateDrift: () => ipcRenderer.invoke('serial:drift:estimate'),
    onData: (callback) => {
      ipcRenderer.on('serial:data', (_event, data) => callback(data))
    },
    onError: (callback) => {
      ipcRenderer.on('serial:error', (_event, error) => callback(error))
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners('serial:data')
      ipcRenderer.removeAllListeners('serial:error')
    }
  },
  database: {
    listSamples: () => ipcRenderer.invoke('db:sample:list'),
    getSample: (id) => ipcRenderer.invoke('db:sample:get', id),
    saveSample: (sample) => ipcRenderer.invoke('db:sample:save', sample),
    updateSample: (sample) => ipcRenderer.invoke('db:sample:update', sample),
    deleteSample: (id) => ipcRenderer.invoke('db:sample:delete', id),
    searchSamples: (keyword) => ipcRenderer.invoke('db:sample:search', keyword)
  },
  vanGenuchten: {
    fit: (data) => ipcRenderer.invoke('vg:fit', data),
    curve: (params) => ipcRenderer.invoke('vg:curve', params)
  },
  report: {
    export: (reportData) => ipcRenderer.invoke('report:export', reportData),
    preview: (reportData) => ipcRenderer.invoke('report:preview', reportData)
  },
  dataProcessing: {
    processBatch: (dataPoints) => ipcRenderer.invoke('data:process', dataPoints)
  },
  turntable: {
    home: () => ipcRenderer.invoke('turntable:home'),
    moveTo: (position, options) => ipcRenderer.invoke('turntable:moveTo', position, options),
    moveNext: () => ipcRenderer.invoke('turntable:moveNext'),
    movePrevious: () => ipcRenderer.invoke('turntable:movePrevious'),
    status: () => ipcRenderer.invoke('turntable:status'),
    setPositions: (count) => ipcRenderer.invoke('turntable:setPositions', count),
    setSpeed: (speed) => ipcRenderer.invoke('turntable:setSpeed', speed),
    setName: (position, name) => ipcRenderer.invoke('turntable:setName', position, name),
    stop: () => ipcRenderer.invoke('turntable:stop'),
    reset: () => ipcRenderer.invoke('turntable:reset'),
    runSequence: (start, end, options) => ipcRenderer.invoke('turntable:runSequence', start, end, options),
    onPositionChanged: (callback) => {
      ipcRenderer.on('turntable:positionChanged', (_event, data) => callback(data))
    },
    onHomed: (callback) => {
      ipcRenderer.on('turntable:homed', (_event, data) => callback(data))
    },
    onSequenceCompleted: (callback) => {
      ipcRenderer.on('turntable:sequenceCompleted', (_event, data) => callback(data))
    }
  },
  multiPlate: {
    status: () => ipcRenderer.invoke('multiplate:status'),
    setPlateCount: (count) => ipcRenderer.invoke('multiplate:setPlateCount', count),
    setPlateName: (plateId, name) => ipcRenderer.invoke('multiplate:setPlateName', plateId, name),
    setPlateActive: (plateId, active) => ipcRenderer.invoke('multiplate:setPlateActive', plateId, active),
    addData: (plateId, data) => ipcRenderer.invoke('multiplate:addData', plateId, data),
    getPlateData: (plateId) => ipcRenderer.invoke('multiplate:getPlateData', plateId),
    getAllData: () => ipcRenderer.invoke('multiplate:getAllData'),
    setPressureSteps: (steps) => ipcRenderer.invoke('multiplate:setPressureSteps', steps),
    startAuto: (config) => ipcRenderer.invoke('multiplate:startAuto', config),
    stopAuto: () => ipcRenderer.invoke('multiplate:stopAuto'),
    fitPlate: (plateId, options) => ipcRenderer.invoke('multiplate:fitPlate', plateId, options),
    fitAll: (options) => ipcRenderer.invoke('multiplate:fitAll', options),
    clearPlate: (plateId) => ipcRenderer.invoke('multiplate:clearPlate', plateId),
    clearAll: () => ipcRenderer.invoke('multiplate:clearAll'),
    setEquilibriumConfig: (config) => ipcRenderer.invoke('multiplate:setEquilibriumConfig', config),
    summary: () => ipcRenderer.invoke('multiplate:summary'),
    onDataAdded: (callback) => {
      ipcRenderer.on('multiplate:dataAdded', (_event, data) => callback(data))
    },
    onEquilibriumReached: (callback) => {
      ipcRenderer.on('multiplate:equilibriumReached', (_event, data) => callback(data))
    },
    onFitComplete: (callback) => {
      ipcRenderer.on('multiplate:fitComplete', (_event, data) => callback(data))
    },
    onMeasurementCompleted: (callback) => {
      ipcRenderer.on('multiplate:measurementCompleted', (_event, data) => callback(data))
    }
  },
  hydrus: {
    exportFiles: (fitResults, options) => ipcRenderer.invoke('hydrus:exportFiles', fitResults, options),
    exportCSV: (fitResults, options) => ipcRenderer.invoke('hydrus:exportCSV', fitResults, options),
    exportJSON: (fitResults, options) => ipcRenderer.invoke('hydrus:exportJSON', fitResults, options),
    exportBatch: (fitResults, options) => ipcRenderer.invoke('hydrus:exportBatch', fitResults, options),
    convertParams: (fitResult, options) => ipcRenderer.invoke('hydrus:convertParams', fitResult, options),
    generateReport: (fitResults, options) => ipcRenderer.invoke('hydrus:generateReport', fitResults, options)
  }
})
