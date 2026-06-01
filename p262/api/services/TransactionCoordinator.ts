import type { PIDState, PartitionState, TransactionState, TransactionPhase } from '../../shared/types';

function generateTxnId(): string {
  return 'txn-' + Math.random().toString(36).substring(2, 10);
}

class TransactionCoordinator {
  private pidStates: Map<number, PIDState>;
  private activeTransactions: Map<string, TransactionState>;
  private completedTransactions: TransactionState[];

  constructor() {
    this.pidStates = new Map();
    this.activeTransactions = new Map();
    this.completedTransactions = [];
  }

  getOrCreatePIDState(pid: number, epoch: number): PIDState {
    let state = this.pidStates.get(pid);
    
    if (!state) {
      state = {
        pid,
        epoch,
        partitions: {},
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };
      this.pidStates.set(pid, state);
    }
    
    state.lastUsedAt = Date.now();
    return state;
  }

  getPIDState(pid: number): PIDState | undefined {
    return this.pidStates.get(pid);
  }

  updatePartitionState(
    pid: number,
    partition: number,
    sequence: number
  ): PartitionState {
    const state = this.getOrCreatePIDState(pid, 0);
    
    const partitionState: PartitionState = {
      partition,
      lastSequence: sequence,
      lastTimestamp: Date.now(),
    };
    
    state.partitions[partition] = partitionState;
    state.lastUsedAt = Date.now();
    
    return partitionState;
  }

  getNextSequenceForPartition(pid: number, partition: number): number {
    const state = this.getPIDState(pid);
    if (!state || !state.partitions[partition]) {
      return 0;
    }
    return state.partitions[partition].lastSequence + 1;
  }

  isDuplicate(pid: number, partition: number, sequence: number): boolean {
    const state = this.getPIDState(pid);
    if (!state || !state.partitions[partition]) {
      return false;
    }
    return sequence <= state.partitions[partition].lastSequence;
  }

  removePIDState(pid: number): boolean {
    return this.pidStates.delete(pid);
  }

  getAllPIDStates(): PIDState[] {
    return Array.from(this.pidStates.values());
  }

  clearAll(): void {
    this.pidStates.clear();
    this.activeTransactions.clear();
    this.completedTransactions = [];
  }

  beginTransaction(pid: number, epoch: number, transactionalId?: string): TransactionState {
    const txnId = transactionalId || generateTxnId();

    const existing = this.activeTransactions.get(txnId);
    if (existing) {
      throw new Error(`Transaction ${txnId} already in progress`);
    }

    const txn: TransactionState = {
      transactionId: txnId,
      pid,
      epoch,
      phase: 'BEGIN',
      partitions: [],
      messageIds: [],
      startedAt: Date.now(),
    };

    this.activeTransactions.set(txnId, txn);
    return txn;
  }

  addMessageToTransaction(txnId: string, messageId: string, partition: number): TransactionState {
    const txn = this.activeTransactions.get(txnId);
    if (!txn) {
      throw new Error(`Transaction ${txnId} not found`);
    }
    if (txn.phase !== 'BEGIN' && txn.phase !== 'SENDING') {
      throw new Error(`Transaction ${txnId} is in phase ${txn.phase}, cannot add messages`);
    }

    txn.phase = 'SENDING';
    txn.messageIds.push(messageId);
    if (!txn.partitions.includes(partition)) {
      txn.partitions.push(partition);
    }
    
    return txn;
  }

  commitTransaction(txnId: string): TransactionState {
    const txn = this.activeTransactions.get(txnId);
    if (!txn) {
      throw new Error(`Transaction ${txnId} not found`);
    }
    if (txn.phase !== 'SENDING' && txn.phase !== 'BEGIN') {
      throw new Error(`Transaction ${txnId} is in phase ${txn.phase}, cannot commit`);
    }

    txn.phase = 'COMMITTING';
    txn.committedAt = Date.now();
    
    this.activeTransactions.delete(txnId);
    this.completedTransactions.push(txn);
    
    return txn;
  }

  abortTransaction(txnId: string): TransactionState {
    const txn = this.activeTransactions.get(txnId);
    if (!txn) {
      throw new Error(`Transaction ${txnId} not found`);
    }
    if (txn.phase !== 'SENDING' && txn.phase !== 'BEGIN') {
      throw new Error(`Transaction ${txnId} is in phase ${txn.phase}, cannot abort`);
    }

    txn.phase = 'ABORTING';
    txn.abortedAt = Date.now();
    
    this.activeTransactions.delete(txnId);
    this.completedTransactions.push(txn);
    
    return txn;
  }

  getTransaction(txnId: string): TransactionState | undefined {
    return this.activeTransactions.get(txnId) || 
      this.completedTransactions.find(t => t.transactionId === txnId);
  }

  getActiveTransaction(txnId: string): TransactionState | undefined {
    return this.activeTransactions.get(txnId);
  }

  getCompletedTransactions(): TransactionState[] {
    return [...this.completedTransactions];
  }

  getAllTransactions(): TransactionState[] {
    return [...this.activeTransactions.values(), ...this.completedTransactions];
  }
}

export const transactionCoordinator = new TransactionCoordinator();
