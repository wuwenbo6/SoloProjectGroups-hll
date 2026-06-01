class SCPIParser {
  parse(response) {
    if (!response || response.trim() === '') {
      return { type: 'empty', value: null };
    }

    response = response.trim();

    const numericResult = this._parseNumeric(response);
    if (numericResult !== null) {
      return { type: 'numeric', value: numericResult };
    }

    if (response.startsWith('"') && response.endsWith('"')) {
      return { type: 'string', value: response.slice(1, -1) };
    }

    if (response.includes(',')) {
      return this._parseCommaSeparated(response);
    }

    if (response.startsWith('#')) {
      return this._parseBlockData(response);
    }

    if (response === '1' || response === '0' || response.toUpperCase() === 'ON' || response.toUpperCase() === 'OFF') {
      return { type: 'boolean', value: response === '1' || response.toUpperCase() === 'ON' };
    }

    return { type: 'raw', value: response };
  }

  _parseNumeric(response) {
    const num = parseFloat(response);
    if (!isNaN(num) && num.toString() === response || !isNaN(num) && /^[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?$/.test(response)) {
      return num;
    }
    return null;
  }

  _parseCommaSeparated(response) {
    const parts = response.split(',').map(p => p.trim());
    const values = parts.map(p => {
      const sub = this.parse(p);
      return sub.value !== undefined ? sub.value : p;
    });

    return {
      type: 'array',
      value: values
    };
  }

  _parseBlockData(response) {
    if (response.length < 3) {
      return { type: 'block', value: response };
    }

    const digitCount = parseInt(response[1], 10);
    if (isNaN(digitCount) || digitCount <= 0 || digitCount > 9) {
      return { type: 'block', value: response };
    }

    const headerLength = 2 + digitCount;
    const dataLengthStr = response.slice(2, headerLength);
    const dataLength = parseInt(dataLengthStr, 10);

    if (isNaN(dataLength)) {
      return { type: 'block', value: response };
    }

    const data = response.slice(headerLength, headerLength + dataLength);

    return {
      type: 'block',
      length: dataLength,
      value: data
    };
  }

  formatCommand(command, params = []) {
    let formatted = command;
    if (params.length > 0) {
      formatted += ' ' + params.map(p => this._formatParam(p)).join(',');
    }
    return formatted;
  }

  _formatParam(param) {
    if (typeof param === 'string') {
      return `"${param}"`;
    }
    if (typeof param === 'boolean') {
      return param ? '1' : '0';
    }
    return String(param);
  }

  parseError(response) {
    const match = response.match(/^([+-]?\d+),"?(.*?)"?$/);
    if (match) {
      return {
        code: parseInt(match[1], 10),
        message: match[2] || 'Unknown error'
      };
    }
    return null;
  }

  parseIDN(response) {
    const parts = response.split(',');
    return {
      manufacturer: parts[0] || '',
      model: parts[1] || '',
      serial: parts[2] || '',
      firmware: parts[3] || ''
    };
  }
}

module.exports = SCPIParser;
