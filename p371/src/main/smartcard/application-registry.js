const { Buffer } = require('buffer');

const DEFAULT_DF_REGISTRY = [
  {
    name: 'PSE (Payment System Environment)',
    dfName: '1PAY.SYS.DDF01',
    aid: 'A0000000041010',
    description: 'EMV Contactless PSE',
    matchType: 'both',
  },
  {
    name: 'PSE (PPSE - Proximity Payment System Environment)',
    dfName: '2PAY.SYS.DDF01',
    aid: 'A0000000042010',
    description: 'EMV Contactless PPSE',
    matchType: 'both',
  },
  {
    name: 'VISA',
    dfName: '',
    aid: 'A000000003',
    description: 'Visa International',
    matchType: 'aid_prefix',
  },
  {
    name: 'MasterCard',
    dfName: '',
    aid: 'A000000004',
    description: 'MasterCard International',
    matchType: 'aid_prefix',
  },
  {
    name: 'MasterCard PayPass',
    dfName: '',
    aid: 'A0000000046000',
    description: 'MasterCard PayPass',
    matchType: 'aid_prefix',
  },
  {
    name: 'AMEX',
    dfName: '',
    aid: 'A000000025',
    description: 'American Express',
    matchType: 'aid_prefix',
  },
  {
    name: 'JCB',
    dfName: '',
    aid: 'A000000065',
    description: 'JCB International',
    matchType: 'aid_prefix',
  },
  {
    name: 'UnionPay',
    dfName: '',
    aid: 'A000000333',
    description: 'China UnionPay',
    matchType: 'aid_prefix',
  },
  {
    name: 'Discover',
    dfName: '',
    aid: 'A000000152',
    description: 'Discover Network',
    matchType: 'aid_prefix',
  },
  {
    name: 'PBOC (ePBOC DEBIT)',
    dfName: '',
    aid: 'A000000333010101',
    description: 'PBOC ePBOC Debit',
    matchType: 'aid_exact',
  },
  {
    name: 'PBOC (ePBOC CREDIT)',
    dfName: '',
    aid: 'A000000333010102',
    description: 'PBOC ePBOC Credit',
    matchType: 'aid_exact',
  },
  {
    name: 'PBOC (ePBOC QUASI-CASH)',
    dfName: '',
    aid: 'A000000333010103',
    description: 'PBOC ePBOC Quasi Cash',
    matchType: 'aid_exact',
  },
  {
    name: 'ePassport (MRTD)',
    dfName: '',
    aid: 'A0000002471001',
    description: 'ICAO ePassport Application',
    matchType: 'aid_prefix',
  },
  {
    name: 'ePassport (DG14 - Security)',
    dfName: '',
    aid: 'A0000002472001',
    description: 'ICAO ePassport Security Application',
    matchType: 'aid_prefix',
  },
  {
    name: 'US PIV Card',
    dfName: '',
    aid: 'A000000308000010000100',
    description: 'US PIV NIST SP 800-73',
    matchType: 'aid_exact',
  },
  {
    name: 'eID (Belgium)',
    dfName: '',
    aid: 'A000000167455349474E',
    description: 'Belgian eID Card',
    matchType: 'aid_prefix',
  },
  {
    name: 'eID (Germany)',
    dfName: '',
    aid: 'A0000002472001',
    description: 'German eID Card (nPA)',
    matchType: 'aid_prefix',
  },
  {
    name: 'eID (France)',
    dfName: '',
    aid: 'A0000000940001',
    description: 'French eID Card',
    matchType: 'aid_prefix',
  },
  {
    name: 'Health Insurance Card (EU)',
    dfName: '',
    aid: 'A00000000955435444',
    description: 'European Health Insurance Card',
    matchType: 'aid_prefix',
  },
  {
    name: 'Gemplus Card (Generic)',
    dfName: '',
    aid: 'A000000018',
    description: 'Gemplus/Gemalto Generic',
    matchType: 'aid_prefix',
  },
];

class ApplicationRegistry {
  constructor() {
    this.applications = [...DEFAULT_DF_REGISTRY];
    this.customApplications = [];
  }

  addApplication(app) {
    if (!app.name) {
      throw new Error('Application name is required');
    }
    if (!app.dfName && !app.aid) {
      throw new Error('Either dfName or aid must be provided');
    }
    this.customApplications.push({
      ...app,
      matchType: app.matchType || 'both',
    });
  }

  getAllApplications() {
    return [...this.customApplications, ...this.applications];
  }

