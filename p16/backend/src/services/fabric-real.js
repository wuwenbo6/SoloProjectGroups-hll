const { Wallets, Gateway } = require('fabric-network');
const path = require('path');
const fs = require('fs');

class RealFabricService {
  constructor() {
    this.gateway = null;
    this.contract = null;
    this.network = null;
  }

  async init() {
    try {
      const ccpPath = path.resolve(__dirname, '../../config', 'connection.json');
      const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

      const walletPath = path.join(process.cwd(), 'wallet');
      const wallet = await Wallets.newFileSystemWallet(walletPath);

      const identity = await wallet.get('appUser');
      if (!identity) {
        console.log('An identity for the user "appUser" does not exist in the wallet');
        throw new Error('User identity not found');
      }

      this.gateway = new Gateway();
      await this.gateway.connect(ccp, {
        wallet,
        identity: 'appUser',
        discovery: { enabled: true, asLocalhost: true }
      });

      this.network = await this.gateway.getNetwork(process.env.CHANNEL_NAME || 'mychannel');
      this.contract = this.network.getContract(process.env.CHAINCODE_NAME || 'produce-traceability');
      
      console.log('Successfully connected to Fabric network');
    } catch (error) {
      console.error('Failed to connect to Fabric network:', error);
      throw error;
    }
  }

  async createProduce(produce) {
    const result = await this.contract.submitTransaction(
      'CreateProduce',
      produce.id,
      produce.name,
      produce.batchNumber,
      produce.quantity.toString(),
      produce.unit,
      produce.owner,
      produce.ownerRole,
      produce.imageURL || ''
    );
    return JSON.parse(result.toString());
  }

  async transferProduce(id, newOwner, newOwnerRole, location, remark) {
    const result = await this.contract.submitTransaction(
      'TransferProduce',
      id,
      newOwner,
      newOwnerRole,
      location,
      remark
    );
    return JSON.parse(result.toString());
  }

  async addInspectionReport(reportID, produceID, inspector, items, results, conclusion, reportURL) {
    const result = await this.contract.submitTransaction(
      'AddInspectionReport',
      reportID,
      produceID,
      inspector,
      items,
      results,
      conclusion,
      reportURL
    );
    return JSON.parse(result.toString());
  }

  async readProduce(id) {
    const result = await this.contract.evaluateTransaction('ReadProduce', id);
    return JSON.parse(result.toString());
  }

  async getProduceHistory(id) {
    const result = await this.contract.evaluateTransaction('GetProduceHistory', id);
    return JSON.parse(result.toString());
  }

  async getAllProduces() {
    const result = await this.contract.evaluateTransaction('GetAllProduces');
    return JSON.parse(result.toString());
  }

  async updateProduceStatus(id, status) {
    const result = await this.contract.submitTransaction('UpdateProduceStatus', id, status);
    return JSON.parse(result.toString());
  }

  disconnect() {
    if (this.gateway) {
      this.gateway.disconnect();
    }
  }
}

module.exports = RealFabricService;
