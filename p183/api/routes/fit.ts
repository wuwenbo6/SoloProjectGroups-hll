import express from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import { fitDiodeModel } from '../services/fitService';
import { fitBJTModel } from '../services/bjtFitService';
import { fitMOSFETModel } from '../services/mosfetFitService';
import { generateSpiceStatement } from '../services/spiceStatement';
import { generateSampleData } from '../services/sampleData';
import { DataPoint, ModelType } from '../../shared/types';

const router = express.Router();
const upload = multer();

function fitModel(data: DataPoint[], modelType: ModelType) {
  switch (modelType) {
    case 'diode':
      return fitDiodeModel(data);
    case 'bjt':
      return fitBJTModel(data);
    case 'mosfet':
      return fitMOSFETModel(data);
    default:
      throw new Error(`Unknown model type: ${modelType}`);
  }
}

router.post('/fit', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const modelType = (req.body.modelType || 'diode') as ModelType;
    if (!['diode', 'bjt', 'mosfet'].includes(modelType)) {
      return res.status(400).json({ success: false, error: `Invalid model type: ${modelType}` });
    }

    const fileContent = req.file.buffer.toString('utf8');
    const parseResult = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true
    });

    if (parseResult.errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: `CSV parse error: ${parseResult.errors[0].message}`
      });
    }

    const rows = parseResult.data as any[];
    let data: DataPoint[] = rows.map((row: any) => ({
      v: parseFloat(row.V || row.v || row.voltage || row.Voltage || row.VBE || row.vbe || row.VGS || row.vgs),
      i: parseFloat(row.I || row.i || row.current || row.Current || row.IC || row.ic || row.ID || row.id)
    })).filter((point: DataPoint) =>
      !isNaN(point.v) && !isNaN(point.i) && isFinite(point.v) && isFinite(point.i)
    );

    if (data.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid data points found. Expected columns: V, I or VBE, IC or VGS, ID'
      });
    }

    data = data.sort((a, b) => a.v - b.v);
    const fitResult = fitModel(data, modelType);
    const spiceStatement = generateSpiceStatement(modelType, fitResult.parameters);

    res.json({
      success: true,
      data: {
        measuredData: data,
        fittedData: fitResult.fittedCurve,
        parameters: fitResult.parameters,
        statistics: fitResult.statistics,
        modelType,
        spiceStatement
      }
    });

  } catch (error: any) {
    console.error('Fit error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

router.get('/sample', (req, res) => {
  try {
    const modelType = (req.query.modelType as ModelType) || 'diode';
    const sampleData = generateSampleData(modelType);
    res.json({
      success: true,
      data: sampleData
    });
  } catch (error: any) {
    console.error('Sample data error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

export default router;