  matchByDfName(dfName) {
    const dfNameStr = typeof dfName === 'string' ? dfName : dfName.toString('utf8');
    const allApps = this.getAllApplications();

    return allApps.filter((app) => {
      if (!app.dfName) return false;
      const appDfName = app.dfName.toUpperCase();
      const targetDfName = dfNameStr.toUpperCase();
      return appDfName === targetDfName || appDfName.includes(targetDfName) || targetDfName.includes(appDfName);
    });
  }

  matchByAid(aidHex, aidSelector = 0x04) {
    const aidStr = typeof aidHex === 'string' ? aidHex.toUpperCase() : Buffer.from(aidHex).toString('hex').toUpperCase();
    const allApps = this.getAllApplications();

    return allApps.filter((app) => {
      if (!app.aid) return false;
      const appAid = app.aid.toUpperCase();

      if (aidSelector === 0x04) {
        if (app.matchType === 'aid_exact' || app.matchType === 'both') {
          return aidStr === appAid;
        } else if (app.matchType === 'aid_prefix') {
          return appAid.startsWith(aidStr) || aidStr.startsWith(appAid);
        }
        return aidStr === appAid || aidStr.startsWith(appAid);
      }

      if (aidSelector === 0x00) {
        return appAid.startsWith(aidStr);
      }

      return appAid === aidStr;
    });
  }

  matchSelectCommand(apduHex) {
    const apduBuf = Buffer.from(apduHex, 'hex');
    if (apduBuf.length < 5) {
      return { error: 'APDU too short' };
    }

    const cla = apduBuf[0];
    const ins = apduBuf[1];
    const p1 = apduBuf[2];
    const p2 = apduBuf[3];
    const lc = apduBuf[4];

    if (ins !== 0xA4) {
      return { error: 'Not a SELECT command' };
    }

    if (apduBuf.length < 5 + lc) {
      return { error: 'SELECT command truncated' };
    }

    const data = apduBuf.subarray(5, 5 + lc);

    const result = {
      cla,
      ins,
      p1,
      p2,
      lc,
      dataHex: data.toString('hex'),
      selectType: this._decodeSelectType(p1, p2),
    };

    if (p1 === 0x04) {
      result.matchType = 'aid';
      result.aid = data.toString('hex');
      result.aidAscii = this._tryConvertToAscii(data);
      result.matchedApplications = this.matchByAid(result.aid, p2);
    } else if (p1 === 0x00) {
      if (p2 === 0x00 || p2 === 0x08) {
        result.matchType = 'df_name';
        result.dfName = data.toString('utf8');
        result.dfNameHex = data.toString('hex');
        result.matchedApplications = this.matchByDfName(result.dfName);
      } else if (p2 === 0x02 || p2 === 0x0A) {
        result.matchType = 'file_id';
        result.fileId = data.readUInt16BE(0);
        result.matchedApplications = [];
      }
    }

    return result;
  }

  _decodeSelectType(p1, p2) {
    const p1Desc = {
      0x00: 'MF/DF/EF by file identifier',
      0x01: 'Child DF under current DF',
      0x02: 'EF under current DF',
      0x03: 'Parent DF',
      0x04: 'DF by DF name (AID)',
      0x08: 'Path from MF',
      0x09: 'Path from current DF',
    };

    const p2Desc = {
      0x00: 'First or only occurrence',
      0x01: 'Last occurrence',
      0x02: 'Next occurrence',
      0x03: 'Previous occurrence',
      0x04: 'File control information (FCI)',
      0x0C: 'File control parameters (FCP)',
      0x08: 'File management data (FMD)',
    };

    return {
      p1: p1Desc[p1] || `Unknown (0x${p1.toString(16)})`,
      p2: p2Desc[p2] || `Unknown (0x${p2.toString(16)})`,
    };
  }

  _tryConvertToAscii(buf) {
    try {
      const str = buf.toString('utf8');
      const printable = str.replace(/[\x00-\x1F\x7F]/g, '');
      if (printable.length > 0 && printable.length >= buf.length * 0.7) {
        return printable;
      }
      return null;
    } catch (_e) {
      return null;
    }
  }

  static getInstance() {
    if (!ApplicationRegistry._instance) {
      ApplicationRegistry._instance = new ApplicationRegistry();
    }
    return ApplicationRegistry._instance;
  }
}

ApplicationRegistry._instance = null;

module.exports = { ApplicationRegistry, DEFAULT_DF_REGISTRY };
