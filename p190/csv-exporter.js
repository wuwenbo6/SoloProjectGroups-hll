class CSVExporter {
  static exportObjectDictionary(results, options = {}) {
    const delimiter = options.delimiter || ',';
    const includeHeader = options.includeHeader !== false;
    const includeName = options.includeName !== false;
    const encoding = options.encoding || 'utf8';

    const headers = [];
    headers.push('Index');
    headers.push('SubIndex');
    if (includeName) headers.push('Name');
    headers.push('Data (Hex)');
    headers.push('Length');
    headers.push('Transfer Type');
    headers.push('Status');
    if (options.includeError) headers.push('Error');

    const rows = [];

    if (includeHeader) {
      rows.push(headers.join(delimiter));
    }

    for (const entry of results) {
      const row = [];
      row.push(`0x${entry.index.toString(16).toUpperCase().padStart(4, '0')}`);
      row.push(entry.subIndex);
      if (includeName) row.push(CSVExporter.escapeField(entry.name || '', delimiter));
      row.push(CSVExporter.escapeField(entry.hex || '', delimiter));
      row.push(entry.length || 0);
      row.push(entry.success ? (entry.transferType || 'expedited') : 'failed');
      row.push(entry.success ? 'OK' : 'Error');
      if (options.includeError) row.push(CSVExporter.escapeField(entry.error || '', delimiter));
      rows.push(row.join(delimiter));
    }

    return rows.join('\n');
  }

  static exportBatchWriteResults(results, options = {}) {
    const delimiter = options.delimiter || ',';
    const includeHeader = options.includeHeader !== false;
    const includeName = options.includeName !== false;

    const headers = [];
    headers.push('Index');
    headers.push('SubIndex');
    if (includeName) headers.push('Name');
    headers.push('Bytes Written');
    headers.push('Status');
    headers.push('Error');

    const rows = [];

    if (includeHeader) {
      rows.push(headers.join(delimiter));
    }

    for (const entry of results) {
      const row = [];
      row.push(`0x${entry.index.toString(16).toUpperCase().padStart(4, '0')}`);
      row.push(entry.subIndex);
      if (includeName) row.push(CSVExporter.escapeField(entry.name || '', delimiter));
      row.push(entry.bytesWritten || 0);
      row.push(entry.success ? 'OK' : 'Error');
      row.push(CSVExporter.escapeField(entry.error || '', delimiter));
      rows.push(row.join(delimiter));
    }

    return rows.join('\n');
  }

  static parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return [];

    const delimiter = CSVExporter.detectDelimiter(lines[0]);
    const headers = CSVExporter.parseLine(lines[0], delimiter);

    const entries = [];
    for (let i = 1; i < lines.length; i++) {
      const values = CSVExporter.parseLine(lines[i], delimiter);
      if (values.length < 2) continue;

      const entry = {};
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j].trim().toLowerCase();
        const value = (values[j] || '').trim();

        if (header === 'index') {
          entry.index = value.startsWith('0x') || value.startsWith('0X') ? value : value;
        } else if (header === 'subindex' || header === 'sub index') {
          entry.subIndex = parseInt(value) || 0;
        } else if (header === 'name') {
          entry.name = value;
        } else if (header === 'data' || header === 'data (hex)' || header === 'hex') {
          entry.data = CSVExporter.parseHexData(value);
        }
      }

      if (entry.index !== undefined) {
        entries.push(entry);
      }
    }

    return entries;
  }

  static parseHexData(hexStr) {
    const cleaned = hexStr.replace(/\s/g, '');
    if (cleaned.length % 2 !== 0) return [];
    const bytes = [];
    for (let i = 0; i < cleaned.length; i += 2) {
      const byte = parseInt(cleaned.substr(i, 2), 16);
      if (!isNaN(byte)) bytes.push(byte);
    }
    return bytes;
  }

  static escapeField(field, delimiter) {
    if (field.includes(delimiter) || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  static parseLine(line, delimiter) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
    }
    result.push(current);
    return result;
  }

  static detectDelimiter(headerLine) {
    const counts = {
      ',': (headerLine.match(/,/g) || []).length,
      ';': (headerLine.match(/;/g) || []).length,
      '\t': (headerLine.match(/\t/g) || []).length
    };

    return Object.entries(counts).reduce((a, b) => a[1] >= b[1] ? a : b)[0];
  }

  static generateBOM() {
    return '\uFEFF';
  }
}

module.exports = CSVExporter;
