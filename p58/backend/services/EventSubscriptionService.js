const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('../database/init');
const OnvifService = require('./OnvifService');

class EventSubscriptionService {
  static subscriptions = new Map();
  static eventServer = null;
  static eventCallbacks = new Map();

  static init() {
    this.startEventServer();
    this.loadSubscriptions();
  }

  static startEventServer() {
    const port = 8090;
    this.eventServer = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/onvif/event') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            this.handleEventNotification(body, req.socket.remoteAddress);
          } catch (e) {
            console.error('Event parsing error:', e);
          }
          res.writeHead(200);
          res.end();
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    this.eventServer.listen(port, () => {
      console.log(`Event notification server listening on port ${port}`);
    });
  }

  static loadSubscriptions() {
    const subscriptions = db.prepare('SELECT * FROM event_subscriptions WHERE enabled = 1').all();
    for (const sub of subscriptions) {
      this.subscribeToEvents(sub.camera_id, sub.event_type, JSON.parse(sub.config || '{}'));
    }
  }

  static async subscribeToEvents(cameraId, eventType = 'Motion', config = {}) {
    const key = `${cameraId}_${eventType}`;
    
    if (this.subscriptions.has(key)) {
      return this.subscriptions.get(key);
    }

    try {
      const camera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(cameraId);
      if (!camera) {
        throw new Error('Camera not found');
      }

      const cam = await OnvifService.connectCamera(
        camera.ip_address,
        camera.port,
        camera.username || '',
        camera.password || ''
      );

      if (!cam.events) {
        console.log(`Camera ${cameraId} does not support ONVIF events`);
        this.startPollingMotionDetection(cameraId, cam, config);
        return { polling: true };
      }

      const subscription = await this.createPullPointSubscription(cam);
      this.subscriptions.set(key, { cameraId, eventType, subscription, cam });

      this.startPullingEvents(cameraId, cam, subscription);

      db.prepare(`
        INSERT OR REPLACE INTO event_subscriptions (camera_id, event_type, enabled, config)
        VALUES (?, ?, 1, ?)
      `).run(cameraId, eventType, JSON.stringify(config));

      return subscription;
    } catch (error) {
      console.error(`Failed to subscribe to events for camera ${cameraId}:`, error);
      throw error;
    }
  }

  static async createPullPointSubscription(cam) {
    return new Promise((resolve, reject) => {
      cam.events.createPullPointSubscription((err, subscription) => {
        if (err) reject(err);
        else resolve(subscription);
      });
    });
  }

  static startPullingEvents(cameraId, cam, subscription) {
    const pullEvents = async () => {
      try {
        const messages = await this.pullMessages(cam);
        
        for (const msg of messages) {
          this.processEvent(cameraId, msg);
        }
      } catch (error) {
        console.error('Pull events error:', error);
      }

      setTimeout(() => pullEvents(), 1000);
    };

    pullEvents();
  }

  static async pullMessages(cam) {
    return new Promise((resolve, reject) => {
      if (!cam.events || !cam.events.pullMessages) {
        resolve([]);
        return;
      }

      cam.events.pullMessages({
        MessageLimit: 10,
        Timeout: 'PT2S'
      }, (err, result) => {
        if (err) {
          resolve([]);
        } else {
          const messages = result?.NotificationMessage || [];
          resolve(Array.isArray(messages) ? messages : [messages]);
        }
      });
    });
  }

  static startPollingMotionDetection(cameraId, cam, config = {}) {
    const interval = config.interval || 2000;
    const sensitivity = config.sensitivity || 0.5;
    
    let lastFrame = null;
    let lastMotionTime = 0;
    const cooldown = config.cooldown || 5000;

    const poll = async () => {
      try {
        const currentTime = Date.now();
        if (currentTime - lastMotionTime < cooldown) {
          return;
        }

        const motionDetected = await this.detectMotion(cam, lastFrame, sensitivity);
        
        if (motionDetected) {
          this.processEvent(cameraId, {
            topic: 'MotionAlarm',
            data: { State: 'true' }
          });
          lastMotionTime = currentTime;
        }
      } catch (error) {
        console.error('Motion polling error:', error);
      }
    };

    const key = `${cameraId}_Motion`;
    const intervalId = setInterval(poll, interval);
    this.subscriptions.set(key, { cameraId, eventType: 'Motion', polling: true, intervalId });
  }

  static async detectMotion(cam, lastFrame, sensitivity) {
    return false;
  }

  static handleEventNotification(xmlData, sourceIp) {
    console.log('Received event from:', sourceIp);
    this.processEvent(null, { raw: xmlData });
  }

  static processEvent(cameraId, event) {
    let eventType = 'Unknown';
    let eventState = null;

    try {
      const topic = event.Topic || event.topic || '';
      
      if (topic.includes('Motion') || topic.includes('MotionAlarm')) {
        eventType = 'Motion';
      } else if (topic.includes('VideoLoss')) {
        eventType = 'VideoLoss';
      } else if (topic.includes('Tampering')) {
        eventType = 'Tampering';
      } else if (topic.includes('Relay')) {
        eventType = 'Relay';
      } else if (event.topic === 'MotionAlarm') {
        eventType = 'Motion';
      }

      const data = event.Message?.Data?.SimpleItem || event.data || {};
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.$?.Name === 'State') {
            eventState = item.$.Value === 'true';
          }
        }
      } else if (data.State !== undefined) {
        eventState = data.State === 'true' || data.State === true;
      }

    } catch (e) {
      console.error('Event parsing error:', e);
    }

    if (eventType === 'Motion' && eventState === true) {
      this.recordMotionEvent(cameraId, event);
      this.notifyCallbacks('motion', { cameraId, event, timestamp: new Date() });
    }
  }

  static recordMotionEvent(cameraId, event) {
    const eventTime = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO motion_events (camera_id, event_type, event_time, metadata)
      VALUES (?, ?, ?, ?)
    `).run(
      cameraId,
      'Motion',
      eventTime,
      JSON.stringify(event)
    );
  }

  static getEvents(cameraId = null, limit = 100, offset = 0) {
    let query = `
      SELECT me.*, c.name as camera_name
      FROM motion_events me
      LEFT JOIN cameras c ON me.camera_id = c.id
    `;
    const params = [];

    if (cameraId) {
      query += ' WHERE me.camera_id = ?';
      params.push(cameraId);
    }

    query += ' ORDER BY me.event_time DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.prepare(query).all(...params);
  }

  static markEventAsRead(eventId) {
    db.prepare('UPDATE motion_events SET read = 1 WHERE id = ?').run(eventId);
  }

  static getUnreadCount(cameraId = null) {
    let query = 'SELECT COUNT(*) as count FROM motion_events WHERE read = 0';
    const params = [];

    if (cameraId) {
      query += ' AND camera_id = ?';
      params.push(cameraId);
    }

    return db.prepare(query).get(...params).count;
  }

  static on(eventType, callback) {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, []);
    }
    this.eventCallbacks.get(eventType).push(callback);
  }

  static notifyCallbacks(eventType, data) {
    const callbacks = this.eventCallbacks.get(eventType) || [];
    for (const cb of callbacks) {
      try {
        cb(data);
      } catch (e) {
        console.error('Callback error:', e);
      }
    }
  }

  static unsubscribe(cameraId, eventType = 'Motion') {
    const key = `${cameraId}_${eventType}`;
    const subscription = this.subscriptions.get(key);
    
    if (subscription) {
      if (subscription.intervalId) {
        clearInterval(subscription.intervalId);
      }
      this.subscriptions.delete(key);
    }

    db.prepare('DELETE FROM event_subscriptions WHERE camera_id = ? AND event_type = ?').run(cameraId, eventType);
  }
}

module.exports = EventSubscriptionService;
