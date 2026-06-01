class HIDComm {
  constructor() {
    this.device = null;
    this.onReceiveCallback = null;
    this.onConnectCallback = null;
    this.onDisconnectCallback = null;
  }

  setOnReceive(callback) {
    this.onReceiveCallback = callback;
  }

  setOnConnect(callback) {
    this.onConnectCallback = callback;
  }

  setOnDisconnect(callback) {
    this.onDisconnectCallback = callback;
  }

  async connect(filters = []) {
    try {
      if (!window.electronAPI || !window.electronAPI.hid) {
        throw new Error('WebHID API not available');
      }

      const devices = await window.electronAPI.hid.requestDevice({ filters });
      if (devices.length === 0) {
        throw new Error('No HID device selected');
      }

      this.device = devices[0];
      await this.device.open();

      this.device.addEventListener('inputreport', (event) => {
        if (this.onReceiveCallback) {
          this.onReceiveCallback(event);
        }
      });

      if (this.onConnectCallback) {
        this.onConnectCallback(this.device);
      }

      return this.device;
    } catch (error) {
      console.error('HID connection error:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.device && this.device.opened) {
        await this.device.close();
        if (this.onDisconnectCallback) {
          this.onDisconnectCallback(this.device);
        }
      }
      this.device = null;
    } catch (error) {
      console.error('HID disconnect error:', error);
      throw error;
    }
  }

  async sendReport(reportId, data) {
    try {
      if (!this.device || !this.device.opened) {
        throw new Error('HID device not connected');
      }

      const buffer = new Uint8Array(data);
      await this.device.sendReport(reportId, buffer);
      return true;
    } catch (error) {
      console.error('HID send error:', error);
      throw error;
    }
  }

  async sendFeatureReport(reportId, data) {
    try {
      if (!this.device || !this.device.opened) {
        throw new Error('HID device not connected');
      }

      const buffer = new Uint8Array(data);
      await this.device.sendFeatureReport(reportId, buffer);
      return true;
    } catch (error) {
      console.error('HID feature send error:', error);
      throw error;
    }
  }

  async receiveFeatureReport(reportId) {
    try {
      if (!this.device || !this.device.opened) {
        throw new Error('HID device not connected');
      }

      const data = await this.device.receiveFeatureReport(reportId);
      return new Uint8Array(data.buffer);
    } catch (error) {
      console.error('HID feature receive error:', error);
      throw error;
    }
  }

  isConnected() {
    return this.device && this.device.opened;
  }

  getDeviceInfo() {
    if (!this.device) return null;
    return {
      vendorId: this.device.vendorId,
      productId: this.device.productId,
      productName: this.device.productName,
      opened: this.device.opened
    };
  }
}

window.HIDComm = HIDComm;
