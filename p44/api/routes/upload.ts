import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { sceneService } from '../services/SceneService.js';

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.gltf', '.glb', '.bin', '.png', '.jpg', '.jpeg'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

router.post('/', upload.array('files'), (req, res) => {
  try {
    const sceneId = uuidv4();
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const modelPaths: string[] = [];
    
    files.forEach(file => {
      const path = sceneService.saveModelFile(sceneId, file.originalname, file.buffer);
      if (file.originalname.endsWith('.gltf') || file.originalname.endsWith('.glb')) {
        modelPaths.push(path);
      }
    });

    const mainModelPath = modelPaths[0] || '';
    const sceneName = req.body.name || files[0].originalname.replace(/\.(gltf|glb)$/i, '');
    
    const scene = sceneService.createScene(sceneName, mainModelPath);
    
    res.json({
      success: true,
      data: {
        scene,
        uploadedFiles: files.map(f => f.originalname)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/:sceneId', upload.array('files'), (req, res) => {
  try {
    const { sceneId } = req.params;
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const scene = sceneService.getScene(sceneId);
    if (!scene) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }

    const modelPaths: string[] = [];
    
    files.forEach(file => {
      const path = sceneService.saveModelFile(sceneId, file.originalname, file.buffer);
      if (file.originalname.endsWith('.gltf') || file.originalname.endsWith('.glb')) {
        modelPaths.push(path);
      }
    });

    const updates: { modelPath?: string } = {};
    if (modelPaths.length > 0 && !scene.modelPath) {
      updates.modelPath = modelPaths[0];
    }

    const updatedScene = sceneService.updateScene(sceneId, updates);
    
    res.json({
      success: true,
      data: {
        scene: updatedScene,
        uploadedFiles: files.map(f => f.originalname)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
