const fs = require('fs');
const path = require('path');

class CSVExporter {
  constructor(database) {
    this.database = database;
  }

  exportFlights(startTime, endTime, outputPath) {
    const flights = this.database.getHistoricalFlights(startTime, endTime);
    
    return this.writeCSV(outputPath, flights, this.getFlightHeaders());
  }

  exportFlightHistory(icao24, outputPath) {
    const history = this.database.getFlightHistory(icao24);
    
    return this.writeCSV(outputPath, history, this.getHistoryHeaders());
  }

  exportAllFlights(outputPath) {
    const flights = this.database.getAllFlights();
    
    return this.writeCSV(outputPath, flights, this.getFlightHeaders());
  }

  exportConflicts(conflicts, outputPath) {
    return this.writeCSV(outputPath, conflicts, this.getConflictHeaders());
  }

  getFlightHeaders() {
    return [
      { key: 'icao24', label: 'ICAO24' },
      { key: 'callsign', label: '航班号' },
      { key: 'last_lat', label: '纬度' },
      { key: 'last_lon', label: '经度' },
      { key: 'last_altitude', label: '高度(ft)' },
      { key: 'last_velocity', label: '速度(kt)' },
      { key: 'first_seen', label: '首次发现' },
      { key: 'last_seen', label: '最后发现' }
    ];
  }

  getHistoryHeaders() {
    return [
      { key: 'id', label: 'ID' },
      { key: 'icao24', label: 'ICAO24' },
      { key: 'callsign', label: '航班号' },
      { key: 'latitude', label: '纬度' },
      { key: 'longitude', label: '经度' },
      { key: 'altitude', label: '高度(ft)' },
      { key: 'velocity', label: '速度(kt)' },
      { key: 'heading', label: '航向(°)' },
      { key: 'vertical_rate', label: '垂直速度(ft/min)' },
      { key: 'timestamp', label: '时间戳' },
      { key: 'datetime', label: '日期时间' }
    ];
  }

  getConflictHeaders() {
    return [
      { key: 'id', label: '冲突ID' },
      { key: 'flight1_icao', label: '飞机1 ICAO24' },
      { key: 'flight1_callsign', label: '飞机1 航班号' },
      { key: 'flight2_icao', label: '飞机2 ICAO24' },
      { key: 'flight2_callsign', label: '飞机2 航班号' },
      { key: 'horizontalDistance', label: '水平距离(km)' },
      { key: 'verticalDistance', label: '垂直距离(ft)' },
      { key: 'timeToClosest', label: '预计接近时间(s)' },
      { key: 'level', label: '告警级别' },
      { key: 'timestamp', label: '时间戳' },
      { key: 'datetime', label: '日期时间' }
    ];
  }

  writeCSV(outputPath, data, headers) {
    let csvContent = headers.map(h => h.label).join(',') + '\n';
    
    for (const row of data) {
      const processedRow = { ...row };
      
      if (processedRow.flight1) {
        processedRow.flight1_icao = processedRow.flight1.icao24;
        processedRow.flight1_callsign = processedRow.flight1.callsign || '';
      }
      if (processedRow.flight2) {
        processedRow.flight2_icao = processedRow.flight2.icao24;
        processedRow.flight2_callsign = processedRow.flight2.callsign || '';
      }
      
      if (processedRow.timestamp) {
        processedRow.datetime = new Date(processedRow.timestamp).toLocaleString('zh-CN');
      }
      if (processedRow.first_seen) {
        processedRow.first_seen = new Date(processedRow.first_seen).toLocaleString('zh-CN');
      }
      if (processedRow.last_seen) {
        processedRow.last_seen = new Date(processedRow.last_seen).toLocaleString('zh-CN');
      }
      
      const values = headers.map(header => {
        let value = processedRow[header.key] !== undefined ? processedRow[header.key] : '';
        if (typeof value === 'string' && value.includes(',')) {
          value = `"${value}"`;
        }
        return value;
      });
      
      csvContent += values.join(',') + '\n';
    }
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, csvContent, 'utf-8');
    
    return {
      path: outputPath,
      rows: data.length,
      size: Buffer.byteLength(csvContent, 'utf-8')
    };
  }

  generateReport(startTime, endTime, outputDir) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const reports = [];
    
    reports.push({
      name: '航班摘要',
      ...this.exportFlights(startTime, endTime, path.join(outputDir, `flights_${timestamp}.csv`))
    });
    
    const flights = this.database.getHistoricalFlights(startTime, endTime);
    for (const flight of flights) {
      if (flight.icao24) {
        reports.push({
          name: `航班轨迹 ${flight.callsign || flight.icao24}`,
          ...this.exportFlightHistory(
            flight.icao24,
            path.join(outputDir, `flight_${flight.icao24}_${timestamp}.csv`)
          )
        });
      }
    }
    
    const summaryPath = path.join(outputDir, `report_summary_${timestamp}.txt`);
    let summary = `ADS-B 航班报告\n`;
    summary += `生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
    summary += `时间范围: ${new Date(startTime).toLocaleString('zh-CN')} - ${new Date(endTime).toLocaleString('zh-CN')}\n`;
    summary += `航班数量: ${flights.length}\n\n`;
    summary += `导出文件:\n`;
    reports.forEach(r => {
      summary += `- ${r.name}: ${r.path} (${r.rows} 行, ${Math.round(r.size/1024)} KB)\n`;
    });
    
    fs.writeFileSync(summaryPath, summary, 'utf-8');
    
    return {
      summaryPath,
      reports,
      totalFlights: flights.length
    };
  }
}

module.exports = CSVExporter;
