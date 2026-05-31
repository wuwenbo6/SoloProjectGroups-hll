const express = require('express');
const router = express.Router();
const EventSubscriptionService = require('../services/EventSubscriptionService');

router.get('/', (req, res) => {
  try {
    const { camera_id, limit = 100, offset = 0 } = req.query;
    const events = EventSubscriptionService.getEvents(
      camera_id ? parseInt(camera_id) : null,
      parseInt(limit),
      parseInt(offset)
    );
    res.json({ success: true, events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/unread-count', (req, res) => {
  try {
    const { camera_id } = req.query;
    const count = EventSubscriptionService.getUnreadCount(
      camera_id ? parseInt(camera_id) : null
    );
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/read', (req, res) => {
  try {
    EventSubscriptionService.markEventAsRead(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/subscribe', async (req, res) => {
  try {
    const { camera_id, event_type = 'Motion', config = {} } = req.body;
    
    if (!camera_id) {
      return res.status(400).json({ success: false, error: 'camera_id is required' });
    }

    const subscription = await EventSubscriptionService.subscribeToEvents(
      camera_id,
      event_type,
      config
    );
    
    res.json({ success: true, subscription });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/unsubscribe', (req, res) => {
  try {
    const { camera_id, event_type = 'Motion' } = req.body;
    
    if (!camera_id) {
      return res.status(400).json({ success: false, error: 'camera_id is required' });
    }

    EventSubscriptionService.unsubscribe(camera_id, event_type);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
