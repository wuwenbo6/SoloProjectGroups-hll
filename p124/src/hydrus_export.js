const fs = require('fs')
const path = require('path')

class HydrusExporter {
  constructor() {
    this.modelTypes = ['vanGenuchten', 'Mualem-vanGenuchten', 'Brooks-Corey']
    this.units = {
      length: 'cm',
      time: 'days',
      pressure: 'cm'
    }
  }

  convertToHydrusParams(fitResult, options = {}) {
    if (!fitResult || !fitResult.parameters) {
      throw new Error('无效的拟合结果')
    }

    const params = fitResult.parameters
    const modelType = options.modelType || 'vanGenuchten'

    if (modelType === 'vanGenuchten') {
      return {
        thetaR: params.thetaR,
        thetaS: params.thetaS,
        alpha: params.alpha,
        n: params.n,
        m: params.m || 1 - 1 / params.n,
        l: options.l || 0.5,
        Ks: options.Ks || null
      }
    } else if (modelType === 'Mualem-vanGenuchten') {
      return {
        thetaR: params.thetaR,
        thetaS: params.thetaS,
        alpha: params.alpha,
        n: params.n,
        m: params.m || 1 - 1 / params.n,
        l: options.l || 0.5,
        Ks: options.Ks || null
      }
    } else if (modelType === 'Brooks-Corey') {
      return this._convertToBrooksCorey(params, options)
    }

    throw new Error(`不支持的模型类型: ${modelType}`)
  }

  _convertToBrooksCorey(vgParams, options) {
    const alpha = vgParams.alpha
    const n = vgParams.n

    const hb = 1 / alpha
    const lambda = n - 1

    return {
      thetaR: vgParams.thetaR,
      thetaS: vgParams.thetaS,
      hb: hb,
      lambda: lambda,
      Ks: options.Ks || null
    }
  }

  generateSelectorIn(params, options = {}) {
    const {
      projectName = 'HYDRUS Project',
      modelType = 'vanGenuchten',
      spaceUnit = 'cm',
      timeUnit = 'days',
      printGrid = false,
      solverType = 'Richards'
    } = options

    let selectorContent = `SELECTOR INPUT FILE
====================

Project Name: ${projectName}
Space Unit: ${spaceUnit}
Time Unit: ${timeUnit}

`

    if (modelType === 'vanGenuchten' || modelType === 'Mualem-vanGenuchten') {
      selectorContent += `
Soil Hydraulic Parameters - van Genuchten-Mualem
------------------------------------------------
theta_r = ${params.thetaR.toFixed(6)}
theta_s = ${params.thetaS.toFixed(6)}
Alpha   = ${params.alpha.toFixed(6)}
n       = ${params.n.toFixed(6)}
m       = ${(params.m || 1 - 1 / params.n).toFixed(6)}
l       = ${(params.l || 0.5).toFixed(4)}
Ks      = ${params.Ks ? params.Ks.toFixed(4) : 'Auto'}

`
    } else if (modelType === 'Brooks-Corey') {
      selectorContent += `
Soil Hydraulic Parameters - Brooks-Corey
----------------------------------------
theta_r = ${params.thetaR.toFixed(6)}
theta_s = ${params.thetaS.toFixed(6)}
hb      = ${params.hb.toFixed(4)}
lambda  = ${params.lambda.toFixed(4)}
Ks      = ${params.Ks ? params.Ks.toFixed(4) : 'Auto'}

`
    }

    selectorContent += `
Solver Type: ${solverType}
Print Grid: ${printGrid ? 'Yes' : 'No'}

End of SELECTOR Input
`

    return selectorContent
  }

  generateHYDRUS3DInput(materialParams, options = {}) {
    const {
      projectName = 'HYDRUS3D Project',
      numMaterials = 1
    } = options

    let content = `HYDRUS-3D Input File
=====================

Project: ${projectName}
Number of Materials: ${numMaterials}

`

    materialParams.forEach((params, index) => {
      content += `
Material ${index + 1}:
----------
  theta_r = ${params.thetaR.toFixed(6)}
  theta_s = ${params.thetaS.toFixed(6)}
  Alpha   = ${params.alpha.toFixed(6)}
  n       = ${params.n.toFixed(6)}
  m       = ${(params.m || 1 - 1 / params.n).toFixed(6)}
  l       = ${(params.l || 0.5).toFixed(4)}
  Ks      = ${params.Ks ? params.Ks.toFixed(4) : 'Auto'}

`
    })

    content += `
End of HYDRUS-3D Input
`

    return content
  }

