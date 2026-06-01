const EventEmitter = require('events');
const crypto = require('crypto');

class NFCReader extends EventEmitter {
  constructor(db) {
    super();
    this.db = db;
    this.isRunning = false;
    this.currentPoster = null;
    this.currentSessionId = null;
    this.simulatedTags = ['NFC001', 'NFC002', 'NFC003', 'NFC004', 'NFC005'];
    
    this.debounceDelay = 1000;
    this.lastTouchTime = 0;
    this.lastTouchTagId = null;
    this.isTransitioning = false;
    this.transitionLock = false;
    
    this.tagDataCache = new Map();
    
    this.carouselEnabled = false;
    this.carouselInterval = 5000;
    this.carouselTimer = null;
    this.carouselIndex = 0;
    this.carouselPosters = [];
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[NFC Reader] PC/SC simulation started...');
    console.log('[NFC Reader] Debounce delay:', this.debounceDelay + 'ms');
    console.log('[NFC Reader] Waiting for NFC tags...');
  }

  stop() {
    this.isRunning = false;
    console.log('[NFC Reader] Stopped');
  }

  _validateTagData(tagId, poster) {
    if (!tagId || typeof tagId !== 'string') {
      console.error('[NFC Reader] Invalid tag ID format');
      return false;
    }
    
    if (tagId.trim().length === 0) {
      console.error('[NFC Reader] Tag ID cannot be empty');
      return false;
    }
    
    if (poster) {
      if (!poster.title || typeof poster.title !== 'string') {
        console.error('[NFC Reader] Poster title validation failed');
        return false;
      }
      if (!poster.url || typeof poster.url !== 'string') {
        console.error('[NFC Reader] Poster URL validation failed');
        return false;
      }
      try {
        new URL(poster.url);
      } catch (e) {
        console.error('[NFC Reader] Invalid URL format:', poster.url);
        return false;
      }
    }
    
    return true;
  }

