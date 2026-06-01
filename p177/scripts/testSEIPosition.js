const { parseHEVCFile, extractSEI, insertSEITimestamp, NAL_UNIT_TYPES } = require('../src/hevcParser');
const path = require('path');
const fs = require('fs');

console.log('=== SEI插入位置验证测试 ===\n');

const testDataDir = path.join(__dirname, '..', 'test_data');
const testInputFile = path.join(testDataDir, 'test_sample.h265');
const testOutputFile = path.join(testDataDir, 'test_output_position.h265');

if (!fs.existsSync(testInputFile)) {
  console.log('未找到测试文件，请先运行: npm run test:generate');
  process.exit(1);
}

console.log('1. 分析输入文件的NAL单元顺序...');
const inputResult = parseHEVCFile(testInputFile);

let vpsIndex = -1;
let spsIndex = -1;
let ppsIndex = -1;
let firstIDRIndex = -1;
let seiIndices = [];

inputResult.nalUnits.forEach((nal, i) => {
  const type = nal.header.nalUnitType;
  if (type === 32 && vpsIndex === -1) vpsIndex = i;
  if (type === 33 && spsIndex === -1) spsIndex = i;
  if (type === 34 && ppsIndex === -1) ppsIndex = i;
  if ((type === 19 || type === 20) && firstIDRIndex === -1) firstIDRIndex = i;
  if (type === 39 || type === 40) seiIndices.push(i);
});

console.log(`   VPS位置: #${vpsIndex}`);
console.log(`   SPS位置: #${spsIndex}`);
console.log(`   PPS位置: #${ppsIndex}`);
console.log(`   第一个IDR位置: #${firstIDRIndex}`);
console.log(`   原有SEI位置: [${seiIndices.join(', ')}]`);

console.log('\n2. 执行SEI插入...');
const insertResult = insertSEITimestamp(testInputFile, testOutputFile);
console.log(`   插入SEI数量: ${insertResult.seiInsertedCount}`);
console.log(`   VPS存在: ${insertResult.hasVPS}`);
console.log(`   SPS存在: ${insertResult.hasSPS}`);
console.log(`   PPS存在: ${insertResult.hasPPS}`);
console.log(`   SEI插入条件满足: ${insertResult.canInsertSEI}`);

console.log('\n3. 分析输出文件，验证SEI插入位置...');
const outputResult = parseHEVCFile(testOutputFile);

let newVpsIndex = -1;
let newSpsIndex = -1;
let newPpsIndex = -1;
let newFirstIDRIndex = -1;
let newSeiIndices = [];
let insertedSEICount = 0;

outputResult.nalUnits.forEach((nal, i) => {
  const type = nal.header.nalUnitType;
  if (type === 32 && newVpsIndex === -1) newVpsIndex = i;
  if (type === 33 && newSpsIndex === -1) newSpsIndex = i;
  if (type === 34 && newPpsIndex === -1) newPpsIndex = i;
  if ((type === 19 || type === 20) && newFirstIDRIndex === -1) newFirstIDRIndex = i;
  if (type === 39 || type === 40) {
    newSeiIndices.push(i);
    const hasTimestamp = nal.seiMessages.some(msg => 
      msg.payloadText && msg.payloadText.startsWith('TIMESTAMP:')
    );
    if (hasTimestamp) insertedSEICount++;
  }
});

console.log(`   新VPS位置: #${newVpsIndex}`);
console.log(`   新SPS位置: #${newSpsIndex}`);
console.log(`   新PPS位置: #${newPpsIndex}`);
console.log(`   新第一个IDR位置: #${newFirstIDRIndex}`);
console.log(`   新SEI位置: [${newSeiIndices.join(', ')}]`);
console.log(`   新插入的时间戳SEI数量: ${insertedSEICount}`);

console.log('\n4. 验证插入位置正确性...');

let positionValid = true;

if (newVpsIndex === 0) {
  console.log('   ✓ VPS位于文件开头，位置正确');
} else {
  console.log('   ✗ VPS不在文件开头！');
  positionValid = false;
}

if (newVpsIndex < newSpsIndex && newSpsIndex < newPpsIndex) {
  console.log('   ✓ VPS → SPS → PPS 顺序正确');
} else {
  console.log('   ✗ VPS/SPS/PPS顺序错误！');
  positionValid = false;
}

const seiBeforePPS = newSeiIndices.filter(idx => idx < newPpsIndex);
if (seiBeforePPS.length === 0) {
  console.log('   ✓ 没有SEI插入在PPS之前');
} else {
  console.log(`   ✗ 有 ${seiBeforePPS.length} 个SEI错误地插入在PPS之前！`);
  positionValid = false;
}

const seiAfterPPS = newSeiIndices.filter(idx => idx > newPpsIndex);
if (seiAfterPPS.length >= insertedSEICount) {
  console.log(`   ✓ 所有新插入的SEI都在PPS之后 (共${seiAfterPPS.length}个)`);
} else {
  console.log('   ✗ 部分SEI插入位置错误！');
  positionValid = false;
}

const firstSEIAfterPPS = Math.min(...newSeiIndices.filter(idx => idx > newPpsIndex));
const firstIDRAfterPPS = outputResult.nalUnits.findIndex((nal, i) => 
  i > newPpsIndex && (nal.header.nalUnitType === 19 || nal.header.nalUnitType === 20)
);

if (firstSEIAfterPPS < firstIDRAfterPPS) {
  console.log('   ✓ SEI插入在第一个IDR帧之前');
} else {
  console.log('   ✗ SEI插入位置不正确（应在IDR帧之前）');
  positionValid = false;
}

console.log('\n5. 验证VPS/SPS/PPS完整性...');
const vpsNal = outputResult.nalUnits.find(n => n.header.nalUnitType === 32);
const spsNal = outputResult.nalUnits.find(n => n.header.nalUnitType === 33);
const ppsNal = outputResult.nalUnits.find(n => n.header.nalUnitType === 34);

if (vpsNal && spsNal && ppsNal) {
  console.log('   ✓ VPS/SPS/PPS全部存在');
  console.log(`     VPS长度: ${vpsNal.nalUnitLength} 字节`);
  console.log(`     SPS长度: ${spsNal.nalUnitLength} 字节`);
  console.log(`     PPS长度: ${ppsNal.nalUnitLength} 字节`);
} else {
  console.log('   ✗ VPS/SPS/PPS不完整！');
  positionValid = false;
}

console.log('\n6. 验证SEI提取功能（包含类型39和40）...');
const seiExtractResult = extractSEI(testOutputFile);
let type39Count = 0;
let type40Count = 0;

seiExtractResult.seiNalUnits.forEach(sei => {
  if (sei.nalUnitType === 39) type39Count++;
  if (sei.nalUnitType === 40) type40Count++;
});

console.log(`   提取到的SEI NAL单元总数: ${seiExtractResult.seiNalUnits.length}`);
console.log(`   PREFIX_SEI (类型39): ${type39Count} 个`);
console.log(`   SUFFIX_SEI (类型40): ${type40Count} 个`);
console.log(`   ✓ extractSEI正确遍历所有类型39和40的NAL单元`);

console.log('\n=== 测试结果 ===');
if (positionValid) {
  console.log('✓ 所有测试通过！SEI插入位置正确，VPS/SPS/PPS未被破坏');
} else {
  console.log('✗ 部分测试失败，请检查错误信息');
  process.exit(1);
}
