import type { MessageRecord, ProducerStatus, ProducerStats, PIDState, TransactionState } from '../../shared/types';
import { transactionCoordinator } from './TransactionCoordinator';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generatePID(): number {
  return Math.floor(Math.random() * 9000) + 1000;
}

class KafkaProducerSimulator {
  private pid: number;
  private epoch: number;
  private enableIdempotence: boolean;
  private messages: MessageRecord[];
  private transactionalId: string | null;
  private activeTxnId: string | null;

  constructor() {
    this.pid = generatePID();
    this.epoch = 0;
    this.enableIdempotence = true;
    this.messages = [];
    this.transactionalId = null;
    this.activeTxnId = null;
    
    transactionCoordinator.getOrCreatePIDState(this.pid, this.epoch);
  }

  getStatus(): ProducerStatus {
    const pidState = transactionCoordinator.getPIDState(this.pid);
    const partitionSequences: Record<number, number> = {};
    
    if (pidState) {
      for (const [partition, state] of Object.entries(pidState.partitions)) {
        partitionSequences[parseInt(partition)] = state.lastSequence;
      }
    }
    
    const allSequences = Object.values(partitionSequences);
    const currentSequence = allSequences.length > 0 ? Math.max(...allSequences) : 0;

    let activeTransaction: TransactionState | null = null;
    if (this.activeTxnId) {
      activeTransaction = transactionCoordinator.getActiveTransaction(this.activeTxnId) || null;
    }

    return {
      pid: this.pid,
      currentSequence,
      enableIdempotence: this.enableIdempotence,
      epoch: this.epoch,
      partitionSequences,
      transactionalId: this.transactionalId,
      activeTransaction,
    };
  }

  sendMessage(content: string, partition: number = 0): { message: MessageRecord; isDuplicate: boolean } {
    const sequence = transactionCoordinator.getNextSequenceForPartition(this.pid, partition);
    
    let isDuplicate = false;
    let status: MessageRecord['status'] = 'ACCEPTED';

    if (this.enableIdempotence && transactionCoordinator.isDuplicate(this.pid, partition, sequence)) {
      isDuplicate = true;
      status = 'DUPLICATE_DISCARDED';
    }

    const message: MessageRecord = {
      id: generateUUID(),
      content,
      pid: this.pid,
      sequence,
      status,
      timestamp: Date.now(),
      partition,
    };

    this.messages.push(message);

    if (!isDuplicate) {
      transactionCoordinator.updatePartitionState(this.pid, partition, sequence);
    }

    return { message, isDuplicate };
  }

  sendDuplicateMessage(
    content: string,
    pid: number,
    sequence: number,
    partition: number = 0
  ): { message: MessageRecord; isDuplicate: boolean } {
    let isDuplicate = false;
    let status: MessageRecord['status'] = 'ACCEPTED';

    if (this.enableIdempotence && transactionCoordinator.isDuplicate(pid, partition, sequence)) {
      isDuplicate = true;
      status = 'DUPLICATE_DISCARDED';
    }

    const message: MessageRecord = {
      id: generateUUID(),
      content,
      pid,
      sequence,
      status,
      timestamp: Date.now(),
      partition,
    };

    this.messages.push(message);

    if (!isDuplicate) {
      transactionCoordinator.updatePartitionState(pid, partition, sequence);
    }

    return { message, isDuplicate };
  }

  beginTransaction(transactionalId?: string): TransactionState {
    this.transactionalId = transactionalId || `txnal-${this.pid}`;
    const txn = transactionCoordinator.beginTransaction(this.pid, this.epoch, this.transactionalId);
    this.activeTxnId = txn.transactionId;
    return txn;
  }

  sendTransactionalMessage(content: string, partition: number): { message: MessageRecord; isDuplicate: boolean } {
    if (!this.activeTxnId) {
      throw new Error('No active transaction. Call beginTransaction first.');
    }

    const sequence = transactionCoordinator.getNextSequenceForPartition(this.pid, partition);
    
    let isDuplicate = false;
    let status: MessageRecord['status'] = 'TX_PENDING';

    if (this.enableIdempotence && transactionCoordinator.isDuplicate(this.pid, partition, sequence)) {
      isDuplicate = true;
      status = 'DUPLICATE_DISCARDED';
    }

    const message: MessageRecord = {
      id: generateUUID(),
      content,
      pid: this.pid,
      sequence,
      status,
      timestamp: Date.now(),
      partition,
      transactionId: this.activeTxnId,
    };

    this.messages.push(message);

    if (!isDuplicate) {
      transactionCoordinator.updatePartitionState(this.pid, partition, sequence);
      transactionCoordinator.addMessageToTransaction(this.activeTxnId, message.id, partition);
    }

    return { message, isDuplicate };
  }