  generateProfileDAT(params, options = {}) {
    const {
      numNodes = 101,
      profileDepth = 100,
      observationNodes = []
    } = options

    let content = `PROFILE.DAT - Soil Profile
===========================

Number of Nodes: ${numNodes}
Profile Depth: ${profileDepth} cm

`

    const dz = profileDepth / (numNodes - 1)
    content += `Node Information:
  Node  Depth(cm)  Material
`
    for (let i = 0; i < numNodes; i++) {
      const depth = i * dz
      content += `  ${String(i + 1).padStart(5)}  ${depth.toFixed(4).padStart(10)}  1\n`
    }

    if (observationNodes.length > 0) {
      content += `\nObservation Nodes: ${observationNodes.length}\n`
      observationNodes.forEach((node, i) => {
        content += `  ${String(i + 1).padStart(5)}  ${node}\n`
      })
    }

    return content
  }

  generateATMOSPH(options = {}) {
    const {
      duration = 30,
      initialPressure = -100,
      boundaryType = 'freeDrainage',
      surfaceFlux = 0
    } = options

    return `ATMOSPH.IN - Atmospheric Boundary Conditions
=============================================

Duration: ${duration} days
Initial Pressure Head: ${initialPressure} cm
Boundary Type: ${boundaryType}
Surface Flux: ${surfaceFlux} cm/day

Time Variable Boundary:
  Time(days)  hCritA(cm)  hCritB(cm)  rTop(cm/day)  rBot(cm/day)
  0.0         -10000       0            0              0
  ${duration}         -10000       0            0              0

End of ATMOSPH Input
`
  }

