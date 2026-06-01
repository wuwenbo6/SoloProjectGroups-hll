import { create } from "zustand";
import type {
  SCTPMessage,
  StreamState,
  ConnectionStatus,
  ServerToClientMessage,
  SACKMessage,
  QueuedMessage,
  GapAckBlock,
  NetworkConfig,
} from "../types";

interface SCTPStore {
  connectionStatus: ConnectionStatus;
  clientId: string | null;
  streams: Map<number, StreamState>;
  receivedMessages: SCTPMessage[];
  sentMessages: SCTPMessage[];
  networkConfig: NetworkConfig;
  droppedCount: number;

  setConnectionStatus: (status: ConnectionStatus) => void;
  setClientId: (id: string) => void;
  initStreams: () => void;
  resetStore: () => void;
  setNetworkConfig: (config: Partial<NetworkConfig>) => void;

  enqueueMessage: (
    streamId: number,
    content: string,
    lifetime?: number,
    isUnreliable?: boolean
  ) => SCTPMessage;
  markMessageSent: (streamId: number, sequence: number) => void;
  receiveMessage: (message: ServerToClientMessage) => SCTPMessage[];
  processBuffer: (streamId: number) => SCTPMessage[];
  checkExpiredMessages: (streamId: number) => number[];
  handleExpiredMessages: (streamId: number, sequences: number[]) => void;

  generateSACK: (streamId: number) => SACKMessage;
  processIncomingSACK: (streamId: number, sack: SACKMessage) => number[];
  retransmitLost: (streamId: number, sequences: number[]) => SCTPMessage[];

  getStreamState: (streamId: number) => StreamState | undefined;
  getSendQueue: (streamId: number) => QueuedMessage[];
  getStreamStats: (streamId: number) => {
    received: number;
    sent: number;
    buffered: number;
    inFlight: number;
    acked: number;
    expired: number;
    nextSequence: number;
    expectedSequence: number;
    lastAcked: number;
  };
}

const defaultNetworkConfig: NetworkConfig = {
  lossRate: 0,
  minDelay: 100,
  maxDelay: 500,
  reorderRate: 0.5,
};

const createInitialSendState = () => ({
  nextTSN: 0,
  lastAckedTSN: -1,
  sendQueue: new Map<number, QueuedMessage>(),
  outstandingBytes: 0,
  cwnd: 4380,
  ssthresh: 8760,
});

const createInitialStreamState = (
  streamId: number,
  name: string
): StreamState => ({
  streamId,
  name,
  nextSequence: 0,
  expectedSequence: 0,
  highestReceived: -1,
  buffer: new Map(),
  receivedCount: 0,
  sentCount: 0,
  expiredCount: 0,
  sendState: createInitialSendState(),
});

const generateGapAckBlocks = (
  received: Set<number>,
  cumulativeTSN: number,
  highestReceived: number
): GapAckBlock[] => {
  const blocks: GapAckBlock[] = [];
  if (highestReceived <= cumulativeTSN) return blocks;

  let inGap = false;
  let gapStart = 0;

  for (let i = cumulativeTSN + 1; i <= highestReceived; i++) {
    const hasReceived = received.has(i);
    if (!hasReceived && !inGap) {
      inGap = true;
      gapStart = i;
    } else if (hasReceived && inGap) {
      inGap = false;
      blocks.push({ start: gapStart, end: i - 1 });
    }
  }

  return blocks;
};

