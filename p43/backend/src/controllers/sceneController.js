const { Scene, Device } = require('../models');

class SceneController {
  constructor(mqttClient, gateway, logService) {
    this.mqttClient = mqttClient;
    this.gateway = gateway;
    this.logService = logService;
  }

  async getAllScenes(req, res) {
    try {
      const scenes = await Scene.findAll({
        order: [['isPreset', 'DESC'], ['name', 'ASC']]
      });
      res.json(scenes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getSceneById(req, res) {
    try {
      const scene = await Scene.findByPk(req.params.id);
      if (scene) {
        res.json(scene);
      } else {
        res.status(404).json({ error: 'Scene not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async createScene(req, res) {
    try {
      const scene = await Scene.create({
        ...req.body,
        isPreset: false
      });
      res.status(201).json(scene);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async updateScene(req, res) {
    try {
      const scene = await Scene.findByPk(req.params.id);
      if (scene) {
        if (scene.isPreset) {
          return res.status(403).json({ error: 'Cannot modify preset scenes' });
        }
        await scene.update(req.body);
        res.json(scene);
      } else {
        res.status(404).json({ error: 'Scene not found' });
      }
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async deleteScene(req, res) {
    try {
      const scene = await Scene.findByPk(req.params.id);
      if (scene) {
        if (scene.isPreset) {
          return res.status(403).json({ error: 'Cannot delete preset scenes' });
        }
        await scene.destroy();
        res.json({ message: 'Scene deleted' });
      } else {
        res.status(404).json({ error: 'Scene not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async applyScene(req, res) {
    try {
      const { id } = req.params;
      const { deviceIds, areas } = req.body;

      const scene = await Scene.findByPk(id);
      if (!scene) {
        return res.status(404).json({ error: 'Scene not found' });
      }

      const sceneData = {
        brightness: scene.brightness,
        colorTemperature: scene.colorTemperature
      };

      if (this.mqttClient) {
        this.mqttClient.publish('blemesh/command/set-scene', JSON.stringify({
          sceneId: id,
          deviceIds,
          areas
        }));
      }

      const whereClause = {};
      if (deviceIds && deviceIds.length > 0) {
        whereClause.id = deviceIds;
      } else if (areas && areas.length > 0) {
        whereClause.area = areas;
      } else if (scene.targetAreas && scene.targetAreas.length > 0) {
        whereClause.area = scene.targetAreas;
      }

      const [affectedCount] = await Device.update(
        { ...sceneData, lastUpdate: new Date() },
        { where: whereClause }
      );

      if (this.logService) {
        this.logService.logControl({
          action: 'scene',
          actionSource: scene.name,
          brightness: scene.brightness,
          colorTemperature: scene.colorTemperature,
          area: areas ? areas.join(',') : (scene.targetAreas ? scene.targetAreas.join(',') : 'all'),
          affectedDevices: affectedCount,
          energyConsumption: 0
        });
      }

      res.json({
        success: true,
        message: `Scene ${scene.name} applied`,
        scene: sceneData,
        target: whereClause,
        affectedCount
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = SceneController;
