import { asnToAsdot, asdotToAsn, batchConvert, batchConvertStream, classifyAsn, ASN_RANGES, AS_TRANS } from './asnConverter.js';

console.log('=== ASN 转换器单元测试 v3.0 ===\n');

let passed = 0;
let failed = 0;

function test(description, actual, expected) {
  if (actual === expected) {
    console.log(`✅ ${description}`);
    passed++;
  } else {
    console.log(`❌ ${description}`);
    console.log(`   期望: ${expected}, 实际: ${actual}`);
    failed++;
  }
}

console.log('--- classifyAsn 范围分类测试 ---');

test('classifyAsn(1) → 公网 ASN', classifyAsn(1).categoryZh, '公网 ASN');
test('classifyAsn(1).type', classifyAsn(1).type, '2-byte');
test('classifyAsn(100) → 公网', classifyAsn(100).categoryZh, '公网 ASN');
test('classifyAsn(64511) → 文档示例', classifyAsn(64511).categoryZh, '文档示例 (2字节)');
test('classifyAsn(64496) → 文档示例', classifyAsn(64496).categoryZh, '文档示例 (2字节)');
test('classifyAsn(64500) → 文档示例', classifyAsn(64500).categoryZh, '文档示例 (2字节)');
test('classifyAsn(64512) → IANA 保留', classifyAsn(64512).categoryZh, 'IANA 保留');
test('classifyAsn(65534) → IANA 保留', classifyAsn(65534).categoryZh, 'IANA 保留');
test('classifyAsn(65535) → 2字节最后', classifyAsn(65535).categoryZh, '2字节最后');
test('classifyAsn(23456) → AS_TRANS', classifyAsn(23456).categoryZh, 'AS_TRANS 占位符');
test('classifyAsn(23456).color', classifyAsn(23456).color, 'as-trans');
test('classifyAsn(65536) → 文档示例', classifyAsn(65536).categoryZh, '文档示例 (4字节)');
test('classifyAsn(65536).type', classifyAsn(65536).type, '4-byte');
test('classifyAsn(65538) → 文档示例', classifyAsn(65538).categoryZh, '文档示例 (4字节)');
test('classifyAsn(65551) → 文档示例', classifyAsn(65551).categoryZh, '文档示例 (4字节)');
test('classifyAsn(100000) → 4字节公网', classifyAsn(100000).categoryZh, '4字节公网');
test('classifyAsn(4200000000) → 4字节私网', classifyAsn(4200000000).categoryZh, '4字节私网');
test('classifyAsn(4200000001) → 4字节私网', classifyAsn(4200000001).categoryZh, '4字节私网');
test('classifyAsn(4294967294) → 4字节私网', classifyAsn(4294967294).categoryZh, '4字节私网');
test('classifyAsn(4294967295) → 4字节最后', classifyAsn(4294967295).categoryZh, '4字节最后');

console.log('\n--- ASN → ASdot 含分类测试 ---');

const t1 = asnToAsdot(100);
test('ASN 100 分类 → 公网', t1.classification.categoryZh, '公网 ASN');

const t2 = asnToAsdot(65538);
test('ASN 65538 分类 → 文档示例', t2.classification.categoryZh, '文档示例 (4字节)');

const t3 = asnToAsdot(23456);
test('ASN 23456 分类 → AS_TRANS', t3.classification.categoryZh, 'AS_TRANS 占位符');

const t4 = asnToAsdot(64512);
test('ASN 64512 分类 → IANA保留', t4.classification.categoryZh, 'IANA 保留');

const t5 = asnToAsdot(65535);
test('ASN 65535 分类 → 2字节最后', t5.classification.categoryZh, '2字节最后');

const t6 = asnToAsdot(4200000001);
test('ASN 4200000001 分类 → 4字节私网', t6.classification.categoryZh, '4字节私网');

console.log('\n--- ASdot → ASN 含分类测试 ---');

const t7 = asdotToAsn('0.100');
test('ASdot 0.100 分类 → 公网', t7.classification.categoryZh, '公网 ASN');

const t8 = asdotToAsn('1.2');
test('ASdot 1.2 分类 → 文档示例', t8.classification.categoryZh, '文档示例 (4字节)');

const t9 = asdotToAsn('0.64512');
test('ASdot 0.64512 分类 → IANA保留', t9.classification.categoryZh, 'IANA 保留');

const t10 = asdotToAsn('65535.65535');
test('ASdot 65535.65535 分类 → 4字节最后', t10.classification.categoryZh, '4字节最后');

console.log('\n--- 批量转换含分类测试 ---');

const batch = ['1', '100', '23456', '64512', '65535', '65538', '4200000001', '4294967295'];
const br = batchConvert(batch, 'asn-to-asdot');
test('批量结果数', br.length, 8);
test('批量全部有效', br.every(r => r.isValid), true);
test('批量结果均含 classification', br.every(r => r.classification !== undefined), true);

const categories = br.map(r => r.classification.categoryZh);
test('1 → 公网', categories[0], '公网 ASN');
test('100 → 公网', categories[1], '公网 ASN');
test('23456 → AS_TRANS', categories[2], 'AS_TRANS 占位符');
test('64512 → IANA保留', categories[3], 'IANA 保留');
test('65535 → 2字节最后', categories[4], '2字节最后');
test('65538 → 文档示例', categories[5], '文档示例 (4字节)');
test('4200000001 → 4字节私网', categories[6], '4字节私网');
test('4294967295 → 4字节最后', categories[7], '4字节最后');

console.log('\n--- 流式生成器含分类测试 ---');

const streamResults = [];
for (const item of batchConvertStream(['100', '65538', '23456'], 'asn-to-asdot')) {
  streamResults.push(item);
}
test('流式结果均含 classification', streamResults.every(r => r.classification !== undefined), true);
test('流式100 → 公网', streamResults[0].classification.categoryZh, '公网 ASN');
test('流式65538 → 文档示例', streamResults[1].classification.categoryZh, '文档示例 (4字节)');
test('流式23456 → AS_TRANS', streamResults[2].classification.categoryZh, 'AS_TRANS 占位符');

console.log('\n--- ASN_RANGES 数据测试 ---');

test('ASN_RANGES 存在', Array.isArray(ASN_RANGES), true);
test('ASN_RANGES 条目数', ASN_RANGES.length, 9);

console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n🎉 所有测试通过！\n');
}