export const useSCTPStore = create<SCTPStore>((set, get) => ({
  connectionStatus: "disconnected",
  clientId: null,
  streams: new Map(),
  receivedMessages: [],
  sentMessages: [],
  networkConfig: defaultNetworkConfig,
  droppedCount: 0,

  setConnectionStatus: (status) => {
    set({ connectionStatus: status });
  },

  setClientId: (id) => {
    set({ clientId: id });
  },

  initStreams: () => {
    const streams = new Map<number, StreamState>();
    streams.set(0, createInitialStreamState(0, "控制流"));
    streams.set(1, createInitialStreamState(1, "数据流"));
    set({ streams, droppedCount: 0 });
  },

  resetStore: () => {
    set({
      connectionStatus: "disconnected",
      clientId: null,
      streams: new Map(),
      receivedMessages: [],
      sentMessages: [],
      droppedCount: 0,
    });
  },

  setNetworkConfig: (config) => {
    set((state) => ({
      networkConfig: { ...state.networkConfig, ...config },
    }));
  },

  enqueueMessage: (streamId, content, lifetime, isUnreliable = false) => {
    const state = get();
    const stream = state.streams.get(streamId);

    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    const sequence = stream.sendState.nextTSN;
    const now = Date.now();
    const message: SCTPMessage = {
      streamId,
      sequence,
      content,
      timestamp: now,
      type: "data",
      lifetime,
      isUnreliable,
    };

    const queuedMessage: QueuedMessage = {
      message,
      status: "pending",
      retransmitCount: 0,
      expireTime: lifetime ? now + lifetime : undefined,
    };

    const newSendQueue = new Map(stream.sendState.sendQueue);
    newSendQueue.set(sequence, queuedMessage);

    const newStreams = new Map(state.streams);
    newStreams.set(streamId, {
      ...stream,
      nextSequence: stream.nextSequence + 1,
      sentCount: stream.sentCount + 1,
      sendState: {
        ...stream.sendState,
        nextTSN: stream.sendState.nextTSN + 1,
        sendQueue: newSendQueue,
      },
    });

    set({
      streams: newStreams,
      sentMessages: [...state.sentMessages, message],
    });

    return message;
  },

  markMessageSent: (streamId, sequence) => {
    const state = get();
    const stream = state.streams.get(streamId);

    if (!stream) return;

    const newSendQueue = new Map(stream.sendState.sendQueue);
    const queued = newSendQueue.get(sequence);
    if (queued) {
      newSendQueue.set(sequence, {
        ...queued,
        status: "sent",
        sentTime: Date.now(),
      });

      const newStreams = new Map(state.streams);
      newStreams.set(streamId, {
        ...stream,
        sendState: {
          ...stream.sendState,
          sendQueue: newSendQueue,
        },
      });

      set({ streams: newStreams });
    }
  },

  receiveMessage: (message) => {
    if (message.type === "sack") {
      if (message.sack) {
        get().processIncomingSACK(message.streamId ?? 0, message.sack);
      }
      return [];
    }

    if (message.type === "expired") {
      if (message.expired && message.streamId !== undefined) {
        get().handleExpiredMessages(message.streamId, message.expired);
      }
      return [];
    }

    if (message.type !== "message") {
      return [];
    }

    const state = get();
    const streamId = message.streamId ?? 0;
    const stream = state.streams.get(streamId);

    if (!stream) {
      return [];
    }

    const sctpMessage: SCTPMessage = {
      streamId,
      sequence: message.sequence ?? 0,
      content: message.content ?? "",
      timestamp: message.timestamp ?? Date.now(),
      type: "data",
    };

    const newStreams = new Map(state.streams);
    const currentStream = { ...stream, buffer: new Map(stream.buffer) };
    const deliveredMessages: SCTPMessage[] = [];

    if (sctpMessage.sequence > currentStream.highestReceived) {
      currentStream.highestReceived = sctpMessage.sequence;
    }

    if (sctpMessage.sequence === currentStream.expectedSequence) {
      deliveredMessages.push(sctpMessage);
      currentStream.expectedSequence++;
      currentStream.receivedCount++;

      let nextSequence = currentStream.expectedSequence;
      while (currentStream.buffer.has(nextSequence)) {
        const bufferedMsg = currentStream.buffer.get(nextSequence)!;
        deliveredMessages.push(bufferedMsg);
        currentStream.buffer.delete(nextSequence);
        nextSequence++;
        currentStream.receivedCount++;
      }
      currentStream.expectedSequence = nextSequence;
    } else if (sctpMessage.sequence > currentStream.expectedSequence) {
      currentStream.buffer.set(sctpMessage.sequence, sctpMessage);
    }

    newStreams.set(streamId, currentStream);

    set({
      streams: newStreams,
      receivedMessages: [...state.receivedMessages, ...deliveredMessages],
    });

    return deliveredMessages;
  },

  processBuffer: (streamId) => {
    const state = get();
    const stream = state.streams.get(streamId);

    if (!stream) {
      return [];
    }

    const newStreams = new Map(state.streams);
    const currentStream = { ...stream, buffer: new Map(stream.buffer) };
    const deliveredMessages: SCTPMessage[] = [];

    let nextSequence = currentStream.expectedSequence;
    while (currentStream.buffer.has(nextSequence)) {
      const bufferedMsg = currentStream.buffer.get(nextSequence)!;
      deliveredMessages.push(bufferedMsg);
      currentStream.buffer.delete(nextSequence);
      nextSequence++;
      currentStream.receivedCount++;
    }
    currentStream.expectedSequence = nextSequence;

    newStreams.set(streamId, currentStream);

    set({
      streams: newStreams,
      receivedMessages: [...state.receivedMessages, ...deliveredMessages],
    });

    return deliveredMessages;
  },

  checkExpiredMessages: (streamId) => {
    const state = get();
    const stream = state.streams.get(streamId);
    if (!stream) return [];

    const now = Date.now();
    const expired: number[] = [];

    for (const [seq, queued] of stream.sendState.sendQueue) {
      if (
        queued.message.lifetime &&
        queued.expireTime &&
        now > queued.expireTime &&
        queued.status !== "acked" &&
        queued.status !== "expired"
      ) {
        expired.push(seq);
      }
    }

    return expired;
  },

  handleExpiredMessages: (streamId, sequences) => {
    const state = get();
    const stream = state.streams.get(streamId);
    if (!stream) return;

    const newSendQueue = new Map(stream.sendState.sendQueue);
    let expiredCount = 0;

    for (const seq of sequences) {
      const queued = newSendQueue.get(seq);
      if (queued && queued.status !== "acked" && queued.status !== "expired") {
        newSendQueue.set(seq, {
          ...queued,
          status: "expired",
        });
        expiredCount++;
      }
    }

    const newStreams = new Map(state.streams);
    newStreams.set(streamId, {
      ...stream,
      expiredCount: stream.expiredCount + expiredCount,
      sendState: {
        ...stream.sendState,
        sendQueue: newSendQueue,
      },
    });

    set({ streams: newStreams });
  },

  generateSACK: (streamId) => {
    const state = get();
    const stream = state.streams.get(streamId);
    if (!stream) {
      return {
        streamId,
        cumulativeTSN: 0,
        gapAckBlocks: [],
        duplicateTSNs: [],
        timestamp: Date.now(),
      };
    }

    const cumulativeTSN = stream.expectedSequence - 1;
    const receivedTSNs = new Set<number>();
    const duplicates: number[] = [];

    for (let i = cumulativeTSN + 1; i <= stream.highestReceived; i++) {
      if (stream.buffer.has(i)) {
        receivedTSNs.add(i);
      }
    }

    const gapAckBlocks = generateGapAckBlocks(
      receivedTSNs,
      cumulativeTSN,
      stream.highestReceived
    );

    const sack: SACKMessage = {
      streamId,
      cumulativeTSN,
      gapAckBlocks,
      duplicateTSNs: duplicates,
      timestamp: Date.now(),
    };

    const newStreams = new Map(state.streams);
    newStreams.set(streamId, { ...stream, lastSACK: sack });
    set({ streams: newStreams });

    return sack;
  },

  processIncomingSACK: (streamId, sack) => {
    const state = get();
    const stream = state.streams.get(streamId);
    if (!stream) return [];

    const lostSequences: number[] = [];
    const newSendQueue = new Map(stream.sendState.sendQueue);
    let newLastAcked = stream.sendState.lastAckedTSN;

    for (let i = stream.sendState.lastAckedTSN + 1; i <= sack.cumulativeTSN; i++) {
      const queued = newSendQueue.get(i);
      if (queued) {
        newSendQueue.set(i, {
          ...queued,
          status: "acked",
          ackTime: Date.now(),
        });
        newLastAcked = i;
      }
    }

    const receivedInGaps = new Set<number>();
    for (const block of sack.gapAckBlocks) {
      for (let i = block.start; i <= block.end; i++) {
        receivedInGaps.add(i);
      }
    }

    for (const [seq, queued] of newSendQueue) {
      if (
        seq > sack.cumulativeTSN &&
        queued.status === "sent" &&
        !receivedInGaps.has(seq)
      ) {
        const isUnreliable = queued.message.isUnreliable;
        const isExpired =
          queued.message.lifetime &&
          queued.expireTime &&
          Date.now() > queued.expireTime;

        if (isUnreliable || isExpired) {
          newSendQueue.set(seq, { ...queued, status: "expired" });
        } else {
          lostSequences.push(seq);
          newSendQueue.set(seq, { ...queued, status: "lost" });
        }
      }
    }

    const newStreams = new Map(state.streams);
    newStreams.set(streamId, {
      ...stream,
      sendState: {
        ...stream.sendState,
        lastAckedTSN: newLastAcked,
        sendQueue: newSendQueue,
      },
    });
    set({ streams: newStreams });

    return lostSequences;
  },

  retransmitLost: (streamId, sequences) => {
    const state = get();
    const stream = state.streams.get(streamId);
    if (!stream) return [];

    const retransmitted: SCTPMessage[] = [];
    const newSendQueue = new Map(stream.sendState.sendQueue);

    for (const seq of sequences) {
      const queued = newSendQueue.get(seq);
      if (queued && queued.status === "lost") {
        newSendQueue.set(seq, {
          ...queued,
          status: "sent",
          sentTime: Date.now(),
          retransmitCount: queued.retransmitCount + 1,
        });
        retransmitted.push(queued.message);
      }
    }

    const newStreams = new Map(state.streams);
    newStreams.set(streamId, {
      ...stream,
      sendState: {
        ...stream.sendState,
        sendQueue: newSendQueue,
      },
    });
    set({ streams: newStreams });

    return retransmitted;
  },

  getStreamState: (streamId) => {
    return get().streams.get(streamId);
  },

  getSendQueue: (streamId) => {
    const stream = get().streams.get(streamId);
    if (!stream) return [];
    return Array.from(stream.sendState.sendQueue.values());
  },

  getStreamStats: (streamId) => {
    const stream = get().streams.get(streamId);
    if (!stream) {
      return {
        received: 0,
        sent: 0,
        buffered: 0,
        inFlight: 0,
        acked: 0,
        expired: 0,
        nextSequence: 0,
        expectedSequence: 0,
        lastAcked: -1,
      };
    }

    const sendQueue = stream.sendState.sendQueue;
    let inFlight = 0;
    let acked = 0;
    let expired = 0;

    for (const queued of sendQueue.values()) {
      if (queued.status === "sent") inFlight++;
      if (queued.status === "acked") acked++;
      if (queued.status === "expired") expired++;
    }

    return {
      received: stream.receivedCount,
      sent: stream.sentCount,
      buffered: stream.buffer.size,
      inFlight,
      acked,
      expired: stream.expiredCount,
      nextSequence: stream.nextSequence,
      expectedSequence: stream.expectedSequence,
      lastAcked: stream.sendState.lastAckedTSN,
    };
  },
}));
