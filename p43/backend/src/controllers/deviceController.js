const { Device } = require('../models');

class DeviceController {
  constructor(mqttClient, gateway, logService) {
    this.mqttClient = mqttClient;
    this.gateway = gateway;
    this.logService = logService;
  }

  async getAllDevices(req, res) {
    try {
      const devices = await Device.findAll({
        order: [['id', 'ASC']]
      });
      res.json(devices);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getDeviceById(req, res) {
    try {
      const device = await Device.findByPk(req.params.id);
      if (device) {
        res.json(device);
      } else {
        res.status(404).json({ error: 'Device not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async createDevice(req, res) {
    try {
      const device = await Device.create(req.body);
      res.status(201).json(device);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async updateDevice(req, res) {
    try {
      const device = await Device.findByPk(req.params.id);
      if (device) {
        await device.update(req.body);
        res.json(device);
      } else {
        res.status(404).json({ error: 'Device not found' });
      }
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async deleteDevice(req, res) {
    try {
      const device = await Device.findByPk(req.params.id);
      if (device) {
        await device.destroy();
        res.json({ message: 'Device deleted' });
      } else {
        res.status(404).json({ error: 'Device not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async controlDevice(req, res) {
    try {
      const { id } = req.params;
      const { brightness, colorTemperature } = req.body;

      const controlData = {};
      if (brightness !== undefined) controlData.brightness = brightness;
      if (colorTemperature !== undefined) controlData.colorTemperature = colorTemperature;

      if (this.mqttClient) {
        this.mqttClient.publish(`blemesh/control/${id}`, JSON.stringify(controlData));
      }

      const device = await Device.findByPk(id);
      if (device) {
        controlData.lastUpdate = new Date();
        await device.update(controlData);

        if (this.logService) {
          this.logService.logControl({
            deviceId: id,
            deviceName: device.name,
            action: 'manual',
            actionSource: 'API',
            brightness: controlData.brightness,
            colorTemperature: controlData.colorTemperature,
            area: device.area,
            affectedDevices: 1,
            energyConsumption: 0
          });
        }
      }

      res.json({ success: true, message: 'Command sent', deviceId: id, controlData });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async controlAllDevices(req, res) {
    try {
      const { brightness, colorTemperature, area } = req.body;

      const controlData = {};
      if (brightness !== undefined) controlData.brightness = brightness;
      if (colorTemperature !== undefined) controlData.colorTemperature = colorTemperature;

      if (this.mqttClient) {
        this.mqttClient.publish('blemesh/control/all', JSON.stringify(controlData));
      }

      const whereClause = area ? { area } : {};
      controlData.lastUpdate = new Date();
      const [affectedCount] = await Device.update(controlData, { where: whereClause });

      if (this.logService) {
        this.logService.logControl({
          action: 'manual',
          actionSource: 'API - Global',
          brightness: controlData.brightness,
          colorTemperature: controlData.colorTemperature,
          area: area || 'all',
          affectedDevices: affectedCount,
          energyConsumption: 0
        });
      }

      res.json({ success: true, message: 'Command sent to all devices', controlData, affectedCount });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async syncDevicesFromGateway(req, res) {
    try {
      if (!this.gateway) {
        return res.status(500).json({ error: 'Gateway not available' });
      }

      const gatewayDevices = this.gateway.getDevices();

      for (const gwDevice of gatewayDevices) {
        const [device, created] = await Device.findOrCreate({
          where: { id: gwDevice.id },
          defaults: gwDevice
        });

        if (!created) {
          await device.update({
            brightness: gwDevice.brightness,
            colorTemperature: gwDevice.colorTemperature,
            online: gwDevice.online,
            lastUpdate: gwDevice.lastUpdate
          });
        }
      }

      res.json({ success: true, count: gatewayDevices.length, message: 'Devices synced from gateway' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = DeviceController;
