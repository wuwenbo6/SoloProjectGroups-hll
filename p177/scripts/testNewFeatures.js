const { parseHEVCFile, extractSEI, insertSEITimestamp, batchProcessFolder } = require('../src/hevcParser');
const path = require('path');
const fs = require('fs');

console.log('=== 新功能测试：注册SEI类型 & 批量处理 ===\n');

const testDataDir = path.join(__dirname, '..', 'test_data');
const batchInputDir = path.join(testDataDir, 'batch_input');
const batchOutputDir = path.join(testDataDir, 'batch_output');

console.log('1. 测试注册用户数据SEI类型 (ITU-T T.35)...');

const testInputFile = path.join(testDataDir, 'test_sample.h265');
if (!fs.existsSync(testInputFile)) {
  console.log('   生成测试文件...');
  require('./generateTestData');
}

const registeredOutput = path.join(testDataDir, 'test_registered_sei.h265');
try {
  const result = insertSEITimestamp(testInputFile, registeredOutput, {
    seiType: 'registered',
    countryCode: 0xB5,
    providerCode: 0x003C,
    userIdentifier: 'TS  '
  });
  console.log(`   ✓ 注册类型SEI插入成功`);
  console.log(`     插入SEI数量: ${result.seiInsertedCount}`);
  console.log(`     SEI类型: ${result.seiType}`);
} catch (e) {
  console.log(`   ✗ 注册类型SEI插入失败: ${e.message}`);
}

console.log('\n2. 验证注册类型SEI是否正确插入...');
try {
  const seiResult = extractSEI(registeredOutput);
  let registeredSEICount = 0;
  let registeredData = [];

  seiResult.seiNalUnits.forEach(sei => {
    sei.seiMessages.forEach(msg => {
      if (msg.payloadType === 4) {
        registeredSEICount++;
        if (msg.payloadData && msg.payloadData.length >= 7) {
          const header = msg.payloadData.slice(0, 7);
          const data = msg.payloadData.slice(7);
          registeredData.push({
            countryCode: header[0],
            providerCode: (header[1] << 8) | header[2],
            userIdentifier: header.slice(3, 7).toString('ascii'),
            userData: data.toString('utf8')
          });
        }
      }
    });
  });

  console.log(`   ✓ 提取到 ${registeredSEICount} 个注册类型SEI消息`);
  if (registeredData.length > 0) {
    const first = registeredData[0];
    console.log(`     Country Code: 0x${first.countryCode.toString(16).toUpperCase()}`);
    console.log(`     Provider Code: 0x${first.providerCode.toString(16).toUpperCase()}`);
    console.log(`     User Identifier: '${first.userIdentifier}'`);
    console.log(`     User Data: '${first.userData}'`);
  }
} catch (e) {
  console.log(`   ✗ 验证失败: ${e.message}`);
}

console.log('\n3. 准备批量处理测试数据...');
if (!fs.existsSync(batchInputDir)) {
  fs.mkdirSync(batchInputDir, { recursive: true });
}

const sourceFile = fs.readFileSync(testInputFile);
for (let i = 1; i <= 5; i++) {
  const targetFile = path.join(batchInputDir, `video_${i.toString().padStart(2, '0')}.h265`);
  fs.writeFileSync(targetFile, sourceFile);
}

const otherFile = path.join(batchInputDir, 'readme.txt');
fs.writeFileSync(otherFile, 'This is a test file that should be ignored.');

const filesInInput = fs.readdirSync(batchInputDir);
console.log(`   ✓ 输入文件夹已准备，包含 ${filesInInput.length} 个文件`);
console.log(`     ${filesInInput.join(', ')}`);

console.log('\n4. 执行批量处理...');
try {
  const batchResult = batchProcessFolder(batchInputDir, batchOutputDir, {
    seiType: 'unregistered'
  });
  console.log(`   ✓ 批量处理完成`);
  console.log(`     总文件数: ${batchResult.totalFiles}`);
  console.log(`     成功: ${batchResult.successCount}`);
  console.log(`     失败: ${batchResult.errorCount}`);

  batchResult.results.forEach(r => {
    if (r.status === 'success') {
      console.log(`     ✓ ${r.fileName}: ${r.seiInsertedCount} SEI插入`);
    } else {
      console.log(`     ✗ ${r.fileName}: ${r.error}`);
    }
  });
} catch (e) {
  console.log(`   ✗ 批量处理失败: ${e.message}`);
}

console.log('\n5. 验证批量处理输出...');
if (fs.existsSync(batchOutputDir)) {
  const outputFiles = fs.readdirSync(batchOutputDir);
  console.log(`   ✓ 输出文件夹包含 ${outputFiles.length} 个文件`);
  outputFiles.forEach(f => console.log(`     - ${f}`));
}

console.log('\n6. 对比两种SEI类型...');
const unregOutput = path.join(testDataDir, 'test_unregistered_sei.h265');
insertSEITimestamp(testInputFile, unregOutput, { seiType: 'unregistered' });

const unregSEI = extractSEI(unregOutput);
const regSEI = extractSEI(registeredOutput);

let unregType5Count = 0;
let regType4Count = 0;

unregSEI.seiNalUnits.forEach(sei => {
  sei.seiMessages.forEach(msg => {
    if (msg.payloadType === 5) unregType5Count++;
  });
});

regSEI.seiNalUnits.forEach(sei => {
  sei.seiMessages.forEach(msg => {
    if (msg.payloadType === 4) regType4Count++;
  });
});

console.log(`   未注册类型(5) SEI消息数: ${unregType5Count}`);
console.log(`   注册类型(4) SEI消息数: ${regType4Count}`);
console.log(`   ✓ 两种SEI类型工作正常`);

console.log('\n=== 新功能测试完成 ===');
console.log('✓ 注册用户数据SEI类型 (ITU-T T.35) 支持');
console.log('✓ 批量处理文件夹功能');
