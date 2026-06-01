const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

let worklist = [
  {
    accessionNumber: 'ACC001',
    patientId: 'P001',
    patientName: '张三',
    patientBirthDate: '1985-03-15',
    patientSex: 'M',
    studyInstanceUid: '1.2.840.113619.2.55.3.2831164356.789.1715000000.1',
    scheduledProcedureStepId: 'SPS001',
    scheduledProcedureStepDescription: '胸部CT平扫',
    scheduledProcedureStepStartDate: '2026-05-27',
    scheduledProcedureStepStartTime: '09:00:00',
    modality: 'CT',
    performingPhysicianName: '李医生',
    mppsStatus: 'SCHEDULED'
  },
  {
    accessionNumber: 'ACC002',
    patientId: 'P002',
    patientName: '李四',
    patientBirthDate: '1990-07-22',
    patientSex: 'F',
    studyInstanceUid: '1.2.840.113619.2.55.3.2831164356.789.1715000000.2',
    scheduledProcedureStepId: 'SPS002',
    scheduledProcedureStepDescription: '头颅MRI增强',
    scheduledProcedureStepStartDate: '2026-05-27',
    scheduledProcedureStepStartTime: '10:30:00',
    modality: 'MR',
    performingPhysicianName: '王医生',
    mppsStatus: 'SCHEDULED'
  },
  {
    accessionNumber: 'ACC003',
    patientId: 'P003',
    patientName: '王五',
    patientBirthDate: '1978-11-08',
    patientSex: 'M',
    studyInstanceUid: '1.2.840.113619.2.55.3.2831164356.789.1715000000.3',
    scheduledProcedureStepId: 'SPS003',
    scheduledProcedureStepDescription: '腹部超声检查',
    scheduledProcedureStepStartDate: '2026-05-27',
    scheduledProcedureStepStartTime: '14:00:00',
    modality: 'US',
    performingPhysicianName: '赵医生',
    mppsStatus: 'SCHEDULED'
  },
  {
    accessionNumber: 'ACC004',
    patientId: 'P004',
    patientName: '赵六',
    patientBirthDate: '1995-01-30',
    patientSex: 'F',
    studyInstanceUid: '1.2.840.113619.2.55.3.2831164356.789.1715000000.4',
    scheduledProcedureStepId: 'SPS004',
    scheduledProcedureStepDescription: '腰椎X线摄影',
    scheduledProcedureStepStartDate: '2026-05-28',
    scheduledProcedureStepStartTime: '08:30:00',
    modality: 'CR',
    performingPhysicianName: '钱医生',
    mppsStatus: 'SCHEDULED'
  },
  {
    accessionNumber: 'ACC005',
    patientId: 'P005',
    patientName: '孙七',
    patientBirthDate: '1965-09-12',
    patientSex: 'M',
    studyInstanceUid: '1.2.840.113619.2.55.3.2831164356.789.1715000000.5',
    scheduledProcedureStepId: 'SPS005',
    scheduledProcedureStepDescription: '冠状动脉CTA',
    scheduledProcedureStepStartDate: '2026-05-28',
    scheduledProcedureStepStartTime: '11:00:00',
    modality: 'CT',
    performingPhysicianName: '周医生',
    mppsStatus: 'SCHEDULED'
  }
];

let mppsHistory = [];
let storageCommitmentHistory = [];

function parseDicomDate(dateStr) {
  if (!dateStr) return '';
  const clean = dateStr.replace(/-/g, '');
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
  return dateStr;
}

app.get('/api/mwl', (req, res) => {
  const { patientName, startDate, endDate, modality } = req.query;
  
  let filtered = [...worklist];
  
  if (patientName) {
    filtered = filtered.filter(item => 
      item.patientName.includes(patientName)
    );
  }
  
  if (startDate) {
    const formattedStart = parseDicomDate(startDate);
    filtered = filtered.filter(item => 
      item.scheduledProcedureStepStartDate >= formattedStart
    );
  }
  
  if (endDate) {
    const formattedEnd = parseDicomDate(endDate);
    filtered = filtered.filter(item => 
      item.scheduledProcedureStepStartDate <= formattedEnd
    );
  }
  
  if (modality) {
    filtered = filtered.filter(item => 
      item.modality === modality
    );
  }
  
  res.json({
    total: filtered.length,
    worklist: filtered
  });
});

