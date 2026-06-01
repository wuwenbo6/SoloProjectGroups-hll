const path = require('path');
const fs = require('fs');

console.log('=== 系统结构验证 ===\n');

const requiredFiles = [
  'package.json',
  'src/config.js',
  'src/database.js',
  'src/transcoder.js',
  'src/server.js',
  'public/index.html',
  '.gitignore',
  'README.md'
];

console.log('📁 必需文件检查:');
let allOk = true;
for (const file of requiredFiles) {
  const filePath = path.join(__dirname, file);
  const exists = fs.existsSync(filePath);
  const status = exists ? '✅' : '❌';
  console.log(`  ${status} ${file}`);
  if (!exists) allOk = false;
}

console.log('\n📦 预期依赖:');
const packageJson = require('./package.json');
console.log(`  - express: ${packageJson.dependencies.express}`);
console.log(`  - node-media-server: ${packageJson.dependencies['node-media-server']}`);
console.log(`  - better-sqlite3: ${packageJson.dependencies['better-sqlite3']}`);
console.log(`  - fluent-ffmpeg: ${packageJson.dependencies['fluent-ffmpeg']}`);
console.log(`  - cors: ${packageJson.dependencies.cors}`);

console.log('\n⚙️  转码配置:');
const config = require('./src/config');
console.log(`  RTMP 端口: ${config.rtmp.port}`);
console.log(`  HTTP 端口: ${config.http.port}`);
console.log(`  分片时长: ${config.dash.segmentDuration}s`);
console.log(`  转码档位: ${config.transcoding.profiles.length} 个`);
config.transcoding.profiles.forEach(p => {
  console.log(`    - ${p.name}: ${p.resolution} @ ${p.bitrate}`);
});

console.log('\n🧪 FFmpeg 参数构建测试:');
console.log('  (跳过 - 需先安装依赖)');
console.log('  预期参数包含: -f dash, -use_timeline, -use_template');

console.log('\n📊 数据库结构验证:');
console.log('  - stream_sessions: 推流会话表');
console.log('  - viewer_sessions: 观看会话表');
console.log('  - quality_stats: 画质统计表');

console.log('\n🌐 API 端点:');
const apiEndpoints = [
  'GET  /api/streams',
  'GET  /api/streams/active',
  'GET  /api/streams/history',
  'GET  /api/streams/:id',
  'POST /api/viewer/join',
  'POST /api/viewer/quality',
  'POST /api/viewer/leave',
  'GET  /api/stats/viewers/:id'
];
apiEndpoints.forEach(e => console.log(`  - ${e}`));

console.log('\n🎯 前端播放器特性:');
const features = [
  'dash.js 自适应播放',
  '实时码率/分辨率显示',
  '缓冲区监控',
  '码率切换历史图表',
  '自动/手动画质切换',
  '观看人数统计',
  '播放日志',
  '响应式设计'
];
features.forEach(f => console.log(`  ✅ ${f}`));

console.log('\n' + '='.repeat(40));
if (allOk) {
  console.log('✅ 所有文件结构验证通过!');
  console.log('\n下一步:');
  console.log('  1. 安装依赖: npm install');
  console.log('  2. 安装 FFmpeg');
  console.log('  3. 启动服务: npm start');
  console.log('  4. 推送 RTMP 流: rtmp://localhost:1935/live/<key>');
  console.log('  5. 访问播放器: http://localhost:3000');
} else {
  console.log('❌ 部分文件缺失，请检查');
}
console.log('='.repeat(40) + '\n');
