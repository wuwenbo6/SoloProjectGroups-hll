class SoilAnalyzerApp {
  constructor() {
    this.dataPoints = []
    this.isPaused = false
    this.selectedSampleId = null
    this.fitResult = null
    this.curvePoints = []
    this.realtimeChart = null
    this.retentionChart = null
    this.samples = []

    this.init()
  }

  init() {
    this.bindNavigation()
    this.bindSerialControls()
    this.bindDataControls()
    this.bindDataProcessingControls()
    this.bindTurntableControls()
    this.bindMultiPlateControls()
    this.bindHydrusControls()
    this.bindSampleControls()
    this.bindAnalysisControls()
    this.bindModalControls()
    this.initRealtimeChart()
    this.initRetentionChart()
    this.loadSamples()
    this.setupSerialListeners()
    this.setupTurntableListeners()
    this.setupMultiPlateListeners()
  }

  bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page
        this.switchPage(page)
      })
    })
  }

  switchPage(pageName) {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === pageName)
    })
    document.querySelectorAll('.page').forEach(page => {
      page.classList.toggle('active', page.id === `page-${pageName}`)
    })
  }

  bindSerialControls() {
    document.getElementById('refreshPorts').addEventListener('click', () => this.refreshPorts())
    document.getElementById('connectBtn').addEventListener('click', () => this.connect())
    document.getElementById('disconnectBtn').addEventListener('click', () => this.disconnect())
    this.refreshPorts()
  }

  bindDataControls() {
    document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause())
    document.getElementById('clearBtn').addEventListener('click', () => this.clearData())
    document.getElementById('manualAddBtn').addEventListener('click', () => this.openManualAddModal())
  }

  bindDataProcessingControls() {
    document.getElementById('applyCalibrationBtn').addEventListener('click', () => this.applyCalibration())
    document.getElementById('resetCalibrationBtn').addEventListener('click', () => this.resetCalibration())
    document.getElementById('applyFilterBtn').addEventListener('click', () => this.applyFilter())
    document.getElementById('estimateDriftBtn').addEventListener('click', () => this.estimateDrift())
    document.getElementById('enableDriftBtn').addEventListener('click', () => this.enableDriftCompensation())
    document.getElementById('disableDriftBtn').addEventListener('click', () => this.disableDriftCompensation())
  }

  async applyCalibration() {
    if (!window.electronAPI) return

    const config = {
      pressureOffset: parseFloat(document.getElementById('pressureOffset').value) || 0,
      pressureScale: parseFloat(document.getElementById('pressureScale').value) || 1,
      waterContentOffset: parseFloat(document.getElementById('wcOffset').value) || 0,
      waterContentScale: parseFloat(document.getElementById('wcScale').value) || 1
    }

    const result = await window.electronAPI.serial.setCalibration(config)
    if (result.success) {
      this.showToast('校准参数已应用', 'success')
    } else {
      this.showToast(`应用失败: ${result.error}`, 'error')
    }
  }

  async resetCalibration() {
    if (!window.electronAPI) return

    document.getElementById('pressureOffset').value = 0
    document.getElementById('pressureScale').value = 1
    document.getElementById('wcOffset').value = 0
    document.getElementById('wcScale').value = 1

    const config = {
      pressureOffset: 0,
      pressureScale: 1,
      waterContentOffset: 0,
      waterContentScale: 1
    }

    const result = await window.electronAPI.serial.setCalibration(config)
    if (result.success) {
      this.showToast('校准参数已重置', 'info')
    }
  }

  async applyFilter() {
    if (!window.electronAPI) return

    const config = {
      type: document.getElementById('filterType').value,
      windowSize: parseInt(document.getElementById('filterWindow').value) || 5,
      alpha: parseFloat(document.getElementById('filterAlpha').value) || 0.3,
      outlierThreshold: parseFloat(document.getElementById('outlierThreshold').value) || 2
    }

    const result = await window.electronAPI.serial.setFilterConfig(config)
    if (result.success) {
      this.showToast(`滤波已设置为: ${config.type}`, 'success')
    } else {
      this.showToast(`设置失败: ${result.error}`, 'error')
    }
  }

  async estimateDrift() {
    if (!window.electronAPI) return

    if (this.dataPoints.length < 10) {
      this.showToast('需要至少10个数据点来估计漂移', 'warning')
      return
    }

    const result = await window.electronAPI.serial.estimateDrift()
    if (result.success) {
      document.getElementById('driftRate').value = result.rate.toFixed(4)

      if (result.stats) {
        document.getElementById('driftStats').style.display = 'block'
        document.getElementById('driftTrend').textContent = result.stats.trend === 'increasing' ? '上升 ↑' : result.stats.trend === 'decreasing' ? '下降 ↓' : '稳定'
        document.getElementById('driftTotal').textContent = result.stats.totalDrift.toFixed(2) + ' hPa'
        document.getElementById('driftRMSE').textContent = result.stats.rmse.toFixed(4)
      }

      this.showToast(`漂移估计完成: ${result.rate.toFixed(4)} hPa/小时`, 'info')
    } else {
      this.showToast(`估计失败: ${result.error}`, 'error')
    }
  }

  async enableDriftCompensation() {
    if (!window.electronAPI) return

    const referenceValue = parseFloat(document.getElementById('driftReference').value)
    const driftRate = parseFloat(document.getElementById('driftRate').value) || 0

    if (isNaN(referenceValue)) {
      this.showToast('请输入参考压力值', 'warning')
      return
    }

    const resultEnable = await window.electronAPI.serial.enableDriftCompensation(referenceValue)
    const resultRate = await window.electronAPI.serial.setDriftRate(driftRate)

    if (resultEnable.success && resultRate.success) {
      document.getElementById('enableDriftBtn').disabled = true
      document.getElementById('disableDriftBtn').disabled = false
      this.showToast('漂移补偿已启用', 'success')
    } else {
      this.showToast('启用失败', 'error')
    }
  }

  async disableDriftCompensation() {
    if (!window.electronAPI) return

    const result = await window.electronAPI.serial.disableDriftCompensation()
    if (result.success) {
      document.getElementById('enableDriftBtn').disabled = false
      document.getElementById('disableDriftBtn').disabled = true
      this.showToast('漂移补偿已禁用', 'info')
    }
  }

  bindSampleControls() {
    document.getElementById('searchInput').addEventListener('input', (e) => this.searchSamples(e.target.value))
    document.getElementById('saveSampleBtn').addEventListener('click', () => this.saveSample())
    document.getElementById('deleteSampleBtn').addEventListener('click', () => this.deleteSample())
  }

  bindAnalysisControls() {
    document.getElementById('fitBtn').addEventListener('click', () => this.performFit())
    document.getElementById('exportReportBtn').addEventListener('click', () => this.exportReport())
    document.getElementById('showObserved').addEventListener('change', () => this.updateRetentionChart())
    document.getElementById('showFitted').addEventListener('change', () => this.updateRetentionChart())
    document.getElementById('logScale').addEventListener('change', () => this.updateRetentionChart())
  }

  bindModalControls() {
    document.getElementById('closeManualModal').addEventListener('click', () => this.closeManualAddModal())
    document.getElementById('cancelManualAdd').addEventListener('click', () => this.closeManualAddModal())
    document.getElementById('confirmManualAdd').addEventListener('click', () => this.confirmManualAdd())

    document.getElementById('manualAddModal').addEventListener('click', (e) => {
      if (e.target.id === 'manualAddModal') {
        this.closeManualAddModal()
      }
    })
  }

  bindTurntableControls() {
    document.getElementById('homeBtn').addEventListener('click', () => this.turntableHome())
    document.getElementById('prevBtn').addEventListener('click', () => this.turntableMovePrevious())
    document.getElementById('nextBtn').addEventListener('click', () => this.turntableMoveNext())
    document.getElementById('gotoBtn').addEventListener('click', () => this.turntableGoto())
    document.getElementById('positionCount').addEventListener('change', (e) => this.setTurntablePositions(e.target.value))
    document.getElementById('turntableSpeed').addEventListener('input', (e) => {
      document.getElementById('speedValue').textContent = e.target.value
      this.setTurntableSpeed(e.target.value)
    })
    document.getElementById('setNameBtn').addEventListener('click', () => this.setPositionName())
    document.getElementById('startSeqBtn').addEventListener('click', () => this.startSequence())
    document.getElementById('stopSeqBtn').addEventListener('click', () => this.stopSequence())

    this.refreshTurntableStatus()
    this.renderPositionList()
  }

  bindMultiPlateControls() {
    document.getElementById('plateCount').addEventListener('change', (e) => this.setPlateCount(e.target.value))
    document.getElementById('applyConfigBtn').addEventListener('click', () => this.applyMultiPlateConfig())
    document.getElementById('startAutoBtn').addEventListener('click', () => this.startAutoMeasurement())
    document.getElementById('stopAutoBtn').addEventListener('click', () => this.stopAutoMeasurement())
    document.getElementById('fitAllBtn').addEventListener('click', () => this.fitAllPlates())
    document.getElementById('clearAllBtn').addEventListener('click', () => this.clearAllPlates())
    document.getElementById('exportDataBtn').addEventListener('click', () => this.exportMultiPlateData())

    this.refreshMultiPlateStatus()
    this.renderPlateGrid()
  }

  bindHydrusControls() {
    document.getElementById('selectAllBtn').addEventListener('click', () => this.selectAllHydrusSamples())
    document.getElementById('deselectAllBtn').addEventListener('click', () => this.deselectAllHydrusSamples())
    document.getElementById('hydrusModelType').addEventListener('change', () => this.updateHydrusParamsPreview())
    document.getElementById('hydrusL').addEventListener('change', () => this.updateHydrusParamsPreview())
    document.getElementById('hydrusKs').addEventListener('change', () => this.updateHydrusParamsPreview())
    document.getElementById('exportFilesBtn').addEventListener('click', () => this.exportHydrusFiles())
    document.getElementById('exportCsvBtn').addEventListener('click', () => this.exportHydrusCSV())
    document.getElementById('exportJsonBtn').addEventListener('click', () => this.exportHydrusJSON())
    document.getElementById('exportBatchBtn').addEventListener('click', () => this.exportHydrusBatch())
    document.getElementById('previewReportBtn').addEventListener('click', () => this.previewHydrusReport())

    this.refreshHydrusSampleList()
  }

  setupSerialListeners() {
    if (window.electronAPI) {
      window.electronAPI.serial.onData((data) => {
        if (!this.isPaused) {
          this.addDataPoint(data)
        }
      })

      window.electronAPI.serial.onError((error) => {
        this.showToast(error, 'error')
      })
    }
  }

  async refreshPorts() {
    if (!window.electronAPI) return

    const result = await window.electronAPI.serial.list()
    const select = document.getElementById('portSelect')
    select.innerHTML = '<option value="">-- 请选择串口 --</option>'

    if (result.success) {
      result.ports.forEach(port => {
        const option = document.createElement('option')
        option.value = port.path
        option.textContent = `${port.path} - ${port.manufacturer || '未知设备'}`
        select.appendChild(option)
      })
    } else {
      this.showToast('获取串口列表失败', 'error')
    }
  }

  async connect() {
    const path = document.getElementById('portSelect').value
    if (!path) {
      this.showToast('请选择串口', 'warning')
      return
    }

    const options = {
      path,
      baudRate: document.getElementById('baudRateSelect').value,
      dataBits: document.getElementById('dataBitsSelect').value,
      stopBits: document.getElementById('stopBitsSelect').value,
      parity: document.getElementById('paritySelect').value
    }

    const result = await window.electronAPI.serial.connect(options)
    if (result.success) {
      this.updateConnectionStatus(true, path)
      this.showToast(`已连接到 ${path}`, 'success')
      document.getElementById('connectBtn').disabled = true
      document.getElementById('disconnectBtn').disabled = false
      document.getElementById('pauseBtn').disabled = false
      document.getElementById('clearBtn').disabled = false
    } else {
      this.showToast(`连接失败: ${result.error}`, 'error')
    }
  }

  async disconnect() {
    const result = await window.electronAPI.serial.disconnect()
    if (result.success) {
      this.updateConnectionStatus(false)
      this.showToast('已断开连接', 'info')
      document.getElementById('connectBtn').disabled = false
      document.getElementById('disconnectBtn').disabled = true
      document.getElementById('pauseBtn').disabled = true
      document.getElementById('clearBtn').disabled = true
    } else {
      this.showToast(`断开失败: ${result.error}`, 'error')
    }
  }

  updateConnectionStatus(connected, portPath = '') {
    const statusDot = document.querySelector('.status-dot')
    const statusText = document.querySelector('.status-text')

    if (connected) {
      statusDot.classList.remove('disconnected')
      statusDot.classList.add('connected')
      statusText.textContent = `已连接: ${portPath}`
    } else {
      statusDot.classList.remove('connected')
      statusDot.classList.add('disconnected')
      statusText.textContent = '未连接'
    }
  }

  addDataPoint(data) {
    this.dataPoints.push(data)
    this.updateDataDisplay(data)
    this.updateDataTable()
    this.updateRealtimeChart()
  }

  updateDataDisplay(data) {
    document.getElementById('currentPressure').textContent = data.pressure.toFixed(2)
    document.getElementById('currentWaterContent').textContent = data.waterContent.toFixed(4)
    document.getElementById('dataCount').textContent = this.dataPoints.length
  }

  updateDataTable() {
    const tbody = document.getElementById('dataTableBody')

    if (this.dataPoints.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5" class="empty-cell">暂无数据，请连接设备采集或手动添加</td></tr>'
      return
    }

    tbody.innerHTML = this.dataPoints.map((d, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${d.pressure.toFixed(2)}</td>
        <td>${d.waterContent.toFixed(4)}</td>
        <td>${new Date(d.timestamp).toLocaleTimeString()}</td>
        <td>
          <button class="btn btn-secondary" onclick="app.deleteDataPoint(${i})" style="padding: 4px 8px; font-size: 12px;">删除</button>
        </td>
      </tr>
    `).join('')
  }

  deleteDataPoint(index) {
    this.dataPoints.splice(index, 1)
    this.updateDataTable()
    this.updateRealtimeChart()
    this.showToast('已删除数据点', 'info')
  }

  togglePause() {
    this.isPaused = !this.isPaused
    const btn = document.getElementById('pauseBtn')
    btn.textContent = this.isPaused ? '继续' : '暂停'
    this.showToast(this.isPaused ? '已暂停采集' : '已继续采集', 'info')
  }

  clearData() {
    this.dataPoints = []
    this.updateDataDisplay({ pressure: 0, waterContent: 0 })
    this.updateDataTable()
    this.updateRealtimeChart()
    this.showToast('已清空所有数据', 'info')
  }

  openManualAddModal() {
    document.getElementById('manualAddModal').classList.add('active')
    document.getElementById('manualPressure').value = ''
    document.getElementById('manualWaterContent').value = ''
    document.getElementById('manualPressure').focus()
  }

  closeManualAddModal() {
    document.getElementById('manualAddModal').classList.remove('active')
  }

  confirmManualAdd() {
    const pressure = parseFloat(document.getElementById('manualPressure').value)
    const waterContent = parseFloat(document.getElementById('manualWaterContent').value)

    if (isNaN(pressure) || isNaN(waterContent)) {
      this.showToast('请输入有效的数值', 'warning')
      return
    }

    this.addDataPoint({
      pressure,
      waterContent,
      timestamp: Date.now()
    })

    this.closeManualAddModal()
    this.showToast('已添加数据点', 'success')
  }

  initRealtimeChart() {
    const ctx = document.getElementById('realtimeChart').getContext('2d')
    this.realtimeChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: '含水量',
            data: [],
            backgroundColor: 'rgba(59, 130, 246, 0.6)',
            borderColor: 'rgba(59, 130, 246, 1)',
            pointRadius: 5,
            showLine: true,
            tension: 0.3,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: '压力 (hPa)' },
            reverse: true
          },
          y: {
            type: 'linear',
            title: { display: true, text: '含水量 (cm³/cm³)' },
            min: 0,
            max: 1
          }
        },
        plugins: {
          legend: { display: false }
        },
        animation: { duration: 0 }
      }
    })
  }

  updateRealtimeChart() {
    if (!this.realtimeChart) return

    const data = this.dataPoints.map(d => ({
      x: d.pressure,
      y: d.waterContent
    }))

    this.realtimeChart.data.datasets[0].data = data
    this.realtimeChart.update('none')
  }

  initRetentionChart() {
    const ctx = document.getElementById('retentionChart').getContext('2d')
    this.retentionChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: '实测数据',
            data: [],
            backgroundColor: 'rgba(59, 130, 246, 0.8)',
            borderColor: 'rgba(59, 130, 246, 1)',
            pointRadius: 6,
            showLine: false
          },
          {
            label: '拟合曲线',
            data: [],
            borderColor: 'rgba(239, 68, 68, 1)',
            backgroundColor: 'transparent',
            pointRadius: 0,
            showLine: true,
            tension: 0.4,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'logarithmic',
            title: { display: true, text: '压力水头 h (cm)' },
            reverse: false
          },
          y: {
            type: 'linear',
            title: { display: true, text: '含水量 θ (cm³/cm³)' },
            min: 0,
            max: 1
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top'
          }
        }
      }
    })
  }

  updateRetentionChart() {
    if (!this.retentionChart) return

    const showObserved = document.getElementById('showObserved').checked
    const showFitted = document.getElementById('showFitted').checked
    const useLogScale = document.getElementById('logScale').checked

    const observedData = this.dataPoints.map(d => ({
      x: Math.abs(d.pressure),
      y: d.waterContent
    }))

    this.retentionChart.data.datasets[0].data = showObserved ? observedData : []
    this.retentionChart.data.datasets[1].data = showFitted ? this.curvePoints : []

    this.retentionChart.options.scales.x.type = useLogScale ? 'logarithmic' : 'linear'
    this.retentionChart.update('none')
  }

  async performFit() {
    if (this.dataPoints.length < 4) {
      this.showToast('至少需要4个数据点进行拟合', 'warning')
      return
    }

    this.showToast('正在拟合...', 'info')

    const pressures = this.dataPoints.map(d => Math.abs(d.pressure))
    const waterContents = this.dataPoints.map(d => d.waterContent)

    const result = await window.electronAPI.vanGenuchten.fit({
      pressures,
      waterContents
    })

    if (result.success) {
      this.fitResult = result.result
      this.updateFitResults()

      const curveResult = await window.electronAPI.vanGenuchten.curve(this.fitResult.parameters)
      if (curveResult.success) {
        this.curvePoints = curveResult.curve.map(p => ({
          x: p.pressure,
          y: p.waterContent
        }))
        this.updateRetentionChart()
      }

      this.updateFitTable()
      this.showToast('拟合完成', 'success')
    } else {
      this.showToast(`拟合失败: ${result.error}`, 'error')
    }
  }

  updateFitResults() {
    if (!this.fitResult) return

    const params = this.fitResult.parameters
    const stats = this.fitResult.statistics

    document.getElementById('paramThetaR').textContent = params.thetaR.toFixed(4)
    document.getElementById('paramThetaS').textContent = params.thetaS.toFixed(4)
    document.getElementById('paramAlpha').textContent = params.alpha.toFixed(4)
    document.getElementById('paramN').textContent = params.n.toFixed(4)
    document.getElementById('paramM').textContent = params.m.toFixed(4)

    document.getElementById('statRMSE').textContent = stats.rmse.toFixed(6)
    document.getElementById('statR2').textContent = stats.r2.toFixed(6)
    document.getElementById('statSSR').textContent = stats.ssr.toFixed(4)
    document.getElementById('statCount').textContent = stats.sampleCount
  }

  updateFitTable() {
    const tbody = document.getElementById('fitTableBody')

    if (!this.fitResult || this.fitResult.fittedData.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5" class="empty-cell">请先进行拟合分析</td></tr>'
      return
    }

    tbody.innerHTML = this.fitResult.fittedData.map((d, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${d.pressure.toFixed(2)}</td>
        <td>${d.observed.toFixed(4)}</td>
        <td>${d.predicted.toFixed(4)}</td>
        <td style="color: ${Math.abs(d.residual) > 0.02 ? '#ef4444' : '#10b981'}">${d.residual.toFixed(4)}</td>
      </tr>
    `).join('')
  }

  async loadSamples() {
    if (!window.electronAPI) return

    const result = await window.electronAPI.database.listSamples()
    if (result.success) {
      this.samples = result.samples
      this.renderSamplesList()
    }
  }

  renderSamplesList() {
    const container = document.getElementById('samplesList')

    if (this.samples.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
          <p>暂无样本记录</p>
        </div>
      `
      return
    }

    container.innerHTML = this.samples.map(s => `
      <div class="sample-item ${s.id === this.selectedSampleId ? 'selected' : ''}" onclick="app.selectSample(${s.id})">
        <div class="sample-info">
          <h4>${s.name}</h4>
          <p>${s.location || '未设置地点'} - ${s.soil_type || '未知类型'}</p>
        </div>
        <div class="sample-meta">
          <span>${s.data_count} 数据</span>
          <span>${s.fit_count > 0 ? '已拟合' : '未拟合'}</span>
        </div>
      </div>
    `).join('')
  }

  async selectSample(id) {
    this.selectedSampleId = id
    this.renderSamplesList()

    const result = await window.electronAPI.database.getSample(id)
    if (result.success && result.sample) {
      this.fillSampleForm(result.sample)

      if (result.sample.data && result.sample.data.length > 0) {
        this.dataPoints = result.sample.data.map(d => ({
          pressure: d.pressure,
          waterContent: d.water_content,
          timestamp: d.timestamp ? new Date(d.timestamp).getTime() : Date.now()
        }))
        this.updateDataTable()
        this.updateRealtimeChart()
      }

      if (result.sample.fitResult) {
        this.fitResult = {
          parameters: {
            thetaR: result.sample.fitResult.theta_r,
            thetaS: result.sample.fitResult.theta_s,
            alpha: result.sample.fitResult.alpha,
            n: result.sample.fitResult.n,
            m: result.sample.fitResult.m
          },
          statistics: {
            rmse: result.sample.fitResult.rmse,
            r2: result.sample.fitResult.r2,
            ssr: result.sample.fitResult.ssr,
            sampleCount: this.dataPoints.length
          }
        }
        this.updateFitResults()

        const curveResult = await window.electronAPI.vanGenuchten.curve(this.fitResult.parameters)
        if (curveResult.success) {
          this.curvePoints = curveResult.curve.map(p => ({
            x: p.pressure,
            y: p.waterContent
          }))
          this.updateRetentionChart()
        }
      }
    }
  }

  fillSampleForm(sample) {
    document.getElementById('sampleName').value = sample.name || ''
    document.getElementById('sampleLocation').value = sample.location || ''
    document.getElementById('sampleSoilType').value = sample.soil_type || ''
    document.getElementById('sampleDepth').value = sample.depth || ''
    document.getElementById('sampleBulkDensity').value = sample.bulk_density || ''
    document.getElementById('sampleParticleDensity').value = sample.particle_density || ''
    document.getElementById('samplePorosity').value = sample.porosity || ''
    document.getElementById('sampleDescription').value = sample.description || ''

    document.getElementById('saveSampleBtn').style.display = 'inline-flex'
    document.getElementById('deleteSampleBtn').style.display = 'inline-flex'
  }

  clearSampleForm() {
    this.selectedSampleId = null
    document.getElementById('sampleName').value = ''
    document.getElementById('sampleLocation').value = ''
    document.getElementById('sampleSoilType').value = ''
    document.getElementById('sampleDepth').value = ''
    document.getElementById('sampleBulkDensity').value = ''
    document.getElementById('sampleParticleDensity').value = ''
    document.getElementById('samplePorosity').value = ''
    document.getElementById('sampleDescription').value = ''

    document.getElementById('saveSampleBtn').style.display = 'none'
    document.getElementById('deleteSampleBtn').style.display = 'none'
  }

  async saveSample() {
    const name = document.getElementById('sampleName').value.trim()
    if (!name) {
      this.showToast('请输入样本名称', 'warning')
      return
    }

    const sampleData = {
      name,
      description: document.getElementById('sampleDescription').value,
      location: document.getElementById('sampleLocation').value,
      soil_type: document.getElementById('sampleSoilType').value,
      depth: document.getElementById('sampleDepth').value,
      bulk_density: parseFloat(document.getElementById('sampleBulkDensity').value) || null,
      particle_density: parseFloat(document.getElementById('sampleParticleDensity').value) || null,
      porosity: parseFloat(document.getElementById('samplePorosity').value) || null,
      data: this.dataPoints.map(d => ({
        pressure: d.pressure,
        waterContent: d.waterContent,
        timestamp: new Date(d.timestamp).toISOString()
      })),
      fitResult: this.fitResult ? this.fitResult.parameters : null
    }

    let result
    if (this.selectedSampleId) {
      sampleData.id = this.selectedSampleId
      result = await window.electronAPI.database.updateSample(sampleData)
    } else {
      result = await window.electronAPI.database.saveSample(sampleData)
    }

    if (result.success) {
      this.showToast(this.selectedSampleId ? '样本已更新' : '样本已保存', 'success')
      this.loadSamples()
    } else {
      this.showToast(`保存失败: ${result.error}`, 'error')
    }
  }

  async deleteSample() {
    if (!this.selectedSampleId) return

    if (!confirm('确定要删除此样本吗？此操作无法撤销。')) return

    const result = await window.electronAPI.database.deleteSample(this.selectedSampleId)
    if (result.success) {
      this.showToast('样本已删除', 'success')
      this.clearSampleForm()
      this.loadSamples()
    } else {
      this.showToast(`删除失败: ${result.error}`, 'error')
    }
  }

  async searchSamples(keyword) {
    if (!keyword.trim()) {
      this.loadSamples()
      return
    }

    const result = await window.electronAPI.database.searchSamples(keyword)
    if (result.success) {
      this.samples = result.samples
      this.renderSamplesList()
    }
  }

  async exportReport() {
    if (!this.fitResult) {
      this.showToast('请先进行拟合分析', 'warning')
      return
    }

    const currentSample = this.selectedSampleId
      ? this.samples.find(s => s.id === this.selectedSampleId)
      : null

    const reportData = {
      sample: currentSample || {
        name: document.getElementById('sampleName').value || '未命名样本',
        location: document.getElementById('sampleLocation').value,
        soil_type: document.getElementById('sampleSoilType').value,
        depth: document.getElementById('sampleDepth').value,
        bulk_density: parseFloat(document.getElementById('sampleBulkDensity').value) || null,
        particle_density: parseFloat(document.getElementById('sampleParticleDensity').value) || null,
        porosity: parseFloat(document.getElementById('samplePorosity').value) || null,
        description: document.getElementById('sampleDescription').value
      },
      fitResult: this.fitResult,
      dataPoints: this.fitResult.fittedData || this.dataPoints.map(d => ({
        pressure: Math.abs(d.pressure),
        waterContent: d.waterContent
      })),
      curvePoints: this.curvePoints
    }

    const result = await window.electronAPI.report.export(reportData)

    if (result.success) {
      this.showToast(`报告已导出: ${result.filePath}`, 'success')
    } else if (!result.canceled) {
      this.showToast(`导出失败: ${result.error}`, 'error')
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer')
    const toast = document.createElement('div')
    toast.className = `toast ${type}`

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    }

    toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`
    container.appendChild(toast)

    setTimeout(() => {
      toast.style.opacity = '0'
      toast.style.transform = 'translateX(100%)'
      toast.style.transition = 'all 0.3s ease'
      setTimeout(() => toast.remove(), 300)
    }, 3000)
  }

  // ==================== Turntable Methods ====================

  setupTurntableListeners() {
    if (window.electronAPI && window.electronAPI.turntable) {
      window.electronAPI.turntable.onPositionChanged((data) => {
        this.updateTurntableDisplay(data.position)
      })
      window.electronAPI.turntable.onHomed(() => {
        this.updateTurntableDisplay(0)
        this.showToast('转盘已回原点', 'success')
      })
      window.electronAPI.turntable.onSequenceCompleted(() => {
        this.showToast('自动序列完成', 'success')
        document.getElementById('startSeqBtn').disabled = false
        document.getElementById('stopSeqBtn').disabled = true
      })
    }
  }

  async refreshTurntableStatus() {
    if (!window.electronAPI?.turntable) return
    const status = await window.electronAPI.turntable.status()
    this.updateTurntableDisplay(status.currentPosition)
  }

  updateTurntableDisplay(position) {
    document.getElementById('turntableCurrentPos').textContent = position
    this.renderPositionList()
  }

  async turntableHome() {
    if (!window.electronAPI?.turntable) return
    const result = await window.electronAPI.turntable.home()
    if (result.success) {
      this.showToast('正在回原点...', 'info')
    } else {
      this.showToast(`回原点失败: ${result.error}`, 'error')
    }
  }

  async turntableMoveNext() {
    if (!window.electronAPI?.turntable) return
    const result = await window.electronAPI.turntable.moveNext()
    if (result.success) {
      this.showToast(`移动到位置 ${result.position}`, 'info')
    } else {
      this.showToast(`移动失败: ${result.error}`, 'error')
    }
  }

  async turntableMovePrevious() {
    if (!window.electronAPI?.turntable) return
    const result = await window.electronAPI.turntable.movePrevious()
    if (result.success) {
      this.showToast(`移动到位置 ${result.position}`, 'info')
    } else {
      this.showToast(`移动失败: ${result.error}`, 'error')
    }
  }

  async turntableGoto() {
    if (!window.electronAPI?.turntable) return
    const position = parseInt(document.getElementById('gotoPosition').value)
    if (isNaN(position)) {
      this.showToast('请输入有效的位置', 'warning')
      return
    }
    const result = await window.electronAPI.turntable.moveTo(position)
    if (result.success) {
      this.showToast(`移动到位置 ${result.position}`, 'info')
    } else {
      this.showToast(`移动失败: ${result.error}`, 'error')
    }
  }

  async setTurntablePositions(count) {
    if (!window.electronAPI?.turntable) return
    const result = await window.electronAPI.turntable.setPositions(parseInt(count))
    if (result.success) {
      this.renderPositionList()
      this.showToast(`位置数量设置为 ${count}`, 'success')
    }
  }

  async setTurntableSpeed(speed) {
    if (!window.electronAPI?.turntable) return
    await window.electronAPI.turntable.setSpeed(parseInt(speed))
  }

  async setPositionName() {
    if (!window.electronAPI?.turntable) return
    const position = parseInt(document.getElementById('namePosition').value)
    const name = document.getElementById('positionName').value.trim()
    if (!name) {
      this.showToast('请输入位置名称', 'warning')
      return
    }
    const result = await window.electronAPI.turntable.setName(position, name)
    if (result.success) {
      this.renderPositionList()
      this.showToast(`位置 ${position} 命名为 "${name}"`, 'success')
      document.getElementById('positionName').value = ''
    }
  }

  async renderPositionList() {
    if (!window.electronAPI?.turntable) return
    const status = await window.electronAPI.turntable.status()
    const list = document.getElementById('positionList')
    list.innerHTML = ''
    for (let i = 0; i < status.totalPositions; i++) {
      const name = status.positionNames[i] || `位置${i + 1}`
      const item = document.createElement('div')
      item.className = `position-item ${i === status.currentPosition ? 'current' : ''}`
      item.textContent = name
      item.onclick = () => {
        document.getElementById('gotoPosition').value = i
        this.turntableGoto()
      }
      list.appendChild(item)
    }

    const select = document.getElementById('namePosition')
    select.innerHTML = ''
    for (let i = 0; i < status.totalPositions; i++) {
      const option = document.createElement('option')
      option.value = i
      option.textContent = status.positionNames[i] || `位置${i + 1}`
      select.appendChild(option)
    }
  }

  async startSequence() {
    if (!window.electronAPI?.turntable) return
    const start = parseInt(document.getElementById('seqStart').value)
    const end = parseInt(document.getElementById('seqEnd').value)
    const dwell = parseInt(document.getElementById('seqDwell').value) * 1000

    document.getElementById('startSeqBtn').disabled = true
    document.getElementById('stopSeqBtn').disabled = false
    document.getElementById('sequenceStatus').style.display = 'block'
    document.getElementById('sequenceText').textContent = '运行中...'

    const result = await window.electronAPI.turntable.runSequence(start, end, { dwellTime: dwell })
    if (!result.success) {
      this.showToast(`序列启动失败: ${result.error}`, 'error')
    }
  }

  async stopSequence() {
    if (!window.electronAPI?.turntable) return
    await window.electronAPI.turntable.stop()
    document.getElementById('startSeqBtn').disabled = false
    document.getElementById('stopSeqBtn').disabled = true
    document.getElementById('sequenceStatus').style.display = 'none'
    this.showToast('序列已停止', 'info')
  }

  // ==================== Multi-Plate Methods ====================

  setupMultiPlateListeners() {
    if (window.electronAPI && window.electronAPI.multiPlate) {
      window.electronAPI.multiPlate.onDataAdded((data) => {
        this.refreshMultiPlateStatus()
      })
      window.electronAPI.multiPlate.onEquilibriumReached((data) => {
        this.showToast(`样本 ${data.plateName} 达到平衡`, 'success')
      })
      window.electronAPI.multiPlate.onFitComplete((data) => {
        this.showToast(`样本 ${data.plateName} 拟合完成`, 'success')
      })
      window.electronAPI.multiPlate.onMeasurementCompleted(() => {
        this.showToast('自动测量完成', 'success')
        document.getElementById('startAutoBtn').disabled = false
        document.getElementById('stopAutoBtn').disabled = true
      })
    }
  }

  async refreshMultiPlateStatus() {
    if (!window.electronAPI?.multiPlate) return
    const status = await window.electronAPI.multiPlate.status()
    this.renderPlateGrid(status)
    this.updateMultiPlateSummary(status)
  }

  renderPlateGrid(status) {
    const grid = document.getElementById('plateGrid')
    grid.innerHTML = ''
    
    for (const [id, plate] of Object.entries(status.plates)) {
      const card = document.createElement('div')
      card.className = `plate-card ${plate.active ? 'active' : ''} ${plate.status === 'equilibrated' ? 'equilibrated' : ''} ${plate.hasFit ? 'fitted' : ''}`
      card.innerHTML = `
        <div class="plate-card-header">
          <span class="plate-card-name">${plate.name}</span>
          <span class="plate-card-status">${plate.active ? '激活' : '未激活'}</span>
        </div>
        <div class="plate-card-data">
          数据点: ${plate.dataCount}<br>
          ${plate.lastReading ? `P: ${plate.lastReading.pressure.toFixed(1)} | θ: ${plate.lastReading.waterContent.toFixed(4)}` : '无数据'}
        </div>
        <label class="plate-card-toggle">
          <input type="checkbox" ${plate.active ? 'checked' : ''} onchange="app.togglePlateActive(${id}, this.checked)">
          激活
        </label>
      `
      grid.appendChild(card)
    }
  }

  updateMultiPlateSummary(status) {
    document.getElementById('activeCount').textContent = status.activeCount
    const totalPoints = Object.values(status.plates).reduce((sum, p) => sum + p.dataCount, 0)
    document.getElementById('totalPoints').textContent = totalPoints
    const fittedCount = Object.values(status.plates).filter(p => p.hasFit).length
    document.getElementById('fittedCount').textContent = fittedCount
  }

  async setPlateCount(count) {
    if (!window.electronAPI?.multiPlate) return
    const result = await window.electronAPI.multiPlate.setPlateCount(parseInt(count))
    if (result.success) {
      this.refreshMultiPlateStatus()
      this.showToast(`样本板数量设置为 ${count}`, 'success')
    }
  }

  async togglePlateActive(plateId, active) {
    if (!window.electronAPI?.multiPlate) return
    await window.electronAPI.multiPlate.setPlateActive(plateId, active)
    this.refreshMultiPlateStatus()
  }

  async applyMultiPlateConfig() {
    if (!window.electronAPI?.multiPlate) return
    
    const pressureSteps = document.getElementById('pressureSteps').value
      .split(',')
      .map(s => parseFloat(s.trim()))
      .filter(v => !isNaN(v))
    
    await window.electronAPI.multiPlate.setPressureSteps(pressureSteps)
    await window.electronAPI.multiPlate.setEquilibriumConfig({
      threshold: parseFloat(document.getElementById('equilibriumThreshold').value),
      time: parseInt(document.getElementById('equilibriumTime').value),
      minPoints: parseInt(document.getElementById('minDataPoints').value)
    })
    
    this.showToast('配置已应用', 'success')
  }

  async startAutoMeasurement() {
    if (!window.electronAPI?.multiPlate) return
    const result = await window.electronAPI.multiPlate.startAuto()
    if (result.success) {
      document.getElementById('startAutoBtn').disabled = true
      document.getElementById('stopAutoBtn').disabled = false
      this.showToast('自动测量已启动', 'success')
    } else {
      this.showToast(`启动失败: ${result.error}`, 'error')
    }
  }

  async stopAutoMeasurement() {
    if (!window.electronAPI?.multiPlate) return
    await window.electronAPI.multiPlate.stopAuto()
    document.getElementById('startAutoBtn').disabled = false
    document.getElementById('stopAutoBtn').disabled = true
    this.showToast('自动测量已停止', 'info')
  }

  async fitAllPlates() {
    if (!window.electronAPI?.multiPlate) return
    document.getElementById('fitProgress').style.display = 'block'
    
    const result = await window.electronAPI.multiPlate.fitAll()
    if (result.success) {
      this.refreshMultiPlateStatus()
      this.showToast('所有样本拟合完成', 'success')
    } else {
      this.showToast('拟合失败', 'error')
    }
    document.getElementById('fitProgress').style.display = 'none'
  }

  async clearAllPlates() {
    if (!window.electronAPI?.multiPlate) return
    if (!confirm('确定要清除所有数据吗？')) return
    await window.electronAPI.multiPlate.clearAll()
    this.refreshMultiPlateStatus()
    this.showToast('所有数据已清除', 'info')
  }

  async exportMultiPlateData() {
    if (!window.electronAPI?.multiPlate) return
    const result = await window.electronAPI.multiPlate.getAllData()
    if (result.success) {
      console.log('Export data:', result.data)
      this.showToast('数据已导出到控制台', 'info')
    }
  }

  // ==================== Hydrus Export Methods ====================

  async refreshHydrusSampleList() {
    if (!window.electronAPI?.database) return
    const result = await window.electronAPI.database.listSamples()
    if (result.success) {
      this.renderHydrusSampleList(result.samples)
    }
  }

  renderHydrusSampleList(samples) {
    const list = document.getElementById('hydrusSampleList')
    list.innerHTML = ''
    
    samples.forEach(sample => {
      if (!sample.fitResult) return
      const item = document.createElement('label')
      item.className = 'hydrus-sample-item'
      item.innerHTML = `
        <input type="checkbox" class="hydrus-sample-checkbox" value="${sample.id}" checked>
        <div class="hydrus-sample-info">
          <div class="hydrus-sample-name">${sample.name}</div>
          <div class="hydrus-sample-meta">${sample.soil_type || '未知类型'} | ${sample.data_count || 0} 数据点</div>
        </div>
      `
      list.appendChild(item)
    })

    this.updateHydrusParamsPreview()
  }

  selectAllHydrusSamples() {
    document.querySelectorAll('.hydrus-sample-checkbox').forEach(cb => cb.checked = true)
    this.updateHydrusParamsPreview()
  }

  deselectAllHydrusSamples() {
    document.querySelectorAll('.hydrus-sample-checkbox').forEach(cb => cb.checked = false)
    this.updateHydrusParamsPreview()
  }

  getSelectedHydrusSamples() {
    const checkboxes = document.querySelectorAll('.hydrus-sample-checkbox:checked')
    return Array.from(checkboxes).map(cb => parseInt(cb.value))
  }

  async updateHydrusParamsPreview() {
    if (!window.electronAPI?.database) return
    
    const selectedIds = this.getSelectedHydrusSamples()
    const tbody = document.getElementById('hydrusParamsBody')
    
    if (selectedIds.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="9" class="empty-cell">请选择要导出的样本</td></tr>'
      return
    }

    const modelType = document.getElementById('hydrusModelType').value
    const l = parseFloat(document.getElementById('hydrusL').value)
    const ks = document.getElementById('hydrusKs').value || null

    let rows = ''
    for (const id of selectedIds) {
      const result = await window.electronAPI.database.getSample(id)
      if (result.success && result.sample?.fitResult) {
        const fit = result.sample.fitResult
        const converted = await window.electronAPI.hydrus.convertParams(
          { parameters: fit, statistics: { r2: fit.r2 } },
          { modelType, l, Ks: ks ? parseFloat(ks) : null }
        )
        
        if (converted.success) {
          const p = converted.params
          rows += `
            <tr>
              <td>${result.sample.name}</td>
              <td>${p.thetaR.toFixed(4)}</td>
              <td>${p.thetaS.toFixed(4)}</td>
              <td>${p.alpha.toFixed(4)}</td>
              <td>${p.n.toFixed(4)}</td>
              <td>${p.m.toFixed(4)}</td>
              <td>${p.l || 0.5}</td>
              <td>${p.Ks || 'Auto'}</td>
              <td>${fit.r2?.toFixed(6) || '--'}</td>
            </tr>
          `
        }
      }
    }
    
    tbody.innerHTML = rows || '<tr class="empty-row"><td colspan="9" class="empty-cell">所选样本中没有有效的拟合结果</td></tr>'
  }

  async exportHydrusFiles() {
    if (!window.electronAPI?.hydrus) return
    const fitResults = await this.getHydrusExportData()
    if (fitResults.length === 0) {
      this.showToast('没有可导出的数据', 'warning')
      return
    }
    
    const options = this.getHydrusOptions()
    const result = await window.electronAPI.hydrus.exportFiles(fitResults, options)
    if (result.success) {
      this.showToast(`文件已导出到 ${result.exportDir}`, 'success')
    } else if (!result.canceled) {
      this.showToast(`导出失败: ${result.error}`, 'error')
    }
  }

  async exportHydrusCSV() {
    if (!window.electronAPI?.hydrus) return
    const fitResults = await this.getHydrusExportData()
    if (fitResults.length === 0) {
      this.showToast('没有可导出的数据', 'warning')
      return
    }
    
    const options = this.getHydrusOptions()
    const result = await window.electronAPI.hydrus.exportCSV(fitResults, options)
    if (result.success) {
      this.showToast(`CSV已导出: ${result.filePath}`, 'success')
    } else if (!result.canceled) {
      this.showToast(`导出失败: ${result.error}`, 'error')
    }
  }

  async exportHydrusJSON() {
    if (!window.electronAPI?.hydrus) return
    const fitResults = await this.getHydrusExportData()
    if (fitResults.length === 0) {
      this.showToast('没有可导出的数据', 'warning')
      return
    }
    
    const options = this.getHydrusOptions()
    const result = await window.electronAPI.hydrus.exportJSON(fitResults, options)
    if (result.success) {
      this.showToast(`JSON已导出: ${result.filePath}`, 'success')
    } else if (!result.canceled) {
      this.showToast(`导出失败: ${result.error}`, 'error')
    }
  }

  async exportHydrusBatch() {
    if (!window.electronAPI?.hydrus) return
    const fitResults = await this.getHydrusExportData()
    if (fitResults.length === 0) {
      this.showToast('没有可导出的数据', 'warning')
      return
    }
    
    const options = this.getHydrusOptions()
    const result = await window.electronAPI.hydrus.exportBatch(fitResults, options)
    if (result.success) {
      this.showToast(`批量导出完成: ${result.exportDir}`, 'success')
    } else if (!result.canceled) {
      this.showToast(`导出失败: ${result.error}`, 'error')
    }
  }

  async previewHydrusReport() {
    if (!window.electronAPI?.hydrus) return
    const fitResults = await this.getHydrusExportData()
    if (fitResults.length === 0) {
      this.showToast('没有可导出的数据', 'warning')
      return
    }
    
    const options = this.getHydrusOptions()
    const result = await window.electronAPI.hydrus.generateReport(fitResults, options)
    if (result.success) {
      alert(result.report)
    }
  }

  async getHydrusExportData() {
    if (!window.electronAPI?.database) return []
    
    const selectedIds = this.getSelectedHydrusSamples()
    const fitResults = []
    
    for (const id of selectedIds) {
      const result = await window.electronAPI.database.getSample(id)
      if (result.success && result.sample?.fitResult) {
        fitResults.push({
          name: result.sample.name,
          fitResult: {
            parameters: result.sample.fitResult,
            statistics: {
              rmse: result.sample.fitResult.rmse || 0,
              r2: result.sample.fitResult.r2 || 0,
              ssr: result.sample.fitResult.ssr || 0
            }
          }
        })
      }
    }
    
    return fitResults
  }

  getHydrusOptions() {
    return {
      modelType: document.getElementById('hydrusModelType').value,
      l: parseFloat(document.getElementById('hydrusL').value),
      Ks: document.getElementById('hydrusKs').value ? parseFloat(document.getElementById('hydrusKs').value) : null
    }
  }
}

let app
document.addEventListener('DOMContentLoaded', () => {
  app = new SoilAnalyzerApp()
})
