const express = require('express');
const cors = require('cors');
const path = require('path');
const { 
  triangulate, 
  calculateProbabilityEllipse, 
  calculatePowerAtStation,
  generateEllipsePoints,
  distanceBetween,
  generateMovingEmitterPath,
  generateStationReadingsForPath,
  blindSourceSeparation,
  separateMultipleSources,
  generateTrainingQuestion,
  checkAnswer
} = require('./triangulation');
const { saveHistory, getHistory, getHistoryById } = require('./database-simple');
const { generateKML } = require('./kmlExport');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/triangulate', (req, res) => {
  try {
    const { stations, power = 50, terrainFactor = 1 } = req.body;

    if (!stations || stations.length < 2) {
      return res.status(400).json({ error: 'At least 2 stations are required' });
    }

    const emitter = triangulate(stations, terrainFactor);
    const ellipse = calculateProbabilityEllipse(stations, emitter.lat, emitter.lng, terrainFactor);
    const ellipsePoints = generateEllipsePoints(
      emitter.lat, emitter.lng,
      ellipse.major, ellipse.minor,
      ellipse.orientation
    );

    const stationsWithPower = stations.map(station => {
      const distance = distanceBetween(station.lat, station.lng, emitter.lat, emitter.lng);
      const receivedPower = calculatePowerAtStation(power, distance, terrainFactor);
      return {
        ...station,
        distance,
        receivedPower
      };
    });

    const result = {
      emitterLat: emitter.lat,
      emitterLng: emitter.lng,
      probability: ellipse.probability,
      ellipseMajor: ellipse.major,
      ellipseMinor: ellipse.minor,
      ellipseOrientation: ellipse.orientation,
      ellipsePoints,
      power,
      terrainFactor,
      stations: stationsWithPower,
      timestamp: new Date().toISOString()
    };

    const historyId = saveHistory(result);
    result.id = historyId;

    res.json(result);
  } catch (error) {
    console.error('Triangulation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = getHistory(limit);
    res.json(history);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/history/:id', (req, res) => {
  try {
    const record = getHistoryById(parseInt(req.params.id));
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json(record);
  } catch (error) {
    console.error('Get history by id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/kml/:id', (req, res) => {
  try {
    const record = getHistoryById(parseInt(req.params.id));
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    const kml = generateKML(record);
    
    res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
    res.setHeader('Content-Disposition', `attachment; filename="df_result_${record.id}.kml"`);
    res.send(kml);
  } catch (error) {
    console.error('KML export error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/moving-emitter', (req, res) => {
  try {
    const { 
      startLat, startLng, 
      speed = 60, 
      direction = 90, 
      duration = 60,
      interval = 5,
      stations,
      measurementError = 2
    } = req.body;

    const path = generateMovingEmitterPath(startLat, startLng, speed, direction, duration, interval);
    
    let readings = [];
    if (stations && stations.length >= 2) {
      readings = generateStationReadingsForPath(stations, path, measurementError);
    }

    res.json({
      path,
      readings,
      speed,
      direction,
      duration
    });
  } catch (error) {
    console.error('Moving emitter error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/multi-source', (req, res) => {
  try {
    const { stations, numSources = 2 } = req.body;

    if (!stations || stations.length < 3) {
      return res.status(400).json({ error: 'At least 3 stations are required for multi-source' });
    }

    const sources = separateMultipleSources(stations, numSources);

    const sourcesWithDetails = sources.map(source => {
      const ellipse = calculateProbabilityEllipse(stations, source.lat, source.lng, 0);
      const ellipsePoints = generateEllipsePoints(
        source.lat, source.lng,
        ellipse.major, ellipse.minor,
        ellipse.orientation
      );
      return {
        ...source,
        probability: ellipse.probability,
        ellipseMajor: ellipse.major,
        ellipseMinor: ellipse.minor,
        ellipseOrientation: ellipse.orientation,
        ellipsePoints
      };
    });

    res.json({
      sources: sourcesWithDetails,
      numSources: sourcesWithDetails.length,
      stations
    });
  } catch (error) {
    console.error('Multi-source error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/generate-question', (req, res) => {
  try {
    const { difficulty = 'medium' } = req.body;
    const question = generateTrainingQuestion(difficulty);
    
    const questionForUser = {
      ...question,
      trueSources: undefined,
      stations: question.stations.map(s => ({
        ...s,
        trueBearing: undefined,
        closestSource: undefined
      }))
    };
    
    res.json({
      question: questionForUser,
      answerKey: question.trueSources,
      acceptableError: question.acceptableError
    });
  } catch (error) {
    console.error('Generate question error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/check-answer', (req, res) => {
  try {
    const { question, userAnswers } = req.body;
    
    if (!question || !userAnswers) {
      return res.status(400).json({ error: 'Question and userAnswers are required' });
    }
    
    const result = checkAnswer(question, userAnswers);
    res.json(result);
  } catch (error) {
    console.error('Check answer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Direction Finding System running on http://localhost:${PORT}`);
});
