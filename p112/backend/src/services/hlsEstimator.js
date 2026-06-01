const MAX_BRAM = 50;
const MAX_LUT = 50000;
const MAX_DSP = 200;
const DEFAULT_CLOCK = 100;

function estimateResources(code, options = {}) {
  const clockPeriod = options.clockPeriod || 10;
  const targetFreq = options.targetFreq || DEFAULT_CLOCK;
  
  let lut = 0;
  let dsp = 0;
  let bram = 0;
  let warnings = [];
  let pipelineInfo = [];
  let clockDomains = [];

  const loopsInfo = analyzeLoops(code);
  lut += loopsInfo.lutOverhead;
  dsp += loopsInfo.dspMultiplier;
  pipelineInfo = loopsInfo.pipelineInfo;

  const arithmeticOps = (code.match(/[\+\-\*\/]/g) || []).length;
  lut += arithmeticOps * 8;

  const multiplications = (code.match(/\*/g) || []).length;
  dsp += Math.floor(multiplications * 0.5);

  const divisions = (code.match(/\//g) || []).length;
  dsp += divisions * 2;

  const conditionals = (code.match(/\b(if|else|switch)\b/g) || []).length;
  lut += conditionals * 25;

  const arrayAnalysis = analyzeArrays(code);
  bram += arrayAnalysis.bramCount;
  warnings = warnings.concat(arrayAnalysis.warnings);

  const clockAnalysis = analyzeClockDomains(code);
  clockDomains = clockAnalysis.domains;
  warnings = warnings.concat(clockAnalysis.warnings);

  const functions = (code.match(/\bvoid\s+\w+\s*\(/g) || []).length;
  lut += functions * 40;

  lut += Math.floor(lut * (0.5 + Math.random() * 0.5));
  dsp += Math.floor(dsp * Math.random() * 0.3);
  bram += Math.floor(bram * Math.random() * 0.2);

  if (bram > MAX_BRAM) {
    warnings.push({
      type: 'bram_overflow',
      severity: 'critical',
      message: `BRAM资源预估溢出！需求: ${bram}, 可用: ${MAX_BRAM}`,
      detail: '建议减小数组大小、使用数据流优化或考虑更大规模的FPGA器件'
    });
  }

  const latency = estimateLatency(code, pipelineInfo);
  const throughput = estimateThroughput(code, pipelineInfo);

  return {
    lut: Math.max(100, Math.min(MAX_LUT, lut)),
    dsp: Math.max(0, Math.min(MAX_DSP, dsp)),
    bram: Math.max(0, bram),
    warnings,
    pipelineInfo,
    clockDomains,
    performance: {
      latency,
      throughput,
      targetFrequency: targetFreq,
      clockPeriod
    }
  };
}

function analyzeLoops(code) {
  let lutOverhead = 0;
  let dspMultiplier = 1;
  let pipelineInfo = [];
  let loopIndex = 0;

  const loopMatches = code.matchAll(/\b(for|while)\s*\([^)]*\)\s*\{([^}]*)\}/gs);
  
  for (const match of loopMatches) {
    const loopBody = match[2];
    const loopLine = match[0];
    loopIndex++;

    lutOverhead += 50;

    const hasPipeline = loopBody.includes('PIPELINE') || loopBody.includes('pipeline');
    const hasUnroll = loopBody.includes('UNROLL') || loopBody.includes('unroll');
    const hasDataflow = loopBody.includes('DATAFLOW') || loopBody.includes('dataflow');

    const iiMatch = loopBody.match(/II\s*[=:]\s*(\d+)/i);
    const targetII = iiMatch ? parseInt(iiMatch[1]) : 1;

    const pipelineDepth = calculatePipelineDepth(loopBody);

    const loopAnalysis = {
      id: loopIndex,
      type: match[1],
      hasPipeline,
      hasUnroll,
      hasDataflow,
      targetII,
      estimatedII: hasPipeline ? Math.max(targetII, Math.ceil(pipelineDepth / 3)) : pipelineDepth,
      pipelineDepth,
      iterations: extractIterationCount(loopLine),
      recommendations: []
    };

    if (!hasPipeline && !hasUnroll) {
      loopAnalysis.recommendations.push({
        type: 'pipeline',
        message: '建议添加流水线优化',
        detail: `添加 #pragma HLS PIPELINE II=${targetII} 可显著提升吞吐量`,
        expectedGain: '吞吐量提升 2-5x'
      });
    }

    if (hasPipeline && pipelineDepth > targetII * 3) {
      loopAnalysis.recommendations.push({
        type: 'pipeline_ii',
        message: `流水线深度 (${pipelineDepth}) 可能超过目标II约束`,
        detail: '考虑拆分循环体或简化组合逻辑以达到目标II',
        expectedGain: `II从 ${loopAnalysis.estimatedII} 优化到 ${targetII}`
      });
    }

    if (hasDataflow) {
      loopAnalysis.recommendations.push({
        type: 'dataflow',
        message: '数据流优化已启用',
        detail: 'DATAFLOW pragma 已启用任务级并行',
        expectedGain: '任务级流水线并行'
      });
    }

    pipelineInfo.push(loopAnalysis);

    if (hasUnroll) {
      lutOverhead += 200;
      dspMultiplier *= 2;
    } else if (hasPipeline) {
      lutOverhead += 100;
    } else {
      lutOverhead += 80;
    }

    const bodyArithmetic = (loopBody.match(/[\+\-\*\/]/g) || []).length;
    const iterations = extractIterationCount(loopLine);
    
    if (iterations > 0) {
      if (hasUnroll) {
        lutOverhead += bodyArithmetic * 15 * Math.min(iterations, 8);
      } else if (!hasPipeline) {
        lutOverhead += bodyArithmetic * 12;
      } else {
        lutOverhead += bodyArithmetic * 8;
      }
    }
  }

  const nestedDepth = countNestedDepth(code);
  lutOverhead += nestedDepth * 150;

  return { lutOverhead, dspMultiplier, pipelineInfo };
}

function calculatePipelineDepth(loopBody) {
  let depth = 1;
  
  const multipliers = (loopBody.match(/\*/g) || []).length;
  depth += multipliers * 2;
  
  const adders = (loopBody.match(/[\+\-]/g) || []).length;
  depth += Math.floor(adders * 0.5);
  
  const conditions = (loopBody.match(/\b(if|switch)\b/g) || []).length;
  depth += conditions * 2;
  
  return Math.max(1, depth);
}

function countNestedDepth(code) {
  let maxDepth = 0;
  let currentDepth = 0;
  const lines = code.split('\n');
  
  let inLoop = false;
  for (const line of lines) {
    if (line.includes('for') || line.includes('while')) {
      currentDepth++;
      inLoop = true;
      maxDepth = Math.max(maxDepth, currentDepth);
    }
    if (line.includes('}') && inLoop) {
      currentDepth = Math.max(0, currentDepth - 1);
      if (currentDepth === 0) inLoop = false;
    }
  }
  
  return maxDepth > 1 ? maxDepth : 0;
}

function extractIterationCount(loopLine) {
  const forMatch = loopLine.match(/for\s*\([^;]*;\s*[^<]*<\s*(\d+)/);
  if (forMatch) return parseInt(forMatch[1]);
  
  const rangeMatch = loopLine.match(/range\s*\(\s*(\d+)\s*\)/);
  if (rangeMatch) return parseInt(rangeMatch[1]);
  
  return 10;
}

function analyzeArrays(code) {
  let bramCount = 0;
  let warnings = [];

  const arrayPatterns = [
    /(\w+)\s+(?:\w+)\s*\[(\d+)\](?:\[(\d+)\])?(?:\[(\d+)\])?/g,
    /(\w+)\s+(?:\w+)\s*\[(\d+):(\d+)\]/g
  ];

  let match;
  for (const pattern of arrayPatterns) {
    while ((match = pattern.exec(code)) !== null) {
      const dataType = match[1];
      let totalSize = 1;

      for (let i = 2; i < match.length; i++) {
        if (match[i]) {
          totalSize *= parseInt(match[i]);
        }
      }

      const typeWidth = getTypeWidth(dataType);
      const totalBits = totalSize * typeWidth;
      const bramNeeded = Math.ceil(totalBits / (18 * 1024));

      bramCount += bramNeeded;

      if (totalSize > 10000) {
        warnings.push({
          type: 'large_array',
          severity: 'warning',
          message: `检测到大数组 (${totalSize.toLocaleString()} 元素)，可能导致BRAM资源紧张`,
          detail: '建议使用数组分区 #pragma HLS ARRAY_PARTITION 或数据流优化'
        });
      }

      if (bramNeeded > MAX_BRAM * 0.5) {
        warnings.push({
          type: 'high_bram_usage',
          severity: 'high',
          message: `单数组BRAM使用量较高 (${bramNeeded} BRAM)`,
          detail: '考虑拆分数组、使用片外存储器或优化数据类型'
        });
      }
    }
  }

  return { bramCount, warnings };
}

function getTypeWidth(type) {
  const typeMap = {
    'char': 8,
    'unsigned char': 8,
    'short': 16,
    'unsigned short': 16,
    'int': 32,
    'unsigned int': 32,
    'long': 64,
    'float': 32,
    'double': 64,
    'ap_int': 32,
    'ap_fixed': 32
  };

  for (const [t, width] of Object.entries(typeMap)) {
    if (type.includes(t)) return width;
  }
  
  return 32;
}

function analyzeClockDomains(code) {
  const domains = [];
  const warnings = [];

  const clockMatches = code.matchAll(/CLOCK_DOMAIN\s*[=:]\s*(\w+)/gi);
  for (const match of clockMatches) {
    if (!domains.includes(match[1])) {
      domains.push(match[1]);
    }
  }

  const apCtrlClock = code.match(/ap_ctrl_hs|ap_ctrl_none|ap_ctrl_chain/i);
  if (apCtrlClock) {
    domains.push('ap_clk');
  }

  const axisInterfaces = (code.match(/axis|AXI4-Stream|axis_stream/gi) || []).length;
  const axiInterfaces = (code.match(/m_axi|s_axi|AXI4/gi) || []).length;

  if (axisInterfaces > 0 && axiInterfaces > 0) {
    domains.push('axis_clk');
    domains.push('axi_clk');
    warnings.push({
      type: 'multi_clock',
      severity: 'medium',
      message: '检测到多时钟域（AXI-Stream + AXI-MM）',
      detail: '需要处理时钟域交叉，建议添加同步寄存器或FIFO',
      recommended: '使用 #pragma HLS INTERFACE 明确指定时钟域'
    });
  }

  if (domains.length > 1) {
    warnings.push({
      type: 'clock_domains',
      severity: 'info',
      message: `检测到 ${domains.length} 个时钟域: ${domains.join(', ')}`,
      detail: '多时钟域设计需要特别注意时序收敛和CDC处理',
      recommended: '确保每个时钟域有适当的约束和时序分析'
    });
  }

  return { domains, warnings };
}

function estimateLatency(code, pipelineInfo) {
  let totalCycles = 0;

  const loops = code.match(/\b(for|while)\b/g) || [];
  const baseLoopLatency = loops.length * 100;

  for (const pipe of pipelineInfo) {
    if (pipe.hasPipeline) {
      totalCycles += pipe.iterations + pipe.pipelineDepth;
    } else {
      totalCycles += pipe.iterations * pipe.pipelineDepth;
    }
  }

  const arithmeticOps = (code.match(/[\+\-\*\/]/g) || []).length;
  totalCycles += arithmeticOps * 2;

  return Math.max(totalCycles, baseLoopLatency);
}

function estimateThroughput(code, pipelineInfo) {
  let ii = 1;

  for (const pipe of pipelineInfo) {
    if (pipe.hasPipeline) {
      ii = Math.max(ii, pipe.estimatedII);
    }
  }

  const loops = (code.match(/\b(for|while)\b/g) || []).length;
  if (loops === 0) return { initiationInterval: ii, samplesPerCycle: 1 };

  return {
    initiationInterval: ii,
    samplesPerCycle: 1 / ii,
    bottleneck: pipelineInfo.length > 0 ? '流水线II约束' : '循环结构'
  };
}

function generateReport(code, resources, metadata = {}) {
  const timestamp = new Date().toISOString();
  
  return {
    reportVersion: '1.0',
    generatedAt: timestamp,
    designInfo: {
      name: metadata.name || 'Unnamed Design',
      codeLines: code.split('\n').length,
      targetDevice: metadata.targetDevice || 'xczu9eg-ffvb1156-2-e',
      targetFrequency: resources.performance?.targetFrequency || 100
    },
    resourceEstimation: {
      lut: {
        used: resources.lut,
        available: MAX_LUT,
        percentage: ((resources.lut / MAX_LUT) * 100).toFixed(2)
      },
      dsp: {
        used: resources.dsp,
        available: MAX_DSP,
        percentage: ((resources.dsp / MAX_DSP) * 100).toFixed(2)
      },
      bram: {
        used: resources.bram,
        available: MAX_BRAM,
        percentage: ((resources.bram / MAX_BRAM) * 100).toFixed(2)
      }
    },
    performance: resources.performance || {},
    pipelineAnalysis: resources.pipelineInfo || [],
    clockDomains: resources.clockDomains || [],
    recommendations: resources.warnings || []
  };
}

function generateHTMLReport(report) {
  const statusColor = (val, max) => {
    const pct = val / max;
    if (pct > 0.9) return '#dc2626';
    if (pct > 0.7) return '#d97706';
    return '#059669';
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HLS 资源估算报告 - ${report.designInfo.name}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 40px; }
      .container { max-width: 1000px; margin: 0 auto; }
      h1 { font-size: 28px; margin-bottom: 8px; background: linear-gradient(90deg, #3b82f6, #10b981); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
      .subtitle { color: #94a3b8; margin-bottom: 32px; }
      .section { background: #1e293b; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
      .section-title { font-size: 18px; font-weight: 600; margin-bottom: 20px; color: #f1f5f9; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
      .resource-card { background: #334155; border-radius: 8px; padding: 20px; text-align: center; }
      .resource-value { font-size: 32px; font-weight: 700; margin-bottom: 4px; }
      .resource-label { font-size: 14px; color: #94a3b8; margin-bottom: 8px; }
      .progress-bar { height: 8px; background: #1e293b; border-radius: 4px; overflow: hidden; }
      .progress-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
      .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .info-item { display: flex; justify-content: space-between; }
      .info-label { color: #94a3b8; }
      .warning { background: #fef3c7; border-left: 4px solid #f59e0b; color: #92400e; padding: 12px 16px; border-radius: 4px; margin-bottom: 8px; }
      .warning-critical { background: #fee2e2; border-left-color: #dc2626; color: #991b1b; }
      .footer { text-align: center; color: #64748b; margin-top: 40px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>HLS 资源估算报告</h1>
        <p class="subtitle">生成时间: ${new Date(report.generatedAt).toLocaleString('zh-CN')}</p>
        
        <div class="section">
            <div class="section-title">设计信息</div>
            <div class="info-grid">
                <div class="info-item"><span class="info-label">设计名称</span><span>${report.designInfo.name}</span></div>
                <div class="info-item"><span class="info-label">代码行数</span><span>${report.designInfo.codeLines}</span></div>
                <div class="info-item"><span class="info-label">目标器件</span><span>${report.designInfo.targetDevice}</span></div>
                <div class="info-item"><span class="info-label">目标频率</span><span>${report.designInfo.targetFrequency} MHz</span></div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">资源估算</div>
            <div class="grid">
                <div class="resource-card">
                    <div class="resource-value" style="color: ${statusColor(report.resourceEstimation.lut.used, MAX_LUT)}">${report.resourceEstimation.lut.used.toLocaleString()}</div>
                    <div class="resource-label">LUT (${report.resourceEstimation.lut.percentage}%)</div>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${report.resourceEstimation.lut.percentage}%; background: ${statusColor(report.resourceEstimation.lut.used, MAX_LUT)}"></div></div>
                </div>
                <div class="resource-card">
                    <div class="resource-value" style="color: ${statusColor(report.resourceEstimation.dsp.used, MAX_DSP)}">${report.resourceEstimation.dsp.used}</div>
                    <div class="resource-label">DSP (${report.resourceEstimation.dsp.percentage}%)</div>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${report.resourceEstimation.dsp.percentage}%; background: ${statusColor(report.resourceEstimation.dsp.used, MAX_DSP)}"></div></div>
                </div>
                <div class="resource-card">
                    <div class="resource-value" style="color: ${statusColor(report.resourceEstimation.bram.used, MAX_BRAM)}">${report.resourceEstimation.bram.used}</div>
                    <div class="resource-label">BRAM (${report.resourceEstimation.bram.percentage}%)</div>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${report.resourceEstimation.bram.percentage}%; background: ${statusColor(report.resourceEstimation.bram.used, MAX_BRAM)}"></div></div>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">流水线分析</div>
            ${report.pipelineAnalysis.length === 0 ? '<p style="color: #94a3b8">未检测到循环结构</p>' : report.pipelineAnalysis.map(p => `
                <div style="background: #334155; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <strong>循环 #${p.id} (${p.type})</strong>
                        <span style="color: #94a3b8">迭代次数: ${p.iterations}</span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 14px;">
                        <div>流水线: ${p.hasPipeline ? '✅ II=' + p.targetII : '❌ 未启用'}</div>
                        <div>展开: ${p.hasUnroll ? '✅' : '❌'}</div>
                        <div>预估II: ${p.estimatedII}</div>
                    </div>
                    ${p.recommendations.length > 0 ? p.recommendations.map(r => `<div class="warning" style="margin-top: 12px; font-size: 13px;"><strong>${r.message}</strong><br><span style="opacity: 0.8">${r.detail}</span><br>预期收益: ${r.expectedGain}</div>`).join('') : ''}
                </div>
            `).join('')}
        </div>

        <div class="section">
            <div class="section-title">优化建议</div>
            ${report.recommendations.length === 0 ? '<p style="color: #94a3b8">暂无建议</p>' : report.recommendations.map(r => `
                <div class="warning ${r.severity === 'critical' ? 'warning-critical' : ''}">
                    <strong>${r.message}</strong><br>
                    <span style="opacity: 0.8">${r.detail}</span>
                </div>
            `).join('')}
        </div>

        <div class="footer">
            <p>HLS 资源估算工具 v${report.reportVersion} | 此报告由系统自动生成</p>
        </div>
    </div>
</body>
</html>`;
}

module.exports = { 
  estimateResources, 
  MAX_BRAM, 
  MAX_LUT, 
  MAX_DSP,
  generateReport,
  generateHTMLReport 
};
