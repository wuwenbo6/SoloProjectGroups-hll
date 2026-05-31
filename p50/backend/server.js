const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/exports', express.static(path.join(__dirname, 'exports')));

const db = new Database(path.join(__dirname, 'database.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS parameter_sets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    model_name TEXT NOT NULL,
    parameters TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const tempDir = path.join(__dirname, 'temp');
const exportsDir = path.join(__dirname, 'exports');
const modelsDir = path.join(__dirname, 'models');
const cacheDir = path.join(__dirname, 'cache');

[tempDir, exportsDir, modelsDir, cacheDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const activeProcesses = new Map();

function generateScadContent(modelName, parameters) {
  const paramsStr = Object.entries(parameters)
    .map(([key, value]) => `${key} = ${typeof value === 'string' ? `"${value}"` : value};`)
    .join('\n');
  
  const modelPath = path.join(modelsDir, `${modelName}.scad`);
  if (fs.existsSync(modelPath)) {
    const modelContent = fs.readFileSync(modelPath, 'utf8');
    return `${paramsStr}\n\n${modelContent}`;
  }
  
  return `${paramsStr}\n\ncube([width, height, depth]);`;
}

function getCacheKey(modelName, parameters, format) {
  const paramsStr = JSON.stringify(parameters, Object.keys(parameters).sort());
  return `${modelName}_${format}_${crypto.createHash('md5').update(paramsStr).digest('hex')}`;
}

function runOpenSCAD(inputFile, outputFile, format = 'stl', isPreview = false, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const jobId = path.basename(inputFile, '.scad');
    
    const args = ['-o', outputFile];
    
    args.push('--enable=manifold');
    args.push('--enable=lazy-union');
    
    if (!isPreview) {
      args.push('--render');
    }
    
    if (format === '3mf') {
      args.push('--export-format=3mf');
    }
    
    args.push(inputFile);

    console.log(`[${jobId}] 执行 OpenSCAD: openscad ${args.join(' ')}`);
    const openscad = spawn('openscad', args, { timeout: timeout });
    activeProcesses.set(jobId, openscad);
    
    let errorOutput = '';
    let startTime = Date.now();

    openscad.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    openscad.stdout.on('data', (data) => {
      console.log(`[${jobId}] ${data.toString()}`);
    });

    openscad.on('close', (code) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      activeProcesses.delete(jobId);
      
      if (code === 0 || code === null) {
        console.log(`[${jobId}] 完成，耗时 ${elapsed}s`);
        resolve(outputFile);
      } else {
        console.error(`[${jobId}] 失败 (code=${code}), 耗时 ${elapsed}s`);
        reject(new Error(`OpenSCAD failed with code ${code}: ${errorOutput}`));
      }
    });

    openscad.on('error', (err) => {
      activeProcesses.delete(jobId);
      reject(err);
    });
  });
}

function convertToStep(stlFile, stepFile, timeout = 600000) {
  return new Promise((resolve, reject) => {
    const freecadPaths = [
      '/Applications/FreeCAD.app/Contents/Resources/bin/freecad',
      '/usr/bin/freecad',
      '/usr/local/bin/freecad',
      '/Applications/FreeCAD.app/Contents/MacOS/FreeCAD'
    ];
    
    let freecadCmd = null;
    for (const p of freecadPaths) {
      if (fs.existsSync(p)) {
        freecadCmd = p;
        break;
      }
    }
    
    if (!freecadCmd) {
      reject(new Error('未找到 FreeCAD，请先安装 FreeCAD 以支持 STEP 导出'));
      return;
    }
    
    const jobId = path.basename(stlFile, '.stl');
    const scriptContent = `
import sys
import Mesh
import Part

stl_file = sys.argv[1]
step_file = sys.argv[2]

mesh = Mesh.Mesh(stl_file)
shape = Part.Shape()
shape.makeShapeFromMesh(mesh.Topology, 0.1)
solid = Part.makeSolid(shape)
solid.exportStep(step_file)
`;
    
    const scriptFile = path.join(tempDir, `${jobId}_convert.py`);
    fs.writeFileSync(scriptFile, scriptContent);
    
    console.log(`[${jobId}] 使用 FreeCAD 转换 STL -> STEP`);
    const args = ['-c', scriptContent, stlFile, stepFile];
    const freecad = spawn(freecadCmd, args, { timeout: timeout });
    activeProcesses.set(`step_${jobId}`, freecad);
    
    let errorOutput = '';
    let startTime = Date.now();
    
    freecad.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    freecad.on('close', (code) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      activeProcesses.delete(`step_${jobId}`);
      
      try { fs.unlinkSync(scriptFile); } catch(e) {}
      
      if (fs.existsSync(stepFile)) {
        console.log(`[${jobId}] STEP 转换完成，耗时 ${elapsed}s`);
        resolve(stepFile);
      } else {
        reject(new Error(`STEP 转换失败: ${errorOutput || '未知错误'}`));
      }
    });
    
    freecad.on('error', (err) => {
      activeProcesses.delete(`step_${jobId}`);
      try { fs.unlinkSync(scriptFile); } catch(e) {}
      reject(err);
    });
  });
}

function cancelRender(jobId) {
  const process = activeProcesses.get(jobId);
  if (process) {
    process.kill('SIGTERM');
    activeProcesses.delete(jobId);
    console.log(`[${jobId}] 已取消渲染`);
    return true;
  }
  return false;
}

