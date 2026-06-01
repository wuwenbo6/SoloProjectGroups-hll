import { Router, Request, Response } from 'express';
import { parse } from 'csv-parse/sync';
import { upload } from '../middleware/fileUpload';
import { applyKalmanFilter } from '../services/kalmanFilter';
import { calculateStatistics } from '../services/statistics';
import type {
  UWBDataPoint,
  KalmanParams,
  FilterResult,
  ApiResponse,
  MultiTagFilterRequest,
  MultiTagFilterResult,
} from '../../shared/types';
import fs from 'fs';
import path from 'path';

const router = Router();

function parseCSV(content: string): UWBDataPoint[] {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    cast: (value, context) => {
      if (context.column === 'timestamp') return parseInt(value, 10);
      if (context.column === 'distance') return parseFloat(value);
      return value;
    },
  });
  return records as UWBDataPoint[];
}

function parseJSON(content: string): UWBDataPoint[] {
  const data = JSON.parse(content);
  if (!Array.isArray(data)) {
    throw new Error('JSON 数据格式错误，应为数组');
  }
  return data.map((item) => ({
    timestamp: Number(item.timestamp),
    distance: Number(item.distance),
  }));
}

function generateSampleData(trueDistance: number = 5.0): UWBDataPoint[] {
  const baseTimestamp = Date.now();
  const data: UWBDataPoint[] = [];

  for (let i = 0; i < 200; i++) {
    const noise = (Math.random() - 0.5) * 0.5;
    const multipath = Math.sin(i * 0.1) * 0.2;
    const outlier = Math.random() > 0.95 ? (Math.random() - 0.5) * 2 : 0;
    const distance = trueDistance + noise + multipath + outlier;

    data.push({
      timestamp: baseTimestamp + i * 100,
      distance: Math.round(distance * 1000) / 1000,
    });
  }

  return data;
}

const tagColors = [
  '#F97316',
  '#06B6D4',
  '#A855F7',
  '#10B981',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
];

router.post(
  '/upload',
  upload.single('file'),
  (req: Request, res: Response<ApiResponse<{ data: UWBDataPoint[]; filename: string }>>) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: '未上传文件' });
      }

      const content = req.file.buffer.toString('utf-8');
      const ext = path.extname(req.file.originalname).toLowerCase();

      let data: UWBDataPoint[];
      if (ext === '.csv') {
        data = parseCSV(content);
      } else if (ext === '.json') {
        data = parseJSON(content);
      } else {
        return res.status(400).json({ success: false, error: '不支持的文件格式' });
      }

      if (data.length === 0) {
        return res.status(400).json({ success: false, error: '文件内容为空' });
      }

      res.json({
        success: true,
        data: {
          data,
          filename: req.file.originalname,
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : '文件解析失败',
      });
    }
  }
);

router.post(
  '/process',
  (
    req: Request<unknown, unknown, { data: UWBDataPoint[]; params: KalmanParams }>,
    res: Response<ApiResponse<FilterResult>>
  ) => {
    try {
      const { data, params } = req.body;

      if (!data || !Array.isArray(data) || data.length === 0) {
        return res.status(400).json({ success: false, error: '数据无效' });
      }

      if (!params) {
        return res.status(400).json({ success: false, error: '缺少滤波参数' });
      }

      const filteredData = applyKalmanFilter(data, params);
      const statistics = calculateStatistics(data, filteredData);

      res.json({
        success: true,
        data: {
          originalData: data,
          filteredData,
          statistics,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '处理失败',
      });
    }
  }
);

router.get(
  '/sample',
  (_req: Request, res: Response<ApiResponse<{ data: UWBDataPoint[]; filename: string }>>) => {
    try {
      const data = generateSampleData();
      res.json({
        success: true,
        data: {
          data,
          filename: 'sample-data.csv',
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '生成示例数据失败',
      });
    }
  }
);

router.get(
  '/sample-multi',
  (_req: Request, res: Response<ApiResponse<MultiTagFilterResult['tags']>>) => {
    try {
      const distances = [5.0, 3.5, 7.2];
      const tagNames = ['标签 A', '标签 B', '标签 C'];

      const tags = distances.map((distance, idx) => ({
        tagId: `tag-${idx + 1}`,
        tagName: tagNames[idx],
        color: tagColors[idx % tagColors.length],
        originalData: generateSampleData(distance),
        filteredData: [],
        statistics: null,
      }));

      res.json({
        success: true,
        data: tags,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '生成多标签示例数据失败',
      });
    }
  }
);

router.post(
  '/process-multi',
  (
    req: Request<unknown, unknown, MultiTagFilterRequest>,
    res: Response<ApiResponse<MultiTagFilterResult>>
  ) => {
    try {
      const { tags, params } = req.body;

      if (!tags || !Array.isArray(tags) || tags.length === 0) {
        return res.status(400).json({ success: false, error: '标签数据无效' });
      }

      if (!params) {
        return res.status(400).json({ success: false, error: '缺少滤波参数' });
      }

      const processedTags = tags.map((tag, idx) => {
        const filteredData = applyKalmanFilter(tag.data, params);
        const statistics = calculateStatistics(tag.data, filteredData);

        return {
          tagId: tag.tagId,
          tagName: `标签 ${String.fromCharCode(65 + idx)}`,
          color: tagColors[idx % tagColors.length],
          originalData: tag.data,
          filteredData,
          statistics,
        };
      });

      res.json({
        success: true,
        data: {
          tags: processedTags,
          params,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '批量处理失败',
      });
    }
  }
);

export default router;
