import express from 'express';
import cors from 'cors';
import { producer } from './services/KafkaProducerSimulator';
import type {
  SendMessageRequest,
  SendDuplicateRequest,
  ToggleIdempotenceRequest,
  BeginTransactionRequest,
  TransactionalSendRequest,
} from '../shared/types';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.get('/api/producer/status', (req, res) => {
  const status = producer.getStatus();
  res.json(status);
});

app.post('/api/producer/send', (req, res) => {
  const { content, partition } = req.body as SendMessageRequest;

  if (!content || content.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'Message content is required',
    });
  }

  const result = producer.sendMessage(content, partition);
  
  res.json({
    success: true,
    message: result.message,
    isDuplicate: result.isDuplicate,
  });
});

app.post('/api/producer/send-duplicate', (req, res) => {
  const { content, pid, sequence, partition } = req.body as SendDuplicateRequest;

  if (!content || content.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'Message content is required',
    });
  }

  if (pid === undefined || sequence === undefined) {
    return res.status(400).json({
      success: false,
      error: 'PID and sequence are required for duplicate message',
    });
  }

  const result = producer.sendDuplicateMessage(content, pid, sequence, partition);
  
  res.json({
    success: true,
    message: result.message,
    isDuplicate: result.isDuplicate,
  });
});

app.get('/api/producer/messages', (req, res) => {
  const messages = producer.getMessages();
  const stats = producer.getStats();
  
  res.json({
    messages,
    stats,
  });
});

app.post('/api/producer/reset', (req, res) => {
  const status = producer.reset();
  
  res.json({
    success: true,
    status,
  });
});

app.post('/api/producer/toggle-idempotence', (req, res) => {
  const { enable } = req.body as ToggleIdempotenceRequest;
  
  if (enable === undefined) {
    return res.status(400).json({
      success: false,
      error: 'Enable flag is required',
    });
  }

  const enableIdempotence = producer.toggleIdempotence(enable);
  
  res.json({
    success: true,
    enableIdempotence,
  });
});

app.get('/api/producer/pid-states', (req, res) => {
  const pidStates = producer.getAllPIDStates();
  res.json({
    success: true,
    pidStates,
  });
});

app.post('/api/producer/transaction/begin', (req, res) => {
  try {
    const { transactionalId } = req.body as BeginTransactionRequest;
    const txn = producer.beginTransaction(transactionalId);
    res.json({
      success: true,
      transaction: txn,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/producer/transaction/send', (req, res) => {
  try {
    const { content, partition } = req.body as TransactionalSendRequest;

    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Message content is required',
      });
    }

    if (partition === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Partition is required for transactional send',
      });
    }

    const result = producer.sendTransactionalMessage(content, partition);
    res.json({
      success: true,
      message: result.message,
      isDuplicate: result.isDuplicate,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/producer/transaction/commit', (req, res) => {
  try {
    const txn = producer.commitTransaction();
    res.json({
      success: true,
      transaction: txn,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/producer/transaction/abort', (req, res) => {
  try {
    const txn = producer.abortTransaction();
    res.json({
      success: true,
      transaction: txn,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/api/producer/transactions', (req, res) => {
  const transactions = producer.getTransactionHistory();
  res.json({
    success: true,
    transactions,
  });
});

app.get('/api/producer/export/:format', (req, res) => {
  const format = req.params.format as 'json' | 'csv';

  if (format !== 'json' && format !== 'csv') {
    return res.status(400).json({
      success: false,
      error: 'Format must be "json" or "csv"',
    });
  }

  const data = format === 'json' ? producer.exportAsJSON() : producer.exportAsCSV();
  const filename = `kafka-dedup-stats-${Date.now()}.${format}`;
  const contentType = format === 'json' ? 'application/json' : 'text/csv';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(data);
});

app.listen(PORT, () => {
  console.log(`Kafka Producer Simulator API running on port ${PORT}`);
  console.log(`API Base URL: http://localhost:${PORT}/api`);
});
