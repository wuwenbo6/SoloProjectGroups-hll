import * as THREE from 'three';

export class RFIDScanner {
    constructor(scene, agv, shelfManager) {
        this.scene = scene;
        this.agv = agv;
        this.shelfManager = shelfManager;
        
        this.isScanning = false;
        this.scanRange = agv.scanRange;
        this.scanInterval = 500;
        this.lastScanTime = 0;
        this.scannedTags = new Set();
        
        this.listeners = {};
        this.scanIntensity = 0;
    }
    
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }
    
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
    
    startScanning() {
        this.isScanning = true;
        this.scannedTags.clear();
        this.agv.showScanRing(true);
    }
    
    stopScanning() {
        this.isScanning = false;
        this.agv.showScanRing(false);
    }
    
    update() {
        if (!this.isScanning) return;
        
        this.scanIntensity += 0.1;
        this.agv.updateScanRing(this.scanIntensity);
        
        const now = Date.now();
        if (now - this.lastScanTime < this.scanInterval) return;
        
        this.lastScanTime = now;
        this.performScan();
    }
    
    performScan() {
        const agvPos = this.agv.getPosition();
        const tagsInRange = this.shelfManager.getTagsInRange(agvPos, this.scanRange);
        
        tagsInRange.forEach(tag => {
            if (!this.scannedTags.has(tag.id)) {
                this.scannedTags.add(tag.id);
                this.shelfManager.highlightTag(tag.id, true);
                
                this.emit('tagScanned', {
                    id: tag.id,
                    position: tag.worldPosition || tag.position,
                    metadata: tag.metadata,
                    scanTime: Date.now(),
                    distance: tag.distance
                });
            }
        });
    }
    
    getScannedTags() {
        return Array.from(this.scannedTags);
    }
    
    isTagScanned(tagId) {
        return this.scannedTags.has(tagId);
    }
    
    setScanRange(range) {
        this.scanRange = range;
    }
    
    setScanInterval(interval) {
        this.scanInterval = interval;
    }
    
    reset() {
        this.scannedTags.clear();
    }
}
