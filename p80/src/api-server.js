const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

class APIServer {
  constructor(db, nfcReader) {
    this.db = db;
    this.nfcReader = nfcReader;
    this.app = express();
    this.server = null;
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
  }

  setupRoutes() {
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    this.app.get('/api/posters', async (req, res) => {
      try {
        const posters = await this.db.getAllPosters();
        res.json({ success: true, data: posters });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/posters/:tagId', async (req, res) => {
      try {
        const poster = await this.db.getPosterByTagId(req.params.tagId);
        if (poster) {
          res.json({ success: true, data: poster });
        } else {
          res.status(404).json({ success: false, error: 'Poster not found' });
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/posters', async (req, res) => {
      try {
        const poster = await this.db.addPoster(req.body);
        res.json({ success: true, data: poster });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.put('/api/posters/:id', async (req, res) => {
      try {
        const poster = await this.db.updatePoster(req.params.id, req.body);
        res.json({ success: true, data: poster });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.delete('/api/posters/:id', async (req, res) => {
      try {
        await this.db.deletePoster(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/statistics', async (req, res) => {
      try {
        const stats = await this.db.getStatistics();
        res.json({ success: true, data: stats });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/nfc/simulate/:tagId', async (req, res) => {
      try {
        await this.nfcReader.simulateTagRead(req.params.tagId);
        res.json({ success: true, tagId: req.params.tagId });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/nfc/current', (req, res) => {
      try {
        const poster = this.nfcReader.getCurrentPoster();
        res.json({ success: true, data: poster });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/nfc/tags', (req, res) => {
      try {
        const tags = this.nfcReader.getSimulatedTags();
        res.json({ success: true, data: tags });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/nfc/write/:tagId', async (req, res) => {
      try {
        const result = await this.nfcReader.writeTagData(req.params.tagId, req.body);
        res.json({ success: true, data: result });
      } catch (error) {
        console.error('[API] Write tag error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/nfc/debounce', (req, res) => {
      try {
        const { delay } = req.body;
        this.nfcReader.setDebounceDelay(delay);
        res.json({ success: true, delay });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/carousel/start', async (req, res) => {
      try {
        const { interval = 5000 } = req.body;
        await this.nfcReader.startCarousel(interval);
        res.json({ success: true, interval });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/carousel/stop', (req, res) => {
      try {
        this.nfcReader.stopCarousel();
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/carousel/status', (req, res) => {
      try {
        const status = this.nfcReader.getCarouselStatus();
        res.json({ success: true, data: status });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/report/:format', async (req, res) => {
      try {
        const { format } = req.params;
        const { startDate, endDate } = req.query;
        
        const data = await this.db.exportReport(format, startDate, endDate);
        
        if (format === 'csv') {
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="nfc-report-${new Date().toISOString().split('T')[0]}.csv"`);
          res.send(data);
        } else {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', `attachment; filename="nfc-report-${new Date().toISOString().split('T')[0]}.json"`);
          res.send(data);
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  start(port = 3000) {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        console.log(`[API Server] Running on http://localhost:${port}`);
        resolve();
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('[API Server] Stopped');
    }
  }
}

module.exports = APIServer;