  exportToFiles(fitResults, exportDir, options = {}) {
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true })
    }

    const files = {}
    const modelType = options.modelType || 'vanGenuchten'

    fitResults.forEach((result, index) => {
      const hydrusParams = this.convertToHydrusParams(result.fitResult, {
        modelType,
        l: options.l,
        Ks: options.Ks
      })

      const prefix = result.name || `Sample_${index + 1}`

      const selectorPath = path.join(exportDir, `${prefix}_SELECTOR.IN`)
      const selectorContent = this.generateSelectorIn(hydrusParams, {
        projectName: prefix,
        modelType,
        ...options
      })
      fs.writeFileSync(selectorPath, selectorContent, 'utf-8')
      files[`${prefix}_SELECTOR.IN`] = selectorPath

      const atmosphPath = path.join(exportDir, `${prefix}_ATMOSPH.IN`)
      const atmosphContent = this.generateATMOSPH(options)
      fs.writeFileSync(atmosphPath, atmosphContent, 'utf-8')
      files[`${prefix}_ATMOSPH.IN`] = atmosphPath

      const profilePath = path.join(exportDir, `${prefix}_PROFILE.DAT`)
      const profileContent = this.generateProfileDAT(hydrusParams, options)
      fs.writeFileSync(profilePath, profileContent, 'utf-8')
      files[`${prefix}_PROFILE.DAT`] = profilePath
    })

    return { success: true, files, exportDir }
  }

  exportToCSV(fitResults, filePath, options = {}) {
    const modelType = options.modelType || 'vanGenuchten'

    let csvContent = 'Sample Name, theta_r, theta_s, alpha, n, m, l, Ks, RMSE, R2\n'

    fitResults.forEach(result => {
      if (!result.fitResult || !result.fitResult.parameters) return

      const params = result.fitResult.parameters
      const stats = result.fitResult.statistics

      if (modelType === 'vanGenuchten' || modelType === 'Mualem-vanGenuchten') {
        csvContent += `${result.name || 'Unknown'},`
        csvContent += `${params.thetaR.toFixed(6)},`
        csvContent += `${params.thetaS.toFixed(6)},`
        csvContent += `${params.alpha.toFixed(6)},`
        csvContent += `${params.n.toFixed(6)},`
        csvContent += `${(params.m || 1 - 1 / params.n).toFixed(6)},`
        csvContent += `${(options.l || 0.5).toFixed(4)},`
        csvContent += `${options.Ks || 'Auto'},`
        csvContent += `${stats.rmse.toFixed(6)},`
        csvContent += `${stats.r2.toFixed(6)}\n`
      }
    })

    fs.writeFileSync(filePath, csvContent, 'utf-8')
    return { success: true, filePath, content: csvContent }
  }

  exportToJSON(fitResults, filePath, options = {}) {
    const modelType = options.modelType || 'vanGenuchten'

    const data = {
      exportDate: new Date().toISOString(),
      modelType,
      units: this.units,
      samples: fitResults.map(result => {
        if (!result.fitResult) return null

        const params = result.fitResult.parameters
        const stats = result.fitResult.statistics

        return {
          name: result.name || 'Unknown',
          parameters: {
            thetaR: params.thetaR,
            thetaS: params.thetaS,
            alpha: params.alpha,
            n: params.n,
            m: params.m || 1 - 1 / params.n,
            l: options.l || 0.5,
            Ks: options.Ks || null
          },
          statistics: {
            rmse: stats.rmse,
            r2: stats.r2,
            ssr: stats.ssr,
            sampleCount: stats.sampleCount
          },
          model: modelType
        }
      }).filter(Boolean)
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true, filePath, data }
  }

  generateSummaryReport(fitResults, options = {}) {
    const modelType = options.modelType || 'vanGenuchten'

    let report = `HYDRUS 参数导出报告
====================
导出时间: ${new Date().toLocaleString()}
模型类型: ${modelType}
样本数量: ${fitResults.length}

`

    fitResults.forEach((result, index) => {
      if (!result.fitResult || !result.fitResult.parameters) return

      const params = result.fitResult.parameters
      const stats = result.fitResult.statistics

      report += `
样本 ${index + 1}: ${result.name || 'Unknown'}
${'-'.repeat(50)}
  θr (残留含水量)    : ${params.thetaR.toFixed(6)} cm³/cm³
  θs (饱和含水量)    : ${params.thetaS.toFixed(6)} cm³/cm³
  α  (进气值参数)    : ${params.alpha.toFixed(6)} cm⁻¹
  n  (形状参数)      : ${params.n.toFixed(6)}
  m  (派生参数)      : ${(params.m || 1 - 1 / params.n).toFixed(6)}
  l  (孔隙连通性)    : ${(options.l || 0.5).toFixed(4)}
  Ks (饱和导水率)    : ${options.Ks || 'Auto'} cm/day

  拟合统计:
    RMSE (均方根误差) : ${stats.rmse.toFixed(6)}
    R²  (决定系数)   : ${stats.r2.toFixed(6)}
    SSR (残差平方和)  : ${stats.ssr.toFixed(4)}
    数据点数         : ${stats.sampleCount}

`
    })

    report += `
${'='.repeat(50)}
导出完成
`

    return report
  }

  generateHYDRUSBatch(fitResults, exportDir, options = {}) {
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true })
    }

    const batchDir = path.join(exportDir, 'HYDRUS_Batch')
    if (!fs.existsSync(batchDir)) {
      fs.mkdirSync(batchDir, { recursive: true })
    }

    const modelType = options.modelType || 'vanGenuchten'
    const files = {}

    const hydrusParams = fitResults
      .filter(r => r.fitResult)
      .map(r => ({
        ...this.convertToHydrusParams(r.fitResult, { modelType, ...options }),
        name: r.name
      }))

    const hydrus3DPath = path.join(batchDir, 'HYDRUS3D_Input.txt')
    const hydrus3DContent = this.generateHYDRUS3DInput(hydrusParams, {
      projectName: options.projectName || 'Batch Export',
      numMaterials: hydrusParams.length
    })
    fs.writeFileSync(hydrus3DPath, hydrus3DContent, 'utf-8')
    files['HYDRUS3D_Input.txt'] = hydrus3DPath

    const csvPath = path.join(batchDir, 'Parameters.csv')
    this.exportToCSV(fitResults, csvPath, options)
    files['Parameters.csv'] = csvPath

    const jsonPath = path.join(batchDir, 'Parameters.json')
    this.exportToJSON(fitResults, jsonPath, options)
    files['Parameters.json'] = jsonPath

    const reportPath = path.join(batchDir, 'Summary_Report.txt')
    const reportContent = this.generateSummaryReport(fitResults, options)
    fs.writeFileSync(reportPath, reportContent, 'utf-8')
    files['Summary_Report.txt'] = reportPath

    return { success: true, files, exportDir: batchDir }
  }
}

module.exports = HydrusExporter
