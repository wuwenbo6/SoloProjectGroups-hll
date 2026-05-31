const OnvifService = require('./OnvifService');
const db = require('../database/init');

class PTZService {
  static cameraConnections = new Map();
  static cameraStates = new Map();

  static async getCameraConnection(cameraId) {
    if (this.cameraConnections.has(cameraId)) {
      return this.cameraConnections.get(cameraId);
    }

    const camera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(cameraId);
    if (!camera) {
      throw new Error('Camera not found');
    }

    const cam = await OnvifService.connectCamera(
      camera.ip_address,
      camera.port,
      camera.username || '',
      camera.password || ''
    );

    this.cameraConnections.set(cameraId, cam);
    return cam;
  }

  static async move(cameraId, direction, speed = 0.5) {
    const cam = await this.getCameraConnection(cameraId);
    
    if (!cam.ptz) {
      throw new Error('PTZ not supported on this camera');
    }

    const profile = cam.profiles?.[0];
    if (!profile) {
      throw new Error('No profile found');
    }

    let x = 0, y = 0, zoom = 0;

    switch (direction) {
      case 'up':
        y = speed;
        break;
      case 'down':
        y = -speed;
        break;
      case 'left':
        x = -speed;
        break;
      case 'right':
        x = speed;
        break;
      case 'upleft':
        x = -speed;
        y = speed;
        break;
      case 'upright':
        x = speed;
        y = speed;
        break;
      case 'downleft':
        x = -speed;
        y = -speed;
        break;
      case 'downright':
        x = speed;
        y = -speed;
        break;
      default:
        throw new Error('Invalid direction');
    }

    this.cameraStates.set(cameraId, { moving: true, direction, speed });

    try {
      await this.sendContinuousMove(cam, profile.$.token, { x, y, zoom });
      return { success: true, direction, speed };
    } catch (err) {
      this.cameraStates.set(cameraId, { moving: false });
      throw err;
    }
  }

  static async sendContinuousMove(cam, profileToken, velocity) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve({ success: true, timeout: true });
      }, 2000);

      cam.ptz.continuousMove({
        profileToken: profileToken,
        velocity: velocity
      }, (err) => {
        clearTimeout(timeout);
        if (err) {
          reject(err);
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  static async stop(cameraId) {
    const cam = await this.getCameraConnection(cameraId);
    
    if (!cam.ptz) {
      throw new Error('PTZ not supported on this camera');
    }

    const profile = cam.profiles?.[0];
    if (!profile) {
      throw new Error('No profile found');
    }

    this.cameraStates.set(cameraId, { moving: false });

    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.sendStop(cam, profile.$.token);
        return { success: true, attempts: attempt + 1 };
      } catch (err) {
        lastError = err;
        await new Promise(r => setTimeout(r, 50));
      }
    }

    try {
      await this.sendContinuousMove(cam, profile.$.token, { x: 0, y: 0, zoom: 0 });
      return { success: true, fallback: true };
    } catch (fallbackErr) {
      throw lastError || fallbackErr;
    }
  }

  static async sendStop(cam, profileToken) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve({ success: true, timeout: true });
      }, 1500);

      cam.ptz.stop({
        profileToken: profileToken,
        panTilt: true,
        zoom: true
      }, (err) => {
        clearTimeout(timeout);
        if (err) {
          reject(err);
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  static async zoom(cameraId, direction, speed = 0.5) {
    const cam = await this.getCameraConnection(cameraId);
    
    if (!cam.ptz) {
      throw new Error('PTZ not supported on this camera');
    }

    const profile = cam.profiles?.[0];
    if (!profile) {
      throw new Error('No profile found');
    }

    const zoom = direction === 'in' ? speed : -speed;

    this.cameraStates.set(cameraId, { moving: true, zoom: direction, speed });

    try {
      await this.sendContinuousMove(cam, profile.$.token, { x: 0, y: 0, zoom });
      return { success: true, direction, speed };
    } catch (err) {
      this.cameraStates.set(cameraId, { moving: false });
      throw err;
    }
  }

  static async gotoHomePosition(cameraId) {
    const cam = await this.getCameraConnection(cameraId);
    
    if (!cam.ptz) {
      throw new Error('PTZ not supported on this camera');
    }

    const profile = cam.profiles?.[0];
    if (!profile) {
      throw new Error('No profile found');
    }

    return new Promise((resolve, reject) => {
      cam.ptz.gotoHomePosition({
        profileToken: profile.$.token,
        speed: 0.5
      }, (err) => {
        if (err) reject(err);
        else resolve({ success: true });
      });
    });
  }

  static async getPresets(cameraId) {
    const cam = await this.getCameraConnection(cameraId);
    
    if (!cam.ptz) {
      throw new Error('PTZ not supported on this camera');
    }

    const profile = cam.profiles?.[0];
    if (!profile) {
      throw new Error('No profile found');
    }

    return new Promise((resolve, reject) => {
      cam.ptz.getPresets({
        profileToken: profile.$.token
      }, (err, presets) => {
        if (err) reject(err);
        else resolve(presets);
      });
    });
  }

  static async gotoPreset(cameraId, presetToken, speed = 0.5) {
    const cam = await this.getCameraConnection(cameraId);
    
    if (!cam.ptz) {
      throw new Error('PTZ not supported on this camera');
    }

    const profile = cam.profiles?.[0];
    if (!profile) {
      throw new Error('No profile found');
    }

    return new Promise((resolve, reject) => {
      cam.ptz.gotoPreset({
        profileToken: profile.$.token,
        presetToken: presetToken,
        speed: speed
      }, (err) => {
        if (err) reject(err);
        else resolve({ success: true, presetToken });
      });
    });
  }
}

module.exports = PTZService;
