const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const db = require('./database');

class AdManager {
  constructor() {
    this.activeAdSessions = new Map();
    this.defaultAds = [
      {
        id: 'demo_ad_001',
        name: 'Demo Ad 1',
        url: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=video%20advertisement%20banner%20blue&image_size=landscape_16_9',
        duration: 10
      },
      {
        id: 'demo_ad_002',
        name: 'Demo Ad 2',
        url: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=promotional%20video%20ad%20green&image_size=landscape_16_9',
        duration: 15
      }
    ];
    
    this.ensureAdsFolder();
  }

  ensureAdsFolder() {
    if (!fs.existsSync(config.ads.adsFolder)) {
      fs.mkdirSync(config.ads.adsFolder, { recursive: true });
    }
  }

  startAdScheduler(sessionId, streamStartTime) {
    if (this.activeAdSessions.has(sessionId)) {
      return this.activeAdSessions.get(sessionId);
    }

    const adSession = {
      sessionId,
      streamStartTime,
      lastAdInserted: [],
      nextAdPosition: config.ads.defaultInterval,
      interval: config.ads.defaultInterval,
      timer: null,
      isRunning: false
    };

    this.activeAdSessions.set(sessionId, adSession);
    this.scheduleNextAd(sessionId);
    return adSession;
  }

  scheduleNextAd(sessionId) {
    const adSession = this.activeAdSessions.get(sessionId);
    if (!adSession) return;

    adSession.isRunning = true;
    
    adSession.timer = setInterval(() => {
      const elapsed = (Date.now() - adSession.streamStartTime) / 1000;
      
      if (elapsed >= adSession.nextAdPosition) {
        this.insertAd(sessionId, sessionId);
        adSession.nextAdPosition += adSession.interval;
        
        db.recordPlaybackEvent(
          sessionId,
          null,
          'ad_scheduled',
          { position: adSession.nextAdPosition }
        );
      }
    }, 1000);
  }

  insertAd(sessionId, customAd = null) {
    const adSession = this.activeAdSessions.get(sessionId);
    if (!adSession) return null;

    const ad = customAd || this.defaultAds[adSession.lastAdInserted.length % this.defaultAds.length];
    const adId = uuidv4();
    const position = (Date.now() - adSession.streamStartTime) / 1000;

    const scheduledAd = db.scheduleAd(
      sessionId,
      adId,
      ad.url,
      ad.duration,
      Math.floor(position)
    );

    const adRecord = {
      id: adId,
      sessionId,
      adUrl: ad.url,
      duration: ad.duration,
      position: Math.floor(position),
      status: 'scheduled',
      scte35: this.generateSCTE35Marker(ad.duration),
      insertedAt: new Date().toISOString()
    };

    adSession.lastAdInserted.push(adRecord);

    console.log(`[AdManager] Ad scheduled for session ${sessionId} at ${position}s, duration ${ad.duration}s`);

    return adRecord;
  }

  insertAdAtPosition(sessionId, adUrl, duration, positionSeconds) {
    const adId = uuidv4();
    
    db.scheduleAd(sessionId, adId, adUrl, duration, positionSeconds);

    const adRecord = {
      id: adId,
      sessionId,
      adUrl,
      duration,
      position: positionSeconds,
      status: 'scheduled',
      scte35: this.generateSCTE35Marker(duration),
      insertedAt: new Date().toISOString()
    };

    db.recordPlaybackEvent(
      sessionId,
      null,
      'ad_insert_manual',
      { adId, position: positionSeconds, duration }
    );

    return adRecord;
  }

  generateSCTE35Marker(durationSeconds) {
    const ptsAdjust = 0;
    const spliceDuration = Math.floor(durationSeconds * 90000);
    
    const scte35 = {
      table_id: '0xFC',
      section_syntax_indicator: 0,
      private_indicator: 0,
      section_length: 42,
      protocol_version: 0,
      encrypted_packet: 0,
      encryption_algorithm: 0,
      pts_adjustment: ptsAdjust,
      cw_index: '0xFF',
      tier: '0xFFF',
      splice_command_length: 15,
      splice_command_type: 5,
      splice_event_id: Date.now() & 0xFFFFFFFF,
      splice_event_cancel_indicator: 0,
      out_of_network_indicator: 1,
      program_splice_flag: 1,
      duration_flag: 1,
      splice_immediate_flag: 0,
      splice_time: {
        time_specified_flag: 1,
        pts_time: 0
      },
      break_duration: {
        auto_return: 1,
        duration: spliceDuration
      },
      unique_program_id: 1,
      avail_num: 0,
      avails_expected: 0
    };

    return `/DAl${scte35.splice_event_id}.${spliceDuration}`;
  }

  getScheduledAds(sessionId) {
    return db.getScheduledAds(sessionId);
  }

  getAdBreakInfo(sessionId) {
    const adSession = this.activeAdSessions.get(sessionId);
    if (!adSession) return [];
    return adSession.lastAdInserted;
  }

  recordAdPlayback(adId, viewerId, sessionId) {
    db.recordAdPlayback(adId, viewerId, sessionId);
    db.recordPlaybackEvent(
      sessionId,
      viewerId,
      'ad_start',
      { adId }
    );
  }

  completeAdPlayback(adId, viewerId, completionPercentage, clicked = false) {
    db.updateAdPlaybackCompletion(adId, viewerId, completionPercentage, clicked);
    db.recordPlaybackEvent(
      null,
      viewerId,
      'ad_complete',
      { adId, completionPercentage, clicked }
    );
  }

  stopAdScheduler(sessionId) {
    const adSession = this.activeAdSessions.get(sessionId);
    if (adSession && adSession.timer) {
      clearInterval(adSession.timer);
      adSession.isRunning = false;
    }
    this.activeAdSessions.delete(sessionId);
    
    db.recordPlaybackEvent(sessionId, null, 'ad_scheduler_stopped', {});
  }

  getSessionAds(sessionId) {
    const adSession = this.activeAdSessions.get(sessionId);
    if (!adSession) return null;
    return {
      sessionId,
      adsInserted: adSession.lastAdInserted.length,
      nextAdPosition: adSession.nextAdPosition,
      interval: adSession.interval,
      ads: adSession.lastAdInserted
    };
  }

  getAllActiveSessions() {
    const result = [];
    for (const [sessionId, session] of this.activeAdSessions) {
      result.push({
        sessionId,
        adCount: session.lastAdInserted.length,
        nextAdPosition: session.nextAdPosition
      });
    }
    return result;
  }
}

const adManager = new AdManager();

module.exports = adManager;