app.post('/api/mpps', (req, res) => {
  const mppsData = req.body;
  
  console.log('Received MPPS:', JSON.stringify(mppsData, null, 2));
  
  const { 
    studyInstanceUid, 
    scheduledProcedureStepId, 
    status,
    performedProcedureStepStartDate,
    performedProcedureStepStartTime,
    performedProcedureStepEndDate,
    performedProcedureStepEndTime,
    performedStationAeTitle,
    comments
  } = mppsData;
  
  const workItem = worklist.find(item => 
    item.studyInstanceUid === studyInstanceUid || 
    item.scheduledProcedureStepId === scheduledProcedureStepId
  );
  
  if (!workItem) {
    return res.status(404).json({ 
      error: 'Work item not found',
      received: mppsData
    });
  }
  
  const previousStatus = workItem.mppsStatus;
  workItem.mppsStatus = status;
  
  if (status === 'IN PROGRESS') {
    workItem.performedProcedureStepStartDate = performedProcedureStepStartDate || new Date().toISOString().split('T')[0];
    workItem.performedProcedureStepStartTime = performedProcedureStepStartTime || new Date().toTimeString().split(' ')[0];
  } else if (status === 'COMPLETED' || status === 'DISCONTINUED') {
    workItem.performedProcedureStepEndDate = performedProcedureStepEndDate || new Date().toISOString().split('T')[0];
    workItem.performedProcedureStepEndTime = performedProcedureStepEndTime || new Date().toTimeString().split(' ')[0];
  }
  
  const mppsRecord = {
    id: `MPPS_${Date.now()}`,
    timestamp: new Date().toISOString(),
    studyInstanceUid: workItem.studyInstanceUid,
    accessionNumber: workItem.accessionNumber,
    patientName: workItem.patientName,
    scheduledProcedureStepId: workItem.scheduledProcedureStepId,
    previousStatus,
    newStatus: status,
    performedStationAeTitle,
    comments
  };
  
  mppsHistory.unshift(mppsRecord);
  if (mppsHistory.length > 100) {
    mppsHistory = mppsHistory.slice(0, 100);
  }
  
  res.json({
    success: true,
    message: `MPPS status updated to: ${status}`,
    workItem: {
      accessionNumber: workItem.accessionNumber,
      patientName: workItem.patientName,
      mppsStatus: workItem.mppsStatus
    },
    mppsRecord
  });
});

app.get('/api/mpps/history', (req, res) => {
  res.json({
    total: mppsHistory.length,
    history: mppsHistory
  });
});

app.get('/api/modalities', (req, res) => {
  const modalities = [...new Set(worklist.map(item => item.modality))];
  res.json({ modalities });
});

app.get('/api/statuses', (req, res) => {
  res.json({
    statuses: [
      { code: 'SCHEDULED', description: '已预约' },
      { code: 'IN PROGRESS', description: '执行中' },
      { code: 'COMPLETED', description: '已完成' },
      { code: 'DISCONTINUED', description: '已终止' }
    ]
  });
});

app.post('/api/worklist', (req, res) => {
  const newItem = req.body;
  newItem.accessionNumber = `ACC${String(worklist.length + 1).padStart(3, '0')}`;
  newItem.studyInstanceUid = `1.2.840.113619.2.55.3.2831164356.789.${Date.now()}`;
  newItem.mppsStatus = 'SCHEDULED';
  newItem.storageCommitmentStatus = 'NOT_COMMITTED';
  worklist.push(newItem);
  res.json({ success: true, workItem: newItem });
});

worklist.forEach(item => {
  item.storageCommitmentStatus = item.storageCommitmentStatus || 'NOT_COMMITTED';
});

app.post('/api/storage-commitment', (req, res) => {
  const { studyInstanceUid, accessionNumber, action, requestingAeTitle, receivingAeTitle } = req.body;
  
  console.log('Received Storage Commitment:', JSON.stringify(req.body, null, 2));
  
  const workItem = worklist.find(item => 
    item.studyInstanceUid === studyInstanceUid || 
    item.accessionNumber === accessionNumber
  );
  
  if (!workItem) {
    return res.status(404).json({ 
      error: 'Work item not found',
      received: req.body
    });
  }
  
  const previousStatus = workItem.storageCommitmentStatus || 'NOT_COMMITTED';
  const newStatus = action === 'COMMIT' ? 'COMMITTED' : 
                    action === 'FAIL' ? 'FAILED' : previousStatus;
  
  workItem.storageCommitmentStatus = newStatus;
  
  const commitmentRecord = {
    id: `STOR_COMMIT_${Date.now()}`,
    timestamp: new Date().toISOString(),
    studyInstanceUid: workItem.studyInstanceUid,
    accessionNumber: workItem.accessionNumber,
    patientName: workItem.patientName,
    scheduledProcedureStepDescription: workItem.scheduledProcedureStepDescription,
    previousStatus,
    newStatus,
    requestingAeTitle: requestingAeTitle || 'UNKNOWN',
    receivingAeTitle: receivingAeTitle || 'PACS_ARCHIVE',
    transactionUid: `1.2.840.113619.2.55.${Date.now()}`
  };
  
  storageCommitmentHistory.unshift(commitmentRecord);
  if (storageCommitmentHistory.length > 100) {
    storageCommitmentHistory = storageCommitmentHistory.slice(0, 100);
  }
  
  res.json({
    success: true,
    message: `Storage commitment status updated to: ${newStatus}`,
    workItem: {
      accessionNumber: workItem.accessionNumber,
      patientName: workItem.patientName,
      storageCommitmentStatus: workItem.storageCommitmentStatus
    },
    commitmentRecord
  });
});