  _generateTagChecksum(tagId, poster) {
    const data = JSON.stringify({
      tagId,
      posterId: poster?.id || null,
      title: poster?.title || '',
      url: poster?.url || ''
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  _verifyTagDataIntegrity(tagId, poster) {
    const cacheKey = tagId;
    const cachedData = this.tagDataCache.get(cacheKey);
    
    if (cachedData) {
      const currentChecksum = this._generateTagChecksum(tagId, poster);
      if (cachedData.checksum !== currentChecksum) {
        console.warn('[NFC Reader] Tag data checksum mismatch, possible corruption detected');
        return false;
      }
    }
    
    return true;
  }

  _cacheTagData(tagId, poster) {
    const checksum = this._generateTagChecksum(tagId, poster);
    this.tagDataCache.set(tagId, {
      poster,
      checksum,
      cachedAt: Date.now()
    });
  }

  async _endCurrentSession() {
    if (this.currentSessionId) {
      try {
        await this.db.endDisplaySession(this.currentSessionId);
        console.log('[NFC Reader] Session ended:', this.currentSessionId);
      } catch (error) {
        console.error('[NFC Reader] Error ending session:', error);
      }
      this.currentSessionId = null;
    }
  }

  async _startNewSession(poster, tagId = null, source = 'nfc') {
    try {
      const session = await this.db.startDisplaySession(poster.id, tagId, source);
      this.currentSessionId = session.sessionId;
      console.log('[NFC Reader] New session started:', session.sessionId, 'source:', source);
    } catch (error) {
      console.error('[NFC Reader] Error starting session:', error);
    }
  }

  async simulateTagRead(tagId) {
    if (!this.isRunning) {
      console.log('[NFC Reader] Not running, cannot read tag');
      return null;
    }

    const now = Date.now();
    
    if (this.transitionLock) {
      console.log('[NFC Reader] Transition locked, ignoring touch:', tagId);
      return null;
    }

    if (now - this.lastTouchTime < this.debounceDelay) {
      if (tagId === this.lastTouchTagId) {
        console.log('[NFC Reader] Debounce: ignoring duplicate touch:', tagId);
        return null;
      }
    }

    this.transitionLock = true;
    this.lastTouchTime = now;
    this.lastTouchTagId = tagId;

    if (this.carouselEnabled) {
      this.stopCarousel();
    }

    try {
      console.log(`[NFC Reader] Tag detected: ${tagId}`);
      
      const poster = await this.db.getPosterByTagId(tagId);
      
      if (!this._validateTagData(tagId, poster)) {
        console.error('[NFC Reader] Tag data validation failed for:', tagId);
        this.emit('tag-error', { tagId, error: 'Validation failed' });
        this.transitionLock = false;
        return null;
      }
      
      if (!this._verifyTagDataIntegrity(tagId, poster)) {
        console.warn('[NFC Reader] Data integrity verification failed, re-caching...');
      }
      
      this._cacheTagData(tagId, poster);
      
      const touchRecord = await this.db.recordTouch(tagId, poster ? poster.id : null);
      
      const tagData = {
        tagId,
        poster: poster || null,
        timestamp: new Date().toISOString(),
        touchId: touchRecord.id,
        verified: true,
        source: 'nfc'
      };

      if (poster) {
        await this._endCurrentSession();
        this.currentPoster = poster;
        await this._startNewSession(poster, tagId, 'nfc');
        console.log(`[NFC Reader] Matched poster: ${poster.title} -> ${poster.url}`);
      } else {
        console.log(`[NFC Reader] No matching poster found for tag: ${tagId}`);
      }

      this.emit('tag-read', tagData);
      
      setTimeout(() => {
        this.transitionLock = false;
      }, this.debounceDelay);
      
      return tagData;
      
    } catch (error) {
      console.error('[NFC Reader] Error processing tag:', error);
      this.transitionLock = false;
      this.emit('tag-error', { tagId, error: error.message });
      return null;
    }
  }

  async startCarousel(interval = 5000) {
    if (this.carouselEnabled) {
      console.log('[NFC Reader] Carousel already running');
      return;
    }

    this.carouselInterval = interval;
    this.carouselEnabled = true;
    
    const allPosters = await this.db.getAllPosters();
    this.carouselPosters = allPosters;
    
    if (this.carouselPosters.length === 0) {
      console.log('[NFC Reader] No posters available for carousel');
      this.carouselEnabled = false;
      return;
    }

    console.log(`[NFC Reader] Starting carousel with ${this.carouselPosters.length} posters, interval: ${interval}ms`);
    
    this._runCarousel();
    this.carouselTimer = setInterval(() => this._runCarousel(), interval);
    
    this.emit('carousel-started', { interval, posterCount: this.carouselPosters.length });
  }

  async _runCarousel() {
    if (!this.carouselEnabled || this.carouselPosters.length === 0) return;

    const poster = this.carouselPosters[this.carouselIndex];
    this.carouselIndex = (this.carouselIndex + 1) % this.carouselPosters.length;

    if (!poster) return;

    try {
      await this._endCurrentSession();
      this.currentPoster = poster;
      await this._startNewSession(poster, null, 'carousel');

      const tagData = {
        tagId: `CAROUSEL-${poster.id}`,
        poster: poster,
        timestamp: new Date().toISOString(),
        source: 'carousel'
      };

      this.emit('tag-read', tagData);
      console.log(`[NFC Reader] Carousel: showing ${poster.title}`);
    } catch (error) {
      console.error('[NFC Reader] Carousel error:', error);
    }
  }

  stopCarousel() {
    if (!this.carouselEnabled) return;

    this.carouselEnabled = false;
    if (this.carouselTimer) {
      clearInterval(this.carouselTimer);
      this.carouselTimer = null;
    }
    
    console.log('[NFC Reader] Carousel stopped');
    this.emit('carousel-stopped');
  }

  async refreshCarouselPosters() {
    this.carouselPosters = await this.db.getAllPosters();
    this.carouselIndex = 0;
  }

  getCarouselStatus() {
    return {
      enabled: this.carouselEnabled,
      interval: this.carouselInterval,
      currentIndex: this.carouselIndex,
      posterCount: this.carouselPosters.length
    };
  }

  async writeTagData(tagId, posterData) {
    console.log(`[NFC Reader] Writing data to tag: ${tagId}`);
    
    if (!this._validateTagData(tagId, posterData)) {
      throw new Error('Tag data validation failed');
    }
    
    if (posterData.id) {
      await this.db.updatePoster(posterData.id, posterData);
    } else {
      await this.db.addPoster({ tag_id: tagId, ...posterData });
    }
    
    const poster = await this.db.getPosterByTagId(tagId);
    this._cacheTagData(tagId, poster);
    
    const verifyResult = this._verifyTagDataIntegrity(tagId, poster);
    if (!verifyResult) {
      throw new Error('Write verification failed - data corruption detected');
    }
    
    console.log(`[NFC Reader] Tag write successful and verified: ${tagId}`);
    return { success: true, tagId, poster };
  }

  getCurrentPoster() {
    return this.currentPoster;
  }

  getSimulatedTags() {
    return this.simulatedTags;
  }

  addSimulatedTag(tagId) {
    if (!this.simulatedTags.includes(tagId)) {
      this.simulatedTags.push(tagId);
    }
  }

  setDebounceDelay(delayMs) {
    this.debounceDelay = delayMs;
    console.log(`[NFC Reader] Debounce delay set to: ${delayMs}ms`);
  }

  clearTagCache(tagId = null) {
    if (tagId) {
      this.tagDataCache.delete(tagId);
    } else {
      this.tagDataCache.clear();
    }
  }
}

module.exports = NFCReader;