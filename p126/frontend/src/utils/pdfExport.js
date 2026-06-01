import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export async function exportReport({
  circuitName = '未命名电路',
  circuitDescription = '',
  circuitData = null,
  simulationResult = null,
  monteCarloResult = null,
  temperatureSweepResult = null,
  simulationConfig = null,
  netlist = '',
  editorElement = null,
  waveformElement = null
}) {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  let yPos = margin;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('电路仿真报告', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`生成时间: ${new Date().toLocaleString('zh-CN')}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;

  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('1. 电路信息', margin, yPos);
  yPos += 6;

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`名称: ${circuitName}`, margin + 5, yPos);
  yPos += 5;
  if (circuitDescription) {
    pdf.text(`描述: ${circuitDescription}`, margin + 5, yPos);
    yPos += 5;
  }

  const { components = [], wires = [] } = circuitData || {};
  pdf.text(`元件数: ${components.length}`, margin + 5, yPos);
  yPos += 5;
  pdf.text(`连线数: ${wires.length}`, margin + 5, yPos);
  yPos += 8;

  if (components.length > 0) {
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('元件列表:', margin + 5, yPos);
    yPos += 5;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    const typeLabels = {
      voltage_source: '电压源', current_source: '电流源',
      resistor: '电阻', capacitor: '电容', inductor: '电感',
      diode: '二极管', npn: 'NPN三极管', pnp: 'PNP三极管',
      nmos: 'NMOS', pmos: 'PMOS', opamp: '运放', ground: '接地'
    };

    components.slice(0, 10).forEach((c, i) => {
      const label = typeLabels[c.type] || c.type;
      pdf.text(`  ${i + 1}. ${label}: ${formatValue(c.value, c.type)}`, margin + 5, yPos);
      yPos += 4;
    });
    if (components.length > 10) {
      pdf.text(`  ... 还有 ${components.length - 10} 个元件`, margin + 5, yPos);
      yPos += 4;
    }
  }

  yPos += 4;
  if (yPos > pageHeight - 60) {
    pdf.addPage();
    yPos = margin;
  }

  if (simulationConfig) {
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('2. 仿真设置', margin, yPos);
    yPos += 6;

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    const typeLabel = { tran: '瞬态分析', ac: '交流分析', dc: '直流扫描' }[simulationConfig.type] || simulationConfig.type;
    pdf.text(`分析类型: ${typeLabel}`, margin + 5, yPos);
    yPos += 5;

    if (simulationConfig.type === 'tran') {
      pdf.text(`起始时间: ${formatSI(simulationConfig.start, 's')}`, margin + 5, yPos); yPos += 4;
      pdf.text(`终止时间: ${formatSI(simulationConfig.stop, 's')}`, margin + 5, yPos); yPos += 4;
      pdf.text(`时间步长: ${formatSI(simulationConfig.step, 's')}`, margin + 5, yPos); yPos += 4;
    } else if (simulationConfig.type === 'ac') {
      pdf.text(`起始频率: ${formatSI(simulationConfig.fstart, 'Hz')}`, margin + 5, yPos); yPos += 4;
      pdf.text(`终止频率: ${formatSI(simulationConfig.fstop, 'Hz')}`, margin + 5, yPos); yPos += 4;
      pdf.text(`点数/十倍频: ${simulationConfig.points}`, margin + 5, yPos); yPos += 4;
    } else if (simulationConfig.type === 'dc') {
      pdf.text(`扫描源: ${simulationConfig.source}`, margin + 5, yPos); yPos += 4;
      pdf.text(`起始: ${formatSI(simulationConfig.start, 'V')}`, margin + 5, yPos); yPos += 4;
      pdf.text(`终止: ${formatSI(simulationConfig.stop, 'V')}`, margin + 5, yPos); yPos += 4;
      pdf.text(`步长: ${formatSI(simulationConfig.step, 'V')}`, margin + 5, yPos); yPos += 4;
    }
  }

  if (monteCarloResult) {
    yPos += 4;
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('蒙特卡洛分析', margin + 5, yPos); yPos += 6;
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`运行次数: ${monteCarloResult.runs}`, margin + 10, yPos); yPos += 5;
    pdf.text(`分布: ${monteCarloResult.distribution === 'gaussian' ? '高斯' : '均匀'}`, margin + 10, yPos); yPos += 5;
    pdf.text(`失败次数: ${monteCarloResult.failed_runs}`, margin + 10, yPos); yPos += 5;

    if (monteCarloResult.stats) {
      Object.entries(monteCarloResult.stats).forEach(([signal, stat]) => {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${signal}:`, margin + 10, yPos); yPos += 5;
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`  均值: ${formatSI(stat.mean)}`, margin + 15, yPos); yPos += 4;
        pdf.text(`  标准差: ${formatSI(stat.std)}`, margin + 15, yPos); yPos += 4;
        pdf.text(`  最小值: ${formatSI(stat.min)}`, margin + 15, yPos); yPos += 4;
        pdf.text(`  最大值: ${formatSI(stat.max)}`, margin + 15, yPos); yPos += 4;
      });
    }
  }

  if (temperatureSweepResult) {
    yPos += 4;
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('温度扫描分析', margin + 5, yPos); yPos += 6;
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`温度点: ${temperatureSweepResult.temperatures?.join(', ')} °C`, margin + 10, yPos); yPos += 5;
    pdf.text(`成功: ${temperatureSweepResult.results?.length || 0} / ${temperatureSweepResult.temperatures?.length || 0}`, margin + 10, yPos); yPos += 5;
  }

  pdf.addPage();
  yPos = margin;

  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('3. 电路图', margin, yPos);
  yPos += 8;

  if (editorElement) {
    try {
      const canvas = await html2canvas(editorElement, {
        backgroundColor: '#ffffff',
        scale: 2
      });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      if (yPos + imgHeight > pageHeight - margin) {
        pdf.addPage();
        yPos = margin;
      }
      pdf.addImage(imgData, 'PNG', margin, yPos, imgWidth, imgHeight);
      yPos += imgHeight + 8;
    } catch (e) {
      console.warn('电路图截图失败:', e);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'italic');
      pdf.text('(电路图截图失败)', margin, yPos);
      yPos += 6;
    }
  }

  pdf.addPage();
  yPos = margin;

  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('4. 仿真波形', margin, yPos);
  yPos += 8;

  if (waveformElement) {
    try {
      const canvas = await html2canvas(waveformElement, {
        backgroundColor: '#ffffff',
        scale: 2
      });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      if (yPos + imgHeight > pageHeight - margin) {
        pdf.addPage();
        yPos = margin;
      }
      pdf.addImage(imgData, 'PNG', margin, yPos, imgWidth, imgHeight);
      yPos += imgHeight + 8;
    } catch (e) {
      console.warn('波形截图失败:', e);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'italic');
      pdf.text('(波形截图失败)', margin, yPos);
      yPos += 6;
    }
  }

  if (simulationResult?.result?.data) {
    const data = simulationResult.result.data;
    const header = simulationResult.result.header;

    yPos += 4;
    if (yPos > pageHeight - 60) {
      pdf.addPage();
      yPos = margin;
    }

    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('5. 关键数据', margin, yPos);
    yPos += 6;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`分析类型: ${header?.plotname || '-'}`, margin + 5, yPos);
    yPos += 5;
    pdf.text(`点数: ${header?.numPoints || 0}`, margin + 5, yPos);
    yPos += 5;

    const signals = Object.keys(data).filter(k => k !== 'time' && k !== 'frequency');
    signals.slice(0, 4).forEach(sig => {
      const vals = data[sig];
      if (Array.isArray(vals) && vals.length > 0) {
        const values = vals.map(v => typeof v === 'object' ? Math.sqrt(v.real ** 2 + v.imag ** 2) : v);
        pdf.text(`${sig}:`, margin + 5, yPos);
        yPos += 4;
        pdf.text(`  最小值: ${formatSI(Math.min(...values))}`, margin + 10, yPos);
        yPos += 4;
        pdf.text(`  最大值: ${formatSI(Math.max(...values))}`, margin + 10, yPos);
        yPos += 4;
        pdf.text(`  最终值: ${formatSI(values[values.length - 1])}`, margin + 10, yPos);
        yPos += 4;
      }
    });
  }

  if (netlist) {
    pdf.addPage();
    yPos = margin;

    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('6. SPICE 网表', margin, yPos);
    yPos += 6;

    pdf.setFontSize(9);
    pdf.setFont('courier', 'normal');
    const lines = netlist.split('\n');
    lines.forEach(line => {
      if (yPos > pageHeight - margin) {
        pdf.addPage();
        yPos = margin;
      }
      pdf.text(line, margin + 5, yPos);
      yPos += 4;
    });
  }

  pdf.addPage();
  yPos = pageHeight - margin;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(128);
  pdf.text('电路仿真器自动生成报告', pageWidth / 2, yPos, { align: 'center' });

  const filename = `${circuitName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_报告.pdf`;
  pdf.save(filename);
}

function formatValue(value, type) {
  if (type === 'resistor') return formatSI(value, 'Ω');
  if (type === 'capacitor') return formatSI(value, 'F');
  if (type === 'inductor') return formatSI(value, 'H');
  if (type === 'voltage_source') return formatSI(value, 'V');
  if (type === 'current_source') return formatSI(value, 'A');
  return formatSI(value, '');
}

function formatSI(v, unit = '') {
  if (!isFinite(v)) return 'N/A';
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'G' + unit;
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M' + unit;
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(2) + 'k' + unit;
  if (Math.abs(v) >= 1) return v.toFixed(2) + unit;
  if (Math.abs(v) >= 1e-3) return (v * 1e3).toFixed(2) + 'm' + unit;
  if (Math.abs(v) >= 1e-6) return (v * 1e6).toFixed(2) + 'u' + unit;
  if (Math.abs(v) >= 1e-9) return (v * 1e9).toFixed(2) + 'n' + unit;
  if (Math.abs(v) >= 1e-12) return (v * 1e12).toFixed(2) + 'p' + unit;
  return '0' + unit;
}
