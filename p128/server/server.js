const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const db = require('./database');
const analysis = require('./analysis');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../client')));

const defaultSheetMusic = [
    {
        id: 'twinkle-twinkle',
        title: '小星星',
        difficulty: '初级',
        key: 'C大调',
        tempo: 100,
        timeSignature: '4/4',
        description: '经典儿歌，适合初学者练习基本指法',
        measures: [
            { id: 1, notes: [{ note: 'C4', duration: 1, finger: 1 }, { note: 'C4', duration: 1, finger: 1 }, { note: 'G4', duration: 1, finger: 5 }, { note: 'G4', duration: 1, finger: 5 }] },
            { id: 2, notes: [{ note: 'A4', duration: 1, finger: 3 }, { note: 'A4', duration: 1, finger: 3 }, { note: 'G4', duration: 2, finger: 5 }] },
            { id: 3, notes: [{ note: 'F4', duration: 1, finger: 4 }, { note: 'F4', duration: 1, finger: 4 }, { note: 'E4', duration: 1, finger: 3 }, { note: 'E4', duration: 1, finger: 3 }] },
            { id: 4, notes: [{ note: 'D4', duration: 1, finger: 2 }, { note: 'D4', duration: 1, finger: 2 }, { note: 'C4', duration: 2, finger: 1 }] },
            { id: 5, notes: [{ note: 'G4', duration: 1, finger: 5 }, { note: 'G4', duration: 1, finger: 5 }, { note: 'F4', duration: 1, finger: 4 }, { note: 'F4', duration: 1, finger: 4 }] },
            { id: 6, notes: [{ note: 'E4', duration: 1, finger: 3 }, { note: 'E4', duration: 1, finger: 3 }, { note: 'D4', duration: 2, finger: 2 }] },
            { id: 7, notes: [{ note: 'G4', duration: 1, finger: 5 }, { note: 'G4', duration: 1, finger: 5 }, { note: 'F4', duration: 1, finger: 4 }, { note: 'F4', duration: 1, finger: 4 }] },
            { id: 8, notes: [{ note: 'E4', duration: 1, finger: 3 }, { note: 'E4', duration: 1, finger: 3 }, { note: 'D4', duration: 2, finger: 2 }] },
            { id: 9, notes: [{ note: 'C4', duration: 1, finger: 1 }, { note: 'C4', duration: 1, finger: 1 }, { note: 'G4', duration: 1, finger: 5 }, { note: 'G4', duration: 1, finger: 5 }] },
            { id: 10, notes: [{ note: 'A4', duration: 1, finger: 3 }, { note: 'A4', duration: 1, finger: 3 }, { note: 'G4', duration: 2, finger: 5 }] },
            { id: 11, notes: [{ note: 'F4', duration: 1, finger: 4 }, { note: 'F4', duration: 1, finger: 4 }, { note: 'E4', duration: 1, finger: 3 }, { note: 'E4', duration: 1, finger: 3 }] },
            { id: 12, notes: [{ note: 'D4', duration: 1, finger: 2 }, { note: 'D4', duration: 1, finger: 2 }, { note: 'C4', duration: 2, finger: 1 }] }
        ]
    },
    {
        id: 'ode-to-joy',
        title: '欢乐颂',
        difficulty: '初级',
        key: 'D大调',
        tempo: 120,
        timeSignature: '4/4',
        description: '贝多芬第九交响曲主题，旋律优美',
        measures: [
            { id: 1, notes: [{ note: 'E4', duration: 1, finger: 3 }, { note: 'E4', duration: 1, finger: 3 }, { note: 'F#4', duration: 1, finger: 4 }, { note: 'G4', duration: 1, finger: 5 }] },
            { id: 2, notes: [{ note: 'G4', duration: 1, finger: 5 }, { note: 'F#4', duration: 1, finger: 4 }, { note: 'E4', duration: 1, finger: 3 }, { note: 'D4', duration: 1, finger: 2 }] },
            { id: 3, notes: [{ note: 'C4', duration: 1, finger: 1 }, { note: 'C4', duration: 1, finger: 1 }, { note: 'D4', duration: 1, finger: 2 }, { note: 'E4', duration: 1, finger: 3 }] },
            { id: 4, notes: [{ note: 'E4', duration: 1.5, finger: 3 }, { note: 'D4', duration: 0.5, finger: 2 }, { note: 'D4', duration: 2, finger: 2 }] },
            { id: 5, notes: [{ note: 'E4', duration: 1, finger: 3 }, { note: 'E4', duration: 1, finger: 3 }, { note: 'F#4', duration: 1, finger: 4 }, { note: 'G4', duration: 1, finger: 5 }] },
            { id: 6, notes: [{ note: 'G4', duration: 1, finger: 5 }, { note: 'F#4', duration: 1, finger: 4 }, { note: 'E4', duration: 1, finger: 3 }, { note: 'D4', duration: 1, finger: 2 }] },
            { id: 7, notes: [{ note: 'C4', duration: 1, finger: 1 }, { note: 'C4', duration: 1, finger: 1 }, { note: 'D4', duration: 1, finger: 2 }, { note: 'E4', duration: 1, finger: 3 }] },
            { id: 8, notes: [{ note: 'D4', duration: 1.5, finger: 2 }, { note: 'C4', duration: 0.5, finger: 1 }, { note: 'C4', duration: 2, finger: 1 }] }
        ]
    },
    {
        id: 'mary-had-a-little-lamb',
        title: '玛丽有只小羊羔',
        difficulty: '入门',
        key: 'C大调',
        tempo: 90,
        timeSignature: '4/4',
        description: '最简单的入门曲目，练习三度跳进',
        measures: [
            { id: 1, notes: [{ note: 'E4', duration: 1, finger: 3 }, { note: 'D4', duration: 1, finger: 2 }, { note: 'C4', duration: 1, finger: 1 }, { note: 'D4', duration: 1, finger: 2 }] },
            { id: 2, notes: [{ note: 'E4', duration: 1, finger: 3 }, { note: 'E4', duration: 1, finger: 3 }, { note: 'E4', duration: 2, finger: 3 }] },
            { id: 3, notes: [{ note: 'D4', duration: 1, finger: 2 }, { note: 'D4', duration: 1, finger: 2 }, { note: 'D4', duration: 2, finger: 2 }] },
            { id: 4, notes: [{ note: 'E4', duration: 1, finger: 3 }, { note: 'G4', duration: 1, finger: 5 }, { note: 'G4', duration: 2, finger: 5 }] },
            { id: 5, notes: [{ note: 'E4', duration: 1, finger: 3 }, { note: 'D4', duration: 1, finger: 2 }, { note: 'C4', duration: 1, finger: 1 }, { note: 'D4', duration: 1, finger: 2 }] },
            { id: 6, notes: [{ note: 'E4', duration: 1, finger: 3 }, { note: 'E4', duration: 1, finger: 3 }, { note: 'E4', duration: 1, finger: 3 }, { note: 'E4', duration: 1, finger: 3 }] },
            { id: 7, notes: [{ note: 'D4', duration: 1, finger: 2 }, { note: 'D4', duration: 1, finger: 2 }, { note: 'E4', duration: 1, finger: 3 }, { note: 'D4', duration: 1, finger: 2 }] },
            { id: 8, notes: [{ note: 'C4', duration: 4, finger: 1 }] }
        ]
    },
    {
        id: 'c-major-scale',
        title: 'C大调音阶',
        difficulty: '入门',
        key: 'C大调',
        tempo: 80,
        timeSignature: '4/4',
        description: 'C大调音阶练习，掌握正确的穿指和跨指',
        measures: [
            { id: 1, notes: [{ note: 'C4', duration: 1, finger: 1 }, { note: 'D4', duration: 1, finger: 2 }, { note: 'E4', duration: 1, finger: 3 }, { note: 'F4', duration: 1, finger: 4 }] },
            { id: 2, notes: [{ note: 'G4', duration: 1, finger: 1 }, { note: 'A4', duration: 1, finger: 2 }, { note: 'B4', duration: 1, finger: 3 }, { note: 'C5', duration: 1, finger: 4 }] },
            { id: 3, notes: [{ note: 'D5', duration: 1, finger: 5 }, { note: 'C5', duration: 1, finger: 4 }, { note: 'B4', duration: 1, finger: 3 }, { note: 'A4', duration: 1, finger: 2 }] },
            { id: 4, notes: [{ note: 'G4', duration: 1, finger: 1 }, { note: 'F4', duration: 1, finger: 2 }, { note: 'E4', duration: 1, finger: 3 }, { note: 'D4', duration: 1, finger: 4 }] },
            { id: 5, notes: [{ note: 'C4', duration: 4, finger: 1 }] }
        ]
    }
];