app.get('/api/storage-commitment/history', (req, res) => {
  res.json({
    total: storageCommitmentHistory.length,
    history: storageCommitmentHistory
  });
});

app.get('/api/export/worklist.csv', (req, res) => {
  const { patientName, startDate, endDate, modality } = req.query;
  
  let filtered = [...worklist];
  
  if (patientName) {
    filtered = filtered.filter(item => item.patientName.includes(patientName));
  }
  
  if (startDate) {
    const formattedStart = parseDicomDate(startDate);
    filtered = filtered.filter(item => item.scheduledProcedureStepStartDate >= formattedStart);
  }
  
  if (endDate) {
    const formattedEnd = parseDicomDate(endDate);
    filtered = filtered.filter(item => item.scheduledProcedureStepStartDate <= formattedEnd);
  }
  
  if (modality) {
    filtered = filtered.filter(item => item.modality === modality);
  }
  
  const headers = ['检查号', '患者ID', '患者姓名', '出生日期', '性别', '检查项目', '检查类型', '检查日期', '检查时间', '执行医生', 'MPPS状态', '存储提交状态'];
  
  const rows = filtered.map(item => [
    item.accessionNumber,
    item.patientId,
    item.patientName,
    item.patientBirthDate,
    item.patientSex,
    item.scheduledProcedureStepDescription,
    item.modality,
    item.scheduledProcedureStepStartDate,
    item.scheduledProcedureStepStartTime,
    item.performingPhysicianName,
    item.mppsStatus,
    item.storageCommitmentStatus || 'NOT_COMMITTED'
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))
  ].join('\n');
  
  const filename = `worklist_${new Date().toISOString().split('T')[0]}.csv`;
  
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.write('\ufeff');
  res.write(csvContent);
  res.end();
});

app.get('/api/export/mpps.csv', (req, res) => {
  const headers = ['记录ID', '时间戳', '检查号', '患者姓名', '检查项目', '原状态', '新状态', '执行设备', '备注'];
  
  const rows = mppsHistory.map(item => [
    item.id,
    item.timestamp,
    item.accessionNumber,
    item.patientName,
    worklist.find(w => w.accessionNumber === item.accessionNumber)?.scheduledProcedureStepDescription || '',
    item.previousStatus,
    item.newStatus,
    item.performedStationAeTitle || '',
    item.comments || ''
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))
  ].join('\n');
  
  const filename = `mpps_history_${new Date().toISOString().split('T')[0]}.csv`;
  
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.write('\ufeff');
  res.write(csvContent);
  res.end();
});

app.get('/api/export/storage-commitment.csv', (req, res) => {
  const headers = ['记录ID', '时间戳', '检查号', '患者姓名', '检查项目', '原状态', '新状态', '请求AE', '接收AE', '事务UID'];
  
  const rows = storageCommitmentHistory.map(item => [
    item.id,
    item.timestamp,
    item.accessionNumber,
    item.patientName,
    item.scheduledProcedureStepDescription,
    item.previousStatus,
    item.newStatus,
    item.requestingAeTitle,
    item.receivingAeTitle,
    item.transactionUid
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))
  ].join('\n');
  
  const filename = `storage_commitment_${new Date().toISOString().split('T')[0]}.csv`;
  
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.write('\ufeff');
  res.write(csvContent);
  res.end();
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`DICOM MWL SCP Simulator running`);
  console.log(`Server URL: http://localhost:${PORT}`);
  console.log(`========================================`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  GET  /api/mwl                       - 查询工作列表`);
  console.log(`  POST /api/mpps                      - 接收MPPS状态更新`);
  console.log(`  GET  /api/mpps/history              - 获取MPPS历史记录`);
  console.log(`  POST /api/storage-commitment        - 存储提交`);
  console.log(`  GET  /api/storage-commitment/history - 获取存储提交历史`);
  console.log(`  GET  /api/export/worklist.csv       - 导出工作列表CSV`);
  console.log(`  GET  /api/export/mpps.csv           - 导出MPPS历史CSV`);
  console.log(`  GET  /api/export/storage-commitment.csv - 导出存储提交CSV`);
  console.log(`  GET  /api/modalities                - 获取检查类型列表`);
  console.log(`  GET  /api/statuses                  - 获取状态列表`);
  console.log(`\n========================================\n`);
});
