const { Sensor } = require('../models');

class SensorController {
  constructor(mqttClient) {
    this.mqttClient = mqttClient;
  }

  async getAllSensors(req, res) {
    try {
      const sensors = await Sensor.findAll({
        order: [['type', 'ASC'], ['id', 'ASC']]
      });
      res.json(sensors);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getSensorById(req, res) {
    try {
      const sensor = await Sensor.findByPk(req.params.id);
      if (sensor) {
        res.json(sensor);
      } else {
        res.status(404).json({ error: 'Sensor not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async createSensor(req, res) {
    try {
      const sensor = await Sensor.create(req.body);
      res.status(201).json(sensor);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async updateSensor(req, res) {
    try {
      const sensor = await Sensor.findByPk(req.params.id);
      if (sensor) {
        await sensor.update(req.body);
        res.json(sensor);
      } else {
        res.status(404).json({ error: 'Sensor not found' });
      }
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async deleteSensor(req, res) {
    try {
      const sensor = await Sensor.findByPk(req.params.id);
      if (sensor) {
        await sensor.destroy();
        res.json({ message: 'Sensor deleted' });
      } else {
        res.status(404).json({ error: 'Sensor not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateSensorValue(req, res) {
    try {
      const { id } = req.params;
      const { value } = req.body;

      const sensor = await Sensor.findByPk(id);
      if (sensor) {
        await sensor.update({
          value,
          lastUpdate: new Date(),
          online: true
        });

        if (this.mqttClient) {
          this.mqttClient.publish(`sensors/data/${id}`, JSON.stringify({
            sensorId: id,
            value,
            timestamp: new Date().toISOString()
          }));
        }

        res.json({ success: true, sensor });
      } else {
        res.status(404).json({ error: 'Sensor not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async simulateSensorData(req, res) {
    try {
      const sensors = await Sensor.findAll();
      
      const updates = sensors.map(sensor => {
        let value;
        switch (sensor.type) {
          case 'motion':
          case 'occupancy':
            value = Math.random() > 0.5 ? 1 : 0;
            break;
          case 'light':
            value = Math.floor(Math.random() * 1000);
            break;
          case 'temperature':
            value = 18 + Math.random() * 10;
            break;
          case 'humidity':
            value = 30 + Math.random() * 40;
            break;
          default:
            value = Math.random();
        }
        return sensor.update({
          value,
          lastUpdate: new Date()
        });
      });

      await Promise.all(updates);

      res.json({ success: true, message: 'Sensor data simulated' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = SensorController;