async function initDefaultSheetMusic() {
    const existing = await db.getSheetMusicList();
    if (existing.length === 0) {
        for (const sheet of defaultSheetMusic) {
            await db.saveSheetMusic(sheet);
        }
        console.log('Default sheet music initialized');
    }
}

async function startServer() {
    try {
        await db.initDatabase();
        await initDefaultSheetMusic();

        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../client/index.html'));
        });

        app.get('/api/sheet-music', async (req, res) => {
            try {
                const sheets = await db.getSheetMusicList();
                res.json(sheets);
            } catch (error) {
                console.error('Error getting sheet music list:', error);
                res.status(500).json({ error: 'Failed to get sheet music list' });
            }
        });

        app.get('/api/sheet-music/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const sheet = await db.getSheetMusicById(id);
                
                if (!sheet) {
                    return res.status(404).json({ error: 'Sheet music not found' });
                }
                
                res.json(sheet);
            } catch (error) {
                console.error('Error getting sheet music:', error);
                res.status(500).json({ error: 'Failed to get sheet music' });
            }
        });

        app.post('/api/sheet-music', async (req, res) => {
            try {
                const sheet = req.body;
                
                if (!sheet.id || !sheet.title || !sheet.measures) {
                    return res.status(400).json({ error: 'Missing required fields' });
                }
                
                const saved = await db.saveSheetMusic(sheet);
                res.json(saved);
            } catch (error) {
                console.error('Error saving sheet music:', error);
                res.status(500).json({ error: 'Failed to save sheet music' });
            }
        });

        app.delete('/api/sheet-music/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const deleted = await db.deleteSheetMusic(id);
                
                if (!deleted) {
                    return res.status(404).json({ error: 'Sheet music not found' });
                }
                
                res.json({ success: true });
            } catch (error) {
                console.error('Error deleting sheet music:', error);
                res.status(500).json({ error: 'Failed to delete sheet music' });
            }
        });

        app.post('/api/analyze', (req, res) => {
            try {
                const performanceData = req.body;
                const result = analysis.analyzePerformance(performanceData);
                res.json(result);
            } catch (error) {
                console.error('Error analyzing performance:', error);
                res.status(500).json({ error: 'Failed to analyze performance' });
            }
        });

        app.post('/api/finger-suggestions', (req, res) => {
            try {
                const { note, context } = req.body;
                
                if (!note) {
                    return res.status(400).json({ error: 'Note is required' });
                }
                
                const suggestions = analysis.getFingerSuggestions(note, context || {});
                res.json(suggestions);
            } catch (error) {
                console.error('Error getting finger suggestions:', error);
                res.status(500).json({ error: 'Failed to get finger suggestions' });
            }
        });

        app.post('/api/analyze-note', (req, res) => {
            try {
                const { playedNote, expectedNote, context } = req.body;
                
                if (playedNote === undefined || expectedNote === undefined) {
                    return res.status(400).json({ error: 'playedNote and expectedNote are required' });
                }
                
                const result = analysis.analyzeRealTimeNote(playedNote, expectedNote, context || {});
                res.json(result);
            } catch (error) {
                console.error('Error analyzing note:', error);
                res.status(500).json({ error: 'Failed to analyze note' });
            }
        });

        app.post('/api/practice-records', async (req, res) => {
            try {
                const record = req.body;
                
                if (!record.sheetId || !record.sheetTitle || record.startTime === undefined) {
                    return res.status(400).json({ error: 'Missing required fields' });
                }
                
                const saved = await db.savePracticeRecord(record);
                res.json(saved);
            } catch (error) {
                console.error('Error saving practice record:', error);
                res.status(500).json({ error: 'Failed to save practice record' });
            }
        });

        app.get('/api/practice-records', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit, 10) || 50;
                const offset = parseInt(req.query.offset, 10) || 0;
                
                const records = await db.getPracticeRecords(limit, offset);
                res.json(records);
            } catch (error) {
                console.error('Error getting practice records:', error);
                res.status(500).json({ error: 'Failed to get practice records' });
            }
        });

        app.get('/api/practice-records/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const record = await db.getPracticeRecordById(parseInt(id, 10));
                
                if (!record) {
                    return res.status(404).json({ error: 'Practice record not found' });
                }
                
                res.json(record);
            } catch (error) {
                console.error('Error getting practice record:', error);
                res.status(500).json({ error: 'Failed to get practice record' });
            }
        });

        app.get('/api/practice-records/sheet/:sheetId', async (req, res) => {
            try {
                const { sheetId } = req.params;
                const limit = parseInt(req.query.limit, 10) || 50;
                
                const records = await db.getPracticeRecordsBySheetId(sheetId, limit);
                res.json(records);
            } catch (error) {
                console.error('Error getting practice records by sheet:', error);
                res.status(500).json({ error: 'Failed to get practice records' });
            }
        });

        app.delete('/api/practice-records/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const deleted = await db.deletePracticeRecord(parseInt(id, 10));
                
                if (!deleted) {
                    return res.status(404).json({ error: 'Practice record not found' });
                }
                
                res.json({ success: true });
            } catch (error) {
                console.error('Error deleting practice record:', error);
                res.status(500).json({ error: 'Failed to delete practice record' });
            }
        });

        app.get('/api/stats', async (req, res) => {
            try {
                const stats = await db.getPracticeStats();
                res.json(stats);
            } catch (error) {
                console.error('Error getting stats:', error);
                res.status(500).json({ error: 'Failed to get stats' });
            }
        });

        app.get('/api/health', (req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });

        app.use((req, res) => {
            res.status(404).json({ error: 'Endpoint not found' });
        });

        app.use((err, req, res, next) => {
            console.error('Server error:', err);
            res.status(500).json({ error: 'Internal server error' });
        });

        app.listen(PORT, () => {
            console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🎹 Piano Trainer Server is running!                      ║
║                                                            ║
║   📡 Server:   http://localhost:${PORT}                      ║
║   🌐 Web App:  http://localhost:${PORT}                      ║
║   📊 API:      http://localhost:${PORT}/api                  ║
║                                                            ║
║   💾 Database: SQLite (server/piano_trainer.db)            ║
║                                                            ║
║   📖 Usage:                                                ║
║      1. Open http://localhost:${PORT} in Chrome/Edge       ║
║      2. Connect your MIDI keyboard                         ║
║      3. Select a song and start practicing!                ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
