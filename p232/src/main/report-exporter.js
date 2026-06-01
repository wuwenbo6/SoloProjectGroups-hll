const fs = require('fs');

class ReportExporter {
  static exportCSV(entries, outputPath, options = {}) {
    const includeDeletedOnly = options.includeDeletedOnly !== false;
    const includeAnalysis = options.includeAnalysis !== false;

    const filtered = includeDeletedOnly
      ? entries.filter((e) => !e.isInUse)
      : entries;

    const headers = [
      'Entry Index',
      'File Name',
      'Parent Entry',
      'Type',
      'Status',
      'File Size (bytes)',
      'File Size (formatted)',
      'Created',
      'Modified',
      'Is Compressed',
      'Is Encrypted',
      'Data Attribute Type',
      'Data Runs Count',
    ];

    if (includeAnalysis) {
      headers.push(
        'Recovery Probability %',
        'Recovery Level',
        'Recommended Action'
      );
    }

    const lines = [headers.join(',')];

    for (const entry of filtered) {
      const row = [
        entry.entryIndex || '-',
        this.escapeCSV(entry.fileName || '-'),
        entry.parentEntryIndex || '-',
        entry.isDirectory ? 'Directory' : 'File',
        entry.isInUse ? 'Active' : 'Deleted',
        entry.fileSize || 0,
        this.formatSize(entry.fileSize || 0),
        this.formatDate(entry.createTime),
        this.formatDate(entry.modifyTime),
        entry.isCompressed ? 'Yes' : 'No',
        entry.isEncrypted ? 'Yes' : 'No',
        entry.dataAttribute ? (entry.dataAttribute.resident ? 'Resident' : 'Non-Resident') : 'None',
        entry.dataAttribute?.data?.dataRuns?.length || 0,
      ];

      if (includeAnalysis && entry.recovery) {
        row.push(
          entry.recovery.probabilityPercent,
          entry.recovery.level,
          this.escapeCSV(entry.recovery.recommendedAction)
        );
      }

      lines.push(row.join(','));
    }

    const csvContent = lines.join('\n');
    fs.writeFileSync(outputPath, '\ufeff' + csvContent, 'utf8');

    return {
      success: true,
      totalEntries: entries.length,
      exportedEntries: filtered.length,
      path: outputPath,
    };
  }

  static exportSignatureResults(results, outputPath) {
    const headers = [
      'Signature Name',
      'Extension',
      'Category',
      'Offset (hex)',
      'Offset (decimal)',
      'Cluster Offset',
      'Estimated Size (bytes)',
      'Estimated Size (formatted)',
      'Confidence %',
      'Validation Score',
    ];

    const lines = [headers.join(',')];

    for (const result of results) {
      const row = [
        result.signatureName,
        result.extension,
        result.category,
        '0x' + result.offset.toString(16).toUpperCase(),
        result.offset,
        result.clusterOffset,
        result.estimatedSize || 0,
        result.estimatedSize > 0 ? this.formatSize(result.estimatedSize) : 'Unknown',
        Math.round((result.confidence || 0) * 100),
        result.validationScore || 0,
      ];
      lines.push(row.join(','));
    }

    const csvContent = lines.join('\n');
    fs.writeFileSync(outputPath, '\ufeff' + csvContent, 'utf8');

    return {
      success: true,
      exportedResults: results.length,
      path: outputPath,
    };
  }

  static exportFullReport(analysis, signatureResults, outputPath) {
    const content = [];

    content.push('=== NTFS Recovery Report ===');
    content.push('Generated: ' + new Date().toISOString());
    content.push('');

    if (analysis) {
      content.push('--- Summary ---');
      content.push(`Total MFT Entries: ${analysis.totalEntries}`);
      content.push(`Active Files: ${analysis.activeEntries}`);
      content.push(`Deleted Files: ${analysis.deletedEntries}`);
      content.push('');

      if (analysis.summary) {
        content.push('--- Recovery Analysis ---');
        content.push(`Excellent: ${analysis.summary.byLevel.excellent}`);
        content.push(`Good: ${analysis.summary.byLevel.good}`);
        content.push(`Fair: ${analysis.summary.byLevel.fair}`);
        content.push(`Poor: ${analysis.summary.byLevel.poor}`);
        content.push(`Very Poor: ${analysis.summary.byLevel.very_poor}`);
        content.push('');
        content.push(`Total Recoverable Files: ${analysis.summary.totalRecoverableFiles}`);
        content.push(`Total Recoverable Size: ${this.formatSize(analysis.summary.totalRecoverableSize)}`);
        content.push(`Average Recovery Probability: ${analysis.summary.averageProbability}%`);
        content.push('');
      }
    }

    if (signatureResults && signatureResults.length > 0) {
      content.push('--- Signature Scan Results ---');
      content.push(`Total Signatures Found: ${signatureResults.length}`);

      const byCategory = {};
      for (const r of signatureResults) {
        byCategory[r.category] = (byCategory[r.category] || 0) + 1;
      }
      for (const [cat, count] of Object.entries(byCategory)) {
        content.push(`  ${cat}: ${count}`);
      }
      content.push('');
    }

    if (analysis?.entries?.length > 0) {
      content.push('--- Deleted Files List (Top 50 by Recovery Probability) ---');
      const sorted = [...analysis.entries]
        .sort((a, b) => b.recovery?.probability - a.recovery?.probability)
        .slice(0, 50);

      for (const entry of sorted) {
        const prob = entry.recovery?.probabilityPercent || 0;
        const size = this.formatSize(entry.fileSize || 0);
        content.push(`[${prob}%] ${entry.fileName || 'Unknown'} - ${size}`);
      }
      content.push('');
    }

    fs.writeFileSync(outputPath, content.join('\n'), 'utf8');

    return {
      success: true,
      path: outputPath,
    };
  }

  static escapeCSV(value) {
    if (typeof value !== 'string') return String(value);
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  static formatSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
  }

  static formatDate(timestamp) {
    if (!timestamp) return '-';
    return new Date(timestamp).toISOString();
  }
}

module.exports = { ReportExporter };
