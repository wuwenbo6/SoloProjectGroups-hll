const { SIGNATURES } = require('./signature-scanner');

class RecoveryAnalyzer {
  constructor(parser) {
    this.parser = parser;
  }

  analyze(entries) {
    const deletedEntries = entries.filter((e) => !e.isInUse && e.fileName);
    const analyzed = [];

    for (const entry of deletedEntries) {
      const analysis = this.analyzeEntry(entry);
      analyzed.push({
        ...entry,
        recovery: analysis,
      });
    }

    analyzed.sort((a, b) => b.recovery.probability - a.recovery.probability);

    return {
      totalEntries: entries.length,
      activeEntries: entries.filter((e) => e.isInUse).length,
      deletedEntries: deletedEntries.length,
      entries: analyzed,
      summary: this.buildSummary(analyzed),
    };
  }

  analyzeEntry(entry) {
    const factors = [];
    let probability = 0.0;

    const hasValidFileName = entry.fileName && entry.fileName.length > 0 && !entry.fileName.includes('\x00');
    if (hasValidFileName) {
      probability += 0.15;
      factors.push({ factor: 'Valid filename', weight: 0.15, positive: true });
    } else {
      factors.push({ factor: 'Missing/corrupted filename', weight: 0.0, positive: false });
    }

    const hasDataAttr = entry.dataAttribute !== null && entry.dataAttribute !== undefined;
    if (hasDataAttr) {
      if (entry.dataAttribute.resident) {
        probability += 0.30;
        factors.push({ factor: 'Resident data (stored in MFT)', weight: 0.30, positive: true });
      } else {
        probability += 0.15;
        factors.push({ factor: 'Non-resident data (stored in clusters)', weight: 0.15, positive: true });
      }
    } else {
      factors.push({ factor: 'No data attribute found', weight: 0.0, positive: false });
    }

    if (hasDataAttr && !entry.dataAttribute.resident && entry.dataAttribute.data) {
      const dataRuns = entry.dataAttribute.data.dataRuns;
      if (dataRuns && dataRuns.length > 0) {
        const totalClusters = dataRuns.reduce((sum, r) => sum + r.length, 0);
        const expectedClusters = Math.ceil(entry.fileSize / this.parser.clusterSize);

        if (totalClusters >= expectedClusters) {
          probability += 0.25;
          factors.push({ factor: 'Complete cluster chain', weight: 0.25, positive: true });
        } else if (totalClusters > 0) {
          const ratio = totalClusters / expectedClusters;
          const partialWeight = 0.25 * ratio;
          probability += partialWeight;
          factors.push({
            factor: `Partial cluster chain (${Math.round(ratio * 100)}% allocated)`,
            weight: partialWeight,
            positive: ratio > 0.5,
          });
        }

        const hasSparse = dataRuns.some((r) => r.isSparse);
        if (hasSparse) {
          probability -= 0.10;
          factors.push({ factor: 'Sparse regions detected', weight: -0.10, positive: false });
        }
      } else {
        factors.push({ factor: 'No data run information', weight: 0.0, positive: false });
      }
    }

    if (entry.isCompressed) {
      probability -= 0.08;
      factors.push({ factor: 'File is LZNT1 compressed (requires intact compression units)', weight: -0.08, positive: false });
    }

    if (entry.isEncrypted) {
      probability -= 0.20;
      factors.push({ factor: 'File is encrypted (requires decryption key)', weight: -0.20, positive: false });
    }

    if (entry.fileSize > 0) {
      probability += 0.10;
      factors.push({ factor: 'File size known', weight: 0.10, positive: true });

      if (entry.fileSize <= this.parser.mftRecordSize - 200) {
        probability += 0.10;
        factors.push({ factor: 'Small file (likely resident)', weight: 0.10, positive: true });
      }
    }

    if (entry.sequenceNumber > 1) {
      probability -= 0.05;
      factors.push({ factor: 'MFT entry was reused', weight: -0.05, positive: false });
    }

    const extension = this.getExtension(entry.fileName);
    const knownType = SIGNATURES.find((s) => s.extension === extension);
    if (knownType) {
      probability += 0.05;
      factors.push({ factor: `Known file type: ${knownType.name}`, weight: 0.05, positive: true });
    }

    if (entry.isDirectory) {
      probability += 0.10;
      factors.push({ factor: 'Directory (metadata likely intact)', weight: 0.10, positive: true });
    }

    probability = Math.max(0, Math.min(1, probability));

    return {
      probability,
      probabilityPercent: Math.round(probability * 100),
      level: this.getRecoveryLevel(probability),
      factors,
      recommendedAction: this.getRecommendedAction(probability, hasDataAttr, entry.dataAttribute?.resident),
    };
  }

  getRecoveryLevel(probability) {
    if (probability >= 0.8) return 'excellent';
    if (probability >= 0.6) return 'good';
    if (probability >= 0.4) return 'fair';
    if (probability >= 0.2) return 'poor';
    return 'very_poor';
  }

  getRecommendedAction(probability, hasDataAttr, isResident) {
    if (probability >= 0.8) {
      return 'File can likely be fully recovered. Data clusters appear intact.';
    }
    if (probability >= 0.6) {
      return 'File can likely be recovered with minor corruption. Some clusters may have been overwritten.';
    }
    if (probability >= 0.4) {
      return 'Partial recovery possible. Significant portions of data may be corrupted or overwritten.';
    }
    if (probability >= 0.2) {
      return 'Recovery unlikely. Most data clusters appear to have been reallocated. Try signature-based carving.';
    }
    return 'Recovery very unlikely. Data has almost certainly been overwritten.';
  }

  getExtension(fileName) {
    if (!fileName) return '';
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex === -1) return '';
    return fileName.substring(dotIndex).toLowerCase();
  }

  buildSummary(analyzed) {
    const byLevel = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
      very_poor: 0,
    };

    let totalRecoverableSize = 0;

    for (const entry of analyzed) {
      byLevel[entry.recovery.level]++;
      if (entry.recovery.probability >= 0.4 && entry.fileSize) {
        totalRecoverableSize += entry.fileSize;
      }
    }

    return {
      byLevel,
      totalRecoverableSize,
      totalRecoverableFiles: byLevel.excellent + byLevel.good + byLevel.fair,
      averageProbability: analyzed.length > 0
        ? Math.round((analyzed.reduce((sum, e) => sum + e.recovery.probability, 0) / analyzed.length) * 100)
        : 0,
    };
  }
}

module.exports = { RecoveryAnalyzer };
