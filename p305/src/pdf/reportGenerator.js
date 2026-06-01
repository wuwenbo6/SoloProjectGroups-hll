const { jsPDF } = require('jspdf');

function generateDRCReport(reportData) {
  const { fileName, rules, violations, summary, fileStats } = reportData;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = margin;

  function addText(text, x, y, options = {}) {
    doc.text(text, x, y, { align: options.align || 'left' });
  }

  function addSeparator(yPos) {
    doc.setDrawColor(200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
  }

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  addText('SiP 基板 Gerber DRC 检查报告', pageWidth / 2, y, { align: 'center' });
  y += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  addText('生成时间: ' + new Date().toLocaleString('zh-CN'), pageWidth / 2, y, { align: 'center' });
  y += 8;
  addText('文件名: ' + fileName, pageWidth / 2, y, { align: 'center' });
  y += 15;

  addSeparator(y);
  y += 10;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  addText('一、设计规则配置', margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const ruleItems = [
    ['最小线宽', rules.minLineWidth + ' mm'],
    ['最小间距', rules.minSpacing + ' mm'],
    ['最小环宽', rules.minAnnularRing + ' mm'],
    ['钻孔直径', rules.drillSize + ' mm'],
    ['微孔最小直径', rules.minMicroviaDiameter + ' mm'],
    ['微孔最大直径', rules.maxMicroviaDiameter + ' mm'],
    ['微孔最小环宽', rules.minMicroviaAnnularRing + ' mm'],
    ['微孔最小间距', rules.minMicroviaSpacing + ' mm'],
  ];

  ruleItems.forEach(([label, value]) => {
    addText(label + ':', margin, y);
    addText(value, margin + 50, y);
    y += 6;
  });

  y += 8;
  addSeparator(y);
  y += 10;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  addText('二、文件统计', margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const statItems = [
    ['线路数量', fileStats.traceCount],
    ['焊盘数量', fileStats.padCount],
    ['网络数量', fileStats.netCount],
    ['铜区数量', fileStats.regionCount],
  ];

  statItems.forEach(([label, value]) => {
    addText(label + ':', margin, y);
    addText(String(value), margin + 50, y);
    y += 6;
  });

  y += 8;
  addSeparator(y);
  y += 10;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  addText('三、违规结果汇总', margin, y);
  y += 8;

  const summaryData = [
    ['总违规数', summary.total, summary.total > 0 ? [240, 80, 80] : [80, 200, 80]],
    ['线宽违规', summary.lineWidth, [255, 180, 0]],
    ['间距违规', summary.spacing, [180, 140, 255]],
    ['环宽违规', summary.annularRing, [80, 160, 255]],
    ['微孔违规', summary.microvia, [255, 100, 150]],
  ];

  summaryData.forEach(([label, count, color]) => {
    addText(label + ':', margin, y);
    doc.setTextColor(...color);
    addText(String(count), margin + 50, y);
    doc.setTextColor(0);
    y += 6;
  });

  if (violations.length > 0) {
    y += 8;
    addSeparator(y);
    y += 10;

    if (y > 250) {
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    addText('四、违规详情', margin, y);
    y += 10;

    const tableHeaders = ['#', '类型', 'X坐标', 'Y坐标', '实际值', '要求值', '描述'];
    const colWidths = [8, 22, 25, 25, 18, 18, 65];
    let colX = margin;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(240);
    doc.rect(margin, y - 5, pageWidth - margin * 2, 7, 'F');
    tableHeaders.forEach((header, i) => {
      addText(header, colX, y);
      colX += colWidths[i];
    });
    y += 8;

    doc.setFont('helvetica', 'normal');
    violations.slice(0, 100).forEach((v, idx) => {
      if (y > 270) {
        doc.addPage();
        y = margin;
      }

      let typeLabel = '';
      if (v.type === 'line_width') typeLabel = '线宽';
      else if (v.type === 'spacing') typeLabel = '间距';
      else if (v.type === 'annular_ring') typeLabel = '环宽';
      else if (v.type === 'microvia') typeLabel = '微孔';
      else typeLabel = v.type;

      const rowData = [
        String(idx + 1),
        typeLabel,
        v.x != null ? v.x.toFixed(4) : '-',
        v.y != null ? v.y.toFixed(4) : '-',
        v.actual != null ? v.actual.toFixed(4) : '-',
        v.required != null ? v.required.toFixed(4) : '-',
        v.message.substring(0, 40),
      ];

      colX = margin;
      rowData.forEach((text, i) => {
        if (v.type === 'spacing') doc.setTextColor(180, 140, 255);
        else if (v.type === 'line_width') doc.setTextColor(255, 180, 0);
        else if (v.type === 'annular_ring') doc.setTextColor(80, 160, 255);
        else if (v.type === 'microvia') doc.setTextColor(255, 100, 150);
        else doc.setTextColor(0);

        addText(text, colX, y);
        colX += colWidths[i];
      });
      doc.setTextColor(0);
      y += 6;
    });

    if (violations.length > 100) {
      y += 4;
      doc.setFontSize(9);
      doc.setTextColor(100);
      addText('... 还有 ' + (violations.length - 100) + ' 条违规未显示', margin, y);
    }
  }

  y += 15;
  addSeparator(y);
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(120);
  addText('本报告由 SiP Gerber DRC Checker 自动生成', pageWidth / 2, y, { align: 'center' });

  return doc;
}

function saveReportPdf(filePath, reportData) {
  const doc = generateDRCReport(reportData);
  doc.save(filePath);
  return true;
}

module.exports = { generateDRCReport, saveReportPdf };
