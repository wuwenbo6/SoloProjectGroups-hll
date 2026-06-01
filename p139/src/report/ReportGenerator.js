const fs = require('fs');
const path = require('path');

class ReportGenerator {
  constructor(database) {
    this.database = database;
  }

  async generateHTML(testRunId, options = {}) {
    const testRun = await this.database.getTestRun(testRunId);
    if (!testRun) {
      throw new Error(`Test run not found: ${testRunId}`);
    }

    const { includeChart = true, includeDetails = true } = options;
    const passRate = testRun.total_tests > 0 
      ? ((testRun.passed_tests / testRun.total_tests) * 100).toFixed(1) 
      : 0;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Report - ${testRun.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      padding: 40px;
      color: #333;
    }
    .container { 
      max-width: 1000px; 
      margin: 0 auto; 
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px 40px;
    }
    .header h1 { font-size: 28px; margin-bottom: 8px; }
    .header .subtitle { opacity: 0.9; font-size: 14px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      padding: 30px 40px;
      background: #f8f9fa;
    }
    .summary-item {
      text-align: center;
      padding: 20px;
      background: white;
      border-radius: 8px;
    }
    .summary-item .value {
      font-size: 36px;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .summary-item .label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
    }
    .pass .value { color: #10b981; }
    .fail .value { color: #ef4444; }
    .rate .value { color: #667eea; }
    .content { padding: 30px 40px; }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e5e7eb;
    }
    .result-table {
      width: 100%;
      border-collapse: collapse;
    }
    .result-table th,
    .result-table td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    .result-table th {
      background: #f8f9fa;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
    }
    .result-table tr:hover { background: #f9fafb; }
    .status-pass {
      display: inline-block;
      padding: 4px 12px;
      background: #d1fae5;
      color: #065f46;
      border-radius: 20px;
      font-weight: 600;
      font-size: 12px;
    }
    .status-fail {
      display: inline-block;
      padding: 4px 12px;
      background: #fee2e2;
      color: #991b1b;
      border-radius: 20px;
      font-weight: 600;
      font-size: 12px;
    }
    .error-message {
      color: #dc2626;
      font-size: 13px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 20px;
    }
    .info-item {
      display: flex;
      justify-content: space-between;
      padding: 12px 16px;
      background: #f8f9fa;
      border-radius: 6px;
    }
    .info-item .label { color: #666; font-size: 13px; }
    .info-item .val { font-weight: 600; }
    .footer {
      text-align: center;
      padding: 20px;
      color: #999;
      font-size: 12px;
      border-top: 1px solid #e5e7eb;
    }
    @media print {
      body { background: white; padding: 0; }
      .container { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔬 Instrument Test Report</h1>
      <div class="subtitle">${testRun.name}</div>
    </div>
    
    <div class="summary">
      <div class="summary-item">
        <div class="value">${testRun.total_tests || 0}</div>
        <div class="label">Total Tests</div>
      </div>
      <div class="summary-item pass">
        <div class="value">${testRun.passed_tests || 0}</div>
        <div class="label">Passed</div>
      </div>
      <div class="summary-item fail">
        <div class="value">${testRun.failed_tests || 0}</div>
        <div class="label">Failed</div>
      </div>
      <div class="summary-item rate">
        <div class="value">${passRate}%</div>
        <div class="label">Pass Rate</div>
      </div>
    </div>
    
    <div class="content">
      <div class="section-title">Test Information</div>
      <div class="info-grid">
        <div class="info-item">
          <span class="label">Test Run ID</span>
          <span class="val">#${testRun.id}</span>
        </div>
        <div class="info-item">
          <span class="label">Status</span>
          <span class="val">${testRun.status}</span>
        </div>
        <div class="info-item">
          <span class="label">Device</span>
          <span class="val">${testRun.device_id || 'N/A'}</span>
        </div>
        <div class="info-item">
          <span class="label">Started</span>
          <span class="val">${testRun.started_at || 'N/A'}</span>
        </div>
        <div class="info-item">
          <span class="label">Finished</span>
          <span class="val">${testRun.finished_at || 'N/A'}</span>
        </div>
        <div class="info-item">
          <span class="label">Notes</span>
          <span class="val">${testRun.notes || 'N/A'}</span>
        </div>
      </div>
      
      <div class="section-title">Test Results</div>
      <table class="result-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Test Name</th>
            <th>Measured</th>
            <th>Limits</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${(testRun.results || []).map((r, i) => `
          <tr>
            <td>${i + 1}</td>
            <td><strong>${r.name}</strong></td>
            <td>${r.measured_value !== null && r.measured_value !== undefined ? 
              `${r.measured_value} ${r.unit || ''}` : 'N/A'}</td>
            <td>
              ${r.min_limit !== null && r.max_limit !== null ? 
                `${r.min_limit} ~ ${r.max_limit}` : 
                r.min_limit !== null ? `> ${r.min_limit}` :
                r.max_limit !== null ? `< ${r.max_limit}` : 'N/A'}
            </td>
            <td>
              <span class="status-${r.status}">${r.status.toUpperCase()}</span>
              ${r.error_message ? `<div class="error-message">${r.error_message}</div>` : ''}
            </td>
          </tr>
          `).join('')}
          ${(!testRun.results || testRun.results.length === 0) ? 
            '<tr><td colspan="5" style="text-align:center; color:#999; padding:30px;">No test results</td></tr>' : ''}
        </tbody>
      </table>
    </div>
    
    <div class="footer">
      Generated by Instrument Control Studio • ${new Date().toISOString()}
    </div>
  </div>
</body>
</html>`;

    return html;
  }

  async saveHTML(testRunId, outputPath) {
    const html = await this.generateHTML(testRunId);
    fs.writeFileSync(outputPath, html, 'utf8');
    return outputPath;
  }

  async generateCSV(testRunId) {
    const testRun = await this.database.getTestRun(testRunId);
    if (!testRun) {
      throw new Error(`Test run not found: ${testRunId}`);
    }

    const headers = ['#', 'Test Name', 'Command', 'Measured Value', 'Unit', 
                     'Min Limit', 'Max Limit', 'Status', 'Error Message', 'Time'];
    
    const rows = (testRun.results || []).map((r, i) => [
      i + 1,
      r.name,
      r.command || '',
      r.measured_value !== null && r.measured_value !== undefined ? r.measured_value : '',
      r.unit || '',
      r.min_limit !== null && r.min_limit !== undefined ? r.min_limit : '',
      r.max_limit !== null && r.max_limit !== undefined ? r.max_limit : '',
      r.status,
      r.error_message || '',
      r.created_at || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    return csv;
  }

  async saveCSV(testRunId, outputPath) {
    const csv = await this.generateCSV(testRunId);
    fs.writeFileSync(outputPath, csv, 'utf8');
    return outputPath;
  }

  async generateJSON(testRunId) {
    const testRun = await this.database.getTestRun(testRunId);
    if (!testRun) {
      throw new Error(`Test run not found: ${testRunId}`);
    }

    const passRate = testRun.total_tests > 0 
      ? ((testRun.passed_tests / testRun.total_tests) * 100).toFixed(1) 
      : 0;

    return JSON.stringify({
      testRun: {
        id: testRun.id,
        name: testRun.name,
        status: testRun.status,
        device: testRun.device_id,
        startedAt: testRun.started_at,
        finishedAt: testRun.finished_at
      },
      summary: {
        total: testRun.total_tests,
        passed: testRun.passed_tests,
        failed: testRun.failed_tests,
        passRate: parseFloat(passRate)
      },
      results: (testRun.results || []).map(r => ({
        name: r.name,
        command: r.command,
        measuredValue: r.measured_value,
        unit: r.unit,
        minLimit: r.min_limit,
        maxLimit: r.max_limit,
        status: r.status,
        error: r.error_message,
        time: r.created_at
      }))
    }, null, 2);
  }

  async saveJSON(testRunId, outputPath) {
    const json = await this.generateJSON(testRunId);
    fs.writeFileSync(outputPath, json, 'utf8');
    return outputPath;
  }
}

module.exports = ReportGenerator;
