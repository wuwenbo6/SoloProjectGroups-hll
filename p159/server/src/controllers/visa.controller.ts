import { Request, Response } from 'express';
import { visaDevice } from '../services/visaDevice.service';
import { ConnectRequest, ScpiCommandRequest } from '../types';

export const connectDevice = async (req: Request, res: Response) => {
  try {
    const { host, port, timeout, chunkSize, chunkDelay }: ConnectRequest = req.body;

    if (!host || !port) {
      return res.status(400).json({
        success: false,
        error: 'Host and port are required'
      });
    }

    await visaDevice.connect({ host, port, timeout, chunkSize, chunkDelay });
    
    res.json({
      success: true,
      message: 'Connected to device successfully',
      status: visaDevice.getStatus()
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Connection failed';
    res.status(500).json({
      success: false,
      error
    });
  }
};

export const disconnectDevice = (_req: Request, res: Response) => {
  try {
    visaDevice.disconnect();
    res.json({
      success: true,
      message: 'Disconnected from device',
      status: visaDevice.getStatus()
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Disconnection failed';
    res.status(500).json({
      success: false,
      error
    });
  }
};

export const getDeviceStatus = (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: visaDevice.getStatus()
  });
};

export const sendScpiCommand = async (req: Request, res: Response) => {
  try {
    const { command, isQuery, timeout }: ScpiCommandRequest = req.body;

    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'Command is required'
      });
    }

    const result = await visaDevice['sendCommandInternal'](
      command,
      isQuery !== false,
      timeout || 5000
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Command execution failed';
    res.status(500).json({
      success: false,
      command: req.body.command,
      error,
      timestamp: Date.now()
    });
  }
};

export const enqueueScpiCommand = async (req: Request, res: Response) => {
  try {
    const { command, isQuery, timeout }: ScpiCommandRequest = req.body;

    if (!command) {
      return res.status(400).json({
        success: false,
        error: 'Command is required'
      });
    }

    if (!visaDevice.isDeviceConnected()) {
      return res.status(400).json({
        success: false,
        error: 'Device not connected'
      });
    }

    const queuedCommand = visaDevice.enqueueCommand(
      command,
      isQuery !== false,
      timeout || 5000
    );

    res.json({
      success: true,
      message: 'Command enqueued',
      commandId: queuedCommand.id,
      queueLength: visaDevice.getStatus().queueLength
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to enqueue command';
    res.status(500).json({
      success: false,
      error
    });
  }
};

export const getCommandStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const command = visaDevice.getCommandById(id);

    if (!command) {
      return res.status(404).json({
        success: false,
        error: 'Command not found'
      });
    }

    res.json({
      success: true,
      command
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to get command status';
    res.status(500).json({
      success: false,
      error
    });
  }
};

export const getQueueStatus = (_req: Request, res: Response) => {
  res.json({
    success: true,
    queue: visaDevice.getQueueStatus()
  });
};

export const clearQueue = (_req: Request, res: Response) => {
  visaDevice.clearQueue();
  res.json({
    success: true,
    message: 'Queue cleared',
    queue: visaDevice.getQueueStatus()
  });
};

export const sendBatchCommands = async (req: Request, res: Response) => {
  try {
    const { commands } = req.body;

    if (!Array.isArray(commands) || commands.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Commands array is required'
      });
    }

    const commandIds = [];
    for (const cmd of commands) {
      const queued = visaDevice.enqueueCommand(
        cmd.command,
        cmd.isQuery !== false,
        cmd.timeout || 5000
      );
      commandIds.push(queued.id);
    }

    res.json({
      success: true,
      message: 'Commands enqueued',
      commandIds,
      queueLength: visaDevice.getStatus().queueLength
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Batch command enqueue failed';
    res.status(500).json({
      success: false,
      error
    });
  }
};

export const parseWaveformData = (req: Request, res: Response) => {
  try {
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({
        success: false,
        error: 'Waveform data is required'
      });
    }

    const values = data
      .trim()
      .split(/[,\s]+/)
      .map((s: string) => parseFloat(s.trim()))
      .filter((v: number) => !isNaN(v));

    if (values.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid numeric data found'
      });
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a: number, b: number) => a + b, 0) / values.length;
    const variance = values.reduce((a: number, b: number) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const peakToPeak = max - min;

    res.json({
      success: true,
      values,
      stats: {
        count: values.length,
        min,
        max,
        mean,
        stdDev,
        peakToPeak
      }
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to parse waveform data';
    res.status(500).json({
      success: false,
      error
    });
  }
};

export const exportWaveformCsv = (req: Request, res: Response) => {
  try {
    const { data, xIncrement = 1e-6, xOrigin = 0 } = req.body;

    if (!data) {
      return res.status(400).json({
        success: false,
        error: 'Waveform data is required'
      });
    }

    const values = data
      .trim()
      .split(/[,\s]+/)
      .map((s: string) => parseFloat(s.trim()))
      .filter((v: number) => !isNaN(v));

    if (values.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid numeric data found'
      });
    }

    const csvLines = ['Index,Time,Voltage'];
    values.forEach((value: number, index: number) => {
      const time = xOrigin + index * xIncrement;
      csvLines.push(`${index},${time.toExponential(6)},${value.toExponential(6)}`);
    });

    const csvContent = csvLines.join('\n');
    const filename = `waveform_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to export CSV';
    res.status(500).json({
      success: false,
      error
    });
  }
};
