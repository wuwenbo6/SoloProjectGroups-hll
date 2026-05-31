const express = require('express');
const router = express.Router();
const db = require('../database/init');

router.get('/schedules', (req, res) => {
  try {
    const schedules = db.prepare(`
      SELECT rs.*, c.name as camera_name, c.ip_address
      FROM recording_schedules rs
      JOIN cameras c ON rs.camera_id = c.id
      ORDER BY rs.created_at DESC
    `).all();
    res.json({ success: true, schedules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/schedules/:id', (req, res) => {
  try {
    const schedule = db.prepare('SELECT * FROM recording_schedules WHERE id = ?').get(req.params.id);
    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    res.json({ success: true, schedule });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/schedules', (req, res) => {
  try {
    const { camera_id, name, days_of_week, start_time, end_time, storage_path, segment_duration, enabled = 1 } = req.body;

    if (!camera_id || !name || !days_of_week || !start_time || !end_time) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const result = db.prepare(`
      INSERT INTO recording_schedules 
      (camera_id, name, enabled, days_of_week, start_time, end_time, storage_path, segment_duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(camera_id, name, enabled, days_of_week, start_time, end_time, storage_path, segment_duration || 300);

    const schedule = db.prepare('SELECT * FROM recording_schedules WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, schedule });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/schedules/:id', (req, res) => {
  try {
    const { name, enabled, days_of_week, start_time, end_time, storage_path, segment_duration } = req.body;
    const scheduleId = req.params.id;

    const existing = db.prepare('SELECT * FROM recording_schedules WHERE id = ?').get(scheduleId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    db.prepare(`
      UPDATE recording_schedules 
      SET name = COALESCE(?, name),
          enabled = COALESCE(?, enabled),
          days_of_week = COALESCE(?, days_of_week),
          start_time = COALESCE(?, start_time),
          end_time = COALESCE(?, end_time),
          storage_path = COALESCE(?, storage_path),
          segment_duration = COALESCE(?, segment_duration),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, enabled, days_of_week, start_time, end_time, storage_path, segment_duration, scheduleId);

    const schedule = db.prepare('SELECT * FROM recording_schedules WHERE id = ?').get(scheduleId);
    res.json({ success: true, schedule });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/schedules/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM recording_schedules WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/recordings', (req, res) => {
  try {
    const { camera_id, limit = 100, offset = 0 } = req.query;
    
    let query = `
      SELECT r.*, c.name as camera_name
      FROM recordings r
      JOIN cameras c ON r.camera_id = c.id
    `;
    const params = [];
    
    if (camera_id) {
      query += ' WHERE r.camera_id = ?';
      params.push(camera_id);
    }
    
    query += ' ORDER BY r.start_time DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const recordings = db.prepare(query).all(...params);
    res.json({ success: true, recordings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