  commitTransaction(): TransactionState {
    if (!this.activeTxnId) {
      throw new Error('No active transaction to commit.');
    }

    const txn = transactionCoordinator.commitTransaction(this.activeTxnId);

    for (const msgId of txn.messageIds) {
      const msg = this.messages.find(m => m.id === msgId);
      if (msg) {
        msg.status = 'TX_COMMITTED';
      }
    }

    this.activeTxnId = null;
    return txn;
  }

  abortTransaction(): TransactionState {
    if (!this.activeTxnId) {
      throw new Error('No active transaction to abort.');
    }

    const txn = transactionCoordinator.abortTransaction(this.activeTxnId);

    for (const msgId of txn.messageIds) {
      const msg = this.messages.find(m => m.id === msgId);
      if (msg) {
        msg.status = 'TX_ABORTED';
      }
    }

    for (const partition of txn.partitions) {
      const pidState = transactionCoordinator.getPIDState(this.pid);
      if (pidState && pidState.partitions[partition]) {
        const lastCommittedSeq = this.messages
          .filter(m => m.partition === partition && m.pid === this.pid && m.status === 'TX_COMMITTED')
          .reduce((max, m) => Math.max(max, m.sequence), -1);
        
        if (lastCommittedSeq >= 0) {
          transactionCoordinator.updatePartitionState(this.pid, partition, lastCommittedSeq);
        }
      }
    }

    this.activeTxnId = null;
    return txn;
  }

  getMessages(): MessageRecord[] {
    return [...this.messages].sort((a, b) => b.timestamp - a.timestamp);
  }

  getStats(): ProducerStats {
    const totalSent = this.messages.length;
    const discarded = this.messages.filter(m => m.status === 'DUPLICATE_DISCARDED').length;
    const aborted = this.messages.filter(m => m.status === 'TX_ABORTED').length;
    const accepted = totalSent - discarded - aborted;
    const deduplicationRate = totalSent > 0 ? (discarded / totalSent) * 100 : 0;

    return {
      totalSent,
      accepted,
      discarded,
      deduplicationRate,
    };
  }

  getTransactionHistory(): TransactionState[] {
    return transactionCoordinator.getAllTransactions();
  }

  getAllPIDStates(): PIDState[] {
    return transactionCoordinator.getAllPIDStates();
  }

  exportAsJSON(): string {
    const stats = this.getStats();
    const messages = this.messages;
    const pidStates = this.getAllPIDStates();
    const transactions = this.getTransactionHistory();

    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      producer: this.getStatus(),
      stats,
      pidStates,
      transactions,
      messages,
    }, null, 2);
  }

  exportAsCSV(): string {
    const headers = ['ID', 'Content', 'PID', 'Sequence', 'Status', 'Partition', 'TransactionID', 'Timestamp'];
    const rows = this.messages.map(m => [
      m.id,
      `"${m.content.replace(/"/g, '""')}"`,
      m.pid,
      m.sequence,
      m.status,
      m.partition,
      m.transactionId || '',
      new Date(m.timestamp).toISOString(),
    ]);

    const stats = this.getStats();
    const statsSection = [
      '',
      '--- Statistics ---',
      `Total Sent,${stats.totalSent}`,
      `Accepted,${stats.accepted}`,
      `Discarded (Duplicate),${stats.discarded}`,
      `Deduplication Rate,${stats.deduplicationRate.toFixed(2)}%`,
    ];

    return [headers.join(','), ...rows.map(r => r.join(',')), ...statsSection].join('\n');
  }

  toggleIdempotence(enable: boolean): boolean {
    this.enableIdempotence = enable;
    return this.enableIdempotence;
  }

  reset(): ProducerStatus {
    transactionCoordinator.removePIDState(this.pid);
    
    this.pid = generatePID();
    this.epoch++;
    this.messages = [];
    this.activeTxnId = null;
    this.transactionalId = null;
    
    transactionCoordinator.getOrCreatePIDState(this.pid, this.epoch);
    
    return this.getStatus();
  }
}

export const producer = new KafkaProducerSimulator();