app.post('/api/preview', async (req, res) => {
  try {
    const { modelName, parameters } = req.body;
    const jobId = uuidv4();
    
    const cacheKey = getCacheKey(modelName, parameters, 'stl');
    const cacheFile = path.join(cacheDir, `${cacheKey}.stl`);
    
    if (fs.existsSync(cacheFile)) {
      const cachedOutputPath = path.join(exportsDir, `${jobId}.stl`);
      fs.copyFileSync(cacheFile, cachedOutputPath);
      
      setTimeout(() => {
        try { if (fs.existsSync(cachedOutputPath)) fs.unlinkSync(cachedOutputPath); } catch(e) {}
      }, 300000);
      
      return res.json({
        success: true,
        stlUrl: `/exports/${jobId}.stl`,
        cached: true
      });
    }
    
    const scadContent = generateScadContent(modelName, parameters);
    const scadFile = path.join(tempDir, `${jobId}.scad`);
    const outputFile = path.join(exportsDir, `${jobId}.stl`);
    
    fs.writeFileSync(scadFile, scadContent);
    
    try {
      await runOpenSCAD(scadFile, outputFile, 'stl', true, 120000);
      
      try {
        fs.copyFileSync(outputFile, cacheFile);
      } catch(e) {
        console.log('缓存写入失败:', e.message);
      }
    } finally {
      try { if (fs.existsSync(scadFile)) fs.unlinkSync(scadFile); } catch(e) {}
    }
    
    setTimeout(() => {
      try { if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile); } catch(e) {}
    }, 300000);
    
    res.json({
      success: true,
      stlUrl: `/exports/${jobId}.stl`,
      jobId
    });
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/render', async (req, res) => {
  try {
    const { modelName, parameters, format = 'stl' } = req.body;
    const jobId = uuidv4();
    
    const scadContent = generateScadContent(modelName, parameters);
    const scadFile = path.join(tempDir, `${jobId}.scad`);
    const stlFile = path.join(tempDir, `${jobId}.stl`);
    const outputFile = format === 'step' 
      ? path.join(exportsDir, `${jobId}.step`)
      : path.join(exportsDir, `${jobId}.${format}`);
    
    fs.writeFileSync(scadFile, scadContent);
    
    try {
      if (format === 'step') {
        await runOpenSCAD(scadFile, stlFile, 'stl', false, 300000);
        await convertToStep(stlFile, outputFile, 600000);
        try { fs.unlinkSync(stlFile); } catch(e) {}
      } else {
        await runOpenSCAD(scadFile, outputFile, format, false, 600000);
      }
    } finally {
      try { if (fs.existsSync(scadFile)) fs.unlinkSync(scadFile); } catch(e) {}
    }
    
    setTimeout(() => {
      try { if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile); } catch(e) {}
    }, 3600000);
    
    res.json({
      success: true,
      downloadUrl: `/exports/${jobId}.${format === 'step' ? 'step' : format}`,
      filename: `${modelName}_${jobId}.${format === 'step' ? 'step' : format}`,
      jobId
    });
  } catch (error) {
    console.error('Render error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/tools/check', (req, res) => {
  const tools = {
    openscad: false,
    freecad: false
  };
  
  try {
    spawn('openscad', ['--version']).on('close', (code) => {
      tools.openscad = code === 0;
      
      const freecadPaths = [
        '/Applications/FreeCAD.app/Contents/Resources/bin/freecad',
        '/usr/bin/freecad',
        '/usr/local/bin/freecad'
      ];
      
      tools.freecad = freecadPaths.some(p => fs.existsSync(p));
      
      res.json({ success: true, tools });
    }).on('error', () => {
      res.json({ success: true, tools });
    });
  } catch (e) {
    res.json({ success: true, tools });
  }
});

app.post('/api/cancel/:jobId', (req, res) => {
  const { jobId } = req.params;
  const success = cancelRender(jobId);
  res.json({ success, message: success ? '已取消' : '未找到该任务' });
});

app.get('/api/models', (req, res) => {
  try {
    const models = fs.readdirSync(modelsDir)
      .filter(f => f.endsWith('.scad'))
      .map(f => f.replace('.scad', ''));
    
    res.json({ success: true, models });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/models/:name', (req, res) => {
  try {
    const modelPath = path.join(modelsDir, `${req.params.name}.scad`);
    if (!fs.existsSync(modelPath)) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }
    
    const content = fs.readFileSync(modelPath, 'utf8');
    res.json({ success: true, content });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/parameter-sets', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM parameter_sets ORDER BY updated_at DESC').all();
    const sets = rows.map(row => ({
      ...row,
      parameters: JSON.parse(row.parameters)
    }));
    res.json({ success: true, parameterSets: sets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/parameter-sets', (req, res) => {
  try {
    const { name, modelName, parameters } = req.body;
    const id = uuidv4();
    
    db.prepare(`
      INSERT INTO parameter_sets (id, name, model_name, parameters)
      VALUES (?, ?, ?)
    `).run(id, name, modelName, JSON.stringify(parameters));
    
    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/parameter-sets/:id', (req, res) => {
  try {
    const { name, parameters } = req.body;
    const { id } = req.params;
    
    const result = db.prepare(`
      UPDATE parameter_sets 
      SET name = ?, parameters = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, JSON.stringify(parameters), id);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Parameter set not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/parameter-sets/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM parameter_sets WHERE id = ?').run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Parameter set not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`OpenSCAD Backend running on port ${PORT}`);
  console.log(`- 预览超时: 120秒`);
  console.log(`- 导出超时: 600秒`);
  console.log(`- 缓存已启用`);
  console.log(`- Manifold 优化: 已启用`);
  console.log(`- Lazy Union 优化: 已启用`);
});

process.on('SIGTERM', () => {
  console.log('正在关闭所有活动进程...');
  activeProcesses.forEach((proc) => proc.kill('SIGTERM'));
  server.close(() => process.exit(0));
});