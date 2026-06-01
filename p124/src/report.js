function generateHTMLReport(reportData) {
  const {
    sample = {},
    fitResult = null,
    dataPoints = [],
    curvePoints = [],
    chartImage = null
  } = reportData

  const now = new Date()
  const formattedDate = now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })

  let dataTableRows = ''
  if (dataPoints.length > 0) {
    dataTableRows = dataPoints.map((d, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${d.pressure.toFixed(2)}</td>
        <td>${(d.waterContent || d.observed || 0).toFixed(4)}</td>
        <td>${(d.predicted || d.waterContent || 0).toFixed(4)}</td>
        <td>${(d.residual || 0).toFixed(4)}</td>
      </tr>
    `).join('')
  }

  const fitParamsTable = fitResult ? `
    <table class="params-table">
      <thead>
        <tr>
          <th>参数</th>
          <th>符号</th>
          <th>值</th>
          <th>单位</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>残留含水量</td>
          <td>θ<sub>r</sub></td>
          <td>${fitResult.parameters.thetaR.toFixed(4)}</td>
          <td>cm³/cm³</td>
        </tr>
        <tr>
          <td>饱和含水量</td>
          <td>θ<sub>s</sub></td>
          <td>${fitResult.parameters.thetaS.toFixed(4)}</td>
          <td>cm³/cm³</td>
        </tr>
        <tr>
          <td>进气值参数</td>
          <td>α</td>
          <td>${fitResult.parameters.alpha.toFixed(4)}</td>
          <td>cm⁻¹</td>
        </tr>
        <tr>
          <td>形状参数</td>
          <td>n</td>
          <td>${fitResult.parameters.n.toFixed(4)}</td>
          <td>-</td>
        </tr>
        <tr>
          <td>派生参数</td>
          <td>m</td>
          <td>${fitResult.parameters.m.toFixed(4)}</td>
          <td>-</td>
        </tr>
      </tbody>
    </table>
  ` : '<p class="no-data">暂无拟合结果</p>'

  const statisticsTable = fitResult ? `
    <table class="stats-table">
      <thead>
        <tr>
          <th>统计指标</th>
          <th>值</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>均方根误差 (RMSE)</td>
          <td>${fitResult.statistics.rmse.toFixed(6)}</td>
        </tr>
        <tr>
          <td>决定系数 (R²)</td>
          <td>${fitResult.statistics.r2.toFixed(6)}</td>
        </tr>
        <tr>
          <td>残差平方和 (SSR)</td>
          <td>${fitResult.statistics.ssr.toFixed(6)}</td>
        </tr>
        <tr>
          <td>样本数量</td>
          <td>${fitResult.statistics.sampleCount}</td>
        </tr>
      </tbody>
    </table>
  ` : ''

  const sampleInfo = `
    <div class="info-grid">
      <div class="info-item"><span class="label">样本名称:</span><span class="value">${sample.name || '-'}</span></div>
      <div class="info-item"><span class="label">采样地点:</span><span class="value">${sample.location || '-'}</span></div>
      <div class="info-item"><span class="label">土壤类型:</span><span class="value">${sample.soil_type || '-'}</span></div>
      <div class="info-item"><span class="label">采样深度:</span><span class="value">${sample.depth || '-'}</span></div>
      <div class="info-item"><span class="label">容重:</span><span class="value">${sample.bulk_density ? sample.bulk_density.toFixed(3) + ' g/cm³' : '-'}</span></div>
      <div class="info-item"><span class="label">比重:</span><span class="value">${sample.particle_density ? sample.particle_density.toFixed(3) + ' g/cm³' : '-'}</span></div>
      <div class="info-item"><span class="label">孔隙度:</span><span class="value">${sample.porosity ? (sample.porosity * 100).toFixed(1) + '%' : '-'}</span></div>
      <div class="info-item"><span class="label">描述:</span><span class="value">${sample.description || '-'}</span></div>
    </div>
  `

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>土壤水分特征曲线分析报告</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f7fa;
      padding: 40px;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
      background: #fff;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    }
    .header {
      text-align: center;
      padding-bottom: 20px;
      border-bottom: 3px solid #2563eb;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #1e40af;
      font-size: 28px;
      margin-bottom: 8px;
    }
    .header .subtitle {
      color: #64748b;
      font-size: 14px;
    }
    .header .date {
      color: #94a3b8;
      font-size: 13px;
      margin-top: 8px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      color: #1e40af;
      font-size: 20px;
      margin-bottom: 15px;
      padding-left: 12px;
      border-left: 4px solid #3b82f6;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px 24px;
      background: #f8fafc;
      padding: 20px;
      border-radius: 8px;
    }
    .info-item {
      display: flex;
      align-items: center;
    }
    .info-item .label {
      color: #64748b;
      font-weight: 500;
      min-width: 100px;
    }
    .info-item .value {
      color: #1e293b;
    }
    .params-table, .stats-table, .data-table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      border-radius: 8px;
      overflow: hidden;
    }
    .params-table th, .stats-table th, .data-table th {
      background: #eff6ff;
      color: #1e40af;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #dbeafe;
    }
    .params-table td, .stats-table td, .data-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #f1f5f9;
    }
    .params-table tr:hover, .stats-table tr:hover, .data-table tr:hover {
      background: #f8fafc;
    }
    .chart-container {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    .chart-container img, .chart-container canvas {
      max-width: 100%;
      height: auto;
    }
    .no-data {
      color: #94a3b8;
      text-align: center;
      padding: 20px;
      font-style: italic;
    }
    .footer {
      text-align: center;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      color: #94a3b8;
      font-size: 13px;
      margin-top: 30px;
    }
    .model-formula {
      background: #f0f9ff;
      padding: 15px 20px;
      border-radius: 8px;
      font-family: 'Times New Roman', serif;
      font-size: 16px;
      text-align: center;
      color: #0369a1;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>土壤水分特征曲线分析报告</h1>
      <div class="subtitle">Van Genuchten 模型拟合结果</div>
      <div class="date">报告生成时间: ${formattedDate}</div>
    </div>

    <div class="section">
      <h2>样本信息</h2>
      ${sampleInfo}
    </div>

    <div class="section">
      <h2>拟合模型</h2>
      <div class="model-formula">
        θ(h) = θ<sub>r</sub> + (θ<sub>s</sub> - θ<sub>r</sub>) / [1 + |αh|<sup>n</sup>]<sup>m</sup>, &nbsp;&nbsp; m = 1 - 1/n
      </div>
    </div>

    <div class="section">
      <h2>拟合参数</h2>
      ${fitParamsTable}
    </div>

    <div class="section">
      <h2>拟合统计</h2>
      ${statisticsTable}
    </div>

    ${chartImage ? `
    <div class="section">
      <h2>特征曲线</h2>
      <div class="chart-container">
        <img src="${chartImage}" alt="土壤水分特征曲线" />
      </div>
    </div>
    ` : ''}

    ${dataPoints.length > 0 ? `
    <div class="section">
      <h2>实验数据</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>序号</th>
            <th>压力 (hPa)</th>
            <th>实测含水量 (cm³/cm³)</th>
            <th>预测含水量 (cm³/cm³)</th>
            <th>残差</th>
          </tr>
        </thead>
        <tbody>
          ${dataTableRows}
        </tbody>
      </table>
    </div>
    ` : ''}

    <div class="footer">
      <p>本报告由土壤水分特征曲线分析仪自动生成</p>
      <p>© 2024 Soil Science Laboratory</p>
    </div>
  </div>
</body>
</html>`
}

function generateCSVReport(reportData) {
  const {
    sample = {},
    fitResult = null,
    dataPoints = [],
    curvePoints = []
  } = reportData

  let csv = '\ufeff'

  csv += '土壤水分特征曲线分析报告\n'
  csv += `生成时间,${new Date().toLocaleString('zh-CN')}\n\n`

  csv += '样本信息\n'
  csv += `样本名称,${sample.name || '-'}\n`
  csv += `采样地点,${sample.location || '-'}\n`
  csv += `土壤类型,${sample.soil_type || '-'}\n`
  csv += `采样深度,${sample.depth || '-'}\n`
  csv += `容重 (g/cm³),${sample.bulk_density || '-'}\n`
  csv += `比重 (g/cm³),${sample.particle_density || '-'}\n`
  csv += `孔隙度,${sample.porosity ? (sample.porosity * 100).toFixed(1) + '%' : '-'}\n`
  csv += `描述,${sample.description || '-'}\n\n`

  if (fitResult) {
    csv += 'Van Genuchten 拟合参数\n'
    csv += '参数,符号,值,单位\n'
    csv += `残留含水量,θr,${fitResult.parameters.thetaR.toFixed(6)},cm³/cm³\n`
    csv += `饱和含水量,θs,${fitResult.parameters.thetaS.toFixed(6)},cm³/cm³\n`
    csv += `进气值参数,α,${fitResult.parameters.alpha.toFixed(6)},cm⁻¹\n`
    csv += `形状参数,n,${fitResult.parameters.n.toFixed(6)},-\n`
    csv += `派生参数,m,${fitResult.parameters.m.toFixed(6)},-\n\n`

    csv += '拟合统计指标\n'
    csv += `均方根误差 (RMSE),${fitResult.statistics.rmse.toFixed(8)}\n`
    csv += `决定系数 (R²),${fitResult.statistics.r2.toFixed(6)}\n`
    csv += `残差平方和 (SSR),${fitResult.statistics.ssr.toFixed(8)}\n`
    csv += `样本数量,${fitResult.statistics.sampleCount}\n\n`
  }

  if (dataPoints.length > 0) {
    csv += '实验数据\n'
    csv += '序号,压力 (hPa),实测含水量 (cm³/cm³),预测含水量 (cm³/cm³),残差\n'
    dataPoints.forEach((d, i) => {
      csv += `${i + 1},${d.pressure.toFixed(2)},${(d.waterContent || d.observed || 0).toFixed(4)},${(d.predicted || d.waterContent || 0).toFixed(4)},${(d.residual || 0).toFixed(4)}\n`
    })
    csv += '\n'
  }

  if (curvePoints.length > 0) {
    csv += '拟合曲线数据\n'
    csv += '压力 (hPa),含水量 (cm³/cm³)\n'
    curvePoints.forEach(p => {
      csv += `${p.pressure.toFixed(4)},${p.waterContent.toFixed(6)}\n`
    })
  }

  return csv
}

function generateExcelReport(reportData) {
  return generateCSVReport(reportData)
}

module.exports = {
  generateHTMLReport,
  generateCSVReport,
  generateExcelReport
}
