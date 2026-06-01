import type { Request, Response } from 'express';
import fs from 'fs';
import { 
  startRecording, 
  stopRecording, 
  getRecordingStatus, 
  getRecordings, 
  getRecordingById,
  getRecordingFilePath,
  getSegments,
  getLatest,
  getSegmentForTime,
  getIndex,
  getNearestIndexEntry,
  streamLatestSegment,
  streamRecordingAtTime,
  getCurrentActiveRecordingId,
  SEGMENT_DURATION,
} from '../services/recordingService.js';

export async function startRecordingHandler(req: Request, res: Response) {
  try {
    const { cameraId } = req.body;
    
    if (!cameraId) {
      res.status(400).json({ error: 'cameraId is required' });
      return;
    }

    const recording = startRecording(cameraId);
    res.json(recording);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to start recording' });
  }
}

export async function stopRecordingHandler(req: Request, res: Response) {
  try {
    const recording = stopRecording();
    
    if (!recording) {
      res.status(400).json({ error: 'No recording in progress' });
      return;
    }

    res.json(recording);
  } catch (error) {
    res.status(500).json({ error: 'Failed to stop recording' });
  }
}

export async function getRecordingStatusHandler(req: Request, res: Response) {
  try {
    const status = getRecordingStatus();
    res.json({
      ...status,
      segmentDuration: SEGMENT_DURATION,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get recording status' });
  }
}

export async function getRecordingsHandler(req: Request, res: Response) {
  try {
    const { cameraId } = req.query;
    const recordings = getRecordings(cameraId as string);
    res.json(recordings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get recordings' });
  }
}

export async function getRecordingHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const recording = getRecordingById(id);
    
    if (!recording) {
      res.status(404).json({ error: 'Recording not found' });
      return;
    }

    res.json(recording);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get recording' });
  }
}

export async function streamRecordingHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { timestamp } = req.query;
    
    if (timestamp) {
      const ts = parseInt(timestamp as string);
      streamRecordingAtTime(id, ts, req, res);
      return;
    }
    
    const filePath = getRecordingFilePath(id);
    
    if (!filePath) {
      res.status(404).json({ error: 'Recording not found' });
      return;
    }

    if (!fs.existsSync(filePath)) {
      const sampleVideoUrl = 'https://www.w3schools.com/html/mov_bbb.mp4';
      res.redirect(sampleVideoUrl);
      return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      });
      
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      });
      
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to stream recording' });
  }
}

export async function getRecordingSegmentsHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const segments = getSegments(id);
    res.json({
      recordingId: id,
      segmentCount: segments.length,
      segmentDuration: SEGMENT_DURATION,
      segments,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get recording segments' });
  }
}

export async function getLatestSegmentHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const segment = getLatest(id);
    
    if (!segment) {
      res.status(404).json({ error: 'No segments found' });
      return;
    }

    res.json(segment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get latest segment' });
  }
}

export async function streamLatestSegmentHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    streamLatestSegment(id, req, res);
  } catch (error) {
    res.status(500).json({ error: 'Failed to stream latest segment' });
  }
}

export async function getSegmentByTimeHandler(req: Request, res: Response) {
  try {
    const { id, timestamp } = req.params;
    const ts = parseInt(timestamp);
    
    if (isNaN(ts)) {
      res.status(400).json({ error: 'Invalid timestamp' });
      return;
    }

    const result = getSegmentForTime(id, ts);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get segment by time' });
  }
}

export async function getRecordingIndexHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const index = getIndex(id);
    
    if (!index) {
      res.status(404).json({ error: 'Index not found' });
      return;
    }

    res.json(index);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get recording index' });
  }
}

export async function getNearestIndexEntryHandler(req: Request, res: Response) {
  try {
    const { id, timestamp } = req.params;
    const ts = parseInt(timestamp);
    
    if (isNaN(ts)) {
      res.status(400).json({ error: 'Invalid timestamp' });
      return;
    }

    const entry = getNearestIndexEntry(id, ts);
    
    if (!entry) {
      res.status(404).json({ error: 'No index entry found' });
      return;
    }

    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get nearest index entry' });
  }
}

export async function streamAtTimeHandler(req: Request, res: Response) {
  try {
    const { id, timestamp } = req.params;
    const ts = parseInt(timestamp);
    
    if (isNaN(ts)) {
      res.status(400).json({ error: 'Invalid timestamp' });
      return;
    }

    streamRecordingAtTime(id, ts, req, res);
  } catch (error) {
    res.status(500).json({ error: 'Failed to stream at time' });
  }
}

export async function getActiveRecordingHandler(req: Request, res: Response) {
  try {
    const { cameraId } = req.params;
    const recordingId = getCurrentActiveRecordingId(cameraId);
    
    res.json({
      cameraId,
      activeRecordingId: recordingId,
      isRecording: !!recordingId,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get active recording' });
  }
}

export async function getSegmentInfoHandler(req: Request, res: Response) {
  try {
    res.json({
      segmentDuration: SEGMENT_DURATION,
      segmentDurationFormatted: `${SEGMENT_DURATION / 60000} minutes`,
      description: 'Recordings are automatically split into 10-minute segments with index entries generated every second for precise seeking.',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get segment info' });
  }
}
