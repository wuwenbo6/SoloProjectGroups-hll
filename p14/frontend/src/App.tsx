import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Tabs,
  Tab,
  Button,
  TextField,
  Grid,
  Paper,
  CircularProgress,
  Alert,
  Snackbar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Switch,
  FormControlLabel,
  Tooltip,
  Divider,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SearchIcon from '@mui/icons-material/Search';
import InfoIcon from '@mui/icons-material/Info';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { Template, Detection, AlignedWaveforms as AlignedWaveformsType } from './types';
import { templateApi, detectionApi, waveformApi, reportApi, streamingApi, StreamingStatus } from './services/api';
import TemplateList from './components/TemplateList';
import DetectionList from './components/DetectionList';
import AlignedWaveforms from './components/AlignedWaveforms';

interface TabPanelProps {
  children?: React.ReactNode;
  value: number;
  index: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div hidden={value !== index} style={{ paddingTop: 24 }}>
      {value === index && children}
    </div>
  );
};

const App: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const [templateName, setTemplateName] = useState('');
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [continuousFile, setContinuousFile] = useState<File | null>(null);
  const [threshold, setThreshold] = useState(0.75);
  const [useAdaptiveThreshold, setUseAdaptiveThreshold] = useState(true);
  const [adaptiveSigma, setAdaptiveSigma] = useState(6.0);
  const [minStations, setMinStations] = useState(1);
  const [clusterTimeWindow, setClusterTimeWindow] = useState(2.0);
  const [alignedData, setAlignedData] = useState<AlignedWaveformsType | null>(null);

  const [streamingStatus, setStreamingStatus] = useState<StreamingStatus | null>(null);
  const [streamingFile, setStreamingFile] = useState<File | null>(null);
  const [reportSummary, setReportSummary] = useState<string>('');

  useEffect(() => {
    loadTemplates();
    loadDetections();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await templateApi.getAll();
      setTemplates(data);
    } catch (error) {
      console.error('加载模板失败:', error);
    }
  };

  const loadDetections = async () => {
    try {
      const data = await detectionApi.getAll();
      setDetections(data);
    } catch (error) {
      console.error('加载检测结果失败:', error);
    }
  };

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleUploadTemplate = async () => {
    if (!templateName || !templateFile) {
      showSnackbar('请填写模板名称和选择文件', 'error');
      return;
    }

    setLoading(true);
    try {
      await templateApi.upload(templateName, templateFile);
      showSnackbar('模板上传成功', 'success');
      setTemplateName('');
      setTemplateFile(null);
      loadTemplates();
    } catch (error) {
      showSnackbar('模板上传失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    try {
      await templateApi.delete(id);
      showSnackbar('模板删除成功', 'success');
      loadTemplates();
    } catch (error) {
      showSnackbar('模板删除失败', 'error');
    }
  };

  const handleDetect = async () => {
    if (!selectedTemplate || !continuousFile) {
      showSnackbar('请选择模板和连续波形文件', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await detectionApi.detect({
        templateId: selectedTemplate.id,
        threshold,
        useAdaptiveThreshold,
        adaptiveSigma,
        minStations,
        clusterTimeWindow,
        file: continuousFile,
      });
      showSnackbar(`检测完成，共发现 ${result.total} 个事件`, 'success');
      loadDetections();
    } catch (error) {
      showSnackbar('检测失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDetection = async (id: number) => {
    try {
      await detectionApi.delete(id);
      showSnackbar('检测结果删除成功', 'success');
      loadDetections();
    } catch (error) {
      showSnackbar('检测结果删除失败', 'error');
    }
  };

  const handleViewDetection = async (detection: Detection) => {
    if (!continuousFile) {
      showSnackbar('请先上传连续波形文件', 'error');
      return;
    }

    setLoading(true);
    try {
      const data = await waveformApi.getAligned(detection.template_id, [detection.id], continuousFile);
      setAlignedData(data);
      setTabValue(2);
    } catch (error) {
      showSnackbar('获取波形数据失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStartStreaming = async () => {
    if (!selectedTemplate) {
      showSnackbar('请先选择模板', 'error');
      return;
    }

    setLoading(true);
    try {
      await streamingApi.start(selectedTemplate.id, 60, 30, useAdaptiveThreshold, threshold);
      const status = await streamingApi.getStatus();
      setStreamingStatus(status);
      showSnackbar('流式检测已启动', 'success');
    } catch (error) {
      showSnackbar('启动流式检测失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFeedStreaming = async () => {
    if (!streamingFile) {
      showSnackbar('请选择波形文件', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await streamingApi.feedData(streamingFile);
      const status = await streamingApi.getStatus();
      setStreamingStatus(status);
      showSnackbar(`数据已处理，检测到 ${result.detections_count} 个事件`, 'success');
      loadDetections();
    } catch (error) {
      showSnackbar('处理流式数据失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStopStreaming = async () => {
    setLoading(true);
    try {
      await streamingApi.stop();
      setStreamingStatus(null);
      showSnackbar('流式检测已停止', 'success');
    } catch (error) {
      showSnackbar('停止流式检测失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadReportSummary = async () => {
    setLoading(true);
    try {
      const result = await reportApi.getSummary();
      setReportSummary(result.summary);
    } catch (error) {
      showSnackbar('加载报告摘要失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    reportApi.exportCsv();
    showSnackbar('CSV报告导出中...', 'success');
  };

  const handleExportPdf = () => {
    reportApi.exportPdf();
    showSnackbar('PDF报告导出中...', 'success');
  };

  const updateStreamingStatus = async () => {
    try {
      const status = await streamingApi.getStatus();
      setStreamingStatus(status);
    } catch (error) {
      console.error('获取状态失败:', error);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (streamingStatus?.is_running) {
        updateStreamingStatus();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [streamingStatus?.is_running]);

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          地震事件检测系统
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" align="center" gutterBottom>
          基于 ObsPy 模板匹配 (Matched Filter) 的地震事件检测
        </Typography>

        <Paper elevation={3} sx={{ mt: 3 }}>
          <Tabs
            value={tabValue}
            onChange={(_, newValue) => setTabValue(newValue)}
            centered
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label="模板管理" />
            <Tab label="事件检测" />
            <Tab label="波形对齐" />
            <Tab label="检测结果" />
            <Tab label="实时流式检测" />
            <Tab label="报告导出" />
          </Tabs>
        </Paper>

        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Paper elevation={3} sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  上传模板
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    label="模板名称"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    fullWidth
                  />
                  <Button
                    variant="contained"
                    component="label"
                    startIcon={<UploadFileIcon />}
                    color={templateFile ? 'success' : 'primary'}
                  >
                    {templateFile ? templateFile.name : '选择模板文件 (mseed)'}
                    <input
                      type="file"
                      accept=".mseed,.msd"
                      hidden
                      onChange={(e) => setTemplateFile(e.target.files?.[0] || null)}
                    />
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleUploadTemplate}
                    disabled={loading || !templateName || !templateFile}
                  >
                    {loading ? <CircularProgress size={24} /> : '上传模板'}
                  </Button>
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={12} md={8}>
              <TemplateList
                templates={templates}
                onSelect={(tpl) => {
                  setSelectedTemplate(tpl);
                  setTabValue(1);
                }}
                onDelete={handleDeleteTemplate}
              />
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={5}>
              <Paper elevation={3} sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  检测配置
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  <FormControl fullWidth>
                    <InputLabel>选择模板</InputLabel>
                    <Select
                      value={selectedTemplate?.id || ''}
                      label="选择模板"
                      onChange={(e) => {
                        const tpl = templates.find((t) => t.id === e.target.value);
                        setSelectedTemplate(tpl || null);
                      }}
                    >
                      {templates.map((tpl) => (
                        <MenuItem key={tpl.id} value={tpl.id}>
                          {tpl.name} ({tpl.station})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography gutterBottom>
                        相关系数阈值: {threshold.toFixed(2)}
                      </Typography>
                      <Tooltip title="最小相关系数阈值，低于此值的检测将被过滤">
                        <InfoIcon fontSize="small" color="action" />
                      </Tooltip>
                    </Box>
                    <Slider
                      value={threshold}
                      onChange={(_, value) => setThreshold(value as number)}
                      min={0.5}
                      max={0.99}
                      step={0.01}
                    />
                  </Box>

                  <FormControlLabel
                    control={
                      <Switch
                        checked={useAdaptiveThreshold}
                        onChange={(e) => setUseAdaptiveThreshold(e.target.checked)}
                      />
                    }
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        自适应阈值
                        <Tooltip title="基于噪声统计自动计算阈值，减少强噪声下的假阳性">
                          <InfoIcon fontSize="small" color="action" />
                        </Tooltip>
                      </Box>
                    }
                  />

                  {useAdaptiveThreshold && (
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography gutterBottom>
                          Sigma倍数: {adaptiveSigma.toFixed(1)}σ
                        </Typography>
                        <Tooltip title="自适应阈值 = 中位数 + Sigma * MAD（中位数绝对偏差）">
                          <InfoIcon fontSize="small" color="action" />
                        </Tooltip>
                      </Box>
                      <Slider
                        value={adaptiveSigma}
                        onChange={(_, value) => setAdaptiveSigma(value as number)}
                        min={3}
                        max={10}
                        step={0.5}
                      />
                    </Box>
                  )}

                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography gutterBottom>
                        最台站数: {minStations}
                      </Typography>
                      <Tooltip title="事件需要在多少个台站同时检测到才被确认，提高定位可靠性">
                        <InfoIcon fontSize="small" color="action" />
                      </Tooltip>
                    </Box>
                    <Slider
                      value={minStations}
                      onChange={(_, value) => setMinStations(value as number)}
                      min={1}
                      max={10}
                      step={1}
                      marks
                    />
                  </Box>

                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography gutterBottom>
                        聚类时间窗口: {clusterTimeWindow.toFixed(1)}秒
                      </Typography>
                      <Tooltip title="在此时间窗口内的多个检测将被聚类，只保留最佳匹配">
                        <InfoIcon fontSize="small" color="action" />
                      </Tooltip>
                    </Box>
                    <Slider
                      value={clusterTimeWindow}
                      onChange={(_, value) => setClusterTimeWindow(value as number)}
                      min={0.5}
                      max={10}
                      step={0.5}
                    />
                  </Box>

                  <Button
                    variant="contained"
                    component="label"
                    startIcon={<UploadFileIcon />}
                    color={continuousFile ? 'success' : 'primary'}
                  >
                    {continuousFile ? continuousFile.name : '选择连续波形文件'}
                    <input
                      type="file"
                      accept=".mseed,.msd"
                      hidden
                      onChange={(e) => setContinuousFile(e.target.files?.[0] || null)}
                    />
                  </Button>

                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    startIcon={<SearchIcon />}
                    onClick={handleDetect}
                    disabled={loading || !selectedTemplate || !continuousFile}
                  >
                    {loading ? <CircularProgress size={24} /> : '开始检测'}
                  </Button>
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={12} md={7}>
              <Alert severity="info" sx={{ mb: 2 }}>
                <strong>使用说明:</strong>
                <ol>
                  <li>选择一个已上传的模板波形</li>
                  <li>开启自适应阈值以减少强噪声下的假阳性</li>
                  <li>多台站数据时增加最台站数以提高定位可靠性</li>
                  <li>上传待检测的连续波形文件 (miniseed 格式)</li>
                  <li>点击"开始检测"执行模板匹配</li>
                </ol>
              </Alert>
              {selectedTemplate && (
                <Paper elevation={3} sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    已选模板信息
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography>名称: {selectedTemplate.name}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography>台站: {selectedTemplate.station}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography>通道: {selectedTemplate.channel}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography>采样率: {selectedTemplate.sampling_rate} Hz</Typography>
                    </Grid>
                  </Grid>
                </Paper>
              )}
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          {alignedData ? (
            <AlignedWaveforms data={alignedData} />
          ) : (
            <Paper elevation={3} sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                请在"事件检测"或"检测结果"标签页中选择一个检测结果进行查看
              </Typography>
            </Paper>
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={3}>
          <DetectionList
            detections={detections}
            onView={handleViewDetection}
            onDelete={handleDeleteDetection}
          />
        </TabPanel>

        <TabPanel value={tabValue} index={4}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Paper elevation={3} sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  实时流式检测
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  <FormControl fullWidth>
                    <InputLabel>选择模板</InputLabel>
                    <Select
                      value={selectedTemplate?.id || ''}
                      label="选择模板"
                      onChange={(e) => {
                        const tpl = templates.find((t) => t.id === e.target.value);
                        setSelectedTemplate(tpl || null);
                      }}
                    >
                      {templates.map((tpl) => (
                        <MenuItem key={tpl.id} value={tpl.id}>
                          {tpl.name} ({tpl.station})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography gutterBottom>
                        阈值: {threshold.toFixed(2)}
                      </Typography>
                    </Box>
                    <Slider
                      value={threshold}
                      onChange={(_, value) => setThreshold(value as number)}
                      min={0.5}
                      max={0.99}
                      step={0.01}
                    />
                  </Box>

                  <FormControlLabel
                    control={
                      <Switch
                        checked={useAdaptiveThreshold}
                        onChange={(e) => setUseAdaptiveThreshold(e.target.checked)}
                      />
                    }
                    label="自适应阈值"
                  />

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="contained"
                      color="success"
                      startIcon={<PlayArrowIcon />}
                      onClick={handleStartStreaming}
                      disabled={loading || !selectedTemplate || streamingStatus?.is_running}
                      fullWidth
                    >
                      启动检测
                    </Button>
                    <Button
                      variant="contained"
                      color="error"
                      startIcon={<StopIcon />}
                      onClick={handleStopStreaming}
                      disabled={loading || !streamingStatus?.is_running}
                      fullWidth
                    >
                      停止
                    </Button>
                  </Box>

                  <Divider />

                  <Button
                    variant="contained"
                    component="label"
                    startIcon={<UploadFileIcon />}
                    color={streamingFile ? 'success' : 'primary'}
                  >
                    {streamingFile ? streamingFile.name : '选择波形数据'}
                    <input
                      type="file"
                      accept=".mseed,.msd"
                      hidden
                      onChange={(e) => setStreamingFile(e.target.files?.[0] || null)}
                    />
                  </Button>

                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleFeedStreaming}
                    disabled={loading || !streamingStatus?.is_running || !streamingFile}
                  >
                    {loading ? <CircularProgress size={24} /> : '推送数据'}
                  </Button>
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={12} md={8}>
              <Paper elevation={3} sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  流式检测状态
                </Typography>
                {streamingStatus ? (
                  <List>
                    <ListItem>
                      <ListItemText
                        primary="运行状态"
                        secondary={streamingStatus.is_running ? '运行中' : '已停止'}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="已处理数据点数"
                        secondary={streamingStatus.total_data_samples}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="已处理窗口数"
                        secondary={streamingStatus.windows_processed}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="检测到事件数"
                        secondary={streamingStatus.detections_count}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="缓冲区大小"
                        secondary={JSON.stringify(streamingStatus.buffer_sizes)}
                      />
                    </ListItem>
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    流式检测器未启动，请先选择模板并启动检测
                  </Typography>
                )}
                <Alert severity="info" sx={{ mt: 2 }}>
                  <strong>使用说明:</strong>
                  <ol>
                    <li>选择模板并点击"启动检测"</li>
                    <li>选择需要推送的波形数据文件</li>
                    <li>点击"推送数据"进行实时检测</li>
                    <li>可多次推送数据，状态会自动更新</li>
                  </ol>
                </Alert>
              </Paper>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tabValue} index={5}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Paper elevation={3} sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  报告导出
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<TableChartIcon />}
                    onClick={handleLoadReportSummary}
                  >
                    生成检测摘要
                  </Button>

                  <Divider />

                  <Typography variant="subtitle2">导出报告</Typography>

                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<TableChartIcon />}
                    onClick={handleExportCsv}
                  >
                    导出 CSV
                  </Button>

                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<PictureAsPdfIcon />}
                    onClick={handleExportPdf}
                  >
                    导出 PDF
                  </Button>
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={12} md={8}>
              <Paper elevation={3} sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  检测摘要
                </Typography>
                {reportSummary ? (
                  <Box
                    component="pre"
                    sx={{
                      p: 2,
                      bgcolor: '#f5f5f5',
                      borderRadius: 1,
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'monospace',
                      fontSize: '0.9rem',
                    }}
                  >
                    {reportSummary}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    点击"生成检测摘要"查看统计信息
                  </Typography>
                )}
                <Alert severity="info" sx={{ mt: 2 }}>
                  <strong>报告格式说明:</strong>
                  <ul>
                    <li><strong>CSV</strong>: 表格格式，可直接导入 Excel 或数据库</li>
                    <li><strong>PDF</strong>: 正式报告，包含摘要、统计和检测结果列表</li>
                    <li><strong>摘要</strong>: 控制台格式，快速查看检测概况</li>
                  </ul>
                </Alert>
              </Paper>
            </Grid>
          </Grid>
        </TabPanel>
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default App;
