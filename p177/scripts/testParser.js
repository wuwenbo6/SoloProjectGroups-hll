const { parseHEVCFile, extractSEI, insertSEITimestamp } = require('../src/hevcParser');
const path = require('path');
const fs = require('fs');

console.log('=== HEVC Parser 功能测试 ===\n');

const testDataDir = path.join(__dirname, '..', 'test_data');
const testInputFile = path.join(testDataDir, 'test_sample.h265');
const testOutputFile = path.join(testDataDir, 'test_output.h265');

if (!fs.existsSync(testInputFile)) {
  console.log('未找到测试文件，请先运行: npm run test:generate');
  console.log('\n正在生成测试文件...\n');
  require('./generateTestData');
}

if (fs.existsSync(testInputFile)) {
  console.log('1. 测试 parseHEVCFile 函数...');
  try {
    const result = parseHEVCFile(testInputFile);
    console.log(`   ✓ 解析成功，共找到 ${result.nalUnitCount} 个NAL单元`);
    console.log(`   ✓ 文件大小: ${result.fileSize} 字节`);

    const typeStats = {};
    result.nalUnits.forEach(nal => {
      const typeName = nal.header.typeName;
      typeStats[typeName] = (typeStats[typeName] || 0) + 1;
    });

    console.log('   NAL单元类型统计:');
    Object.entries(typeStats).forEach(([type, count]) => {
      console.log(`     - ${type}: ${count} 个`);
    });
  } catch (e) {
    console.log(`   ✗ 解析失败: ${e.message}`);
  }

  console.log('\n2. 测试 extractSEI 函数...');
  try {
    const seiResult = extractSEI(testInputFile);
    const seiCount = seiResult.seiNalUnits ? seiResult.seiNalUnits.length : 0;
    console.log(`   ✓ 提取完成，找到 ${seiCount} 个包含SEI的NAL单元`);

    if (seiResult.seiNalUnits && seiResult.seiNalUnits.length > 0) {
      seiResult.seiNalUnits.slice(0, 2).forEach(sei => {
        console.log(`   NAL单元 #${sei.index}:`);
        sei.seiMessages.forEach((msg, i) => {
          console.log(`     消息 ${i}: 类型=${msg.payloadTypeName}, 大小=${msg.payloadSize}B`);
          console.log(`       内容: ${msg.payloadText}`);
        });
      });
    }
  } catch (e) {
    console.log(`   ✗ 提取失败: ${e.message}`);
  }

  console.log('\n3. 测试 insertSEITimestamp 函数...');
  try {
    const insertResult = insertSEITimestamp(testInputFile, testOutputFile);
    console.log(`   ✓ 插入完成`);
    console.log(`     输入文件: ${formatSize(insertResult.inputSize)}`);
    console.log(`     输出文件: ${formatSize(insertResult.outputSize)}`);
    console.log(`     插入SEI数量: ${insertResult.seiInsertedCount}`);
    console.log(`     VPS存在: ${insertResult.hasVPS}, SPS存在: ${insertResult.hasSPS}, PPS存在: ${insertResult.hasPPS}`);
    console.log(`     SEI插入条件满足: ${insertResult.canInsertSEI}`);
    console.log(`     输出文件: ${testOutputFile}`);
  } catch (e) {
    console.log(`   ✗ 插入失败: ${e.message}`);
  }

  console.log('\n4. 验证输出文件...');
  try {
    const verifyResult = extractSEI(testOutputFile);
    const insertedSEIs = verifyResult.seiNalUnits.filter(sei =>
      sei.seiMessages.some(msg => msg.payloadText.startsWith('TIMESTAMP:'))
    );
    console.log(`   ✓ 验证成功，输出文件包含 ${insertedSEIs.length} 个新插入的时间戳SEI`);
  } catch (e) {
    console.log(`   ✗ 验证失败: ${e.message}`);
  }

  console.log('\n=== 测试完成 ===');
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
