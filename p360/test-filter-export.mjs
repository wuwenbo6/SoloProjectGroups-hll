import { changeStreams } from './api/services/ChangeStreamsService.js';
import { collection } from './api/services/CollectionService.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test() {
  console.log('=== MongoDB Change Streams 模拟器 - $match过滤与导出测试 ===\n');

  changeStreams.clear();
  collection.clear();

  console.log('1. 准备测试数据 - 插入6个文档');
  const docs = [
    { name: 'Alice', age: 25, email: 'alice@example.com', status: 'active', score: 85.5 },
    { name: 'Bob', age: 30, email: 'bob@example.com', status: 'active', score: 72.0 },
    { name: 'Charlie', age: 35, email: 'charlie@example.com', status: 'inactive', score: 91.5 },
    { name: 'David', age: 28, email: 'david@example.com', status: 'active', score: 68.5 },
    { name: 'Eve', age: 42, email: 'eve@example.com', status: 'inactive', score: 95.0 },
    { name: 'Frank', age: 22, email: 'frank@example.com', status: 'active', score: 78.0 },
  ];

  for (const doc of docs) {
    collection.insert(doc);
    await sleep(10);
  }

  const allEvents = changeStreams.getAllEvents();
  console.log(`   插入完成，共 ${allEvents.length} 个事件\n`);

  console.log('2. 测试 $match 过滤 - 基础运算符');

  const testCases = [
    {
      name: '$eq 等于过滤 (status=active)',
      filter: {
        id: 'test-1',
        name: 'active用户',
        enabled: true,
        logicalOp: '$and',
        conditions: [{ field: 'status', operator: '$eq', value: 'active' }],
      },
      expected: 4,
    },
    {
      name: '$ne 不等于过滤 (status!=active)',
      filter: {
        id: 'test-2',
        name: '非active用户',
        enabled: true,
        logicalOp: '$and',
        conditions: [{ field: 'status', operator: '$ne', value: 'active' }],
      },
      expected: 2,
    },
    {
      name: '$gt 大于过滤 (age>30)',
      filter: {
        id: 'test-3',
        name: '年龄大于30',
        enabled: true,
        logicalOp: '$and',
        conditions: [{ field: 'age', operator: '$gt', value: 30 }],
      },
      expected: 2,
    },
    {
      name: '$gte 大于等于过滤 (age>=30)',
      filter: {
        id: 'test-4',
        name: '年龄大于等于30',
        enabled: true,
        logicalOp: '$and',
        conditions: [{ field: 'age', operator: '$gte', value: 30 }],
      },
      expected: 3,
    },
    {
      name: '$lt 小于过滤 (age<28)',
      filter: {
        id: 'test-5',
        name: '年龄小于28',
        enabled: true,
        logicalOp: '$and',
        conditions: [{ field: 'age', operator: '$lt', value: 28 }],
      },
      expected: 2,
    },
    {
      name: '$lte 小于等于过滤 (age<=28)',
      filter: {
        id: 'test-6',
        name: '年龄小于等于28',
        enabled: true,
        logicalOp: '$and',
        conditions: [{ field: 'age', operator: '$lte', value: 28 }],
      },
      expected: 3,
    },
    {
      name: '$in 包含过滤 (name in [Alice, Bob, Eve])',
      filter: {
        id: 'test-7',
        name: '指定用户',
        enabled: true,
        logicalOp: '$and',
        conditions: [{ field: 'name', operator: '$in', value: ['Alice', 'Bob', 'Eve'] }],
      },
      expected: 3,
    },
    {
      name: '$nin 不包含过滤 (name not in [Alice, Bob])',
      filter: {
        id: 'test-8',
        name: '排除指定用户',
        enabled: true,
        logicalOp: '$and',
        conditions: [{ field: 'name', operator: '$nin', value: ['Alice', 'Bob'] }],
      },
      expected: 4,
    },
    {
      name: '$exists 存在过滤 (email字段存在)',
      filter: {
        id: 'test-9',
        name: '有email字段',
        enabled: true,
        logicalOp: '$and',
        conditions: [{ field: 'email', operator: '$exists', value: true }],
      },
      expected: 6,
    },
    {
      name: '$exists 不存在过滤 (unknown字段不存在)',
      filter: {
        id: 'test-10',
        name: '无unknown字段',
        enabled: true,
        logicalOp: '$and',
        conditions: [{ field: 'unknown', operator: '$exists', value: false }],
      },
      expected: 6,
    },
    {
      name: '$regex 正则过滤 (name匹配/^A/)',
      filter: {
        id: 'test-11',
        name: '名字以A开头',
        enabled: true,
        logicalOp: '$and',
        conditions: [{ field: 'name', operator: '$regex', value: '^A' }],
      },
      expected: 1,
    },
    {
      name: '$regex 正则过滤 (email匹配/example.com$/)',
      filter: {
        id: 'test-12',
        name: 'example.com邮箱',
        enabled: true,
        logicalOp: '$and',
        conditions: [{ field: 'email', operator: '$regex', value: 'example.com$' }],
      },
      expected: 6,
    },
  ];

  let passCount = 0;
  let failCount = 0;

  for (const testCase of testCases) {
    const matched = allEvents.filter(e => changeStreams.matchEvent(e, testCase.filter));
    const pass = matched.length === testCase.expected;
    if (pass) passCount++; else failCount++;
    console.log(`   ${pass ? '✅' : '❌'} ${testCase.name}`);
    console.log(`      匹配: ${matched.length}, 预期: ${testCase.expected}`);
    if (!pass) {
      console.log(`      匹配文档: ${matched.map(e => e.fullDocument?.name).join(', ')}`);
    }
  }

  console.log(`\n   基础运算符测试: ${passCount} 通过, ${failCount} 失败\n`);

  console.log('3. 测试 $match 过滤 - 多条件组合');

  const comboTests = [
    {
      name: 'AND组合: status=active AND age>25',
      filter: {
        id: 'combo-1',
        name: '活跃且25岁以上',
        enabled: true,
        logicalOp: '$and',
        conditions: [
          { field: 'status', operator: '$eq', value: 'active' },
          { field: 'age', operator: '$gt', value: 25 },
        ],
      },
      expected: 2,
    },
    {
      name: 'OR组合: age>=40 OR score>=90',
      filter: {
        id: 'combo-2',
        name: '年长或高分',
        enabled: true,
        logicalOp: '$or',
        conditions: [
          { field: 'age', operator: '$gte', value: 40 },
          { field: 'score', operator: '$gte', value: 90 },
        ],
      },
      expected: 2,
    },
    {
      name: '嵌套字段: _id=doc-1',
      filter: {
        id: 'combo-3',
        name: '指定ID',
        enabled: true,
        logicalOp: '$and',
        conditions: [
          { field: '_id', operator: '$eq', value: 'doc-1' },
        ],
      },
      expected: 1,
    },
    {
      name: '过滤器禁用: 即使有条件也全部通过',
      filter: {
        id: 'combo-4',
        name: '禁用过滤器',
        enabled: false,
        logicalOp: '$and',
        conditions: [
          { field: 'status', operator: '$eq', value: 'active' },
        ],
      },
      expected: 6,
    },
  ];

  for (const testCase of comboTests) {
    const matched = allEvents.filter(e => changeStreams.matchEvent(e, testCase.filter));
    const pass = matched.length === testCase.expected;
    if (pass) passCount++; else failCount++;
    console.log(`   ${pass ? '✅' : '❌'} ${testCase.name}`);
    console.log(`      匹配: ${matched.length}, 预期: ${testCase.expected}`);
    if (!pass) {
      console.log(`      匹配文档: ${matched.map(e => e.fullDocument?.name).join(', ')}`);
    }
  }

  console.log(`\n4. 测试导出功能 - 多种格式`);

  const exportFormats = ['json', 'csv', 'ndjson'];
  for (const format of exportFormats) {
    const result = changeStreams.exportEvents({ format });
    if ('code' in result) {
      console.log(`   ❌ ${format.toUpperCase()} 导出失败: ${result.message}`);
      failCount++;
    } else {
      const { data, count } = result;
      const hasContent = data.length > 0;
      const correctCount = count === 6;
      const pass = hasContent && correctCount;
      if (pass) passCount++; else failCount++;
      console.log(`   ${pass ? '✅' : '❌'} ${format.toUpperCase()} 导出`);
      console.log(`      记录数: ${count}, 数据大小: ${data.length} bytes`);
      if (format === 'csv') {
        const lines = data.trim().split('\n');
        console.log(`      CSV 行数: ${lines.length} (含表头)`);
      }
    }
  }

  console.log(`\n5. 测试导出功能 - 带过滤条件`);

  const activeFilter = {
    id: 'export-1',
    name: 'active用户',
    enabled: true,
    logicalOp: '$and',
    conditions: [{ field: 'status', operator: '$eq', value: 'active' }],
  };

  const filteredExport = changeStreams.exportEvents({
    format: 'json',
    filter: activeFilter,
  });

  if ('code' in filteredExport) {
    console.log(`   ❌ 带过滤导出失败: ${filteredExport.message}`);
    failCount++;
  } else {
    const pass = filteredExport.count === 4;
    if (pass) passCount++; else failCount++;
    console.log(`   ${pass ? '✅' : '❌'} 带$match过滤导出`);
    console.log(`      导出记录数: ${filteredExport.count}, 预期: 4`);
  }

  console.log(`\n6. 测试导出功能 - 操作类型过滤`);

  const updateDoc = collection.update('doc-1', { name: 'Alice Updated', age: 26 });
  await sleep(10);
  collection.delete('doc-2');
  await sleep(10);

  const insertOnlyExport = changeStreams.exportEvents({
    format: 'json',
    operationTypes: ['insert'],
  });

  if ('code' in insertOnlyExport) {
    console.log(`   ❌ 操作类型过滤导出失败: ${insertOnlyExport.message}`);
    failCount++;
  } else {
    const pass = insertOnlyExport.count === 6;
    if (pass) passCount++; else failCount++;
    console.log(`   ${pass ? '✅' : '❌'} 仅导出insert事件`);
    console.log(`      导出记录数: ${insertOnlyExport.count}, 预期: 6`);
  }

  const updateDeleteExport = changeStreams.exportEvents({
    format: 'json',
    operationTypes: ['update', 'delete'],
  });

  if ('code' in updateDeleteExport) {
    console.log(`   ❌ 操作类型过滤导出失败: ${updateDeleteExport.message}`);
    failCount++;
  } else {
    const pass = updateDeleteExport.count === 2;
    if (pass) passCount++; else failCount++;
    console.log(`   ${pass ? '✅' : '❌'} 导出update+delete事件`);
    console.log(`      导出记录数: ${updateDeleteExport.count}, 预期: 2`);
  }

  console.log(`\n7. 测试 getFilteredEvents - 断点续传+过滤`);

  const allEventsNow = changeStreams.getAllEvents();
  const thirdEventToken = allEventsNow[2]._id._data;

  const filteredAfterResult = changeStreams.getFilteredEvents(activeFilter, thirdEventToken);
  if ('code' in filteredAfterResult) {
    console.log(`   ❌ 断点续传+过滤失败: ${filteredAfterResult.message}`);
    failCount++;
  } else {
    console.log(`   ✅ 从第3个事件后恢复，应用active过滤`);
    console.log(`      事件数: ${filteredAfterResult.length}`);
    console.log(`      事件: ${filteredAfterResult.map(e => `${e.operationType}:${e.fullDocument?.name || e.documentKey._id}`).join(', ')}`);
    passCount++;
  }

  console.log(`\n=== 测试汇总 ===`);
  console.log(`总计: ${passCount + failCount} 项测试`);
  console.log(`通过: ${passCount} ✅`);
  console.log(`失败: ${failCount} ❌`);
  console.log(`\n支持的$match操作符:`);
  console.log(`  $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $exists, $regex`);
  console.log(`支持的导出格式:`);
  console.log(`  JSON, CSV, NDJSON`);
  console.log(`导出选项:`);
  console.log(`  - 应用$match过滤条件`);
  console.log(`  - 按操作类型过滤 (insert/update/delete)`);
  console.log(`  - 按时间范围过滤`);
  console.log(`  - 从指定resumeToken开始导出`);
}

test().catch(console.error);
