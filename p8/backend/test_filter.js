const { 
  KalmanFilter, 
  MovingAverage, 
  OutlierDetector,
  robustTrilateration,
  measurementFilter
} = require('./src/trilateration');

console.log('=== 滤波算法测试 ===\n');

console.log('1. 卡尔曼滤波测试:');
const kalman = new KalmanFilter(10, 0.05, 0.5);
const noisyMeasurements = [10, 12, 9, 11, 10, 15, 10, 9, 11, 10];
console.log('原始测量:', noisyMeasurements);
const kalmanResults = noisyMeasurements.map(m => kalman.update(m));
console.log('滤波结果:', kalmanResults.map(r => r.toFixed(2)));
console.log('');

console.log('2. 移动平均测试:');
const ma = new MovingAverage(5);
const maResults = noisyMeasurements.map(m => ma.update(m));
console.log('移动平均结果:', maResults.map(r => r.toFixed(2)));
console.log('');

console.log('3. 异常值检测测试:');
const detector = new OutlierDetector(2.5);
const testValues = [10, 11, 9, 10, 11, 50, 10, 9, 11, 10];
console.log('测试值:', testValues);
testValues.forEach((v, i) => {
  detector.update(v);
  if (i >= 4) {
    console.log(`  值 ${v}: ${detector.isOutlier(v) ? '异常值!' : '正常'}`);
  }
});
console.log('');

console.log('4. 三边测量鲁棒性测试:');
console.log('测试1个AP的情况:');
const result1 = robustTrilateration([
  { x: 0, y: 0, z: 0, distance: 10 }
]);
console.log('结果:', result1);
console.log('');

console.log('测试2个AP的情况:');
const result2 = robustTrilateration([
  { x: 0, y: 0, z: 0, distance: 10 },
  { x: 20, y: 0, z: 0, distance: 10 }
]);
console.log('结果:', result2);
console.log('');

console.log('测试3个AP的情况:');
const result3 = robustTrilateration([
  { x: 0, y: 0, z: 0, distance: 14.14 },
  { x: 20, y: 0, z: 0, distance: 14.14 },
  { x: 10, y: 20, z: 0, distance: 14.14 }
]);
console.log('结果:', result3);
console.log('');

console.log('5. MeasurementFilter 综合测试:');
console.log('模拟带噪声的距离测量...');
const bssid = '00:11:22:33:44:01';
const distances = [5.0, 5.5, 4.8, 5.2, 20.0, 5.1, 4.9, 5.3, 5.0, 4.7];
console.log('原始距离:', distances);
const filtered = distances.map(d => measurementFilter.filter(bssid, d));
console.log('滤波结果:', filtered.map(d => d.toFixed(2)));
console.log('');

console.log('=== 测试完成 ===');
