import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/images', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({ storage });

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const id = path.basename(req.file.filename, path.extname(req.file.filename));
  
  res.json({
    id,
    url: `http://localhost:${PORT}/images/${req.file.filename}`,
    filename: req.file.originalname,
  });
});

app.post('/api/save', (req, res) => {
  try {
    const { imageData } = req.body;
    
    if (!imageData) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    const id = uuidv4();
    const filename = `${id}.png`;
    const filePath = path.join(uploadDir, filename);

    const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(filePath, base64Data, 'base64');

    res.json({
      id,
      url: `http://localhost:${PORT}/images/${filename}`,
    });
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: 'Failed to save image' });
  }
});

app.get('/api/images/:id', (req, res) => {
  const { id } = req.params;
  const files = fs.readdirSync(uploadDir);
  const file = files.find(f => f.startsWith(id));

  if (!file) {
    return res.status(404).json({ error: 'Image not found' });
  }

  res.sendFile(path.join(uploadDir, file));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
