class FabricService {
  constructor() {
    this.mockData = new Map();
    this.transfers = new Map();
    this.reports = new Map();
    this.privatePrices = new Map();
    this.temperatures = new Map();
    this.certificates = new Map();
    
    this.initMockData();
  }

  initMockData() {
    const now = new Date();
    this.mockData.set('PROD001', {
      id: 'PROD001',
      name: '有机西红柿',
      batchNumber: 'BATCH-2024-001',
      quantity: 500,
      unit: 'kg',
      currentOwner: '阳光农场',
      ownerRole: 'farm',
      status: 'CREATED',
      timestamp: now.toISOString(),
      imageURL: ''
    });

    this.transfers.set('PROD001', []);
    this.reports.set('PROD001', []);
    this.temperatures.set('PROD001', []);
    this.certificates.set('PROD001', []);
  }

  async createProduce(produce) {
    const id = produce.id || 'PROD' + Date.now();
    const newProduce = {
      ...produce,
      id,
      timestamp: new Date().toISOString(),
      status: 'CREATED'
    };
    this.mockData.set(id, newProduce);
    this.transfers.set(id, []);
    this.reports.set(id, []);
    this.temperatures.set(id, []);
    this.certificates.set(id, []);
    return newProduce;
  }

  async setPrivatePrice(produceId, price, currency, ownerOrg) {
    const produce = this.mockData.get(produceId);
    if (!produce) {
      throw new Error(`农产品 ${produceId} 不存在`);
    }

    const priceData = {
      produceID: produceId,
      price: price,
      currency: currency || 'CNY',
      ownerOrg: ownerOrg,
      lastUpdated: new Date().toISOString()
    };

    this.privatePrices.set(produceId, priceData);
    return priceData;
  }

  async getPrivatePrice(produceId) {
    const priceData = this.privatePrices.get(produceId);
    if (!priceData) {
      throw new Error(`农产品 ${produceId} 的价格数据不存在`);
    }
    return priceData;
  }

  async recordTemperature(produceId, temperature, location, reader) {
    const produce = this.mockData.get(produceId);
    if (!produce) {
      throw new Error(`农产品 ${produceId} 不存在`);
    }

    const reading = {
      produceID: produceId,
      temperature: temperature,
      location: location,
      reader: reader,
      timestamp: new Date().toISOString()
    };

    if (!this.temperatures.has(produceId)) {
      this.temperatures.set(produceId, []);
    }
    this.temperatures.get(produceId).push(reading);

    if (temperature > 8) {
      produce.status = 'TEMP_ALERT';
      produce.timestamp = new Date().toISOString();
      this.mockData.set(produceId, produce);
    }

    return reading;
  }

  async getTemperatureHistory(produceId) {
    return this.temperatures.get(produceId) || [];
  }

  async issueCertificate(certificateID, produceID, issuer, validDays, qrCodeHash) {
    const produce = this.mockData.get(produceID);
    if (!produce) {
      throw new Error(`农产品 ${produceID} 不存在`);
    }

    const certificate = {
      certificateID: certificateID || `CERT-${Date.now()}`,
      produceID: produceID,
      issuer: issuer,
      issueDate: new Date().toISOString(),
      validUntil: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString(),
      status: 'VALID',
      qrCodeHash: qrCodeHash
    };

    if (!this.certificates.has(produceID)) {
      this.certificates.set(produceID, []);
    }
    this.certificates.get(produceID).push(certificate);

    return certificate;
  }

  async getCertificates(produceID) {
    const certs = this.certificates.get(produceID) || [];
    return certs.map(cert => {
      if (cert.status === 'VALID' && new Date() > new Date(cert.validUntil)) {
        cert.status = 'EXPIRED';
      }
      return cert;
    });
  }

  async revokeCertificate(produceID, certificateID, reason) {
    const certs = this.certificates.get(produceID) || [];
    const cert = certs.find(c => c.certificateID === certificateID);
    if (!cert) {
      throw new Error(`证书 ${certificateID} 不存在`);
    }
    cert.status = 'REVOKED';
    return cert;
  }

  async transferProduce(id, newOwner, newOwnerRole, location, remark) {
    const produce = this.mockData.get(id);
    if (!produce) {
      throw new Error(`农产品 ${id} 不存在`);
    }

    const transfer = {
      from: produce.currentOwner,
      fromRole: produce.ownerRole,
      to: newOwner,
      toRole: newOwnerRole,
      location,
      timestamp: new Date().toISOString(),
      remark
    };

    if (!this.transfers.has(id)) {
      this.transfers.set(id, []);
    }
    this.transfers.get(id).push(transfer);

    produce.currentOwner = newOwner;
    produce.ownerRole = newOwnerRole;
    produce.status = 'TRANSFERRED';
    produce.timestamp = new Date().toISOString();
    this.mockData.set(id, produce);

    return produce;
  }

  async addInspectionReport(reportID, produceID, inspector, items, results, conclusion, reportURL) {
    const produce = this.mockData.get(produceID);
    if (!produce) {
      throw new Error(`农产品 ${produceID} 不存在`);
    }

    const report = {
      id: reportID,
      produceID,
      inspector,
      inspectionDate: new Date().toISOString(),
      items: JSON.parse(items),
      results: JSON.parse(results),
      conclusion,
      reportURL
    };

    if (!this.reports.has(produceID)) {
      this.reports.set(produceID, []);
    }
    this.reports.get(produceID).push(report);

    return report;
  }

  async readProduce(id) {
    const produce = this.mockData.get(id);
    if (!produce) {
      throw new Error(`农产品 ${id} 不存在`);
    }
    return produce;
  }

  async getProduceHistory(id) {
    const produce = this.mockData.get(id);
    if (!produce) {
      throw new Error(`农产品 ${id} 不存在`);
    }

    return {
      produce,
      transfers: this.transfers.get(id) || [],
      reports: this.reports.get(id) || []
    };
  }

  async getAllProduces() {
    return Array.from(this.mockData.values());
  }

  async updateProduceStatus(id, status) {
    const produce = this.mockData.get(id);
    if (!produce) {
      throw new Error(`农产品 ${id} 不存在`);
    }
    produce.status = status;
    produce.timestamp = new Date().toISOString();
    this.mockData.set(id, produce);
    return produce;
  }
}

module.exports = new FabricService();
