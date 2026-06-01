const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AnalysisService = require('./src/analysisService');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '.pcap');
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(pcap|pcapng)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only pcap files are allowed'));
    }
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const analysisService = new AnalysisService();

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/analyze', upload.single('pcap'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No pcap file uploaded' });
    }

    const options = {
      initialDelay: parseInt(req.query.initialDelay) || 60,
      minDelay: parseInt(req.query.minDelay) || 20,
      maxDelay: parseInt(req.query.maxDelay) || 200,
      oneWayDelay: parseInt(req.query.oneWayDelay) || 100,
      reorderWindowSize: parseInt(req.query.reorderWindowSize) || 16,
      reorderTimeoutMs: parseInt(req.query.reorderTimeoutMs) || 100,
      codec: req.query.codec || null
    };

    if (options.codec) {
      options.codec = analysisService.mosEstimator.getCodecByName(options.codec);
    }

    const result = await analysisService.analyzePCAPFile(req.file.path, options);

    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Error deleting file:', err);
    });

    res.json(result);
  } catch (error) {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/analyze/mock', async (req, res) => {
  try {
    const options = {
      packetCount: parseInt(req.body.packetCount) || 1000,
      lossRate: parseFloat(req.body.lossRate) || 1,
      jitterMean: parseFloat(req.body.jitterMean) || 15,
      jitterStd: parseFloat(req.body.jitterStd) || 5,
      duration: parseInt(req.body.duration) || 60,
      reorderRate: parseFloat(req.body.reorderRate) || 0,
      includeRTCP: req.body.includeRTCP !== false,
      driftPpm: parseFloat(req.body.driftPpm) || 0,
      initialDelay: parseInt(req.body.initialDelay) || 60,
      minDelay: parseInt(req.body.minDelay) || 20,
      maxDelay: parseInt(req.body.maxDelay) || 200,
      oneWayDelay: parseInt(req.body.oneWayDelay) || 100,
      reorderWindowSize: parseInt(req.body.reorderWindowSize) || 16,
      reorderTimeoutMs: parseInt(req.body.reorderTimeoutMs) || 100,
      codec: req.body.codec || null
    };

    if (options.codec) {
      options.codec = analysisService.mosEstimator.getCodecByName(options.codec);
    }

    const mockData = analysisService.generateMockData(options);
    const { rtpPackets, rtcpPackets } = mockData;

    if (rtcpPackets && rtcpPackets.length > 0) {
      options.rtcpSRs = rtcpPackets;
    }

    const result = await analysisService.analyzeStream(rtpPackets, options);

    res.json({
      mockParameters: {
        packetCount: options.packetCount,
        lossRate: options.lossRate,
        jitterMean: options.jitterMean,
        jitterStd: options.jitterStd,
        duration: options.duration,
        reorderRate: options.reorderRate,
        includeRTCP: options.includeRTCP,
        driftPpm: options.driftPpm
      },
      rtcpPacketCount: rtcpPackets ? rtcpPackets.length : 0,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/analyze/mock-av', async (req, res) => {
  try {
    const options = {
      audioPacketCount: parseInt(req.body.audioPacketCount) || 1000,
      videoPacketCount: parseInt(req.body.videoPacketCount) || 300,
      duration: parseInt(req.body.duration) || 60,
      syncOffsetMs: parseFloat(req.body.syncOffsetMs) || 0,
      audioDriftPpm: parseFloat(req.body.audioDriftPpm) || 0,
      videoDriftPpm: parseFloat(req.body.videoDriftPpm) || 10,
      lossRate: parseFloat(req.body.lossRate) || 1,
      jitterMean: parseFloat(req.body.jitterMean) || 15,
      jitterStd: parseFloat(req.body.jitterStd) || 5,
      initialDelay: parseInt(req.body.initialDelay) || 60,
      minDelay: parseInt(req.body.minDelay) || 20,
      maxDelay: parseInt(req.body.maxDelay) || 200,
      oneWayDelay: parseInt(req.body.oneWayDelay) || 100,
      reorderWindowSize: parseInt(req.body.reorderWindowSize) || 16,
      reorderTimeoutMs: parseInt(req.body.reorderTimeoutMs) || 100
    };

    const avData = analysisService.generateAVMockData(options);

    const audioOptions = { ...options };
    if (avData.audio.rtcpPackets.length > 0) {
      audioOptions.rtcpSRs = avData.audio.rtcpPackets;
    }
    audioOptions.codec = analysisService.mosEstimator.getCodecByName('PCMU');

    const videoOptions = { ...options };
    if (avData.video.rtcpPackets.length > 0) {
      videoOptions.rtcpSRs = avData.video.rtcpPackets;
    }

    const audioResult = await analysisService.analyzeStream(avData.audio.rtpPackets, audioOptions);
    const videoResult = await analysisService.analyzeStream(avData.video.rtpPackets, videoOptions);

    const allRtcpPackets = [...avData.audio.rtcpPackets, ...avData.video.rtcpPackets];
    const syncAnalysis = analysisService.analyzeSynchronization(
      avData.audioSSRC,
      avData.videoSSRC,
      allRtcpPackets
    );

    res.json({
      mockParameters: {
        audioPacketCount: options.audioPacketCount,
        videoPacketCount: options.videoPacketCount,
        duration: options.duration,
        syncOffsetMs: options.syncOffsetMs,
        audioDriftPpm: options.audioDriftPpm,
        videoDriftPpm: options.videoDriftPpm,
        lossRate: options.lossRate,
        jitterMean: options.jitterMean,
        jitterStd: options.jitterStd
      },
      audioSSRC: avData.audioSSRC,
      videoSSRC: avData.videoSSRC,
      audio: audioResult,
      video: videoResult,
      syncAnalysis
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/codecs', (req, res) => {
  const codecs = Object.entries(analysisService.mosEstimator.codecProfiles).map(([name, profile]) => ({
    name,
    payloadType: profile.payloadType,
    clockRate: profile.clockRate,
    Ie: profile.Ie,
    Ipl: profile.Ipl,
    bpl: profile.bpl
  }));
  res.json(codecs);
});

app.get('/api/quality-thresholds', (req, res) => {
  res.json(analysisService.mosEstimator.getQualityThresholds());
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`RTP Analysis Server running on http://localhost:${PORT}`);
  console.log(`Web interface available at http://localhost:${PORT}`);
});

module.exports = app;
