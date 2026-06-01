function generateOptimizationTips(code) {
  const tips = [];

  const loops = code.match(/\b(for|while)\s*\([^)]*\)\s*\{/g) || [];
  if (loops.length > 0) {
    tips.push({
      type: 'loop',
      severity: 'high',
      message: `检测到 ${loops.length} 个循环，建议添加 HLS PIPELINE 指令优化吞吐量`,
      detail: '在循环内部添加 #pragma HLS PIPELINE II=1 可以显著提升性能'
    });
  }

  const nestedLoops = countNestedLoops(code);
  if (nestedLoops > 1) {
    tips.push({
      type: 'loop',
      severity: 'high',
      message: '检测到嵌套循环，建议对最内层循环进行展开优化',
      detail: '使用 #pragma HLS UNROLL 可以展开循环，增加并行度'
    });
  }

  const arrays = code.match(/\w+\s+\w+\s*\[\s*(\d+)\s*\]/g) || [];
  arrays.forEach(arr => {
    const sizeMatch = arr.match(/\[(\d+)\]/);
    if (sizeMatch && parseInt(sizeMatch[1]) > 256) {
      tips.push({
        type: 'array',
        severity: 'medium',
        message: `检测到大数组 ${arr.match(/\w+\s*(\[)/)?.[0]?.replace('[', '') || ''}，建议进行数组分区`,
        detail: '使用 #pragma HLS ARRAY_PARTITION 可以减少访存延迟'
      });
    }
  });

  const floatCount = (code.match(/\bfloat\b/g) || []).length;
  const doubleCount = (code.match(/\bdouble\b/g) || []).length;
  if (floatCount > 0 || doubleCount > 0) {
    tips.push({
      type: 'datatype',
      severity: 'medium',
      message: '检测到浮点数使用，建议考虑使用定点数优化',
      detail: '使用 ap_fixed 或 hls::fixed 类型可以减少 DSP 和 LUT 资源占用'
    });
  }

  const intCount = (code.match(/\bint\b/g) || []).length;
  if (intCount > 5) {
    tips.push({
      type: 'datatype',
      severity: 'low',
      message: '检测到多个 int 类型，建议根据实际需求指定位宽',
      detail: '使用 ap_int<N> 可以精确控制位宽，减少资源占用'
    });
  }

  const functions = code.match(/\bvoid\s+(\w+)\s*\(/g) || [];
  if (functions.length > 2) {
    tips.push({
      type: 'function',
      severity: 'low',
      message: '检测到多个函数调用，考虑对热点函数进行内联',
      detail: '使用 #pragma HLS INLINE 可以减少函数调用开销'
    });
  }

  const pointers = code.match(/\w+\s*\*\s*\w+/g) || [];
  if (pointers.length > 0) {
    tips.push({
      type: 'pointer',
      severity: 'high',
      message: '检测到指针使用，HLS 综合可能存在问题',
      detail: '建议使用数组引用代替指针，或添加 #pragma HLS INTERFACE 指令'
    });
  }

  return tips.slice(0, 6);
}

function countNestedLoops(code) {
  let maxDepth = 0;
  let currentDepth = 0;
  const lines = code.split('\n');
  
  lines.forEach(line => {
    if (line.includes('for') || line.includes('while')) {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    }
    if (line.includes('}')) {
      currentDepth = Math.max(0, currentDepth - 1);
    }
  });
  
  return maxDepth;
}

module.exports = { generateOptimizationTips };
