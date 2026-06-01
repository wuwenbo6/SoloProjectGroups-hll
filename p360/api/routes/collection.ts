import { Router, type Request, type Response } from 'express';
import { collection } from '../services/CollectionService.js';
import { changeStreams } from '../services/ChangeStreamsService.js';
import { isResumeTokenError } from '../../shared/types.js';

const router = Router();

router.post('/insert', (req: Request, res: Response) => {
  try {
    const { data } = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid data. Must be an object.',
      });
    }
    const doc = collection.insert(data);
    res.json({
      success: true,
      data: { document: doc },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.put('/update/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data } = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid data. Must be an object.',
      });
    }
    const doc = collection.update(id, data);
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }
    res.json({
      success: true,
      data: { document: doc },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.delete('/delete/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = collection.delete(id);
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }
    res.json({
      success: true,
      data: { documentId: id },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const documents = collection.findAll();
    res.json({
      success: true,
      data: { documents },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/events', (req: Request, res: Response) => {
  try {
    const { resumeAfter } = req.query;
    const result = changeStreams.getEventsAfter(
      resumeAfter ? String(resumeAfter) : undefined
    );

    if (isResumeTokenError(result)) {
      return res.status(400).json({
        success: false,
        error: result.message,
        tokenError: result,
      });
    }

    res.json({
      success: true,
      data: { events: result },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.get('/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      term: changeStreams.getTerm(),
      eventCount: changeStreams.getEventCount(),
      currentOptime: changeStreams.getCurrentOptime(),
      oldestOptime: changeStreams.getOldestOptime(),
      truncationCount: changeStreams.getTruncationCount(),
      lastToken: changeStreams.getLastToken(),
    },
  });
});

router.post('/advance-term', (req: Request, res: Response) => {
  const newTerm = changeStreams.advanceTerm();
  res.json({
    success: true,
    data: {
      previousTerm: newTerm - 1,
      currentTerm: newTerm,
      message: 'Term advanced. All existing resume tokens will return TERM_MISMATCH error.',
    },
  });
});

router.post('/truncate', (req: Request, res: Response) => {
  const { size } = req.body;
  if (typeof size === 'number' && size > 0) {
    changeStreams.setMaxOplogSize(size);
  }
  res.json({
    success: true,
    data: {
      maxOplogSize: changeStreams.getEventCount(),
      truncationCount: changeStreams.getTruncationCount(),
      oldestOptime: changeStreams.getOldestOptime(),
    },
  });
});

router.post('/clear', (req: Request, res: Response) => {
  collection.clear();
  res.json({
    success: true,
    message: 'Collection and event log cleared',
  });
});

router.post('/export', (req: Request, res: Response) => {
  try {
    const { format, resumeAfter, filter, operationTypes, startTime, endTime } = req.body;

    if (!format || !['json', 'csv', 'ndjson'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format. Must be one of: json, csv, ndjson',
      });
    }

    const result = changeStreams.exportEvents({
      format,
      resumeAfter: resumeAfter ? String(resumeAfter) : undefined,
      filter,
      operationTypes,
      startTime,
      endTime,
    });

    if (isResumeTokenError(result)) {
      return res.status(400).json({
        success: false,
        error: result.message,
        tokenError: result,
      });
    }

    const { data, count } = result;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `change-streams-${timestamp}.${format}`;

    const mimeTypes: Record<string, string> = {
      json: 'application/json',
      csv: 'text/csv',
      ndjson: 'application/x-ndjson',
    };

    res.setHeader('Content-Type', mimeTypes[format] || 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Export-Count', String(count));

    res.send(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
