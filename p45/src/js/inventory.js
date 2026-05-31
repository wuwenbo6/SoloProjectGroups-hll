export class InventoryManager {
    constructor(shelfManager, rfidScanner) {
        this.shelfManager = shelfManager;
        this.rfidScanner = rfidScanner;
        
        this.isInventoryActive = false;
        this.inventoryStartTime = null;
        this.inventoryEndTime = null;
        this.tagScanRecords = [];
    }
    
    startInventory() {
        this.isInventoryActive = true;
        this.inventoryStartTime = Date.now();
        this.inventoryEndTime = null;
        this.tagScanRecords = [];
        this.shelfManager.resetAllTags();
        this.rfidScanner.reset();
    }
    
    stopInventory() {
        this.isInventoryActive = false;
        this.inventoryEndTime = Date.now();
    }
    
    recordTagScan(tagData) {
        this.tagScanRecords.push({
            tagId: tagData.id,
            position: tagData.position,
            metadata: tagData.metadata,
            scanTime: tagData.scanTime,
            distance: tagData.distance
        });
    }
    
    getStats() {
        const allTags = this.shelfManager.getAllTags();
        const scannedIds = new Set(this.tagScanRecords.map(r => r.tagId));
        
        return {
            total: allTags.length,
            scanned: scannedIds.size,
            missing: allTags.length - scannedIds.size
        };
    }
    
    generateReport() {
        const allTags = this.shelfManager.getAllTags();
        const scannedIds = new Set(this.tagScanRecords.map(r => r.tagId));
        
        const scannedTags = [];
        const missingTags = [];
        
        allTags.forEach(tag => {
            const scanRecord = this.tagScanRecords.find(r => r.tagId === tag.id);
            
            if (scanRecord) {
                scannedTags.push({
                    id: tag.id,
                    metadata: tag.metadata,
                    scanTime: scanRecord.scanTime,
                    distance: scanRecord.distance,
                    position: scanRecord.position
                });
            } else {
                missingTags.push({
                    id: tag.id,
                    metadata: tag.metadata,
                    expectedPosition: tag.position
                });
            }
        });
        
        const stats = this.getStats();
        
        return {
            reportId: `report_${Date.now()}`,
            startTime: this.inventoryStartTime,
            endTime: this.inventoryEndTime || Date.now(),
            duration: (this.inventoryEndTime || Date.now()) - (this.inventoryStartTime || Date.now()),
            stats: {
                total: stats.total,
                scanned: stats.scanned,
                missing: stats.missing,
                scanRate: stats.total > 0 ? (stats.scanned / stats.total * 100).toFixed(2) : 0
            },
            scannedTags: scannedTags,
            missingTags: missingTags,
            scanRecords: this.tagScanRecords
        };
    }
    
    exportReport(format = 'json') {
        const report = this.generateReport();
        
        if (format === 'json') {
            return JSON.stringify(report, null, 2);
        } else if (format === 'csv') {
            return this.convertToCSV(report);
        }
        
        return report;
    }
    
    convertToCSV(report) {
        let csv = 'RFID Inventory Report\n';
        csv += `Generated: ${new Date().toISOString()}\n\n`;
        
        csv += 'Summary\n';
        csv += `Total Tags,${report.stats.total}\n`;
        csv += `Scanned Tags,${report.stats.scanned}\n`;
        csv += `Missing Tags,${report.stats.missing}\n`;
        csv += `Scan Rate,${report.stats.scanRate}%\n\n`;
        
        csv += 'Scanned Tags\n';
        csv += 'Tag ID,Shelf ID,Level,Position,Scan Time,Distance\n';
        report.scannedTags.forEach(tag => {
            csv += `${tag.id},${tag.metadata?.shelfId || ''},${tag.metadata?.level || ''},${tag.metadata?.position || ''},${new Date(tag.scanTime).toISOString()},${tag.distance?.toFixed(2) || ''}\n`;
        });
        
        csv += '\nMissing Tags\n';
        csv += 'Tag ID,Shelf ID,Level,Position\n';
        report.missingTags.forEach(tag => {
            csv += `${tag.id},${tag.metadata?.shelfId || ''},${tag.metadata?.level || ''},${tag.metadata?.position || ''}\n`;
        });
        
        return csv;
    }
    
    downloadReport(format = 'json') {
        const content = this.exportReport(format);
        const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inventory_report_${Date.now()}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
    }
}
