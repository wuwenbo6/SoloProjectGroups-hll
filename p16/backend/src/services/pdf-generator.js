const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const moment = require('moment');
const path = require('path');
const fs = require('fs');

class CertificateGenerator {
  constructor() {
    this.outputDir = path.join(__dirname, '../../certificates');
    this.ensureOutputDir();
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async generateTraceabilityCertificate(data) {
    return new Promise(async (resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `溯源证书 - ${data.produceId}`,
          Author: '农产品溯源系统',
          Subject: '农产品溯源证书',
          Keywords: '溯源,区块链,农产品',
          CreationDate: new Date()
        }
      });

      const certPath = path.join(this.outputDir, `certificate-${data.produceId}-${Date.now()}.pdf`);
      const writeStream = fs.createWriteStream(certPath);

      doc.pipe(writeStream);

      this.drawHeader(doc, data);
      this.drawProduceInfo(doc, data);
      this.drawTransferHistory(doc, data);
      this.drawInspectionReports(doc, data);
      this.drawTemperatureLog(doc, data);
      await this.drawQRCode(doc, data);
      this.drawFooter(doc, data);

      doc.end();

      writeStream.on('finish', () => {
        resolve(certPath);
      });

      writeStream.on('error', reject);
    });
  }

  drawHeader(doc, data) {
    doc
      .rect(50, 50, 495, 100)
      .stroke('#2c3e50');

    doc
      .fillColor('#27ae60')
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('农产品溯源证书', 50, 65, {
        align: 'center',
        width: 495
      });

    doc
      .fillColor('#34495e')
      .fontSize(14)
      .font('Helvetica')
      .text('PRODUCE TRACEABILITY CERTIFICATE', 50, 95, {
        align: 'center',
        width: 495
      });

    doc
      .fillColor('#7f8c8d')
      .fontSize(10)
      .text(`证书编号: ${data.certificateId}`, 50, 120)
      .text(`签发日期: ${moment().format('YYYY-MM-DD HH:mm:ss')}`, 350, 120);
  }

  drawProduceInfo(doc, data) {
    const startY = 150;
    
    doc
      .fillColor('#2c3e50')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('产品基本信息', 50, startY);

    doc
      .moveTo(50, startY + 20)
      .lineTo(545, startY + 20)
      .stroke('#bdc3c7');

    const produce = data.produce || {};
    const infoItems = [
      { label: '产品ID', value: produce.id || data.produceId },
      { label: '产品名称', value: produce.name || '-' },
      { label: '批次号', value: produce.batchNumber || '-' },
      { label: '数量', value: `${produce.quantity || 0} ${produce.unit || ''}` },
      { label: '当前持有方', value: produce.currentOwner || '-' },
      { label: '产品状态', value: this.getStatusText(produce.status) }
    ];

    const col1X = 70;
    const col2X = 320;
    let y = startY + 35;

    infoItems.forEach((item, index) => {
      const x = index % 2 === 0 ? col1X : col2X;
      const rowY = y + Math.floor(index / 2) * 25;

      doc
        .fillColor('#7f8c8d')
        .fontSize(11)
        .text(`${item.label}:`, x, rowY);
      
      doc
        .fillColor('#2c3e50')
        .fontSize(11)
        .text(item.value, x + 70, rowY);
    });
  }

  drawTransferHistory(doc, data) {
    const transfers = data.transfers || [];
    const startY = 270;

    doc
      .fillColor('#2c3e50')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('流转记录', 50, startY);

    doc
      .moveTo(50, startY + 20)
      .lineTo(545, startY + 20)
      .stroke('#bdc3c7');

    if (transfers.length === 0) {
      doc
        .fillColor('#95a5a6')
        .fontSize(11)
        .font('Helvetica')
        .text('暂无流转记录', 50, startY + 35);
      return startY + 60;
    }

    const tableY = startY + 35;
    const colWidths = [100, 100, 130, 100, 100];
    const headers = ['时间', '转出方', '转入方', '地点', '状态'];

    this.drawTableHeader(doc, tableY, colWidths, headers);

    let rowY = tableY + 25;
    transfers.slice(0, 3).forEach(transfer => {
      this.drawTableRow(doc, rowY, colWidths, [
        moment(transfer.timestamp).format('YYYY-MM-DD HH:mm'),
        transfer.from,
        transfer.to,
        transfer.location,
        '完成'
      ]);
      rowY += 22;
    });

    return rowY;
  }

  drawInspectionReports(doc, data) {
    const reports = data.reports || [];
    const startY = 380;

    doc
      .fillColor('#2c3e50')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('质检报告', 50, startY);

    doc
      .moveTo(50, startY + 20)
      .lineTo(545, startY + 20)
      .stroke('#bdc3c7');

    if (reports.length === 0) {
      doc
        .fillColor('#95a5a6')
        .fontSize(11)
        .font('Helvetica')
        .text('暂无质检报告', 50, startY + 35);
      return;
    }

    const tableY = startY + 35;
    const colWidths = [100, 120, 150, 130];
    const headers = ['报告编号', '质检员', '检测日期', '结论'];

    this.drawTableHeader(doc, tableY, colWidths, headers);

    let rowY = tableY + 25;
    reports.forEach(report => {
      this.drawTableRow(doc, rowY, colWidths, [
        report.id,
        report.inspector,
        moment(report.inspectionDate).format('YYYY-MM-DD'),
        report.conclusion
      ]);
      rowY += 22;
    });
  }

  drawTemperatureLog(doc, data) {
    const temperatures = data.temperatures || [];
    const startY = 500;

    doc
      .fillColor('#2c3e50')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('温度记录', 50, startY);

    doc
      .moveTo(50, startY + 20)
      .lineTo(545, startY + 20)
      .stroke('#bdc3c7');

    if (temperatures.length === 0) {
      doc
        .fillColor('#95a5a6')
        .fontSize(11)
        .font('Helvetica')
        .text('暂无温度记录', 50, startY + 35);
      return;
    }

    const tableY = startY + 35;
    const colWidths = [130, 100, 100, 130];
    const headers = ['时间', '温度(°C)', '状态', '采集人'];

    this.drawTableHeader(doc, tableY, colWidths, headers);

    let rowY = tableY + 25;
    temperatures.slice(0, 5).forEach(temp => {
      const isAlert = temp.temperature > 8;
      const status = isAlert ? '超标' : '正常';
      
      doc
        .rect(50, rowY, 500, 22)
        .fill(isAlert ? '#ffebee' : '#ffffff')
        .stroke('#bdc3c7');

      const rowData = [
        moment(temp.timestamp).format('YYYY-MM-DD HH:mm'),
        temp.temperature.toFixed(1),
        status,
        temp.reader
      ];

      let x = 50;
      colWidths.forEach((width, i) => {
        doc
          .fillColor(isAlert ? '#c0392b' : '#2c3e50')
          .fontSize(10)
          .font('Helvetica')
          .text(rowData[i], x + 5, rowY + 5, {
            width: width - 10,
            align: 'left'
          });
        x += width;
      });

      rowY += 22;
    });
  }

  drawTableHeader(doc, y, colWidths, headers) {
    doc
      .rect(50, y, 500, 25)
      .fill('#34495e')
      .stroke('#2c3e50');

    let x = 50;
    colWidths.forEach((width, i) => {
      doc
        .fillColor('#ffffff')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(headers[i], x + 5, y + 6, {
          width: width - 10,
          align: 'left'
        });
      x += width;
    });
  }

  drawTableRow(doc, y, colWidths, data) {
    doc
      .rect(50, y, 500, 22)
      .fill('#ffffff')
      .stroke('#bdc3c7');

    let x = 50;
    colWidths.forEach((width, i) => {
      doc
        .fillColor('#2c3e50')
        .fontSize(10)
        .font('Helvetica')
        .text(data[i] || '-', x + 5, y + 5, {
          width: width - 10,
          align: 'left'
        });
      x += width;
    });
  }

  async drawQRCode(doc, data) {
    const qrData = JSON.stringify({
      produceId: data.produceId,
      certificateId: data.certificateId,
      timestamp: Date.now(),
      hash: this.generateHash(data)
    });

    const qrImage = await QRCode.toDataURL(qrData, { width: 120 });

    const qrX = 420;
    const qrY = 650;

    doc.image(qrImage, qrX, qrY, { width: 120, height: 120 });

    doc
      .fillColor('#7f8c8d')
      .fontSize(9)
      .text('扫描验证证书', qrX, qrY + 125, {
        width: 120,
        align: 'center'
      });
  }

  drawFooter(doc, data) {
    doc
      .moveTo(50, 760)
      .lineTo(545, 760)
      .stroke('#bdc3c7');

    doc
      .fillColor('#7f8c8d')
      .fontSize(9)
      .text('本证书基于区块链技术生成，数据不可篡改', 50, 770)
      .text(`© ${moment().format('YYYY')} 农产品溯源系统 版权所有`, 50, 785);

    doc
      .fillColor('#95a5a6')
      .fontSize(8)
      .text(`SHA256: ${this.generateHash(data).substring(0, 32)}...`, 300, 775);
  }

  getStatusText(status) {
    const statusMap = {
      'CREATED': '已创建',
      'TRANSFERRED': '流转中',
      'TEMP_ALERT': '温度异常',
      'DELIVERED': '已送达'
    };
    return statusMap[status] || status || '-';
  }

  generateHash(data) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify({
      produceId: data.produceId,
      timestamp: Date.now()
    }));
    return hash.digest('hex');
  }
}

module.exports = new CertificateGenerator();
